import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Matrix4, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { ShadowChunkBuilder, shadowChunkSourceKey } from './shadow-chunk-builder.ts';

const cells = [12, 20, 32];
const right = new Vector3(.8, 0, -.6), up = new Vector3(.2, .94, .266);

// Frozen pre-change binning algorithm, independent of the new numeric lookup.
function legacyAdd(buckets, geometry, matrix, cascades, side, zone, axes = [right, up]) {
  const v = new Vector3();
  for (const cascade of cascades) {
    const pos = geometry.getAttribute('position'), idx = geometry.index, world = new Float32Array(pos.count * 3);
    for (let j = 0; j < pos.count; j++) {
      v.fromBufferAttribute(pos, j).applyMatrix4(matrix); world.set([v.x, v.y, v.z], j * 3);
    }
    const cell = cells[cascade], count = idx ? idx.count : pos.count;
    for (let j = 0; j + 2 < count; j += 3) {
      const a = (idx ? idx.getX(j) : j) * 3, b = (idx ? idx.getX(j + 1) : j + 1) * 3, c = (idx ? idx.getX(j + 2) : j + 2) * 3;
      v.set((world[a] + world[b] + world[c]) / 3, (world[a + 1] + world[b + 1] + world[c + 1]) / 3,
        (world[a + 2] + world[b + 2] + world[c + 2]) / 3);
      const key = `${cascade}:${Math.floor(v.dot(axes[0]) / cell)},${Math.floor(v.dot(axes[1]) / cell)},${side}`;
      let bucket = buckets.get(key);
      if (!bucket) { bucket = { side, cascade, data: [[], []], zones: new Map() }; buckets.set(key, bucket); }
      const [points, indices] = bucket.data, base = points.length / 3;
      for (const n of [a, b, c]) points.push(world[n], world[n + 1], world[n + 2]);
      indices.push(base, base + 1, base + 2);
      bucket.zones.set(zone, (bucket.zones.get(zone) ?? 0) + 3);
    }
  }
}
const snapshot = buckets => [...buckets].map(([key, b]) => ({ key, side: b.side, cascade: b.cascade,
  positions: [...new Float32Array(b.data[0])], indices: b.data[1], zones: [...b.zones] }));

test('indexed/nonindexed instances preserve exact positions, indices, bucket order and zone attribution', () => {
  const indexed = new BoxGeometry(35, 17, 29, 2, 2, 2), flat = indexed.toNonIndexed();
  const hull = new BoxGeometry(28, 13, 22), builder = new ShadowChunkBuilder(cells, right, up), old = new Map();
  try {
    for (let i = 0; i < 12; i++) {
      const matrix = new Matrix4().makeRotationY(i * .39);
      matrix.scale(new Vector3(i % 2 ? -.8 : 1.13, .7 + i / 10, 1.3));
      matrix.setPosition(-80 + i * 13.713, i * .071, -170 + i * 19.327);
      const geometry = i % 2 ? indexed : flat, side = i % 3, zone = i % 2 ? 'town' : 'other';
      // Same three integration cases: full geometry in all cascades, near only,
      // and a distinct existing hull for the far cascade.
      const passes = i % 3 === 0 ? [[geometry, [0, 1, 2]]] : i % 3 === 1
        ? [[geometry, [0, 1]]] : [[geometry, [0, 1]], [hull, [2]]];
      for (const [g, cascades] of passes) {
        builder.add(g, matrix, cascades, side, zone); legacyAdd(old, g, matrix, cascades, side, zone);
      }
    }
    assert.deepEqual(snapshot(builder.buckets), snapshot(old));
    assert.ok(builder.buckets.size > 20);
  } finally { indexed.dispose(); flat.dispose(); hull.dispose(); }
});

test('negative and exact cell boundaries retain Float32 rounding and triangle winding', () => {
  const geometry = new BufferGeometry(), vertices = [];
  for (const x of [-32, -20, -12, -0, 0, 12, 20, 32]) {
    for (const offset of [-1e-5, 0, 1e-5]) vertices.push(x + offset, 0, -20, x + offset, 2, -20, x + offset, 1, -20);
  }
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  const axes = [new Vector3(1, 0, 0), new Vector3(0, 0, 1)], matrix = new Matrix4();
  const builder = new ShadowChunkBuilder(cells, ...axes), old = new Map();
  try {
    builder.add(geometry, matrix, [0, 1, 2], 2, 'edge'); legacyAdd(old, geometry, matrix, [0, 1, 2], 2, 'edge', axes);
    assert.deepEqual(snapshot(builder.buckets), snapshot(old));
  } finally { geometry.dispose(); }
});

test('one world transform is shared across cascades instead of repeated per cascade', () => {
  const geometry = new BoxGeometry(), position = geometry.getAttribute('position'), getX = position.getX;
  let reads = 0;
  position.getX = function (i) { reads++; return getX.call(this, i); };
  try {
    const builder = new ShadowChunkBuilder(cells, right, up);
    builder.add(geometry, new Matrix4(), [0, 1, 2], 0, 'other');
    assert.equal(reads, position.count);
    reads = 0; legacyAdd(new Map(), geometry, new Matrix4(), [0, 1, 2], 0, 'other');
    assert.equal(reads, position.count * 3);
    const next = new ShadowChunkBuilder(cells, right, up);
    assert.equal(next.buckets.size, 0); // no module-level bucket or transformed-geometry cache
  } finally { position.getX = getX; geometry.dispose(); }
});

test('same mesh replacing geometry or shadow override invalidates; unrelated colour changes do not', () => {
  const a = new BoxGeometry(), b = new BoxGeometry(), c = new BoxGeometry();
  const material = new MeshBasicMaterial(), mesh = new Mesh(a, material);
  try {
    const original = shadowChunkSourceKey(mesh, 42);
    assert.equal(shadowChunkSourceKey(mesh, 42), original);
    material.color.set('red'); assert.equal(shadowChunkSourceKey(mesh, 42), original);
    assert.notEqual(shadowChunkSourceKey(mesh, 43), original);
    mesh.geometry = b; const replaced = shadowChunkSourceKey(mesh, 42); assert.notEqual(replaced, original);
    mesh.userData.shadowGeometry = c; const override = shadowChunkSourceKey(mesh, 42); assert.notEqual(override, replaced);
    mesh.geometry = a; assert.notEqual(shadowChunkSourceKey(mesh, 42), override); // base bounds affect far inclusion too
    mesh.geometry = b; mesh.userData.shadowGeometry = a; assert.notEqual(shadowChunkSourceKey(mesh, 42), override);
    delete mesh.userData.shadowGeometry; assert.equal(shadowChunkSourceKey(mesh, 42), replaced);
    material.side = 2; assert.notEqual(shadowChunkSourceKey(mesh, 42), replaced);
    const beforeUpload = shadowChunkSourceKey(mesh, 42);
    b.getAttribute('position').needsUpdate = true;
    assert.notEqual(shadowChunkSourceKey(mesh, 42), beforeUpload);
    const beforeAttribute = shadowChunkSourceKey(mesh, 42);
    b.setAttribute('position', b.getAttribute('position').clone());
    assert.notEqual(shadowChunkSourceKey(mesh, 42), beforeAttribute);
  } finally { a.dispose(); b.dispose(); c.dispose(); material.dispose(); }
});

test('builder borrows source geometry without mutation or disposal and emits no empty chunks', () => {
  const geometry = new BoxGeometry(), before = geometry.getAttribute('position').array.slice();
  let disposed = 0; geometry.addEventListener('dispose', () => disposed++);
  try {
    const builder = new ShadowChunkBuilder(cells, right, up);
    builder.add(geometry, new Matrix4().makeTranslation(13, 2, -17), [0, 1], 0, 'other');
    assert.deepEqual(geometry.getAttribute('position').array, before); assert.equal(disposed, 0);
    for (const bucket of builder.buckets.values()) assert.ok(bucket.data[1].length > 0);
    const empty = new BufferGeometry().setAttribute('position', new Float32BufferAttribute([], 3));
    try {
      const count = builder.buckets.size; builder.add(empty, new Matrix4(), [0, 1, 2], 0, 'other');
      assert.equal(builder.buckets.size, count);
    } finally { empty.dispose(); }
  } finally { geometry.dispose(); }
});
