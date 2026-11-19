import { Component, Suspense, startTransition, use, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { useOwnedWorldVisual } from './useOwnedWorldVisual';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import type { Group, Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { withWorldAssetDecoder } from './WorldAssetDecoder';
import { night } from './WorldNight';
import { useDjcFurnitureEnvironment as useBarEnvironment } from './WorldDjcFurnitureEnvironment';
import { DJC_BAR_ASSETS, DJC_BAR_BOXES, DJC_BAR_NEAR_PREFETCH, DJC_BAR_ORIGIN, buildDjcBarProxy, cloneDjcBarVisual, createDjcBarPrefetchCheck, djcBarLod, djcBarQaOpaque, djcBarQaMode, djcBarQaSceneTransmission, shareDjcBarTexture } from './djc-bar-layout';
import { buildClubBarStoolContact, DJC_NORTH_BAR_CONTACT, djcBarStructureSupply, djcBarStoolSupply,
  type ContactShape } from './club-north-bar-contact';

let structureSource:Promise<typeof import('./club-north-bar-structure')>|undefined;
function BarStructureContact({shapes,fallback=false}:{shapes:Record<'surface'|'solid',ContactShape>;fallback?:boolean}){
  return <>{(['surface','solid'] as const).map(kind=><RigidBody key={kind} type="fixed" colliders={false}
    userData={{[kind]:true,assetId:'djc-north-bar',...(kind==='solid'&&{cameraBlocker:true})}}>
    <TrimeshCollider name={djcBarStructureSupply(kind,fallback)} args={[shapes[kind].vertices,shapes[kind].indices]}
      friction={kind==='surface'?.9:.65} restitution={0}/>
  </RigidBody>)}</>;
}
function BarAsset({ lod, environment, opaque, textures, sceneTransmission }: { lod:'near'|'far'; environment: Texture | null; opaque: boolean; textures: Map<string, Texture>; sceneTransmission: boolean }) {
  const url=DJC_BAR_ASSETS[lod];
  if(!structureSource){
    structureSource=import('./club-north-bar-structure');
    // GLTFLoader can suspend before React subscribes to the contact chunk.
    void structureSource.catch(()=>undefined);
  }
  const gltf = useLoader(GLTFLoader, url, withWorldAssetDecoder);
  const {buildClubNorthBarContact,declareNorthBarContacts}=use(structureSource);
  const visual = useMemo(() => {
    const display=cloneDjcBarVisual(gltf.scene, opaque, environment, texture => {
      const index = gltf.parser.associations.get(texture)?.textures;
      const definition = index === undefined ? undefined : gltf.parser.json.textures?.[index];
      const uri = definition ? gltf.parser.json.images?.[definition.source]?.uri : undefined;
      const resolved = uri ? new URL(uri, `https://world.local${url}`).href : undefined;
      return shareDjcBarTexture(texture, resolved, textures);
    }, sceneTransmission);
    try{declareNorthBarContacts(display.root,lod);}
    catch(error){display.dispose();throw error;}
    return display;
  }, [gltf, lod, opaque, environment, textures, url, sceneTransmission, declareNorthBarContacts]);
  const shape=useMemo(buildClubNorthBarContact,[buildClubNorthBarContact]);
  useOwnedWorldVisual(visual);
  useFrame(() => { for (const m of visual.materials) m.envMapIntensity = .35 * (1 - night.value * .88); });
  return <>
    <primitive object={visual.root} dispose={null} />
    <BarStructureContact shapes={shape}/>
  </>;
}
class BarBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.warn('[djc-bar] asset failed; fixed proxy and fallback retained', error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
function BarFallback({ proxy, stools }: { proxy: ReturnType<typeof buildDjcBarProxy>; stools: ReturnType<typeof buildClubBarStoolContact> }) {
  const floor=djcBarStructureSupply('surface',true),wall=djcBarStructureSupply('solid',true);
  const source={worldCollision:'solid',worldCollisionPartitions:{floor,wall}};
  return <group name="djc-north-bar-fallback">
    {DJC_BAR_BOXES.filter(box=>box.name!=='stool').map((box, i) => <mesh key={i} name={`djc-bar-fallback-${box.name}`} position={box.center} castShadow receiveShadow userData={source}>
      <boxGeometry args={box.size} /><meshStandardMaterial color={box.color} roughness={.85} />
    </mesh>)}
    {stools.placements.map((p,i) => <mesh key={`stool${i}`} name={`djc-bar-fallback-stool-${i}`} position={p}
      userData={{worldCollision:'solid',surfaceId:djcBarStoolSupply(i),worldCollisionSharedSurface:true}}
      geometry={stools.geometry} castShadow receiveShadow dispose={null}>
      <meshStandardMaterial color="#a77749" roughness={.85} />
    </mesh>)}
    <mesh castShadow receiveShadow userData={{worldCollision:'solid',surfaceId:wall,worldCollisionSharedSurface:true}}>
      <primitive object={proxy.roof} attach="geometry" dispose={null} /><meshStandardMaterial color="#a58a50" roughness={.95} />
    </mesh>
    <BarStructureContact shapes={proxy} fallback/>
  </group>;
}
/** Mounted after the bar enters the camera's prefetch range. */
function ActiveBarVisual({ fallback }: { fallback: ReactNode }) {
  const textures = useRef(new Map<string, Texture>());
  useEffect(() => () => textures.current.clear(), []);
  const camera = useThree(s => s.camera);
  const mode = useMemo(() => djcBarQaMode(typeof window === 'undefined' ? '' : window.location.search), []);
  const distance = () => Math.hypot(camera.position.x - DJC_BAR_ORIGIN[0], camera.position.y - DJC_BAR_ORIGIN[1], camera.position.z - DJC_BAR_ORIGIN[2]);
  const [lod, setLod] = useState<'near' | 'far'>(() => mode === 'near' || mode === 'far' ? mode : djcBarLod(distance(), 'far'));
  const requested = useRef(lod), environment = useBarEnvironment();
  const opaque = useMemo(() => typeof window !== 'undefined' && djcBarQaOpaque(window.location.search), []);
  const sceneTransmission = useMemo(() => typeof window !== 'undefined' && djcBarQaSceneTransmission(window.location.search), []);
  useFrame(() => {
    const next = mode === 'near' || mode === 'far' ? mode : djcBarLod(distance(), requested.current);
    if (next !== requested.current) {
      requested.current = next;
      // A stable, already-revealed Suspense boundary keeps the previous asset
      // visible while the next useLoader request suspends. No keyed cold remount.
      startTransition(() => setLod(next));
    }
  });
  return <BarBoundary fallback={fallback}><Suspense fallback={fallback}>
    <BarAsset lod={lod} environment={environment} opaque={opaque} textures={textures.current} sceneTransmission={sceneTransmission} />
  </Suspense></BarBoundary>;
}
/** Collision is always present. Asset caches activate once and remain bounded to two LODs. */
export default function WorldDjcClubBar() {
  const camera = useThree(s => s.camera), group = useRef<Group>(null);
  const distance = () => Math.hypot(camera.position.x - DJC_BAR_ORIGIN[0], camera.position.y - DJC_BAR_ORIGIN[1], camera.position.z - DJC_BAR_ORIGIN[2]);
  const [active, setActive] = useState(() => distance() <= DJC_BAR_NEAR_PREFETCH), activated = useRef(active);
  const shouldPrefetch = useMemo(createDjcBarPrefetchCheck, []);
  const proxy = useMemo(() => buildDjcBarProxy(true), []);
  const stools = useMemo(buildClubBarStoolContact, []);
  useOwnedWorldVisual(proxy.roof);
  useOwnedWorldVisual(stools.geometry);
  useFrame(() => {
    const d = distance();
    if (!activated.current && shouldPrefetch(camera, d)) { activated.current = true; setActive(true); }
    if (group.current) group.current.visible = d < 180;
  });
  const fallback = <BarFallback proxy={proxy} stools={stools} />;
  return <group name="djc-north-bar" position={DJC_BAR_ORIGIN} userData={{ assetId: 'djc-north-bar' }}>
    <group name={DJC_NORTH_BAR_CONTACT}>
      <group ref={group} name="djc-north-bar-visual">
        {active ? <ActiveBarVisual fallback={fallback} /> : fallback}
      </group>
      <RigidBody type="fixed" colliders={false} userData={{solid:true,assetId:'djc-north-bar',cameraBlocker:true}}>
        {stools.placements.map((p,i) => <TrimeshCollider key={i} name={djcBarStoolSupply(i)} position={p}
          args={[stools.vertices, stools.indices]} friction={.65} restitution={0}/>)}
      </RigidBody>
    </group>
  </group>;
}
