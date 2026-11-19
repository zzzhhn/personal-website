import type { Object3D } from 'three';

export type CoasterCollisionReview = { active: boolean; occupied: boolean; preparing: boolean; renderedNear: boolean };

/** Require the contact roots whose owner and visual asset have entered their
 * physical phase. Do not read the registrations under review to select roots. */
export function coasterCollisionReviewRoots(scene: Object3D): string[] {
  const attraction = scene.getObjectByName('intent-coaster');
  const state = attraction?.userData.coasterCollisionReview as CoasterCollisionReview | undefined;
  if (!attraction || !state) return [];
  const enabled = state.active || state.occupied;
  const architecture = enabled || (state.preparing && state.renderedNear);
  const roots: string[] = [];
  if (architecture && attraction.getObjectByName('coaster-gate-craft-static')) roots.push('coaster-gate-portal-contact');
  if (architecture && attraction.getObjectByName('coaster-station-craft')) roots.push('coaster-station-architecture-contact');
  // Both leaves use the same GLB lease. Once it resolves the scope expects both.
  if (enabled && attraction.getObjectByName('coaster-gate-craft-leaf')) roots.push('coaster-gate-leaves');
  if (state.active && !state.occupied && attraction.getObjectByName('coaster-train-craft')) roots.push('coaster-train-craft');
  if (architecture && attraction.getObjectByName('coaster-rail-footings-contact')) roots.push('coaster-rail-footings-contact');
  return roots;
}
