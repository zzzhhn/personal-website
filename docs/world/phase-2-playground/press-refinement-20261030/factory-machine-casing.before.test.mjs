import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, BoxGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Triangle, Vector3 } from 'three';
import { buildFactoryMachineCasing } from './factory-machine-casing.ts';
import { FACTORY_PALETTE } from './factory-geometry.ts';
import { FACTORY_MODULES } from './factory-game.ts';
import { FACTORY_CONVEYOR_TOP, FACTORY_ASSEMBLY_PICK_HEIGHT, FACTORY_RAW_HALF_HEIGHT } from './factory-operation.ts';
import { buildFactoryCarrier } from './factory-carrier.ts';
import { buildFactoryCompanion } from './factory-companion.ts';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
const area = (min, max) => new Box3(new Vector3(...min), new Vector3(...max));
function clear(casing, region, label) {
  for (const solid of casing.solids) assert.ok(!region.intersectsBox(new Box3().setFromCenterAndSize(
    new Vector3(...solid.at), new Vector3(...solid.size))), `${label}: collider intrudes`);
  const p = casing.geometry.attributes.position, index = casing.geometry.index, triangle = new Triangle();
  for (let i = 0; i < index.count; i += 3) {
    triangle.a.fromBufferAttribute(p, index.getX(i)); triangle.b.fromBufferAttribute(p, index.getX(i + 1)); triangle.c.fromBufferAttribute(p, index.getX(i + 2));
    assert.ok(!region.intersectsTriangle(triangle), `${label}: triangle ${i / 3} intrudes`);
  }
}

test('each casing is a finite single batch inside the existing machine survey and budget', () => {
  for (const module of FACTORY_MODULES) {
    const casing = buildFactoryMachineCasing(module, FACTORY_PALETTE);
    try {
      const g = casing.geometry, p = g.attributes.position, a = new Vector3(), b = new Vector3(), c = new Vector3();
      const bounds = g.boundingBox;
      near(bounds.min.y, .12); near(bounds.max.y, 5.1);
      assert.ok(bounds.min.x >= -3 && bounds.max.x <= 3 && bounds.min.z >= -2.40001 && bounds.max.z <= 2.40001);
      assert.deepEqual(g.groups, []); assert.equal(casing.triangles, g.index.count / 3); assert.ok(casing.triangles < 6000);
      assert.ok(casing.solids.length <= 28);
      for (const name of ['position', 'normal', 'color', 'aMat', 'aSuv']) assert.ok(g.attributes[name]);
      for (const attribute of Object.values(g.attributes)) for (const value of attribute.array) assert.ok(Number.isFinite(value));
      for (let i = 0; i < g.index.count; i += 3) {
        for (let j = 0; j < 3; j++) assert.ok(g.index.getX(i + j) < p.count);
        a.fromBufferAttribute(p, g.index.getX(i)); b.fromBufferAttribute(p, g.index.getX(i + 1)); c.fromBufferAttribute(p, g.index.getX(i + 2));
        assert.ok(b.sub(a).cross(c.sub(a)).lengthSq() > 1e-16, 'no collapsed casing face');
      }
      for (const solid of casing.solids) {
        assert.ok([...solid.at, ...solid.size].every(Number.isFinite)); assert.ok(solid.size.every(v => v > 0));
      }
      console.log(JSON.stringify({ module, triangles: casing.triangles, colliders: casing.solids.length, vertices: p.count }));
    } finally { casing.geometry.dispose(); }
  }
});

test('both lower saddles meet the retained press bed, without building a duplicate bed', () => {
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const bedGeometry = new BoxGeometry(4.3, .35, 3.6), bed = new Mesh(bedGeometry, material);
  bed.position.y = FACTORY_CONVEYOR_TOP - .175; bed.updateMatrixWorld(true);
  try {
    for (const module of FACTORY_MODULES) {
      const casing = buildFactoryMachineCasing(module, FACTORY_PALETTE), mesh = new Mesh(casing.geometry, material);
      try {
        for (const x of [-1.55, 1.55]) {
          const top = new Raycaster(new Vector3(x, 1.1, 0), new Vector3(0, -1, 0), 0, .5).intersectObject(mesh, false)[0];
          const underside = new Raycaster(new Vector3(x, .8, 0), new Vector3(0, 1, 0), 0, .3).intersectObject(bed, false)[0];
          assert.ok(top && underside); near(top.point.y, FACTORY_CONVEYOR_TOP - .35); near(top.point.y, underside.point.y);
        }
        const lampMount = new Raycaster(new Vector3(0, 3.95, -1.9), new Vector3(0, 1, 0), 0, .6).intersectObject(mesh, false)[0];
        assert.ok(lampMount); near(lampMount.point.y, 3.98);
        clear(casing, area([-2.14, .88, -1.79], [2.14, FACTORY_CONVEYOR_TOP, 1.79]), 'retained bed interior');
      } finally { casing.geometry.dispose(); }
    }
  } finally { bedGeometry.dispose(); material.dispose(); }
});

test('actual blanks, carriers and both configurations pass along the full X material opening', () => {
  near(FACTORY_CONVEYOR_TOP, 1.215); near(FACTORY_ASSEMBLY_PICK_HEIGHT, 1.275);
  for (const module of FACTORY_MODULES) {
    const casing = buildFactoryMachineCasing(module, FACTORY_PALETTE), carrier = buildFactoryCarrier(module, FACTORY_PALETTE);
    try {
      const rawHalfZ = { frame: .36, wheels: .26, shell: .35 }[module];
      clear(casing, area([-3.05, FACTORY_CONVEYOR_TOP - .001, -rawHalfZ - .01],
        [3.05, FACTORY_CONVEYOR_TOP + 2 * FACTORY_RAW_HALF_HEIGHT[module] + .01, rawHalfZ + .01]), 'raw X passage');
      for (const configuration of ['nimble', 'steady']) {
        const model = buildFactoryCompanion({ configuration });
        try {
          model.group.remove(model.wheelModule, model.shell);
          const part = module === 'frame' ? model.group : module === 'wheels' ? model.wheelModule : model.shell;
          const envelope = new Box3().setFromObject(part).union(carrier.geometry.boundingBox)
            .translate(new Vector3(0, FACTORY_ASSEMBLY_PICK_HEIGHT, 0));
          envelope.min.x = -3.05; envelope.max.x = 3.05; envelope.expandByVector(new Vector3(0, .005, .01));
          clear(casing, envelope, `${module}/${configuration} carrier X passage`);
        } finally { model.dispose(); }
      }
    } finally { carrier.geometry.dispose(); casing.geometry.dispose(); }
  }
});

test('full moving platen/guard envelopes and axial rod probes clear the actual fixed casing', () => {
  const material = new MeshBasicMaterial({ side: DoubleSide });
  try {
    for (const module of FACTORY_MODULES) {
      const casing = buildFactoryMachineCasing(module, FACTORY_PALETTE), mesh = new Mesh(casing.geometry, material);
      try {
        const bottom = FACTORY_CONVEYOR_TOP + 2 * FACTORY_RAW_HALF_HEIGHT[module];
        clear(casing, area([-1.915, bottom - .015, -1.615], [1.915, 3.775, 1.615]), 'complete ram travel');
        clear(casing, area([-1.96, 1.82, -2.22], [1.96, 3.88, -2.08]), 'complete guard travel');
        for (const r of [0, .075, .15, .175]) for (let i = 0; i < 24; i++) {
          const angle = i * Math.PI / 12, x = r * Math.cos(angle), z = r * Math.sin(angle);
          const origin = new Vector3(x, 1.58, z), direction = new Vector3(0, 1, 0);
          assert.equal(new Raycaster(origin, direction, 0, 3.55).intersectObject(mesh, false).length, 0, 'rod bore must be genuinely open');
          for (const solid of casing.solids) assert.equal(new Raycaster(origin, direction, 0, 3.55).ray.intersectBox(
            new Box3().setFromCenterAndSize(new Vector3(...solid.at), new Vector3(...solid.size)), new Vector3()), null);
        }
        const boreWall = new Raycaster(new Vector3(0, 4.1, 0), new Vector3(1, 0, 0), 0, .5).intersectObject(mesh, false)[0];
        assert.ok(boreWall && boreWall.point.x > .18 && boreWall.point.x < .21, 'receiver has an actual annular wall');
      } finally { casing.geometry.dispose(); }
    }
  } finally { material.dispose(); }
});

test('the wheel line has real through-bores and each fixed rear construction is distinct', () => {
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const models = Object.fromEntries(FACTORY_MODULES.map(m => [m, buildFactoryMachineCasing(m, FACTORY_PALETTE)]));
  const mesh = Object.fromEntries(FACTORY_MODULES.map(m => [m, new Mesh(models[m].geometry, material)]));
  const hit = (m, x, y) => new Raycaster(new Vector3(x, y, 1.72), new Vector3(0, 0, 1), 0, .9).intersectObject(mesh[m], false)[0];
  try {
    for (const centre of [-1.05, 1.05]) {
      for (let i = 0; i < 16; i++) {
        const angle = i * Math.PI / 8;
        assert.equal(hit('wheels', centre + .12 * Math.cos(angle), 2.6 + .12 * Math.sin(angle)), undefined, 'bearing access hole is not a dark cap');
      }
      assert.ok(hit('wheels', centre + .28, 2.6), 'solid metal surrounds each access hole');
    }
    assert.equal(hit('frame', 0, 2.5), undefined, 'exposed frame press has an open split rear');
    assert.ok(hit('frame', 1.35, 2.5), 'split service covers are real surfaces');
    assert.ok(hit('shell', 0, 2.5), 'forming press has a broad rear enclosure');
    assert.equal(new Set(FACTORY_MODULES.map(m => models[m].triangles)).size, 3);
  } finally { Object.values(models).forEach(m => m.geometry.dispose()); material.dispose(); }
});

test('operator approach and front aisle remain outside the new fixed envelope', () => {
  for (const module of FACTORY_MODULES) {
    const casing = buildFactoryMachineCasing(module, FACTORY_PALETTE);
    try {
      clear(casing, area([-5.6, .14, -.6], [-4.4, 2.3, .6]), 'existing standing point');
      clear(casing, area([-4.7, .12, -.6], [-3.5, 1.7, .6]), 'existing control console');
      clear(casing, area([-3.5, .14, -3.6], [3.5, 2.3, -2.45]), 'front walking aisle');
    } finally { casing.geometry.dispose(); }
  }
});

test('palette and per-instance geometry ownership are preserved without allocated materials or textures', () => {
  const palette = structuredClone(FACTORY_PALETTE), before = structuredClone(palette);
  const a = buildFactoryMachineCasing('frame', palette), b = buildFactoryMachineCasing('frame', palette);
  let otherDisposals = 0; b.geometry.addEventListener('dispose', () => otherDisposals++);
  try {
    assert.deepEqual(palette, before); assert.notEqual(a.geometry, b.geometry); assert.notEqual(a.solids, b.solids);
    assert.deepEqual(Object.keys(a).sort(), ['geometry', 'solids', 'triangles']);
    a.geometry.dispose(); assert.equal(otherDisposals, 0);
    assert.throws(() => buildFactoryMachineCasing('unknown', palette), TypeError);
  } finally { b.geometry.dispose(); }
});
