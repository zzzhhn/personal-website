import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, BoxGeometry, Mesh, MeshBasicMaterial, Ray, Vector3 } from 'three';
import { buildFactoryWorklife, FACTORY_WORKLIFE_STATIONS } from './factory-worklife.ts';
import { FACTORY_PALETTE } from './factory-geometry.ts';
import { FACTORY_STATIONS, FACTORY_WORK_VIEWS, FACTORY_DISPATCH_VIEWS } from './factory-layout.ts';
import { FACTORY_GANTRY } from './factory-gantry.ts';
import { FACTORY_ASSEMBLY_BOUNDS, FACTORY_LINE_Z } from './factory-operation.ts';

const near = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const box = (min, max) => new Box3(new Vector3(...min), new Vector3(...max));
const workspace = s => box([s.at[0] - 1.55, .12, s.at[2] - .28], [s.at[0] + .9, 1.72, s.at[2] + 1.2]);
function components(model) {
  const meshes = []; model.root.traverse(o => { if (o.isMesh) meshes.push(o); });
  return { meshes, rig: meshes.find(m => m.isSkinnedMesh) };
}

test('two useful fixed workstations fit the extra triangle, draw and animated-object allocation', () => {
  const model = buildFactoryWorklife(FACTORY_PALETTE);
  try {
    const { meshes, rig } = components(model), triangles = meshes.reduce((n, m) => n + m.geometry.index.count / 3, 0);
    assert.equal(model.metrics.triangles, triangles); assert.ok(triangles <= 6000);
    assert.equal(meshes.length, 2); assert.ok(meshes.length + meshes.filter(m => m.castShadow).length <= 3);
    assert.equal(rig.skeleton.bones.length, 4); assert.ok(model.metrics.drivenObjects <= 12);
    assert.equal(new Set(meshes.map(m => m.material)).size, 1); assert.equal(model.solids.length, 6);
    const p = rig.geometry.attributes.position, ids = rig.geometry.attributes.skinIndex, weights = rig.geometry.attributes.skinWeight;
    assert.equal(ids.count, p.count); assert.equal(weights.count, p.count);
    for (let i = 0; i < ids.count; i++) { assert.ok(ids.getX(i) >= 1 && ids.getX(i) <= 3); near(weights.getX(i), 1); }
    for (const mesh of meshes) {
      for (const attribute of Object.values(mesh.geometry.attributes)) for (const value of attribute.array) assert.ok(Number.isFinite(value));
      assert.equal(mesh.material.map, null);
    }
    console.log(JSON.stringify(model.metrics));
  } finally { model.dispose(); }
});

test('station volumes avoid interaction bodies, material lines, both hoists and authored camera rays', () => {
  for (const station of FACTORY_WORKLIFE_STATIONS) {
    const bounds = workspace(station);
    for (const interactive of FACTORY_STATIONS) {
      const [x, y, z] = interactive.at, radius = interactive.radius + .55;
      assert.ok(!bounds.intersectsBox(box([x - radius, y, z - radius], [x + radius, y + 2.2, z + radius])), interactive.id);
    }
    assert.ok(!bounds.intersectsBox(box([FACTORY_GANTRY.columnsX[0] - .6, .12, FACTORY_GANTRY.endsZ[0] - .6],
      [FACTORY_GANTRY.columnsX[1] + .6, 7.5, FACTORY_GANTRY.endsZ[1] + .6])), 'raw extraction envelope');
    assert.ok(!bounds.intersectsBox(box([FACTORY_ASSEMBLY_BOUNDS.x[0] - .7, .12, FACTORY_ASSEMBLY_BOUNDS.z[0] - .7],
      [FACTORY_ASSEMBLY_BOUNDS.x[1] + .7, 11.5, FACTORY_ASSEMBLY_BOUNDS.z[1] + .7])), 'assembly hoist envelope');
    for (const z of Object.values(FACTORY_LINE_Z)) assert.ok(!bounds.intersectsBox(box([-30.1, .12, z - 2.5], [29.5, 5.2, z + 2.5])), 'machine and material corridor');
    assert.ok(!bounds.intersectsBox(box([31.5, .12, 18.5], [90, 3, 21.5])), 'return/outfeed conveyor');
    for (const view of [...Object.values(FACTORY_WORK_VIEWS), ...Object.values(FACTORY_DISPATCH_VIEWS)]) {
      const from = new Vector3(...view.eye), target = new Vector3(...view.target), length = from.distanceTo(target);
      const hit = new Ray(from, target.sub(from).normalize()).intersectBox(bounds.clone().expandByScalar(.3), new Vector3());
      assert.ok(!hit || hit.distanceTo(from) > length, 'authored work camera clearance');
    }
  }
});

test('active work moves one finite cleat continuously between trays and keeps the wrench axis fixed', () => {
  const model = buildFactoryWorklife(FACTORY_PALETTE), { rig } = components(model);
  const arm = model.root.getObjectByName('preparation-forearm'), cleat = model.root.getObjectByName('single-circulating-cleat');
  const service = model.root.getObjectByName('maintenance-wrench-axis');
  try {
    model.update(0, true, false); const previous = cleat.position.clone(), q = arm.quaternion.clone(), serviceAxis = service.position.clone();
    const repair = FACTORY_WORKLIFE_STATIONS[1].at;
    near(serviceAxis.x, repair[0] + .18); near(serviceAxis.y, repair[1] + 1.005); near(serviceAxis.z, repair[2] + .44);
    let minX = cleat.position.x, maxX = minX, highest = cleat.position.y;
    for (let frame = 1; frame <= 16 * 60; frame++) {
      model.update(frame / 60, true, false);
      assert.ok(previous.distanceTo(cleat.position) < .03, 'no part teleport at pickup, release or cycle boundaries');
      assert.ok(q.angleTo(arm.quaternion) < .05, 'no forearm snap at the cycle boundary');
      near(service.position.distanceTo(serviceAxis), 0);
      minX = Math.min(minX, cleat.position.x); maxX = Math.max(maxX, cleat.position.x); highest = Math.max(highest, cleat.position.y);
      previous.copy(cleat.position); q.copy(arm.quaternion);
    }
    assert.ok(maxX - minX > .30 && maxX - minX < .4); assert.ok(highest > 1 && highest < 1.1);
    model.root.updateMatrixWorld(true); rig.skeleton.update();
    const v = new Vector3(), p = rig.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      rig.applyBoneTransform(i, v.fromBufferAttribute(p, i)); assert.ok(v.toArray().every(Number.isFinite));
      assert.ok(FACTORY_WORKLIFE_STATIONS.some(s => workspace(s).containsPoint(v)), 'animated geometry remains inside its workstation');
    }
    near(cleat.position.y, .945);
  } finally { model.dispose(); }
});

test('pause and inactive states freeze work, hide inactive workers and resume without clock catch-up', () => {
  const model = buildFactoryWorklife(FACTORY_PALETTE), { rig } = components(model);
  const snapshot = () => rig.skeleton.bones.map(b => [...b.position.toArray(), ...b.quaternion.toArray()]);
  try {
    model.update(0, true, false); for (let i = 1; i <= 120; i++) model.update(i / 60, true, false);
    const pose = snapshot(); model.update(3, true, true); model.update(4, true, true); assert.deepEqual(snapshot(), pose);
    assert.equal(model.root.visible, true); model.update(5, false, false); assert.equal(model.root.visible, false);
    model.update(100, true, false); assert.equal(model.root.visible, true); assert.deepEqual(snapshot(), pose);
    model.update(100 + 1 / 60, true, false); assert.notDeepEqual(snapshot(), pose);
  } finally { model.dispose(); }
});

test('disposal is idempotent and leaves other instances, added objects and supplied uniforms owned by callers', () => {
  const night = { value: .6 }, a = buildFactoryWorklife(FACTORY_PALETTE, { nightUniform: night }), b = buildFactoryWorklife(FACTORY_PALETTE);
  const own = components(a), foreign = new Mesh(new BoxGeometry(.1, .1, .1), new MeshBasicMaterial()), counts = new Map();
  const resources = [...new Set(own.meshes.map(m => m.geometry)), own.meshes[0].material];
  resources.forEach(r => { counts.set(r, 0); r.addEventListener('dispose', () => counts.set(r, counts.get(r) + 1)); });
  let outside = 0; foreign.geometry.addEventListener('dispose', () => outside++); components(b).meshes[0].material.addEventListener('dispose', () => outside++);
  const release = own.rig.skeleton.dispose.bind(own.rig.skeleton); let skeletonDisposals = 0;
  own.rig.skeleton.dispose = () => { skeletonDisposals++; release(); };
  try {
    a.root.add(foreign); own.rig.removeFromParent(); a.dispose(); a.dispose();
    assert.ok(resources.every(r => counts.get(r) === 1)); assert.equal(skeletonDisposals, 1); assert.equal(outside, 0);
    assert.deepEqual(night, { value: .6 }); assert.equal(foreign.parent, a.root);
  } finally { a.dispose(); b.dispose(); foreign.geometry.dispose(); foreign.material.dispose(); }
});
