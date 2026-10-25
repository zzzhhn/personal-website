// Run from repository root (existing TypeScript dependency; no tsx package needed):
// node --import ./tools/world/alpha-mine-tests/register.mjs --test src/components/world/alpha-mine-layout.test.mjs
// This test imports app TSX and extensionless modules, so Node's strip-types flag alone is insufficient.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALPHA_MINE_ORIGIN, ALPHA_MINE_FOOTPRINT, ALPHA_MINE_CONNECTOR, ALPHA_MINE_CONNECTOR_WIDTH, isOnAlphaMineBase, mineLocalToWorld } from './alpha-mine-layout.ts';
import { ALL_HUTS, HUTS, EXHIBITS, nearestOnWalk } from './WorldParkLayout.ts';
import { BOARDWALK_POINTS, BOOTHS } from './layout.ts';
import { buildWalk } from './WorldParkWalk.tsx';

test('entrance frame gives the facility a one metre independent base margin', () => {
  assert.deepEqual(mineLocalToWorld([0, 0, 0]), [60, 1.14, -55]);
  assert.deepEqual(mineLocalToWorld([-16, 3, -36]), [44, 4.14, -91]);
  assert.deepEqual(mineLocalToWorld([16, 6, 0]), [76, 7.14, -55]);
  assert.deepEqual(ALPHA_MINE_FOOTPRINT, { minX: 43, maxX: 77, minZ: -92, maxZ: -54 });
  for (const [x, z] of [[43, -92], [77, -54], [60, -73]]) assert.equal(isOnAlphaMineBase(x, z), true);
  for (const [x, z] of [[42.9, -73], [77.1, -73], [60, -92.1], [60, -53.9], [26, -42]]) assert.equal(isOnAlphaMineBase(x, z), false);
});

test('connector reaches the level entrance while preserving the former rail opening', () => {
  assert.equal(ALPHA_MINE_CONNECTOR_WIDTH, 3);
  assert.deepEqual(ALPHA_MINE_CONNECTOR.at(-1), ALPHA_MINE_ORIGIN);
  assert.ok(ALPHA_MINE_CONNECTOR.every(p => p[1] === 1.14));
  const old = ALL_HUTS.find(h => h.id === 'alpha-agent').spur.to;
  assert.ok(Math.hypot(old[0] - ALPHA_MINE_CONNECTOR[0][0], old[2] - ALPHA_MINE_CONNECTOR[0][2]) < 1e-6);
  const at = nearestOnWalk(ALPHA_MINE_CONNECTOR[0][0], ALPHA_MINE_CONNECTOR[0][2]);
  assert.equal(at.seg, 0);
  const a = BOARDWALK_POINTS[0], b = BOARDWALK_POINTS[1], length = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const dx = (b[0] - a[0]) / length, dz = (b[2] - a[2]) / length;
  const side = Math.sign((ALPHA_MINE_CONNECTOR[0][0] - at.x) * -dz + (ALPHA_MINE_CONNECTOR[0][2] - at.z) * dx);
  const walk = buildWalk(true), halfGap = 1.75, opening = at.t * length;
  const rails = walk.rails.filter(r => r.id.startsWith(`rail-0-${side > 0 ? 'r' : 'l'}-`));
  assert.ok(rails.length > 0);
  for (const rail of rails) {
    const center = (rail.position[0] - a[0]) * dx + (rail.position[2] - a[2]) * dz;
    assert.ok(center + rail.length / 2 <= opening - halfGap || center - rail.length / 2 >= opening + halfGap, `${rail.id} blocks the connector`);
  }
  for (const g of [walk.deck, walk.solid, ...walk.groups.flatMap(g => [g.deck, g.solid])]) g.dispose();
});

test('Alpha keeps its directory identity while the other five physical projects stay intact', () => {
  assert.deepEqual(ALL_HUTS.map(h => h.id), BOOTHS.map(b => b.id));
  assert.deepEqual(HUTS.map(h => h.id), BOOTHS.filter(b => b.id !== 'alpha-agent').map(b => b.id));
  assert.equal(HUTS.length, 5);
  assert.equal(EXHIBITS['alpha-agent'], undefined);
  assert.deepEqual(EXHIBITS.accompany.map(e => e.id), ['P16', 'P17']);
});
