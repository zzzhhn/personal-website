import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Scene } from 'three';
import { coasterCollisionReviewRoots } from './coaster-collision-review.ts';

const roots = ['coaster-gate-portal-contact','coaster-station-architecture-contact','coaster-gate-leaves','coaster-train-craft','coaster-rail-footings-contact'];
const visualAssets = ['coaster-gate-craft-static','coaster-station-craft','coaster-gate-craft-leaf','coaster-train-craft','coaster-rail-footings-contact'];

test('overlook visuals, portal preparation, local rest and a ride have different strict contact roots', () => {
  const scene = new Scene(), world = new Group(); world.name = 'intent-coaster'; scene.add(world);
  const state = { active: false, occupied: false, preparing: false, renderedNear: false };
  world.userData.coasterCollisionReview = state;
  assert.deepEqual(coasterCollisionReviewRoots(scene), []);
  for (const name of visualAssets) { const model = new Group(); model.name = name; world.add(model); }
  assert.deepEqual(coasterCollisionReviewRoots(scene), []);
  state.preparing = true;
  assert.deepEqual(coasterCollisionReviewRoots(scene), []);
  state.renderedNear = true;
  assert.deepEqual(coasterCollisionReviewRoots(scene), [roots[0], roots[1], roots[4]]);
  state.preparing = false; state.active = true;
  assert.deepEqual(coasterCollisionReviewRoots(scene), roots, 'every scope is required before any collider is inspected');
  state.occupied = true; state.active = false;
  assert.deepEqual(coasterCollisionReviewRoots(scene), [...roots.slice(0,3), roots[4]]);
  state.occupied = false;
  assert.deepEqual(coasterCollisionReviewRoots(scene), []);
});

test('each asset enters review only after the corresponding visual pack has mounted', () => {
  const scene = new Scene(), world = new Group(); world.name = 'intent-coaster'; scene.add(world);
  world.userData.coasterCollisionReview = { active: true, occupied: false, preparing: false, renderedNear: true };
  assert.deepEqual(coasterCollisionReviewRoots(scene), []);
  for (const [i, name] of visualAssets.entries()) {
    const model = new Group(); model.name = name; world.add(model);
    assert.deepEqual(coasterCollisionReviewRoots(scene), roots.slice(0,i + 1));
  }
});
