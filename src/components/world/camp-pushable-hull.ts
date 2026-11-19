import type { Collider } from '@dimforge/rapier3d-compat';
import type { Mesh, Object3D } from 'three';
import { localPoints, type NodePart } from './WorldCampContentAssets';

const physicalParts = {
  C12: ['C12_guitar', 'C12_stand'],
  C13: ['C13_dumbbell'],
  C15: ['C15_case'],
} as const;
export type CampPushableFamily = keyof typeof physicalParts;

export function campLegacyPushableHull(parts: NodePart[], family: CampPushableFamily, scale = 1) {
  const names: readonly string[] = physicalParts[family];
  return localPoints(parts.filter(p => names.includes(p.name)), scale);
}

/** Work in the detached visual's authored frame. The rigid body applies home
 * yaw/position, and both rendering and hull receive the same uniform scale. */
export function campCraftPushableHull(root: Object3D, family: CampPushableFamily, scale: number, surfaceId: string) {
  root.updateMatrixWorld(true);
  const parts: NodePart[] = [];
  for (const name of physicalParts[family]) {
    const group = root.getObjectByName(name);
    if (!group) throw new Error(`Camp facility pack missing collision source ${name}`);
    Object.assign(group.userData, { worldCollision: 'pushable', surfaceId, worldCollisionSharedSurface: true });
    group.traverse(object => {
      const mesh = object as Mesh;
      if (mesh.isMesh) parts.push({ name: mesh.name, geometry: mesh.geometry, matrix: mesh.matrixWorld, glow: false });
    });
  }
  const vertices = localPoints(parts, scale);
  if (vertices.length < 12 || !vertices.every(Number.isFinite)) throw new Error(`Invalid camp facility collision source ${family}`);

  const decoration = family === 'C12' ? root.getObjectByName('camp-content-C12-strings')
    : family === 'C15' ? root.getObjectByName('C15_handle') : null;
  if (decoration) decoration.userData.worldCollision = 'none';
  return vertices;
}

/** Keep the same identified collider through a late visual commit, cleanup and
 * any grab/drop. A stale cleanup must leave the latest mounted visual in place. */
export function createCampPushableHullBinding(fallback: Float32Array, install: (collider: Collider, points: Float32Array) => void) {
  let collider: Collider | null = null;
  let installed = fallback;
  let current: { points: Float32Array } | undefined;
  function update(points: Float32Array) {
    if (points === installed || !collider?.isValid()) return;
    install(collider, points);
    installed = points;
  }
  return {
    connect(next: Collider | null) {
      if (collider === next) return;
      collider = next;
      installed = fallback;
      if (current) update(current.points);
    },
    mount(points: Float32Array) {
      update(points);
      const owner = { points };
      current = owner;
      return () => {
        if (current !== owner) return;
        current = undefined;
        update(fallback);
      };
    },
  };
}
