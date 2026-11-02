import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Color } from 'three';
import { families, loadWorldModule, ROOT } from './runtime.mjs';

const A = loadWorldModule(), oldA = loadWorldModule('WorldStreetAssets.ts', '', true);
const current = families(A), old = families(oldA), legacy = families(loadWorldModule('WorldStreetAssets.ts', '?facilityCraft=legacy'));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const visual = b => [b.pos, b.nrm, b.col, b.mat, b.suv, b.idx, b.parts, b.cell];
const proxies = b => b.hulls().map(a => Array.from(a));

test('all eight facility families keep exact baseline hulls and legacy geometry', () => {
  for (const id of Object.keys(current)) for (const level of [0, 1]) {
    assert.equal(digest(proxies(current[id][level])), digest(proxies(old[id][level])), `${id} L${level} collision`);
    assert.equal(digest(visual(legacy[id][level])), digest(visual(old[id][level])), `${id} L${level} legacy`);
    if (level === 1) assert.equal(digest(visual(current[id][level])), digest(visual(old[id][level])), `${id} distant source`);
    else assert.notEqual(digest(visual(current[id][level])), digest(visual(old[id][level])), `${id} has a real construction change`);
  }
});

test('candidate attributes, triangle winding and geometric normals are valid', () => {
  for (const [id, pair] of Object.entries(current)) for (const B of pair) {
    const count = B.pos.length / 3;
    assert.equal(B.nrm.length, count * 3); assert.equal(B.col.length, count * 3);
    assert.equal(B.mat.length, count * 4); assert.equal(B.suv.length, count * 2);
    for (const a of [B.pos, B.nrm, B.col, B.mat, B.suv]) assert.ok(a.every(Number.isFinite), `${id} finite`);
    assert.ok(B.idx.every(i => Number.isInteger(i) && i >= 0 && i < count));
    for (let i = 0; i < B.idx.length; i += 3) {
      const [a, b, c] = B.idx.slice(i, i + 3).map(v => B.pos.slice(v * 3, v * 3 + 3));
      const u = b.map((x, j) => x - a[j]), v = c.map((x, j) => x - a[j]);
      const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      assert.ok(Math.hypot(...cross) > 1e-10, `${id} degenerate face`);
      const normalSum = [0, 1, 2].map(axis => B.idx.slice(i, i + 3).reduce((sum, vertex) => sum + B.nrm[vertex * 3 + axis], 0));
      assert.ok(cross.reduce((sum, x, axis) => sum + x * normalSum[axis], 0) > 0, `${id} winding disagrees with shading normals`);
    }
    for (let i = 0; i < B.nrm.length; i += 3) assert.ok(Math.abs(Math.hypot(...B.nrm.slice(i, i + 3)) - 1) < 1e-8, `${id} unit normal`);
  }
});

test('seat datums, atlas faces, lighting codes and untouched lamp variants keep their interfaces', () => {
  for (const key of ['BENCH_SEAT_LOCAL', 'SHELTER_SEAT_LOCAL', 'LAMP_HEAD_LOCAL']) assert.equal(digest(A[key]), digest(oldA[key]), key);
  const poster = b => {
    const data = [];
    for (let i = 0; i < b.pos.length / 3; i++) if (b.mat[i * 4 + 3] === 1) data.push(...b.pos.slice(i * 3, i * 3 + 3), ...b.mat.slice(i * 4, i * 4 + 4), ...b.suv.slice(i * 2, i * 2 + 2));
    return data;
  };
  assert.equal(digest(poster(current.shelter[0])), digest(poster(old.shelter[0])));
  for (const [id, expected] of [['lamp', [1, 2]], ['signal', [3, 4, 5]], ['shelter', [2, 7]], ['roadblock', [6]]]) {
    const codes = new Set(current[id][0].mat.filter((_, i) => i % 4 === 2));
    expected.forEach(code => assert.ok(codes.has(code), `${id} glow ${code}`));
  }
  for (const height of [2.3, 2.6]) {
    const opts = { height, arm: 0, cyanRing: false };
    assert.equal(digest(visual(A.lampGeometry(opts))), digest(visual(oldA.lampGeometry(opts))), 'year/park shared post-top lamps untouched');
  }
  assert.equal(digest(proxies(A.yearPillar(0, [0, 0, 1, 1]))), digest(proxies(oldA.yearPillar(0, [0, 0, 1, 1]))), 'year placard physics');
});

test('varying rail lengths retain their roots and baseline physics; static trimeshes use the proxy', () => {
  for (const len of [.8, 2, 4.2, 7.35]) for (const name of ['timberBeam', 'seawallBay']) {
    assert.equal(digest(proxies(A[name](0, len))), digest(proxies(oldA[name](0, len))), `${name} ${len} m`);
  }
  const fixed = readFileSync(`${ROOT}/src/components/world/WorldStreetStatic.tsx`, 'utf8');
  assert.ok(fixed.includes('const proxy = streetFacilityCollision(k.L0);'));
  assert.ok(fixed.includes("k.collide === 'trimesh' && proxy !== k.L0 ? proxy.build()"));
  const C = loadWorldModule('WorldStreetFacilityCraft.ts');
  const original = oldA.benchGeometry(0), crafted = C.finishStreetFacility(original, 'bench', 0);
  assert.equal(C.streetFacilityCollision(crafted), original);
  assert.equal(digest(C.streetFacilityCollision(crafted).pos), digest(original.pos));
});

test('all four roadblock steel legs meet their original rubber feet and upper hinge', () => {
  const B = current.roadblock[0], steel = new Color('#3B4C5E');
  const isSteel = i => Math.abs(B.col[i * 3] - steel.r) < 1e-10 && Math.abs(B.col[i * 3 + 1] - steel.g) < 1e-10 && Math.abs(B.col[i * 3 + 2] - steel.b) < 1e-10;
  for (const x of [-.56, .56]) for (const side of [-1, 1]) {
    const points = [];
    for (let i = 0; i < B.pos.length / 3; i++) {
      if (isSteel(i) && Math.abs(B.pos[i * 3] - x) < .03 && Math.sign(B.pos[i * 3 + 2]) === side) points.push(B.pos.slice(i * 3, i * 3 + 3));
    }
    const bottom = points.filter(p => p[1] < .04);
    assert.ok(bottom.length > 0, `leg ${x}/${side} penetrates the shoe height`);
    assert.ok(bottom.every(p => p[1] >= 0 && Math.abs(p[2] - side * .3) <= .07 && Math.abs(p[0] - x) <= .065), `leg ${x}/${side} sits inside the unchanged rubber shoe footprint`);
    const top = points.filter(p => p[1] > .94);
    assert.ok(top.some(p => p[1] <= .99 && Math.abs(p[2]) < .065), `leg ${x}/${side} enters the hinge block`);
    const bottomZ = bottom.reduce((sum, p) => sum + Math.abs(p[2]), 0) / bottom.length;
    const topZ = top.reduce((sum, p) => sum + Math.abs(p[2]), 0) / top.length;
    assert.ok(bottomZ > topZ + .20, 'the trestle opens toward the ground, not toward the hinge');
  }
});
