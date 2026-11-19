import { memo, Component, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import WorldAlphaExchange from './WorldAlphaExchange';
import RegionSceneBoundary from './RegionSceneBoundary';
import WorldDjcClub from './WorldDjcClub';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { BufferGeometry } from 'three';
import type { WorldContent, WorldProject } from './types';
import type { Vec3 } from './types';
import { parkWalkCollision } from './park-deck-collision';
import { useGreyboxClaim } from './WorldVisualClaims';
import { night } from './WorldNight';
import { parkAudio } from './WorldParkAudio';
import { parkMaterial, parkNight, parkUrl, withDraco, type GLTF } from './WorldParkKit';
import { DECK_Y, EXHIBIT_ANCHOR, HUTS, HUT_BACK_Z, HUT_FRONT_Z } from './WorldParkLayout';
import WorldParkSigns from './WorldParkSigns';
import { buildParkHut } from './park-hut-structure';
import { ParkLOD } from './WorldParkLOD';
import { ParkExhibits, placeExhibits, useExhibitGltfs } from './WorldParkExhibits';
import { buildWalk, Knockables, LampPools, LAMP, RAIL, parkKnockables } from './WorldParkWalk';
import { facilityCraftEnabled, registerFacilitySurfaceWakeup, setFacilityEnvironment } from './WorldFacilitySurface';
import WorldFacilityCraftQA from './WorldFacilityCraftQA';
import { useDjcFurnitureEnvironment } from './WorldDjcFurnitureEnvironment';

/**
 * Park district (owner: park session). Every static park part is batched into two draws per group:
 * a solid batch (casts shadows, view-corridor fade candidate) and a deck batch (userData.surface, walk
 * surfaces never fade). Collision is derived from the same GLB nodes and placement matrices.
 * Greybox keys are claimed inside the component that renders the replacement, after its GLB resolved.
 */
class ParkGuard extends Component<{ id: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error(`[world-park] ${this.props.id} failed; greybox kept.`, error); }
  render() { return this.state.failed ? null : <Suspense fallback={null}>{this.props.children}</Suspense>; }
}

function Batch({ name, geometry, deck, collision }: { name: string; geometry: BufferGeometry; deck?: boolean; collision?: Record<string, unknown> }) {
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh name={name} geometry={geometry} material={parkMaterial()} castShadow receiveShadow
    userData={{ ...(deck ? { surface: true, assetId: 'park-deck' } : { solid: true, occluder: true, assetId: 'park' }), ...collision }} />;
}

/** Five active project huts from hut.glb (variants A / B), their floors and spurs to the boardwalk. */
function ParkHuts({ projects }: { projects: WorldProject[] }) {
  const visualGltf = useLoader(GLTFLoader, facilityCraftEnabled()
    ? '/assets/world/craft-batch6-facilities/hut-runtime.glb' : parkUrl('hut'), withDraco) as GLTF;
  const exhibitGltfs = useExhibitGltfs();
  const built = useMemo(() => {
    const visuals = HUTS.map((hut,index) => {
      const root = visualGltf.scene.getObjectByName(`hut_${hut.variant}`);
      if (!root) throw new Error(`Missing hut shell ${hut.variant}`);
      return buildParkHut(root,hut,index);
    });
    const ex = placeExhibits(exhibitGltfs);
    return { visuals, exhibits: ex };
  }, [visualGltf, exhibitGltfs]);
  useGreyboxClaim('booth');
  return <group name="park-huts">
    {built.visuals.map(v => <group key={v.id} name={v.root}>
      <ParkLOD id={`hut-${v.id}`} center={v.center} nearTriangles={v.triangles} farTriangles={v.low.triangles}
        near={<><Batch name={`park-hut-${v.id}-solid`} geometry={v.solid} collision={{worldCollisionSources:v.sources}} />
          <Batch name={`park-hut-${v.id}-deck`} geometry={v.deck} deck collision={v.deckPolicy}/></>}
        far={<><Batch name={`park-hut-${v.id}-far-solid`} geometry={v.low.solid} collision={{worldCollision:'solid',surfaceId:v.shellId,worldCollisionSharedSurface:true}} />
          <Batch name={`park-hut-${v.id}-far-deck`} geometry={v.low.deck} deck collision={v.deckPolicy} /></>} />
      <RigidBody type="fixed" colliders={false} userData={{solid:true,assetId:v.root}}>
        <TrimeshCollider name={v.shellId} args={[v.shellVertices,v.shellIndices]} friction={.6} restitution={.05}/>
        <TrimeshCollider name={v.deckPolicy.worldCollisionPartitions.wall} args={[v.deckVertices,v.wall]} friction={.65}/>
      </RigidBody>
      <RigidBody type="fixed" colliders={false} userData={{surface:true,assetId:v.root}}>
        <TrimeshCollider name={v.deckPolicy.worldCollisionPartitions.floor} args={[v.deckVertices,v.floor]} friction={.95}/>
      </RigidBody>
    </group>)}
    <ParkExhibits placed={built.exhibits} projects={projects} />
  </group>;
}

/** P01-P04: plaza, boardwalk, rails, lamps (runtime procedural, no GLB). */
function ParkWalk() {
  const walk = useMemo(() => buildWalk(), []), low = useMemo(() => buildWalk(true), []);
  useGreyboxClaim('boardwalk', 'park-plaza');
  useEffect(() => { if (new URLSearchParams(window.location.search).get('qa') === '1') Object.assign(window, { __parkKnock: parkKnockables, __parkWalk: { deckTris: walk.deckTris, solidTris: walk.solidTris, rails: walk.rails.length, lamps: walk.lamps.length, railTris: RAIL.triangles, lampTris: LAMP.triangles, lampContract: { source: 'WorldStreetAssets.lampGeometry', arm: 0, height: 2.6, nearTriangles: LAMP.triangles, farTriangles: LAMP.farTriangles, hullCount: LAMP.hulls.length, totalMass: LAMP.spec.mass },
    railList: walk.rails, lampList: walk.lamps,
    huts: HUTS.map(h => ({ id: h.id, slug: h.slug, yaw: h.yaw, front: h.front, opening: h.local(0, 0, HUT_FRONT_Z), inside: h.local(0, 0, -1.6), anchor: h.local(EXHIBIT_ANCHOR[h.id][0], 0, EXHIBIT_ANCHOR[h.id][1]), backOutside: h.local(0, 0, HUT_BACK_Z - 0.6), spurEnd: h.spur?.to ?? h.local(0, 0, HUT_FRONT_Z + 1) })) } }); }, [walk]);
  const sections = useMemo(() => {
    const plaza = { id: 'plaza', center: [45,1.15,-45] as Vec3, deck: walk.deck, solid: walk.solid, triangles: walk.plazaTris };
    const farPlaza = { deck: low.deck, solid: low.solid, triangles: low.plazaTris };
    return [plaza, ...walk.groups].map((section, i) => {
      const name = 'park-walk-structure-' + section.id;
      return { section, name, far: i === 0 ? farPlaza : low.groups[i-1],
        contact: parkWalkCollision(section.deck, section.solid, name) };
    });
  }, [walk, low]);
  return <group name="park-walk">
    {sections.map(({section, name, far, contact}) => {
      const label = section.id === 'plaza' ? 'walk' : section.id;
      return <group key={name} name={name}>
        <ParkLOD id={section.id} center={section.center} nearTriangles={section.triangles} farTriangles={far.triangles}
          near={<><Batch name={`park-${label}-deck`} geometry={section.deck} deck collision={contact.deckPolicy}/>
            <Batch name={`park-${label}-solid`} geometry={section.solid} collision={contact.shellPolicy}/></>}
          far={<><Batch name={`park-${section.id}-far-deck`} geometry={far.deck} deck collision={contact.deckPolicy}/>
            <Batch name={`park-${section.id}-far-solid`} geometry={far.solid} collision={contact.shellPolicy}/></>}/>
        <RigidBody type="fixed" colliders={false} userData={{surface:true}}>
          <TrimeshCollider name={contact.deckPolicy.worldCollisionPartitions.floor} args={[contact.deckVertices,contact.floor]} friction={.95}/>
        </RigidBody>
        <RigidBody type="fixed" colliders={false} userData={{solid:true}}>
          <TrimeshCollider name={contact.shellId} args={[contact.shellVertices,contact.shellIndices]} friction={.65}/>
          <TrimeshCollider name={contact.deckPolicy.worldCollisionPartitions.wall} args={[contact.deckVertices,contact.wall]} friction={.65}/>
        </RigidBody>
      </group>;
    })}
    <Knockables name="rail" items={walk.rails} source={RAIL.geometry} farSource={RAIL.far} spec={RAIL.spec} contact={RAIL.contact} />
    <Knockables name="lamp" items={walk.lamps} source={LAMP.geometry} farSource={LAMP.far} spec={LAMP.spec} contact={LAMP.contact} />
    <ParkLOD id="lamp-pools" center={[64, 1.14, -28]} near={<LampPools lamps={walk.lamps} />} />
  </group>;
}

/** Shared dusk/night level for the park batch material. */
function ParkClock() {
  useFrame(() => { parkNight.value = night.value; });
  return null;
}

/** Reuse the established renderer cache; never change scene.environment. */
function FacilityReflections() {
  const map = useDjcFurnitureEnvironment(), invalidate = useThree(s => s.invalidate);
  useEffect(() => {
    const unsubscribe = registerFacilitySurfaceWakeup(invalidate);
    setFacilityEnvironment(map);
    return () => { unsubscribe(); setFacilityEnvironment(null); };
  }, [map, invalidate]);
  return null;
}

export default memo(function WorldPark({ projects }: { projects: WorldContent['projects'] }) {
  useEffect(() => parkAudio.retain(), []);
  return <group name="world-park">
    {facilityCraftEnabled() && <FacilityReflections />}
    <WorldFacilityCraftQA />
    <ParkClock />
    <ParkGuard id="huts"><ParkHuts projects={projects} /></ParkGuard>
    <ParkGuard id="walk"><ParkWalk /></ParkGuard>
    <ParkGuard id="signs"><WorldParkSigns projects={projects} /></ParkGuard>
    <RegionSceneBoundary id="exchange"><WorldAlphaExchange projectId={projects.find(p=>/alpha/i.test(p.slug))?.slug}/></RegionSceneBoundary>
    <RegionSceneBoundary id="club"><WorldDjcClub /></RegionSceneBoundary>
  </group>;
});
