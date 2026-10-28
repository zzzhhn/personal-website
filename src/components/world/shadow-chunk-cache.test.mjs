import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Matrix4, Vector3 } from 'three';
import { ShadowChunkCache } from './shadow-chunk-cache.ts';

const cells = [12, 20, 32], right = new Vector3(.8, 0, -.6), up = new Vector3(.2, .94, .266);
const sources = rows => rows.map(r => ({ id: r.id, version: r.version ?? 'v1' }));
const fill = (rows, visited = []) => {
  const byId = new Map(rows.map(r => [r.id, r]));
  return (id, builder) => {
    visited.push(id);
    const r = byId.get(id);
    for (const part of r.parts ?? [{ geometry: r.geometry, cascades: r.cascades ?? [0, 1, 2] }])
      builder.add(part.geometry, r.matrix ?? new Matrix4(), part.cascades, r.side ?? 0, r.zone ?? 'other');
  };
};
function triangles(geometry) {
  const p = geometry.getAttribute('position'), index = geometry.index, out = [];
  for (let i = 0; i < index.count; i += 3) {
    const values = [];
    for (let k = 0; k < 3; k++) {
      const v = index.getX(i + k); values.push(p.getX(v), p.getY(v), p.getZ(v));
    }
    // Triangle order can change on append, but winding and coordinates must match.
    out.push(values.join(','));
  }
  return out.sort();
}
function equalChunks(actual, expected) {
  assert.deepEqual([...actual.keys()].sort(), [...expected.keys()].sort());
  for (const [key, a] of actual) {
    const b = expected.get(key);
    assert.equal(a.side, b.side); assert.equal(a.cascade, b.cascade);
    assert.deepEqual([...a.zones].sort(), [...b.zones].sort());
    assert.deepEqual(a.lightBounds, b.lightBounds);
    assert.deepEqual(a.geometry.boundingSphere, b.geometry.boundingSphere);
    assert.deepEqual(triangles(a.geometry), triangles(b.geometry));
  }
}

test('184 -> 197 stable casters bins only 13 additions, retaining untouched chunks and all full-rebuild triangles', t => {
  const box = new BoxGeometry(2, 3, 2), heavy = new BoxGeometry(15, 3, 20, 12, 2, 12);
  const rows = Array.from({ length: 184 }, (_, i) => ({ id: `old${i}`, geometry: i ? box : heavy,
    matrix: new Matrix4().makeTranslation((i % 23) * 16 - 160, i % 3, Math.floor(i / 23) * 16 - 48), side: i % 2, zone: i % 2 ? 'town' : 'other' }));
  const late = Array.from({ length: 13 }, (_, i) => ({ ...rows[i + 1], id: `late${i}` }));
  // Interleave late sources: append correctness must not depend on traversal order.
  const final = rows.flatMap((r, i) => i < late.length ? [late[i], r] : [r]);
  const cache = new ShadowChunkCache(cells, right, up), full = new ShadowChunkCache(cells, right, up);
  t.after(() => { cache.dispose(); full.dispose(); box.dispose(); heavy.dispose(); });
  cache.update(sources(rows), fill(rows));
  const previous = new Map(cache.chunks), disposed = new Set();
  for (const [key, chunk] of previous) chunk.geometry.addEventListener('dispose', () => disposed.add(key));
  let heavyReads = 0; const p = heavy.getAttribute('position'), getX = p.getX;
  p.getX = function(i) { heavyReads++; return getX.call(this, i); };
  const visited = [], start = performance.now();
  const stats = cache.update(sources(final), fill(final, visited)), appendMs = performance.now() - start;
  assert.equal(stats.mode, 'append'); assert.equal(stats.builtSources, 13); assert.equal(stats.reusedSources, 184);
  assert.equal(visited.length, 13); assert.equal(heavyReads, 0);
  assert.ok(stats.reusedChunks > 0); assert.equal(cache.chunks.size, previous.size);
  assert.equal(disposed.size, stats.rebuiltChunks);
  for (const [key, old] of previous) if (!disposed.has(key)) assert.equal(cache.chunks.get(key), old);
  const beginFull = performance.now(); full.update(sources(final), fill(final)); const fullMs = performance.now() - beginFull;
  assert.ok(heavyReads > 0); p.getX = getX;
  equalChunks(cache.chunks, full.chunks);
  t.diagnostic(JSON.stringify({ fixture: 'synthetic 184+13, not production scene', ...stats, chunks: cache.chunks.size, appendMs, fullMs }));
});

test('unchanged/reordered sources rebuild no geometry; removal, movement, geometry/side/zone revisions rebuild conservatively', t => {
  const geometry = new BoxGeometry(), cache = new ShadowChunkCache(cells, right, up), full = new ShadowChunkCache(cells, right, up);
  t.after(() => { cache.dispose(); full.dispose(); geometry.dispose(); });
  let rows = [{ id: 'a', geometry }, { id: 'b', geometry, matrix: new Matrix4().makeTranslation(-30, 7, 12) }];
  cache.update(sources(rows), fill(rows)); const before = [...cache.chunks.values()];
  for (let i = 0; i < 100; i++) {
    const result = cache.update(sources([...rows].reverse()), () => assert.fail('unchanged source rebuilt'));
    assert.equal(result.mode, 'none'); assert.deepEqual([...cache.chunks.values()], before);
  }
  for (const revision of ['transform', 'geometry', 'side', 'zone']) {
    rows = rows.map((r, i) => i ? r : { ...r, version: revision, matrix: new Matrix4().makeTranslation(4, 2, 1), side: revision === 'side' ? 2 : 0, zone: revision === 'zone' ? 'park' : 'other' });
    const result = cache.update(sources(rows), fill(rows)); assert.equal(result.mode, 'rebuild'); assert.equal(result.changed, 1);
    full.dispose(); full.update(sources(rows), fill(rows)); equalChunks(cache.chunks, full.chunks);
  }
  rows = rows.slice(1);
  assert.equal(cache.update(sources(rows), fill(rows)).mode, 'rebuild');
  full.dispose(); full.update(sources(rows), fill(rows)); equalChunks(cache.chunks, full.chunks);
  let released = 0; for (const c of cache.chunks.values()) c.geometry.addEventListener('dispose', () => released++);
  const count = cache.chunks.size;
  cache.update([], () => assert.fail('empty set should not build'));
  assert.equal(released, count); assert.equal(cache.chunks.size, 0); assert.equal(cache.hasSource('b'), false);
});

test('mixed indexed/nonindexed, far hull selection, negative cells and source ownership survive append', t => {
  const indexed = new BoxGeometry(4, 8, 2), flat = indexed.toNonIndexed(), hull = new BoxGeometry(3, 6, 1);
  const geometries = [indexed, flat, hull]; let sourceDisposals = 0;
  for (const g of geometries) g.addEventListener('dispose', () => sourceDisposals++);
  const rows = [{ id: 'first', geometry: flat, matrix: new Matrix4().makeTranslation(-12, -3, -20), side: 2 },
    { id: 'second', matrix: new Matrix4().makeRotationZ(.4), side: 1, zone: 'camp', parts: [{ geometry: indexed, cascades: [0, 1] }, { geometry: hull, cascades: [2] }] }];
  const cache = new ShadowChunkCache(cells, right, up), full = new ShadowChunkCache(cells, right, up);
  cache.update(sources(rows.slice(0, 1)), fill(rows)); cache.update(sources(rows), fill(rows));
  full.update(sources(rows), fill(rows)); equalChunks(cache.chunks, full.chunks);
  cache.dispose(); full.dispose(); assert.equal(sourceDisposals, 0);
  geometries.forEach(g => g.dispose());
});

test('appending across the u16 primitive-restart boundary promotes indices without loss', t => {
  const make = count => {
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { p[i*3] = i % 3; p[i*3+1] = (i % 3) === 2 ? 1 : 0; }
    return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(p, 3));
  };
  const first = make(65532), last = make(6), cache = new ShadowChunkCache(cells, right, up);
  t.after(() => { cache.dispose(); first.dispose(); last.dispose(); });
  const rows = [{ id: 'first', geometry: first, cascades: [0] }, { id: 'last', geometry: last, cascades: [0] }];
  cache.update(sources(rows.slice(0, 1)), fill(rows));
  assert.ok([...cache.chunks.values()][0].geometry.index.array instanceof Uint16Array);
  cache.update(sources(rows), fill(rows));
  const geometry = [...cache.chunks.values()][0].geometry;
  assert.ok(geometry.index.array instanceof Uint32Array);
  assert.equal(geometry.index.count, 65538); assert.equal(geometry.index.getX(65537), 65537);
});

test('failed additions preserve the current cache and dispose releases only final owned chunks once', () => {
  const source = new BoxGeometry(), cache = new ShadowChunkCache(cells, right, up);
  const rows = [{ id: 'a', geometry: source }]; cache.update(sources(rows), fill(rows));
  const previous = cache.chunks; let disposed = 0;
  for (const c of previous.values()) c.geometry.addEventListener('dispose', () => disposed++);
  assert.throws(() => cache.update([...sources(rows), { id: 'b', version: 'v1' }], () => { throw Error('cancelled'); }), /cancelled/);
  assert.equal(cache.chunks, previous); assert.equal(disposed, 0); assert.equal(cache.hasSource('b'), false);
  const count = cache.chunks.size; cache.dispose(); cache.dispose();
  assert.equal(disposed, count); assert.equal(cache.chunks.size, 0); assert.equal(cache.hasSource('a'), false);
  source.dispose();
});
