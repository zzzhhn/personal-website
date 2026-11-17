import type { World } from '@dimforge/rapier3d-compat';
import type { Object3D } from 'three';
import type { Vec3 } from './types';
import type { useWorldStore } from './store';
import type { roadLandingCandidates } from './world-travel';
import type { RegionPassage } from './region-passage';

export type ActorZone = ReturnType<typeof useWorldStore.getState>['zone'];
export interface ActorArrival {
  position: Vec3;
  yaw: number;
  cameraYaw: number;
  cameraPitch: number;
  waitForColliders: boolean;
  /** Ground anchor requiring actual collider registration before activating the body. */
  ground: Vec3 | null;
  collidersReady: (world: Pick<World,'getCollider'>, states: ReadonlyMap<number,{object:Object3D}>) => boolean;
}
/** Supplied by world assembly, not imported from venues by the actor controller. */
export interface ActorSites {
  arrival: (search: string, development: boolean) => ActorArrival;
  zone: (position: Vec3, fallback?: ActorZone) => ActorZone;
  rideZone: (position: Vec3, hasDriver: boolean) => ActorZone;
  recoveryCandidates: (position: Vec3) => Vec3[];
  roadCandidates: (position: Vec3) => ReturnType<typeof roadLandingCandidates>;
  passage: (world: Pick<World,'getCollider'>, states: ReadonlyMap<number,{object:Object3D}>) => RegionPassage;
}
