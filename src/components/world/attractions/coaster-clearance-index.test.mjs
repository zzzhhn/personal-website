import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { PointClearanceIndex } from './coaster-clearance-index.ts';

// Independent copy of the existing support predicate, without importing a route
// or running any structure generation/module-level track precomputation.
const brute = (points, a, b, radius) => points.some(p => {
  const x = b.x - a.x, y = b.y - a.y, z = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.y - a.y) * y + (p.z - a.z) * z) / Math.max(1e-9, x * x + y * y + z * z)));
  return Math.hypot(p.x - a.x - x * t, p.y - a.y - y * t, p.z - a.z - z * t) < radius;
});
const v = (x, y = 0, z = 0) => new Vector3(x, y, z);

test('strict radius, endpoint clamping, zero-length and tiny segments match the old predicate', () => {
  const cases = [
    [[v(0, 1)], v(-2), v(2), 1, false],
    [[v(0, 1)], v(-2), v(2), 1 + Number.EPSILON, true],
    [[v(0, 1)], v(-2), v(2), 1 - Number.EPSILON, false],
    [[v(3)], v(-2), v(2), 1, false],
    [[v(3)], v(-2), v(2), 1.01, true],
    [[v(-4, -4, -4)], v(-4, -4, -4), v(-4, -4, -4), .01, true],
    [[v(0, 1)], v(0), v(0), 1, false],
    [[v(0)], v(0), v(0), 0, false],
    [[v(0)], v(0), v(1), -1, false],
    [[v(0)], v(0), v(1), NaN, false],
    // Preserve the old denominator floor, not a new tiny-segment convention.
    [[v(1e-6)], v(0), v(1e-6), 1e-8, false],
    [[], v(0), v(1), 1, false],
  ];
  for (const [points, a, b, radius, expected] of cases) {
    assert.equal(brute(points, a, b, radius), expected);
    assert.equal(new PointClearanceIndex(points).blocksSegment(a, b, radius), expected);
  }
});

test('expanded grid search includes adjacent cells, negative cells and long sparse spans', () => {
  const points = [v(4.01, -4.01, 8), v(-12, -8, -4), v(400, 2, 400), v(-400, 3, -400)];
  const index = new PointClearanceIndex(points);
  const queries = [
    [v(3.99, -4, 8), v(3.99, -4, 9), .03],
    [v(-20, -8, -4), v(20, -8, -4), .01],
    [v(-12, -7, -4), v(-12, -7, -4), 1],
    [v(-1e6, 50, -1e6), v(1e6, 50, 1e6), .4],
    [v(-1e6, 2, -1e6), v(1e6, 2, 1e6), .1],
    [v(0), v(0), Infinity],
  ];
  assert.equal(index.blocksSegment(...queries[0]), true);
  for (const q of queries) assert.equal(index.blocksSegment(...q), brute(points, ...q));
});

test('deterministic random segment blocking sets exactly equal brute force', () => {
  let seed = 0x91b5c3;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const point = () => v((random() - .5) * 96, (random() - .5) * 40, (random() - .5) * 96);
  const points = Array.from({ length: 384 }, point), index = new PointClearanceIndex(points);
  const expected = [], actual = [];
  for (let i = 0; i < 1200; i++) {
    const a = i % 4 === 0 ? points[i % points.length].clone() : point();
    const b = i % 7 === 0 ? a.clone() : point(), radius = .001 + random() * 3;
    if (brute(points, a, b, radius)) expected.push(i);
    if (index.blocksSegment(a, b, radius)) actual.push(i);
  }
  assert.ok(expected.length > 100 && expected.length < 1100);
  assert.deepEqual(actual, expected);
});

test('index owns a numeric snapshot and never mutates input points or segment endpoints', () => {
  const point = v(4, 5, 6), points = Object.freeze([point]), index = new PointClearanceIndex(points);
  const a = v(4, 5, 5), b = v(4, 5, 7), before = [a.toArray(), b.toArray(), point.toArray()];
  assert.equal(index.blocksSegment(a, b, .1), true);
  assert.deepEqual([a.toArray(), b.toArray(), point.toArray()], before);
  point.set(100, 100, 100); assert.equal(index.blocksSegment(a, b, .1), true);
  assert.throws(() => new PointClearanceIndex([v(NaN)]), RangeError);
  assert.throws(() => index.blocksSegment(v(Infinity), b, 1), RangeError);
});
