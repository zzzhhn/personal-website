import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, BufferGeometry, Matrix4, Vector3 } from 'three';
import { ShadowChunkBuilder } from './shadow-chunk-builder.ts';
import { ShadowChunkCache } from './shadow-chunk-cache.ts';

const cells = [12, 20, 32], right = new Vector3(.8, 0, -.6), up = new Vector3(.2, .94, .266);
const source = [{ id: 'a', version: '1' }];
const fill = geometry => function* (_id, builder) { yield* builder.addSteps(geometry, new Matrix4(), [0, 1, 2], 0, 'other'); };
function drain(job, visit = () => {}) {
  for (let i = 0; i < 10000; i++) {
    const step = job.next();
    if (step.done) return step.value;
    visit(i);
  }
  assert.fail('job did not finish within bounded test iterations');
}

test('large source work yields within vertex/triangle units and exactly preserves synchronous output', () => {
  const geometry = new BoxGeometry(25, 4, 31, 24, 24, 24), a = new ShadowChunkBuilder(cells, right, up), b = new ShadowChunkBuilder(cells, right, up);
  const position = geometry.getAttribute('position'), index = geometry.index;
  let vertices = 0, indices = 0, yields = 0;
  const px = position.getX, ix = index.getX;
  position.getX = function(i) { vertices++; return px.call(this, i); };
  index.getX = function(i) { indices++; return ix.call(this, i); };
  try {
    drain(a.addSteps(geometry, new Matrix4(), [0, 1, 2], 0, 'other'), () => {
      assert.ok(vertices <= 1024); assert.ok(indices <= 1536);
      vertices = 0; indices = 0; yields++;
    });
    assert.ok(yields > 40, 'one heavy source must split inside its triangle loop');
    b.add(geometry, new Matrix4(), [0, 1, 2], 0, 'other');
    assert.deepEqual(a.buckets, b.buckets);
  } finally { geometry.dispose(); }
});

test('sliced transaction publishes atomically and matches Three bounding spheres', () => {
  const geometry = new BoxGeometry(25, 4, 31, 12, 12, 12), cache = new ShadowChunkCache(cells, right, up);
  try {
    let steps = 0;
    const result = drain(cache.updateSteps(source, fill(geometry)), () => { steps++; assert.equal(cache.chunks.size, 0); assert.equal(cache.hasSource('a'), false); });
    assert.equal(result.mode, 'rebuild'); assert.ok(steps > 30);
    for (const chunk of cache.chunks.values()) {
      const sphere = chunk.geometry.boundingSphere.clone();
      chunk.geometry.computeBoundingSphere();
      assert.deepEqual(chunk.geometry.boundingSphere, sphere);
    }
  } finally { cache.dispose(); geometry.dispose(); }
});

test('cancellation after staged chunks frees exactly staged geometry; published and source geometry survive', () => {
  const geometry = new BoxGeometry(50, 4, 50), cache = new ShadowChunkCache(cells, right, up);
  drain(cache.updateSteps(source, fill(geometry)));
  const published = cache.chunks, publishedGeometries = new Set([...published.values()].map(c => c.geometry));
  const dispose = BufferGeometry.prototype.dispose, disposed = [];
  BufferGeometry.prototype.dispose = function() { disposed.push(this); return dispose.call(this); };
  try {
    const job = cache.updateSteps([...source, { id: 'b', version: '1' }], fill(geometry));
    // Tiny geometry: four build yields, one source yield, then the first final chunk yield.
    for (let i = 0; i < 6; i++) assert.equal(job.next().done, false);
    job.return(); job.return();
    assert.ok(disposed.length > 0);
    assert.equal(new Set(disposed).size, disposed.length);
    assert.ok(disposed.every(g => g !== geometry && !publishedGeometries.has(g)));
    assert.equal(cache.chunks, published); assert.equal(cache.hasSource('b'), false);
  } finally { BufferGeometry.prototype.dispose = dispose; cache.dispose(); geometry.dispose(); }
});

test('invalid source snapshot and disposed cache revision cannot publish stale staged buffers', () => {
  const geometry = new BoxGeometry(50, 4, 50), cache = new ShadowChunkCache(cells, right, up);
  try {
    assert.equal(drain(cache.updateSteps(source, fill(geometry), () => false)), null);
    assert.equal(cache.chunks.size, 0);
    const stale = cache.updateSteps(source, fill(geometry)); stale.next();
    cache.dispose();
    drain(cache.updateSteps([{ id: 'new', version: '2' }], fill(geometry)));
    const current = cache.chunks;
    assert.equal(drain(stale), null); assert.equal(cache.chunks, current);
    assert.equal(cache.hasSource('a'), false); assert.equal(cache.hasSource('new'), true);
  } finally { cache.dispose(); geometry.dispose(); }
});
