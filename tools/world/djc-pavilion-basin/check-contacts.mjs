import assert from 'node:assert/strict';
import { Color, Vector3 } from 'three';
import { buildDjcClubGeometry } from '../../../src/components/world/WorldDjcClubGeometry.ts';
import { CLUB_POOL } from '../../../src/components/world/djc-club-layout.ts';

globalThis.window = { location: { search: '?djcBasin=candidate' } };
const { batches } = buildDjcClubGeometry();
delete globalThis.window;
function vertices(batch, color) {
  const { position, color: rgb } = batches[batch].attributes;
  const target = new Color(color);
  const result = [];
  for (let i = 0; i < position.count; i++) {
    if (Math.abs(rgb.getX(i) - target.r) + Math.abs(rgb.getY(i) - target.g) + Math.abs(rgb.getZ(i) - target.b) < 1e-5)
      result.push(new Vector3(position.getX(i), position.getY(i), position.getZ(i)));
  }
  return result;
}
const has = (points, target) => points.some(p => p.distanceToSquared(new Vector3(...target)) < 1e-9);
const roofY = (x, z) => 7.3 + 3.6 * (1 - (Math.abs(z - 55) / 13.2) ** 1.65) + .025 * (x - 26);
const brace = vertices('wood', '#b28b52');
const bearing = vertices('wood', '#af884b');
const rafter = vertices('wood', '#775830');
const liner = vertices('stone', '#78968f');
const coping = vertices('stone', '#afa38a');
const floor = vertices('stone', '#9cafaa');
assert.equal(brace.length, 12 * 32 * 3);
assert.equal(bearing.length, 6 * 32 * 3);
let roofJoints = 0;
for (const x of [28, 37, 47]) for (const side of [-1, 1]) {
  const pz = side < 0 ? 44.15 : 65.65, kz = side < 0 ? 50.6 : 59.2;
  const kx = Math.max(26.12, x - 3.35);
  const bz = side < 0 ? 52.75 : 57.05;
  for (const [points, px, z, offset] of [[brace, x, pz, .17], [brace, kx, kz, .17], [bearing, x, bz, .15]]) {
    assert(has(points, [px, roofY(px, z) - offset, z]), 'actual tube cap enters the purlin');
    assert(Math.abs((z - 42) / 2.15 - Math.round((z - 42) / 2.15)) < 1e-6);
    assert(px > 26 && px < 50 && Math.abs(offset - .17) < .085);
    roofJoints++;
  }
  for (const [start, oldEnd] of [
    [[x, 7.85, 55 + side * 10.505], [x, 7.9, 55 + side * 10.5]],
    [[x - 1.97, 7.049, 55 + side * 7.254], [x - 2, 7.1, 55 + side * 7.2]],
  ]) {
    assert(has(brace, start));
    assert(new Vector3(...start).distanceTo(new Vector3(...oldEnd)) < .09);
    roofJoints++;
  }
}
for (const x of [28,31,34,37,40,43,47]) for (const j of [0,7,14,21,28]) {
  const z = 41.8 + j * 26.4 / 28;
  assert(has(rafter, [x-.094, roofY(x-.094, z)-.135, z]));
  assert(has(rafter, [x-.094, roofY(x-.094, z)-.244, z]));
  roofJoints++;
}
let linedSegments = 0;
for (let i = 0; i < CLUB_POOL.segments; i++) {
  const a = i * Math.PI * 2 / CLUB_POOL.segments;
  const b = (i + 1) * Math.PI * 2 / CLUB_POOL.segments;
  const mid = (a + b) / 2;
  if (Math.abs(Math.cos(mid)) < .22 || Math.abs(Math.sin(mid)) < .28) continue;
  for (const angle of [a,b]) {
    const [x,z] = CLUB_POOL.boundary(angle);
    const y = CLUB_POOL.floorHeight(x,z);
    assert(has(coping, [x,1.29,z]) && has(liner, [x,1.29,z]), 'liner meets coping');
    assert(has(floor, [x,y,z]) && has(liner, [x,y-.006,z]), 'liner runs below the floor datum');
  }
  linedSegments++;
}
assert.equal(liner.length, linedSegments * 6, 'no liner across the access slopes');
console.log(JSON.stringify({ roofContactChecks: roofJoints, linedSegments, openSegments: CLUB_POOL.segments - linedSegments }));
