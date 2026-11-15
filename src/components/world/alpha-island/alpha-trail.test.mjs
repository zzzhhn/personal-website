import test from 'node:test';
import assert from 'node:assert/strict';
import { ALPHA_TRAIL_STOPS, nearestAlphaTrailStop } from './alpha-trail.ts';
import { alphaWorld } from './alpha-layout.ts';

test('paper card selects each real station by three-dimensional position', () => {
  for (const stop of ALPHA_TRAIL_STOPS) assert.equal(nearestAlphaTrailStop(alphaWorld(stop.point)), stop.n);
  assert.equal(nearestAlphaTrailStop(alphaWorld([2,83,39])), 11);
  assert.notEqual(nearestAlphaTrailStop(alphaWorld([2,24,39])), 11, 'below the summit is not at the summit');
});
test('invalid arrival data cannot pick an arbitrary high station', () => {
  assert.equal(nearestAlphaTrailStop([NaN,83,230]), 1);
  assert.equal(nearestAlphaTrailStop([]), 1);
});
