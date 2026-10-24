import { memo, Component, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { BufferGeometry } from 'three';
import type { WorldContent, WorldProject } from './types';
import type { Vec3 } from './types';
import WorldSurfaceColliders from './WorldSurfaceColliders';
import { useGreyboxClaim } from './WorldVisualClaims';
import { night } from './WorldNight';
import { gltfPieces, gltfTrimesh, mergeBatch, parkMaterial, parkNight, parkUrl, plankDeck, ParkGeo, withDraco, type GLTF } from './WorldParkKit';
import { DECK_Y, EXHIBIT_ANCHOR, HUTS, HUT_BACK_Z, HUT_FRONT_Z } from './WorldParkLayout';
import { ParkExhibits, placeExhibits, useExhibitGltfs } from './WorldParkExhibits';
import { buildWalk, Knockables, LampPools, LAMP, RAIL, parkKnockables } from './WorldParkWalk';

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

function Batch({ name, geometry, deck }: { name: string; geometry: BufferGeometry; deck?: boolean }) {
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh name={name} geometry={geometry} material={parkMaterial()} castShadow receiveShadow
    userData={deck ? { surface: true, assetId: 'park-deck' } : { solid: true, occluder: true, assetId: 'park' }} />;
}

function FixedMesh({ name, mesh }: { name: string; mesh: { vertices: Float32Array; indices: Uint32Array } }) {
  return <RigidBody name={name} type="fixed" colliders={false} userData={{ solid: true, assetId: name }}>
    <TrimeshCollider name={`${name}-trimesh`} args={[mesh.vertices, mesh.indices]} friction={0.6} restitution={0.05} />
  </RigidBody>;
}

/** P06-P11: six huts from hut.glb (variants A / B), their floors and spurs to the boardwalk. */
function ParkHuts({ projects }: { projects: WorldProject[] }) {
  const gltf = useLoader(GLTFLoader, parkUrl('hut'), withDraco) as GLTF;
  const exhibitGltfs = useExhibitGltfs();
  const built = useMemo(() => {
    const solid: BufferGeometry[] = [], deckParts: BufferGeometry[] = [], spurs = new ParkGeo();
    const shells: { vertices: Float32Array; indices: Uint32Array }[] = [];
    const surfaces: { position: Vec3; size: Vec3; rotation: Vec3 }[] = [];
    HUTS.forEach((h, i) => {
      const root = gltf.scene.getObjectByName(`hut_${h.variant}`);
      if (!root) throw new Error(`hut.glb lacks hut_${h.variant}`);
      solid.push(...gltfPieces(root, h.matrix, n => !n.startsWith('floor')));
      deckParts.push(...gltfPieces(root, h.matrix, n => n.startsWith('floor')));
      shells.push(gltfTrimesh(root, h.matrix, n => n.startsWith('shell') || n.startsWith('piles')));
      surfaces.push({ position: h.local(0, -0.125, (HUT_FRONT_Z + HUT_BACK_Z) / 2), size: [h.width, 0.25, HUT_FRONT_Z - HUT_BACK_Z], rotation: [0, h.yaw, 0] });
      if (h.spur) {
        const { from, to, width } = h.spur;
        plankDeck(spurs, from, to, width, 100 + i);
        const L = Math.hypot(to[0] - from[0], to[2] - from[2]);
        for (const s of L > 2.2 ? [L * 0.5] : []) for (const x of [-width / 2 + 0.16, width / 2 - 0.16]) {
          const p = h.local(x, 0, HUT_FRONT_Z + s);
          spurs.cyl([p[0], -2.6, p[2]], [p[0], DECK_Y - 0.26, p[2]], 0.12, 0.11, 8, '#8E6E55');
        }
        surfaces.push({ position: [(from[0] + to[0]) / 2, DECK_Y - 0.15, (from[2] + to[2]) / 2], size: [width, 0.3, L], rotation: [0, h.yaw, 0] });
      }
    });
    const ex = placeExhibits(exhibitGltfs);
    return { solid: mergeBatch([...solid, ...ex.pieces]), deck: mergeBatch([...deckParts, ...spurs.pieces]), shells: [...shells, ...ex.fixed], surfaces, placed: ex.placed };
  }, [gltf, exhibitGltfs]);
  useGreyboxClaim('booth');
  return <group name="park-huts">
    <Batch name="park-huts-solid" geometry={built.solid} />
    <Batch name="park-huts-deck" geometry={built.deck} deck />
    {built.shells.map((m, i) => <FixedMesh key={i} name={i < HUTS.length ? `park-hut-${HUTS[i].id}` : `park-exhibit-body-${i - HUTS.length}`} mesh={m} />)}
    <ParkExhibits placed={built.placed} projects={projects} />
    <WorldSurfaceColliders name="park-hut-floors" items={built.surfaces} />
  </group>;
}

/** P01-P04: plaza, boardwalk, rails, lamps (runtime procedural, no GLB). */
function ParkWalk() {
  const walk = useMemo(buildWalk, []);
  useGreyboxClaim('boardwalk', 'park-plaza');
  useEffect(() => { if (new URLSearchParams(window.location.search).get('qa') === '1') Object.assign(window, { __parkKnock: parkKnockables, __parkWalk: { deckTris: walk.deckTris, solidTris: walk.solidTris, rails: walk.rails.length, lamps: walk.lamps.length, railTris: RAIL.triangles, lampTris: LAMP.triangles,
    railList: walk.rails, lampList: walk.lamps,
    huts: HUTS.map(h => ({ id: h.id, slug: h.slug, yaw: h.yaw, front: h.front, opening: h.local(0, 0, HUT_FRONT_Z), inside: h.local(0, 0, -1.6), anchor: h.local(EXHIBIT_ANCHOR[h.id][0], 0, EXHIBIT_ANCHOR[h.id][1]), backOutside: h.local(0, 0, HUT_BACK_Z - 0.6), spurEnd: h.spur?.to ?? h.local(0, 0, HUT_FRONT_Z + 1) })) } }); }, [walk]);
  return <group name="park-walk">
    <Batch name="park-walk-deck" geometry={walk.deck} deck />
    <Batch name="park-walk-solid" geometry={walk.solid} />
    <WorldSurfaceColliders name="park-walk-surface" items={walk.surfaces} />
    <Knockables name="rail" items={walk.rails} source={RAIL.geometry} spec={RAIL.spec} />
    <Knockables name="lamp" items={walk.lamps} source={LAMP.geometry} spec={LAMP.spec} />
    <LampPools lamps={walk.lamps} />
  </group>;
}

/** Shared dusk/night level for the park batch material. */
function ParkClock() {
  useFrame(() => { parkNight.value = night.value; });
  return null;
}

export default memo(function WorldPark({ projects }: { projects: WorldContent['projects'] }) {
  return <group name="world-park">
    <ParkClock />
    <ParkGuard id="huts"><ParkHuts projects={projects} /></ParkGuard>
    <ParkGuard id="walk"><ParkWalk /></ParkGuard>
  </group>;
});
