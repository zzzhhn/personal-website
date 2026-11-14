import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, BoxGeometry, Mesh, MeshBasicMaterial, Raycaster, Texture, Triangle, Vector3 } from 'three';
import { buildFactoryPrinter, FACTORY_PRINTER } from './factory-printer.ts';

const palette = {
  cream: { color: '#DDD4BF', rough: .66, metal: .12 }, teal: { color: '#416B6A', rough: .54, metal: .3 },
  steel: { color: '#3E494B', rough: .59, metal: .38 }, dark: { color: '#282F31', rough: .85, metal: .06 },
  silver: { color: '#9CABA7', rough: .46, metal: .4 }, amber: { color: '#C99536', rough: .6, metal: .15 },
};
const near = (a, b, e = 1e-5) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);
function owned(model) {
  const geometries = new Set(), materials = new Set();
  model.group.traverse(o => { if (o.isMesh) { geometries.add(o.geometry); materials.add(o.material); } });
  return [...geometries, ...materials];
}
function clearChassis(model, cardBox) {
  const g = model.group.getObjectByName('printer-open-throat-chassis').geometry;
  const p = g.attributes.position, t = new Triangle();
  for (let i = 0; i < g.index.count; i += 3) {
    t.a.fromBufferAttribute(p, g.index.getX(i)); t.b.fromBufferAttribute(p, g.index.getX(i + 1));
    t.c.fromBufferAttribute(p, g.index.getX(i + 2));
    assert.ok(!cardBox.intersectsTriangle(t), `paper crosses enclosure triangle ${i / 3}`);
  }
}

test('paper follows one continuous rigid path through real open geometry at 0, .5, 1 and between', () => {
  const model = buildFactoryPrinter(palette), spec = FACTORY_PRINTER.card;
  try {
    assert.deepEqual(model.group.position.toArray(), [...FACTORY_PRINTER.at]);
    assert.deepEqual(model.card.rotation.toArray().slice(0, 3), [0, 0, 0]);
    for (let i = 0; i <= 40; i++) {
      const feed = i / 40; model.update(feed); model.group.updateMatrixWorld(true);
      const centre = spec.startZ + feed * (spec.endZ - spec.startZ);
      near(model.card.position.z, centre); near(model.card.position.y, spec.y);
      near(model.card.scale.x, 1); near(model.card.scale.y, 1); near(model.card.scale.z, 1);
      const cardBox = new Box3(new Vector3(-spec.width / 2, spec.y - .0005, centre - spec.length / 2),
        new Vector3(spec.width / 2, spec.y + .0005, centre + spec.length / 2));
      clearChassis(model, cardBox);
      const worldBounds = new Box3().setFromObject(model.card);
      near(worldBounds.min.y, spec.y + FACTORY_PRINTER.at[1]);
      near(worldBounds.max.z - worldBounds.min.z, spec.length);
    }
    model.update(0); assert.ok(model.card.position.z + spec.length / 2 < .575, 'initial card is inside the hood');
    model.update(.5); assert.ok(model.card.position.z + spec.length / 2 > .575, 'half-fed card emerges at the actual front');
    model.update(1); assert.ok(model.card.position.z - spec.length / 2 > .575, 'completed card clears the hood');
    assert.ok(model.card.position.z + spec.length / 2 < FACTORY_PRINTER.tray.endZ, 'whole card rests over the tray');
  } finally { model.dispose(); }
});

test('paper bed, feed nip and supported output tray share the same contact plane', () => {
  const model = buildFactoryPrinter(palette), origin = new Vector3(...FACTORY_PRINTER.at);
  const chassis = model.group.getObjectByName('printer-open-throat-chassis');
  try {
    for (const feed of [0, .5, 1]) {
      model.update(feed); model.group.updateMatrixWorld(true);
      // Both sheet edges have real support underneath, rather than hovering over a disconnected shelf.
      for (const x of [-.4, .4]) for (const dz of [-.25, .25]) {
        const ray = new Raycaster(new Vector3(x, FACTORY_PRINTER.card.y + .001, model.card.position.z + dz).add(origin),
          new Vector3(0, -1, 0), 0, .01);
        const hit = ray.intersectObject(chassis, false)[0]; assert.ok(hit, `support at feed ${feed}`);
        near(hit.point.y - origin.y, FACTORY_PRINTER.tray.top);
      }
      const lower = model.group.getObjectByName('printer-lower-feed-roller');
      const upper = model.group.getObjectByName('printer-upper-feed-roller');
      const ray = (target, y, direction) => new Raycaster(new Vector3(0, y, .49).add(origin),
        new Vector3(0, direction, 0), 0, .01).intersectObject(target, false)[0];
      const bottom = ray(lower, FACTORY_PRINTER.card.y + .001, -1);
      const top = ray(upper, FACTORY_PRINTER.card.y - .001, 1);
      assert.ok(bottom && top);
      // A twelve-sided roller's radial contact varies by at most 2.3 mm while turning.
      assert.ok(FACTORY_PRINTER.card.y - (bottom.point.y - origin.y) < .0024);
      assert.ok(top.point.y - origin.y - FACTORY_PRINTER.card.y < .0024);
      near(lower.rotation.x, -upper.rotation.x);
    }
  } finally { model.dispose(); }
});

test('all real vertices fit a compact finite envelope with four draws and fewer than 2500 triangles', () => {
  const model = buildFactoryPrinter(palette), point = new Vector3();
  try {
    let triangles = 0, meshes = 0;
    for (const feed of [0, .5, 1]) {
      model.update(feed); model.group.updateMatrixWorld(true);
      model.group.traverse(o => {
        if (!o.isMesh) return;
        if (feed === 0) { meshes++; triangles += o.geometry.index.count / 3; }
        const g = o.geometry, p = g.attributes.position;
        for (const attribute of Object.values(g.attributes)) for (const n of attribute.array) assert.ok(Number.isFinite(n));
        for (let i = 0; i < p.count; i++) {
          point.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).sub(model.group.position);
          assert.ok(model.bounds.clone().expandByScalar(1e-5).containsPoint(point), `${o.name} vertex outside envelope`);
        }
      });
    }
    assert.equal(meshes, 4); assert.equal(model.triangles, triangles); assert.ok(triangles <= 2500);
    assert.equal(model.card.geometry.attributes.uv.count, 4, 'blank card accepts a caller-owned report texture');
    model.update(-1); near(model.card.position.z, FACTORY_PRINTER.card.startZ);
    model.update(2); near(model.card.position.z, FACTORY_PRINTER.card.endZ);
    model.update(NaN); near(model.card.position.z, FACTORY_PRINTER.card.startZ);
  } finally { model.dispose(); }
});

test('disposal releases owned resources once even after replacement/detach and preserves caller resources', () => {
  const before = structuredClone(palette), a = buildFactoryPrinter(palette), b = buildFactoryPrinter(palette);
  const own = owned(a), other = owned(b), texture = new Texture();
  const foreignGeometry = new BoxGeometry(1, 1, 1), foreignMaterial = new MeshBasicMaterial({ map: texture });
  const counts = new Map([...own, ...other, foreignGeometry, foreignMaterial, texture].map(r => [r, 0]));
  for (const r of counts.keys()) r.addEventListener('dispose', () => counts.set(r, counts.get(r) + 1));
  try {
    a.card.material = foreignMaterial; a.card.removeFromParent(); a.group.add(new Mesh(foreignGeometry, foreignMaterial));
    const oldPosition = a.card.position.clone(); a.dispose(); a.dispose(); a.update(1);
    assert.ok(a.card.position.equals(oldPosition)); assert.ok(own.every(r => counts.get(r) === 1));
    assert.ok([...other, foreignGeometry, foreignMaterial, texture].every(r => counts.get(r) === 0));
    assert.ok(own.every(r => !other.includes(r))); assert.deepEqual(palette, before);
  } finally { a.dispose(); b.dispose(); foreignGeometry.dispose(); foreignMaterial.dispose(); texture.dispose(); }
});
