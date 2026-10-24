import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Camera, InstancedBufferGeometry, Mesh, MeshStandardMaterial } from 'three';
import { WATER_Y } from './layout';
import { createSeaGeometry, SEA_SPOTS, seaSpotUniform, selectSeaPatches, type SeaSelection } from './WorldWater';
import { actorState } from './WorldGrass';

/** Exposed for QA: current clear-spot state and the last CDLOD selection. */
export const seaSpotDebug: { spots: { id: string; x: number; z: number; radius: number; strength: number }[]; lod: SeaSelection | null } = { spots: [], lod: null };

/** The sea is one instanced draw: CDLOD quadrants selected per rendered camera (WorldWater.selectSeaPatches)
 * in onBeforeRender, so the selection always matches the camera that draws it, including QA shots. The mesh
 * stays at the origin at WATER_Y; waves are evaluated in world space. It does not cast; it only receives.
 * Clear spots: any tracked body whose underside is below the surface (WATER_Y + 5 cm) opens a soft see-through
 * disc; it eases in over ~0.25 s and out over ~0.5 s after the body leaves. */
export default function WorldSea({ material }: { material: MeshStandardMaterial }) {
  const geometry = useMemo(() => createSeaGeometry(), []);
  const ref = useRef<Mesh>(null);
  const strengths = useRef(new Map<string, number>());
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => {
    const mesh = ref.current; if (!mesh) return;
    let last: Camera | null = null, lastFrame = -1;
    mesh.onBeforeRender = (renderer, _scene, camera) => {
      // Main camera only; reselect once per frame per camera (shadow passes never draw the sea).
      const frame = renderer.info.render.frame;
      if (camera === last && frame === lastFrame) return;
      last = camera; lastFrame = frame;
      seaSpotDebug.lod = selectSeaPatches(geometry as InstancedBufferGeometry, camera);
    };
  }, [geometry]);
  useFrame((_, delta) => {
    const dt = Math.min(delta, .1), spots: typeof seaSpotDebug.spots = [];
    for (const a of actorState.actors) {
      const wet = a.bottom < WATER_Y + .05;
      const prev = strengths.current.get(a.id) ?? 0;
      const next = wet ? Math.min(1, prev + dt * 4) : Math.max(0, prev - dt * 2);
      strengths.current.set(a.id, next);
      // Player: 1.5 m disc; vehicles: half-length + 1.2 m so the whole body shows.
      if (next > 0) spots.push({ id: a.id, x: a.x, z: a.z, radius: a.kind === 'player' ? 1.5 : a.radius + 1.6, strength: next });
    }
    spots.sort((p, q) => q.strength - p.strength);
    for (let i = 0; i < SEA_SPOTS; i++) {
      const s = spots[i];
      seaSpotUniform.value[i].set(s?.x ?? 0, s?.z ?? 0, s?.radius ?? 0, s?.strength ?? 0);
    }
    seaSpotDebug.spots = spots.slice(0, SEA_SPOTS).map(s => ({ ...s, x: +s.x.toFixed(2), z: +s.z.toFixed(2), strength: +s.strength.toFixed(2) }));
  });
  return <mesh ref={ref} name="world-sea-gerstner" geometry={geometry} material={material} position={[0, WATER_Y, 0]} receiveShadow frustumCulled={false} />;
}
