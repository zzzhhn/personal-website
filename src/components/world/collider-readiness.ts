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
    const body=collider?.parent();
    if(!collider || !collider.isEnabled() || collider.isSensor() || !body?.isFixed() || !body.isEnabled())continue;
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

/** Positive results revalidate their real handles immediately. Missing groups retry
 * at most every 100 ms unless the mounted handle inventory changes first. */
export function createColliderReadinessProbe(world: Pick<World,'getCollider'>, states: MountedColliderStates,
  clock:()=>number=()=>performance.now()) {
  const cache=new WeakMap<readonly ColliderRequirement[],{handles:number[][];size:number;at:number;ready:boolean}>();
  const matches=(handle:number,need:ColliderRequirement)=>{
    const state=states.get(handle),collider=world.getCollider(handle);
    const body=collider?.parent();
    if(!state||!collider||!collider.isEnabled()||collider.isSensor()||!body?.isFixed()||!body.isEnabled()
      ||need.shape!==undefined&&collider.shapeType()!==need.shape)return false;
    for(let object:Object3D|null=state.object;object;object=object.parent)if(object.name===need.name)return true;
    return false;
  };
  return (requirements:readonly ColliderRequirement[])=>{
    if(!requirements.length)return true;
    const now=clock(),old=cache.get(requirements);
    if(old?.ready&&requirements.every((need,i)=>old.handles[i].every(handle=>matches(handle,need))))return true;
    if(old&&!old.ready&&old.size===states.size&&now-old.at<100)return false;
    const handles=requirements.map(need=>{
      const found:number[]=[];
      for(const handle of states.keys())if(matches(handle,need)) {
        found.push(handle);if(found.length>=(need.count??1))break;
      }
      return found;
    });
    const ready=requirements.every((need,i)=>handles[i].length>=(need.count??1));
    cache.set(requirements,{handles,size:states.size,at:now,ready});
    return ready;
  };
}
