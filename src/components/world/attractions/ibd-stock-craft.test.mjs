import test from 'node:test';
import assert from 'node:assert/strict';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { Builder, cbox } from '../WorldStreetGeometry.ts';
import { addIbdPackBindings, addIbdStockRack } from './ibd-stock-craft.ts';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
function fixture(add) {
  const b = new Builder(), colliders = [];
  const cube = (at, size, surface, solid = false, bevel = .03) => {
    cbox(b, at, size, surface, bevel);
    if (solid) colliders.push({ at, size });
  };
  add(b, cube);
  const geometry = b.build(), material = new MeshBasicMaterial({ side: DoubleSide });
  const mesh = new Mesh(geometry, material);
  return { geometry, colliders,
    hit: (at, direction, far = 10) => new Raycaster(new Vector3(...at), new Vector3(...direction), 0, far).intersectObject(mesh, false)[0],
    dispose() { geometry.dispose(); material.dispose(); },
  };
}

test('rear racks expose open sides, separate posts and recessed shelf webs inside their protected volume', () => {
  for (const x of [5, 13, 23]) {
    const f = fixture((b, cube) => addIbdStockRack(b, cube, x));
    try {
      assert.deepEqual(f.colliders, [], 'rack craft must not create additional colliders');
      assert.equal(f.hit([x - 4, 3.8, -23], [1, 0, 0]), undefined, 'side opening is not a solid plate');
      near(f.hit([x + 3, 3.8, -20], [0, 0, -1]).point.z, -21.4);
      near(f.hit([x + 3, 3.8, -26], [0, 0, 1]).point.z, -24.6);
      for (const y of [.4, 2.5, 4.7]) {
        near(f.hit([x, y + .5, -23], [0, -1, 0], .6).point.y, y + .09);
        near(f.hit([x, y - .015, -20], [0, 0, -1]).point.z, -21.35);
        near(f.hit([x, y - .065, -20], [0, 0, -1]).point.z, -21.3);
      }
      const box = f.geometry.boundingBox;
      assert.ok(box.min.x >= x - 3.20001 && box.max.x <= x + 3.20001);
      assert.ok(box.min.z >= -24.70001 && box.max.z <= -21.25999);
      assert.ok(box.min.y >= 0 && box.max.y <= 5);
    } finally { f.dispose(); }
  }
});

test('carton bindings leave the label, inner sample workspace, fork channel and lid sweep clear', () => {
  const f = fixture(b => addIbdPackBindings(b));
  try {
    const p = f.geometry.attributes.position, index = f.geometry.index;
    const a = new Vector3(), b = new Vector3(), c = new Vector3();
    for (const attribute of Object.values(f.geometry.attributes))
      for (const value of attribute.array) assert.ok(Number.isFinite(value));
    for (let i = 0; i < p.count; i++) {
      a.fromBufferAttribute(p, i);
      assert.ok(Math.abs(a.x) <= 1.5 && Math.abs(a.z) <= 1.35);
      assert.ok(a.y >= .21 - 1e-6 && a.y <= .995, 'above the fork entry and below the closed lid');
      assert.ok(Math.abs(a.x) >= 1.405 || Math.abs(a.z) >= 1.277, 'external to the original inner wall planes');
    }
    for (let i = 0; i < index.count; i += 3) {
      const points = [a, b, c];
      points.forEach((v, n) => v.fromBufferAttribute(p, index.getX(i + n)));
      const front = Math.min(...points.map(v => v.z)) > 1.27;
      const overlapsLabel = Math.min(...points.map(v => v.x)) < .5 && Math.max(...points.map(v => v.x)) > -.5 &&
        Math.min(...points.map(v => v.y)) < .88 && Math.max(...points.map(v => v.y)) > .4;
      assert.ok(!front || !overlapsLabel, 'front joinery must leave the existing label unobstructed');
      assert.ok(b.sub(a).cross(c.sub(a)).lengthSq() > 1e-16, 'no collapsed binding faces');
    }
    assert.deepEqual(f.colliders, []);
  } finally { f.dispose(); }
});
