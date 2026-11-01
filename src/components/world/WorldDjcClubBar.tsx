import { Component, Suspense, startTransition, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { DataTexture, EquirectangularReflectionMapping, FloatType, LinearSRGBColorSpace, PMREMGenerator, RGBAFormat, type Group, type Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { withWorldAssetDecoder } from './WorldAssetDecoder';
import { night } from './WorldNight';
import { DJC_BAR_ASSETS, DJC_BAR_BOXES, DJC_BAR_ORIGIN, buildDjcBarProxy, cloneDjcBarVisual, djcBarLod, djcBarQaOpaque, djcBarQaMode, djcBarQaSceneTransmission, shareDjcBarTexture } from './djc-bar-layout';

/** A small private outdoor reflection map. No scene environment, exposure or global lights change. */
function useBarEnvironment() {
  const renderer = useThree(s => s.gl), [map, setMap] = useState<Texture | null>(null);
  useEffect(() => {
    const width = 256, height = 128, pixels = new Float32Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const sky = Math.max(0, 1 - y / (height / 2)), ground = y > height / 2;
      const key = Math.exp(-(((x - width * .32) / 18) ** 2 + ((y - height * .3) / 12) ** 2));
      const i = (y * width + x) * 4;
      pixels[i] = (ground ? .16 : .7 - sky * .32) + key * 1.3;
      pixels[i + 1] = (ground ? .145 : .76 - sky * .23) + key * 1.1;
      pixels[i + 2] = (ground ? .11 : .82 - sky * .08) + key * .8; pixels[i + 3] = 1;
    }
    const source = new DataTexture(pixels, width, height, RGBAFormat, FloatType);
    source.mapping = EquirectangularReflectionMapping; source.colorSpace = LinearSRGBColorSpace; source.needsUpdate = true;
    const generator = new PMREMGenerator(renderer);
    let target: ReturnType<PMREMGenerator['fromEquirectangular']> | undefined;
    try { target = generator.fromEquirectangular(source); }
    catch (error) { console.warn('[djc-bar] private reflections unavailable; PBR textures retained', error); }
    finally { source.dispose(); generator.dispose(); }
    if (!target) return;
    const owned = target;
    setMap(target.texture);
    return () => owned.dispose();
  }, [renderer]);
  return map;
}
function BarAsset({ url, environment, opaque, textures, sceneTransmission }: { url: string; environment: Texture | null; opaque: boolean; textures: Map<string, Texture>; sceneTransmission: boolean }) {
  const gltf = useLoader(GLTFLoader, url, withWorldAssetDecoder);
  const visual = useMemo(() => cloneDjcBarVisual(gltf.scene, opaque, environment, texture => {
    const index = gltf.parser.associations.get(texture)?.textures;
    const definition = index === undefined ? undefined : gltf.parser.json.textures?.[index];
    const uri = definition ? gltf.parser.json.images?.[definition.source]?.uri : undefined;
    const resolved = uri ? new URL(uri, `https://world.local${url}`).href : undefined;
    return shareDjcBarTexture(texture, resolved, textures);
  }, sceneTransmission), [gltf, opaque, environment, textures, url, sceneTransmission]);
  useEffect(() => () => visual.dispose(), [visual]);
  useFrame(() => { for (const m of visual.materials) m.envMapIntensity = .35 * (1 - night.value * .88); });
  return <primitive object={visual.root} dispose={null} />;
}
class BarBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.warn('[djc-bar] asset failed; fixed proxy and fallback retained', error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
function BarFallback({ roof }: { roof: ReturnType<typeof buildDjcBarProxy>['roof'] }) {
  return <group name="djc-north-bar-fallback">
    {DJC_BAR_BOXES.map((box, i) => <mesh key={i} name={`djc-bar-fallback-${box.name}`} position={box.center} castShadow receiveShadow>
      <boxGeometry args={box.size} /><meshStandardMaterial color={box.color} roughness={.85} />
    </mesh>)}
    <mesh castShadow receiveShadow><primitive object={roof} attach="geometry" dispose={null} /><meshStandardMaterial color="#a58a50" roughness={.95} /></mesh>
  </group>;
}
/** Mounted only after first approach; neither GLB requests nor PMREM run remotely. */
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
    <BarAsset url={DJC_BAR_ASSETS[lod]} environment={environment} opaque={opaque} textures={textures.current} sceneTransmission={sceneTransmission} />
  </Suspense></BarBoundary>;
}
/** Collision is always present. Asset caches activate once and remain bounded to two LODs. */
export default function WorldDjcClubBar() {
  const camera = useThree(s => s.camera), group = useRef<Group>(null);
  const distance = () => Math.hypot(camera.position.x - DJC_BAR_ORIGIN[0], camera.position.y - DJC_BAR_ORIGIN[1], camera.position.z - DJC_BAR_ORIGIN[2]);
  const [active, setActive] = useState(() => distance() <= 90), activated = useRef(active);
  const proxy = useMemo(buildDjcBarProxy, []);
  useEffect(() => () => proxy.roof.dispose(), [proxy]);
  useFrame(() => {
    const d = distance();
    if (!activated.current && d <= 90) { activated.current = true; setActive(true); }
    if (group.current) group.current.visible = d < 180;
  });
  const fallback = <BarFallback roof={proxy.roof} />;
  return <group name="djc-north-bar" position={DJC_BAR_ORIGIN} userData={{ assetId: 'djc-north-bar' }}>
    <group ref={group} name="djc-north-bar-visual">
      {active ? <ActiveBarVisual fallback={fallback} /> : fallback}
    </group>
    {(['surface', 'solid'] as const).map(kind => <RigidBody key={kind} name={`djc-bar-${kind}`} type="fixed" colliders={false}
      userData={{ [kind]: true, assetId: 'djc-north-bar', ...(kind === 'solid' ? { cameraBlocker: true } : {}) }}>
      <TrimeshCollider name={`djc-bar-${kind}-proxy`} args={[proxy[kind].vertices, proxy[kind].indices]} friction={kind === 'surface' ? .9 : .65} restitution={0} />
    </RigidBody>)}
  </group>;
}
