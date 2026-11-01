import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { Builder } from '../WorldStreetGeometry.ts';
import { addWoundCoil, addInspectionTools } from './ibd-craft-geometry.ts';

test('rear inspection damage is a real recess while the front face and bore stay intact', () => {
  const material = new MeshBasicMaterial(), geometries = [];
  try {
    const sample = damaged => {
      const b = new Builder(); addWoundCoil(b, damaged); const geometry = b.build(); geometries.push(geometry);
      const mesh = new Mesh(geometry, material); mesh.updateMatrixWorld(true);
      const cast = (x, y, z, dir) => new Raycaster(new Vector3(x, y, z), new Vector3(0, 0, dir)).intersectObject(mesh);
      return { rear: cast(-.72, .82, -5, 1)[0].point.z, front: cast(-.72, .82, 5, -1)[0].point.z, bore: cast(0, 0, 5, -1) };
    };
    const intact = sample(false), damaged = sample(true);
    assert.ok(damaged.rear - intact.rear > .15, 'damage must have physical surface depth, not a decal');
    assert.ok(Math.abs(damaged.front - intact.front) < 1e-6, 'defect remains hidden on the rear until turned');
    assert.equal(intact.bore.length, 0); assert.equal(damaged.bore.length, 0);
    for (const g of geometries) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        assert.ok(Math.abs(p.getX(i)) <= 2.0001 && Math.abs(p.getY(i)) <= 2.0001 && Math.abs(p.getZ(i)) <= 1.4001,
          'sheet and bands must remain inside the existing moving cargo safety envelope');
      }
      assert.ok(g.index.count / 3 < 4500);
    }
  } finally { material.dispose(); geometries.forEach(g => g.dispose()); }
});

test('the inspection torch lens faces the cargo and the kit still fits its takeable desk envelope', () => {
  const b = new Builder(); addInspectionTools(b); const g = b.build(), material = new MeshBasicMaterial();
  try {
    const mesh = new Mesh(g, material); mesh.updateMatrixWorld(true);
    const hit = new Raycaster(new Vector3(0, 0, -1), new Vector3(0, 0, 1)).intersectObject(mesh)[0];
    assert.ok(hit && hit.point.z < -.19, 'head faces negative z, toward the inspected cargo');
    const colour = g.attributes.color, index = hit.face.a;
    assert.ok(colour.getX(index) > .65 && colour.getY(index) > .65, 'lens is legible without emissive material support');
    const box = g.boundingBox;
    assert.ok(box.min.x >= -.16 && box.max.x <= .701 && box.min.y >= -.23 && box.max.y <= .161);
    assert.ok(box.min.z >= -.3 && box.max.z <= .3);
    assert.ok(g.index.count / 3 < 1600);
  } finally { g.dispose(); material.dispose(); }
});
