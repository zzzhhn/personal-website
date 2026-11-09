import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from 'three';
import { applyTerrainLodIndices, lodIndices } from './WorldTerrainLod.ts';

const indices = values => new Uint32Array(values);
const tile = (chunk, bi0, minX, offset) => ({
  chunk, bi0, bj0: 0, minX, maxX: minX + 16, minZ: 0, maxZ: 16,
  fine: indices([offset, offset + 1, offset + 2, offset + 2, offset + 1, offset + 3]),
  fineOpen: indices([offset, offset + 1, offset + 2]),
  coarseCore: indices([offset, offset + 2, offset + 3]),
  coarseCoreOpen: indices([]),
  edgePlain: indices([offset, offset + 3, offset + 4]),
  edgePlainOpen: indices([]),
  edge: [{ sides: [3],
    all: [indices([offset, offset + 3, offset + 4]), indices([offset, offset + 3, offset + 5, offset, offset + 5, offset + 4])],
    variants: [indices([]), indices([offset, offset + 5, offset + 4])],
  }],
});

test('LOD handoff preserves old-path bytes across focus and paving changes without another array copy', () => {
  const tiles = [tile(0, 0, 0, 0), tile(1, 8, 16, 70000)];
  const cached = tiles.map(t => Array.from(t.fine));
  const geometries = Array.from({ length: 4 }, () => new BufferGeometry());
  const sharedPositions = new Float32BufferAttribute([0, 0, 0], 3);
  geometries.forEach(g => g.setAttribute('position', sharedPositions));
  let previous = [];
  for (const [x, open] of [[8, false], [24, false], [24, true], [80, true], [8, false]]) {
    const next = lodIndices(tiles, x, 8, 10, open);
    const originals = [...next.chunks].map(([chunk, data]) => [chunk, data.slice()]);
    const oldPath = new Map([...next.chunks].map(([chunk, data]) => [chunk, new Uint32BufferAttribute(data, 1)]));
    applyTerrainLodIndices(geometries, next.chunks);
    let drawn = 0;
    geometries.forEach((geometry, chunk) => {
      const source = next.chunks.get(chunk);
      const attribute = geometry.getIndex();
      if (source) assert.strictEqual(attribute.array, source, 'fresh LOD output is adopted');
      assert.deepEqual(attribute.array, oldPath.get(chunk)?.array ?? indices([]));
      assert.equal(attribute.itemSize, 1);
      assert.equal(attribute.normalized, false);
      assert.deepEqual(geometry.drawRange, { start: 0, count: source?.length ?? 0 });
      assert.strictEqual(geometry.getAttribute('position'), sharedPositions);
      drawn += geometry.drawRange.count;
    });
    assert.equal(drawn / 3, next.triangles);
    for (const [chunk, saved] of originals) assert.deepEqual(next.chunks.get(chunk), saved);
    for (const { array, saved } of previous) assert.deepEqual(array, saved, 'later updates do not mutate old outputs');
    previous.push(...[...next.chunks.values()].map(array => ({ array, saved: array.slice() })));
  }
  assert.deepEqual(tiles.map(t => Array.from(t.fine)), cached);
  geometries.forEach(g => g.dispose());
});

test('an absent chunk clears stale indices and can return with 32-bit indices', () => {
  const geometry = new BufferGeometry();
  const large = indices([65536, 65537, 70000]);
  applyTerrainLodIndices([geometry], new Map([[0, large]]));
  assert.strictEqual(geometry.getIndex().array, large);
  applyTerrainLodIndices([geometry], new Map());
  assert.equal(geometry.getIndex().count, 0);
  assert.equal(geometry.drawRange.count, 0);
  applyTerrainLodIndices([geometry], new Map([[0, large]]));
  assert.strictEqual(geometry.getIndex().array, large);
  assert.equal(geometry.drawRange.count, 3);
  assert.deepEqual(geometry.getIndex().array, indices([65536, 65537, 70000]));
  geometry.dispose();
});
