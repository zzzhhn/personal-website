import type { World } from '@dimforge/rapier3d-compat';
import type { Object3D } from 'three';
import { ALPHA_BATCH2_ARRIVALS } from './alpha-batch2-layout';
import { alphaWorld } from './alpha-layout';
import type { Vec3 } from '../types';
import { mountedCollidersReady, FIXED_TRIMESH } from '../collider-readiness';

/** Named public Alpha arrivals wait for their independently lazy district. */
export function namedAlphaArrival(start: string | null): Vec3 | null {
  return start && Object.hasOwn(ALPHA_BATCH2_ARRIVALS, start) ? alphaWorld(ALPHA_BATCH2_ARRIVALS[start]) : null;
}

/** Asset availability is insufficient: require the real enabled fixed trimesh. */
export function alphaTerrainColliderMounted(world: Pick<World, 'getCollider'>,
  colliderStates: ReadonlyMap<number, { object: Object3D }>) {
  return mountedCollidersReady(world, colliderStates, [{name:'alpha-terrain-patch',shape:FIXED_TRIMESH}]);
}
