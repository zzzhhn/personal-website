import type { Object3D } from 'three';

export type CoasterCollisionReview = { active: boolean; occupied: boolean; preparing: boolean; renderedNear: boolean };
const SITE_CONTACT = 'coaster-site-contact';

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
  for (const name of ['coaster-workshop-installed-contact','coaster-chest-installed-contact']) {
    if (enabled && attraction.getObjectByName(name)) roots.push(name);
  }
  if (state.active && !state.occupied && attraction.getObjectByName('coaster-train-craft')) roots.push('coaster-train-craft');
  if (architecture && attraction.getObjectByName('coaster-rail-footings-contact')) roots.push('coaster-rail-footings-contact');
  if (architecture && attraction.getObjectByName('coaster-running-rails-contact')) roots.push('coaster-running-rails-contact');
  if (architecture && attraction.getObjectByName('coaster-rail-steel-contact')) roots.push('coaster-rail-steel-contact');
  if (architecture && attraction.getObjectByName('coaster-site-structure')) roots.push(SITE_CONTACT);
  return roots;
}

/** Far scenery stays visible before the venue enables its local contact bodies.
 * The train also releases its exterior walking contacts while the rider owns it. */
export function coasterDistantCollisionRoots(scene: Object3D): Object3D[] {
  const site = scene.getObjectByName('intent-coaster');
  const phase = site?.userData.coasterCollisionReview as CoasterCollisionReview | undefined;
  if (!site || !phase) return [];
  const enabled = phase.active || phase.occupied;
  const names = new Set<string>();
  if (!enabled && !(phase.preparing && phase.renderedNear)) {
    for (const name of ['coaster-gate-portal-contact', 'coaster-station-architecture-contact',
      'coaster-rail-footings-contact', 'coaster-running-rails-contact', 'coaster-rail-steel-contact', SITE_CONTACT]) names.add(name);
  }
  if (!enabled) names.add('coaster-gate-leaves');
  if (!phase.active || phase.occupied) names.add('coaster-train-craft');
  const nodes: Object3D[] = [];
  site.traverse(node => { if (names.has(node.name)) nodes.push(node); });
  return nodes;
}

/** The short walkway is drawn in the coaster's paving batch. Its fixed mesh
 * starts with the approach road, so approaching players get support even
 * while the coaster's local details load. Supply that same scene node. */
export function coasterSharedSupplies(scene: Object3D, includeDistant = false) {
  if (!coasterCollisionReviewRoots(scene).includes(SITE_CONTACT)
    && !(includeDistant && coasterDistantCollisionRoots(scene).some(node => node.name === SITE_CONTACT))) return [];
  const approach = scene.getObjectByName('north-attractions-approach');
  const id = 'coaster-arrival-walk';
  const nodes = approach?.getObjectsByProperty('name', id) ?? [];
  // Keep a missing or duplicate permanent walkway observable in complete captures,
  // including from camp while all of the coaster's local bodies are unloaded.
  if (includeDistant && nodes.length !== 1) return [{ root: SITE_CONTACT, collider: null, missingId: id }];
  return nodes.map(collider => ({ root: SITE_CONTACT, collider }));
}
