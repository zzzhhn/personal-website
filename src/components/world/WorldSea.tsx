import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh, MeshStandardMaterial } from 'three';
import { WATER_Y } from './layout';
import { useWorldStore } from './store';
import { createSeaGeometry, SEA_CELL, SEA_SPOTS, seaSpotUniform } from './WorldWater';
import { actorState } from './WorldGrass';

/** Exposed for QA: current clear-spot state. */
export const seaSpotDebug: { spots: { id: string; x: number; z: number; radius: number; strength: number }[] } = { spots: [] };

/** The sea grid follows the view focus in whole 0.5 m cells (waves are evaluated in world
 * space, so snapping never makes the surface swim). Mean height stays exactly at WATER_Y.
 * Clear spots: any tracked body whose underside is below the surface (WATER_Y + 5 cm) opens a
 * soft see-through disc; it eases in over ~0.25 s and out over ~0.5 s after the body leaves. */
export default function WorldSea({ material }: { material: MeshStandardMaterial }) {
  const geometry = useMemo(createSeaGeometry, []);
  const ref = useRef<Mesh>(null);
  const strengths = useRef(new Map<string, number>());
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ camera }, delta) => {
    const mesh = ref.current; if (!mesh) return;
    const { shot, position } = useWorldStore.getState();
    let fx = position[0], fz = position[2];
    if (shot) {
      // Fixed QA cameras: centre on where the view ray meets the water plane.
      const dir = camera.getWorldDirection(mesh.position.clone()), t = dir.y < -.05 ? (WATER_Y - camera.position.y) / dir.y : 0;
      fx = camera.position.x + dir.x * t; fz = camera.position.z + dir.z * t;
    }
    mesh.position.set(Math.round(fx / SEA_CELL) * SEA_CELL, WATER_Y, Math.round(fz / SEA_CELL) * SEA_CELL);

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
