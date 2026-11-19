import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Scene } from 'three';
import { coasterCollisionReviewRoots, coasterSharedSupplies } from './coaster-collision-review.ts';

const roots = ['coaster-gate-portal-contact','coaster-station-architecture-contact','coaster-gate-leaves','coaster-train-craft',
  'coaster-rail-footings-contact','coaster-running-rails-contact','coaster-rail-steel-contact','coaster-site-contact'];
const visualAssets = ['coaster-gate-craft-static','coaster-station-craft','coaster-gate-craft-leaf','coaster-train-craft',
  'coaster-rail-footings-contact','coaster-running-rails-contact','coaster-rail-steel-contact','coaster-site-structure'];

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
  assert.deepEqual(coasterCollisionReviewRoots(scene), [...roots.slice(0,2), ...roots.slice(4)]);
  state.preparing = false; state.active = true;
  assert.deepEqual(coasterCollisionReviewRoots(scene), roots, 'every scope is required before any collider is inspected');
  state.occupied = true; state.active = false;
  assert.deepEqual(coasterCollisionReviewRoots(scene), [...roots.slice(0,3), ...roots.slice(4)]);
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

test('only the physical node owned by the approach can supply the site walkway before a coaster round trip', () => {
  const scene = new Scene();
  const coaster = new Group(); coaster.name = 'intent-coaster'; scene.add(coaster);
  const site = new Group(); site.name = 'coaster-site-structure'; coaster.add(site);
  const approach = new Group(); approach.name = 'north-attractions-approach'; scene.add(approach);
  const body = new Group(); approach.add(body);
  const collider = new Group(); collider.name = 'coaster-arrival-walk'; body.add(collider);
  const unrelated = new Group(); unrelated.name = collider.name; scene.add(unrelated);
  const state = { active: false, occupied: false, preparing: true, renderedNear: false };
  coaster.userData.coasterCollisionReview = state;
  assert.deepEqual(coasterSharedSupplies(scene),[]);
  state.renderedNear = true;
  assert.deepEqual(coasterSharedSupplies(scene),[{root:'coaster-site-contact',collider}]);
  body.remove(collider);
  assert.deepEqual(coasterSharedSupplies(scene),[]);
  body.add(collider);
  state.preparing = false; state.occupied = true;
  assert.deepEqual(coasterSharedSupplies(scene),[{root:'coaster-site-contact',collider}]);
  state.occupied = false;
  assert.deepEqual(coasterSharedSupplies(scene),[]);
});

test('complete atlas audits the permanent approach even with the coaster far away', async()=>{
  const {coasterDistantCollisionRoots} = await import('./coaster-collision-review.ts');
  const scene = new Scene(), venue = new Group(), site = new Group(), train = new Group(), road = new Group();
  venue.name = 'intent-coaster'; site.name = 'coaster-site-contact'; train.name = 'coaster-train-craft';
  const view = new Group(); view.name = 'coaster-site-structure';
  site.add(view); venue.add(site,train); scene.add(venue,road); road.name = 'north-attractions-approach';
  const phase = {active:false,occupied:false,preparing:false,renderedNear:false};
  venue.userData.coasterCollisionReview = phase;
  assert.deepEqual(coasterDistantCollisionRoots(scene), [site,train]);
  assert.equal(coasterSharedSupplies(scene,true)[0].missingId,'coaster-arrival-walk');
  const deck = new Group(); deck.name = 'coaster-arrival-walk'; road.add(deck);
  assert.deepEqual(coasterSharedSupplies(scene,true),[{root:site.name,collider:deck}]);
  road.add(deck.clone()); assert.equal(coasterSharedSupplies(scene,true)[0].collider,null);
  phase.active=true; assert.deepEqual(coasterDistantCollisionRoots(scene),[]);
  phase.occupied=true; assert.deepEqual(coasterDistantCollisionRoots(scene),[train]);
});
