import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, BoxGeometry, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { buildFactoryCompanion } from './factory-companion.ts';

const near = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
function resources(model) {
  const geometry = new Set(), material = new Set();
  model.group.traverse(o => {
    if (!o.isMesh) return;
    geometry.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) material.add(m);
  });
  return { geometry, material, all: [...geometry, ...material] };
}
function visibleMeshes(root) {
  const meshes = [];
  root.traverseVisible(o => { if (o.isMesh) meshes.push(o); });
  root.updateMatrixWorld(true); return meshes;
}
function geometrySnapshot(root) {
  return visibleMeshes(root).map(mesh => ({
    name: mesh.name, matrix: mesh.matrixWorld.toArray(),
    attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes)
      .map(([name, attribute]) => [name, Array.from(attribute.array)])),
    index: Array.from(mesh.geometry.index.array),
  }));
}

test('both knee-high configurations have a centred contact-plane origin and metre-scale envelope', () => {
  for (const configuration of ['nimble', 'steady']) {
    const model = buildFactoryCompanion({ configuration });
    try {
      const box = new Box3().setFromObject(model.group), size = box.getSize(new Vector3());
      near(size.x, .65); near(size.y, .65); near(size.z, .85);
      near(box.min.y, 0); near(box.min.x + box.max.x, 0); near(box.min.z + box.max.z, 0);
      assert.deepEqual(model.group.position.toArray(), [0, 0, 0]);
      assert.deepEqual(model.group.scale.toArray(), [1, 1, 1]);
      const optic = model.shell.getObjectByName('companion-front-optic');
      const lamp = model.shell.getObjectByName('companion-rear-lamp');
      assert.ok(optic.geometry.boundingBox.min.z > 0 && lamp.geometry.boundingBox.max.z < 0, '+Z faces the optical sensor');
    } finally { model.dispose(); }
  }
});

test('four independently detachable wheels spin inside the complete wheel module', () => {
  const model = buildFactoryCompanion();
  try {
    assert.equal(model.wheels.length, 4); assert.equal(new Set(model.wheels).size, 4);
    assert.equal(model.wheels.filter(w => w.position.z > 0).length, 2);
    assert.equal(model.wheels.filter(w => w.position.x > 0).length, 2);
    const pivots = model.wheels.map(w => w.position.toArray());
    const vertex = new Vector3().fromBufferAttribute(model.wheels[0].children[0].geometry.attributes.position, 0);
    model.group.updateMatrixWorld(true); const before = model.wheels[0].localToWorld(vertex.clone());
    model.wheels[0].rotation.x = .8; model.group.updateMatrixWorld(true);
    assert.ok(before.distanceTo(model.wheels[0].localToWorld(vertex.clone())) > .01);
    assert.deepEqual(model.wheels.map(w => w.position.toArray()), pivots);
    assert.deepEqual(model.shell.position.toArray(), [0, 0, 0]);
    model.wheels[0].removeFromParent();
    assert.equal(model.wheels[0].parent, null);
    assert.ok(model.wheels.slice(1).every(w => w.parent === model.wheelModule));
  } finally { model.dispose(); }
});

test('wheel-only rework preserves every retained frame vertex and transform', () => {
  const nimble = buildFactoryCompanion(), steady = buildFactoryCompanion({ configuration: 'steady' });
  try {
    for (const model of [nimble, steady]) {
      assert.equal(model.wheelModule.parent, model.group);
      model.wheelModule.removeFromParent(); model.shell.removeFromParent();
    }
    const retained = geometrySnapshot(nimble.group);
    assert.deepEqual(retained.map(mesh => mesh.name).sort(), ['companion-bumpers', 'companion-chassis']);
    assert.deepEqual(geometrySnapshot(steady.group), retained,
      'the same frame part ID must retain the same physical geometry across configurations');
    nimble.group.add(steady.wheelModule);
    assert.deepEqual(geometrySnapshot(nimble.group).filter(mesh => mesh.name !== 'companion-running-gear'
      && mesh.name !== 'companion-tyre' && mesh.name !== 'companion-wheel-hub'), retained);
    assert.ok(steady.wheels.every(wheel => wheel.parent === steady.wheelModule));
    const box = new Box3().setFromObject(nimble.group);
    near(box.min.y, 0); near(box.max.x - box.min.x, .65);
  } finally { nimble.dispose(); steady.dispose(); }
});

test('each wheel module carries aligned axles, ground-contact tyres and configuration ballast', () => {
  for (const configuration of ['nimble', 'steady']) {
    const model = buildFactoryCompanion({ configuration });
    try {
      const gear = model.wheelModule.getObjectByName('companion-running-gear');
      assert.equal(gear.parent, model.wheelModule);
      model.group.updateMatrixWorld(true);
      for (const wheel of model.wheels) {
        const side = Math.sign(wheel.position.x), centre = wheel.getWorldPosition(new Vector3());
        const ray = new Raycaster(centre.clone().add(new Vector3(side * .2, 0, 0)), new Vector3(-side, 0, 0));
        const axle = ray.intersectObject(gear, false)[0];
        assert.ok(axle, 'the physical axle must reach each hub centre');
        near(axle.point.x, centre.x); near(axle.point.y, centre.y); near(axle.point.z, centre.z);
        near(centre.y, wheel.userData.radius);
        const tyre = wheel.getObjectByName('companion-tyre');
        const bounds = new Box3().setFromObject(tyre);
        near(bounds.min.y, 0); near(bounds.max.y, 2 * wheel.userData.radius);
        near(bounds.min.x + bounds.max.x, 2 * centre.x);
      }
      const cassette = new Raycaster(new Vector3(0, .24, 0), new Vector3(0, -1, 0)).intersectObject(gear, false);
      assert.equal(cassette.length > 0, configuration === 'steady', 'steady ballast belongs to its wheel module');
      if (cassette.length) near(cassette[0].point.y, .2215);
    } finally { model.dispose(); }
  }
});

test('spinning tyres never rotates axles, suspension or ballast, which detach together', () => {
  for (const configuration of ['nimble', 'steady']) {
    const model = buildFactoryCompanion({ configuration });
    try {
      const gear = model.wheelModule.getObjectByName('companion-running-gear');
      const before = geometrySnapshot(gear);
      for (const wheel of model.wheels) wheel.rotation.x = 1.17;
      model.group.updateMatrixWorld(true);
      assert.deepEqual(geometrySnapshot(gear), before);
      model.wheelModule.removeFromParent();
      assert.equal(model.wheelModule.parent, null);
      assert.equal(model.group.getObjectByName('companion-running-gear'), undefined);
      assert.ok(model.wheels.every(wheel => wheel.parent === model.wheelModule));
      const point = new Vector3().fromBufferAttribute(gear.geometry.attributes.position, 0);
      const original = gear.localToWorld(point.clone());
      model.wheelModule.position.set(.3, .2, -.4); model.wheelModule.updateMatrixWorld(true);
      assert.ok(gear.localToWorld(point.clone()).distanceTo(original) > .5, 'static gear travels with the detached module');
    } finally { model.dispose(); }
  }
});

test('shell-off exposes the internal frame without changing wheel placement; configurations have distinct wheel modules', () => {
  const nimble = buildFactoryCompanion(), steady = buildFactoryCompanion({ configuration: 'steady', shell: false });
  try {
    assert.equal(steady.shell.visible, false);
    const ray = new Raycaster(new Vector3(0, 1, 0), new Vector3(0, -1, 0));
    const covered = ray.intersectObjects(visibleMeshes(nimble.group), false)[0].point.y;
    const pivots = nimble.wheels.map(w => w.position.toArray());
    nimble.shell.visible = false;
    const exposed = ray.intersectObjects(visibleMeshes(nimble.group), false)[0].point.y;
    assert.ok(covered - exposed > .15, 'removing the enclosure reveals an actual lower equipment deck');
    assert.deepEqual(nimble.wheels.map(w => w.position.toArray()), pivots);
    const a = nimble.wheels[0].children[0].geometry.boundingBox.getSize(new Vector3());
    const b = steady.wheels[0].children[0].geometry.boundingBox.getSize(new Vector3());
    assert.ok(b.x > a.x && b.y > a.y, 'steady configuration has visibly wider and larger tyres');
    nimble.shell.removeFromParent(); assert.equal(nimble.shell.parent, null);
  } finally { nimble.dispose(); steady.dispose(); }
});

test('material batches and low-segment geometry stay finite, noncollapsed and within the companion allocation', () => {
  for (const configuration of ['nimble', 'steady']) {
    const model = buildFactoryCompanion({ configuration }), owned = resources(model);
    try {
      const a = new Vector3(), b = new Vector3(), c = new Vector3();
      for (const g of owned.geometry) {
        const p = g.attributes.position;
        for (const attribute of Object.values(g.attributes)) for (const value of attribute.array) assert.ok(Number.isFinite(value));
        for (let i = 0; i < g.index.count; i += 3) {
          for (let j = 0; j < 3; j++) assert.ok(g.index.getX(i + j) < p.count);
          a.fromBufferAttribute(p, g.index.getX(i)); b.fromBufferAttribute(p, g.index.getX(i + 1)); c.fromBufferAttribute(p, g.index.getX(i + 2));
          assert.ok(b.sub(a).cross(c.sub(a)).lengthSq() > 1e-18, 'no collapsed mechanical face');
        }
      }
      const meshes = visibleMeshes(model.group), metrics = model.group.userData.factoryCompanion.metrics;
      assert.equal(metrics.meshes, meshes.length); assert.ok(meshes.length <= 16);
      assert.equal(metrics.materials, owned.material.size); assert.ok(owned.material.size <= 5);
      assert.equal(metrics.geometries, owned.geometry.size); assert.ok(owned.geometry.size <= 8);
      assert.equal(metrics.triangles, meshes.reduce((n, m) => n + m.geometry.index.count / 3, 0));
      assert.ok(metrics.triangles < 5500, `${configuration}: ${metrics.triangles} triangles`);
      assert.ok(model.wheels.every(w => w.children[0].geometry === model.wheels[0].children[0].geometry), 'share geometry inside the instance');
      console.log(JSON.stringify({ configuration, ...metrics }));
    } finally { model.dispose(); }
  }
});

test('dispose releases every owned resource once, including detached modules, and never releases another owner’s assets', () => {
  const a = buildFactoryCompanion(), b = buildFactoryCompanion({ configuration: 'steady' });
  const own = resources(a), other = resources(b), counts = new Map();
  const foreignGeometry = new BoxGeometry(.1, .1, .1), foreignMaterial = new MeshBasicMaterial();
  const foreign = new Mesh(foreignGeometry, foreignMaterial);
  const watched = [...own.all, ...other.all, foreignGeometry, foreignMaterial];
  for (const resource of watched) { counts.set(resource, 0); resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1)); }
  try {
    assert.ok(own.all.every(resource => !other.all.includes(resource)), 'instances must have separate ownership');
    a.wheels[0].removeFromParent(); a.wheelModule.removeFromParent(); a.shell.removeFromParent(); a.group.add(foreign);
    a.dispose(); a.dispose();
    assert.ok(own.all.every(resource => counts.get(resource) === 1));
    assert.ok([...other.all, foreignGeometry, foreignMaterial].every(resource => counts.get(resource) === 0));
    assert.equal(foreign.parent, a.group);
    b.dispose(); assert.ok(other.all.every(resource => counts.get(resource) === 1));
  } finally { a.dispose(); b.dispose(); foreignGeometry.dispose(); foreignMaterial.dispose(); }
});
