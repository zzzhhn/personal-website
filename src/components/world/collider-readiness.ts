import { ShapeType, type World } from '@dimforge/rapier3d-compat';
import type { Object3D } from 'three';

export interface ColliderRequirement { name: string; shape?: ShapeType; count?: number }
export type MountedColliderStates = ReadonlyMap<number,{object:Object3D}>;
/** Inspect the live physics handles as well as the mounted scene tree. A loaded asset,
 * stale Object3D, sensor or disabled/dynamic body cannot satisfy solid-ground readiness. */
export function mountedCollidersReady(world: Pick<World,'getCollider'>, states: MountedColliderStates,
  requirements: readonly ColliderRequirement[]) {
  if(!requirements.length)return true;
  const counts=requirements.map(()=>0);
  for(const [handle,state] of states) {
    const collider=world.getCollider(handle);
    if(!collider || !collider.isEnabled() || collider.isSensor() || !collider.parent()?.isFixed())continue;
    const names=new Set<string>();
    for(let object:Object3D|null=state.object;object;object=object.parent)names.add(object.name);
    for(let i=0;i<requirements.length;i++) {
      const need=requirements[i];
      if(names.has(need.name) && (need.shape===undefined || collider.shapeType()===need.shape))counts[i]++;
    }
  }
  return requirements.every((need,i)=>counts[i]>=(need.count??1));
}

export const FIXED_TRIMESH = ShapeType.TriMesh;
