import type { World } from '@dimforge/rapier3d-compat';
import type * as Rapier from '@dimforge/rapier3d-compat';
import { Box3, Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import { gltfTrimesh } from './WorldParkKit';
import type { CollisionClass } from './static-surface-asset';
import type { Vec3 } from './types';

const flipSeconds = .8;
const hingeAxis = new Vector3(1, 0, 0);

const fixedParts: Record<string, readonly string[]> = {
  P13: ['body', 'display_clip0', 'display_clip1'],
  P14: ['body', 'platter_0', 'platter_1', 'crossfader'],
  P15: ['body'],
  P16: ['body'],
  P17: ['body', 'lamp_glass'],
  P18: ['body'],
};
const details: Record<string, Record<string, string>> = {
  P13: {
    bar_0: 'Vote-count display inside the fixed wood and glass housing',
    bar_1: 'Vote-count display inside the fixed wood and glass housing',
    selector: 'Thin direction indicator on the fixed button pedestal',
  },
  P17: { lamp_flame: 'Light inside the solid lantern glass' },
};

export function exhibitPartContact(id: string, node: string) {
  if (fixedParts[id]?.includes(node)) return { collision: 'solid', group: 'body' } as const;
  if ((id === 'P18' && node === 'board') || (id === 'P13' && node === 'button') || (id === 'P15' && /^record_[0-8]$/.test(node))) {
    return { collision: 'solid', group: node } as const;
  }
  if ((id === 'P14' && node === 'crate') || (id === 'P15' && node === 'stool')) return { collision: 'pushable', group: node } as const;
  if (id === 'P15' && /^(cord_h[0-2][0-1]|cord_v[0-2][0-1])$/.test(node)) {
    return { collision: 'soft', reason: 'Flexible indicator link along the fixed record wall' } as const;
  }
  const reason = details[id]?.[node];
  if (reason) return { collision: 'none', reason } as const;
  throw new Error(`Park exhibit ${id} has no contact policy for ${node}`);
}

export function exhibitSurfaceId(hut: string, exhibit: string, group: string) {
  return `park-exhibit-${hut}-${exhibit}-${group}`;
}

export type ExhibitSourceRange = { id: string; firstVertex: number; vertexCount: number;
  collision: CollisionClass; surfaceId?: string; reason?: string };

export function exhibitPartShape(part: Object3D, placement: Matrix4) {
  part.updateMatrixWorld(true);
  const pose = placement.clone().multiply(part.matrixWorld);
  const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
  pose.decompose(position, rotation, scale);
  const local = new Matrix4().makeScale(scale.x, scale.y, scale.z).multiply(part.matrixWorld.clone().invert());
  const triangles = gltfTrimesh(part, local, () => true);
  const point = new Vector3(), bounds = new Box3();
  for (let i = 0; i < triangles.vertices.length; i += 3) {
    bounds.expandByPoint(point.fromArray(triangles.vertices, i));
  }
  return { ...triangles, position: position.toArray() as Vec3, rotation,
    center: bounds.getCenter(new Vector3()), half: bounds.getSize(new Vector3()).multiplyScalar(.5),
    edge: bounds.min.clone().negate().max(bounds.max) };
}

export type ExhibitPartShape = ReturnType<typeof exhibitPartShape>;

export function boardFlipAngle(base: number, t: number) {
  const k = Math.min(t / flipSeconds, 1);
  return base + Math.PI * k * k * (3 - 2 * k);
}

export function exhibitBoardRotation(board: ExhibitPartShape, angle: number) {
  return board.rotation.clone().multiply(new Quaternion().setFromAxisAngle(hingeAxis, angle));
}

export function exhibitRecordPose(from: Vector3, to: Vector3, placement: Matrix4, time: number, front: boolean) {
  const k = Math.min(1, time / .9), pulse = k === 1 ? 0 : Math.sin(k * Math.PI);
  const local = from.clone().lerp(to, k * k * (3 - 2 * k));
  local.z += pulse * .35 * (front ? 1 : .6);
  return { local, position: local.clone().applyMatrix4(placement), angle: pulse * .25 * (front ? 1 : -1) };
}

export function exhibitBoardSweepClear(world: World, rapier: Pick<typeof Rapier, 'Cuboid'>,
  board: ExhibitPartShape, from: number, to: number) {
  const pivot = new Vector3(...board.position);
  return exhibitSweepClear(world, rapier, board, pivot, pivot, exhibitBoardRotation(board, (from + to) / 2),
    Math.abs(to - from), Math.hypot(board.edge.y, board.edge.z));
}

export function exhibitSweepClear(world: World, rapier: Pick<typeof Rapier, 'Cuboid'>, part: ExhibitPartShape,
  from: Vector3, to: Vector3, rotation: Quaternion, angularDistance: number, edgeRadius: number) {
  const position = from.clone().lerp(to, .5).add(part.center.clone().applyQuaternion(rotation));
  const halfStep = to.clone().sub(from).multiplyScalar(.5).applyQuaternion(rotation.clone().invert());
  // Bound the continuous sweep around the mid-angle, including the motion between physics ticks.
  const pad = 2 * edgeRadius * Math.sin(angularDistance / 4) + .002;
  const shape = new rapier.Cuboid(part.half.x + Math.abs(halfStep.x) + pad,
    part.half.y + Math.abs(halfStep.y) + pad, part.half.z + Math.abs(halfStep.z) + pad);
  let clear = true;
  world.intersectionsWithShape(position, rotation, shape, () => { clear = false; return false; },
    undefined, undefined, undefined, undefined, c => !c.isSensor() && !!c.parent()?.isDynamic());
  return clear;
}
