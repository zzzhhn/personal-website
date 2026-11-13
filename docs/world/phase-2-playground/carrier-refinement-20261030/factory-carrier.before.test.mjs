import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Triangle, Vector3 } from 'three';
import { buildFactoryCarrier } from './factory-carrier.ts';
import { buildFactoryCompanion } from './factory-companion.ts';
import { FACTORY_PALETTE } from './factory-geometry.ts';

const modules = ['frame', 'wheels', 'shell'];
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
function ray(root, origin, direction, far = 2) {
  root.updateMatrixWorld(true);
  return new Raycaster(new Vector3(...origin), new Vector3(...direction), 0, far).intersectObject(root, true)[0];
}
function detach(model, module) {
  model.group.remove(model.wheelModule, model.shell);
  return module === 'frame' ? model.group : module === 'wheels' ? model.wheelModule : model.shell;
}
function checkLocatorClearance(root, bounds) {
  root.updateMatrixWorld(true);
  const triangle = new Triangle();
  for (const locator of bounds) {
    const box = new Box3(new Vector3(...locator.min), new Vector3(...locator.max));
    root.traverse(object => {
      if (!object.isMesh) return;
      const p = object.geometry.attributes.position, index = object.geometry.index;
      for (let i = 0; i < index.count; i += 3) {
        triangle.a.fromBufferAttribute(p, index.getX(i)).applyMatrix4(object.matrixWorld);
        triangle.b.fromBufferAttribute(p, index.getX(i + 1)).applyMatrix4(object.matrixWorld);
        triangle.c.fromBufferAttribute(p, index.getX(i + 2)).applyMatrix4(object.matrixWorld);
        assert.ok(!box.intersectsTriangle(triangle), `${object.name} intersects a carrier locator`);
      }
    });
  }
}

test('all three nests are finite single-draw geometry with a shared roller-contact base', () => {
  const material = new MeshBasicMaterial({ side: DoubleSide });
  try {
    for (const module of modules) {
      const carrier = buildFactoryCarrier(module, FACTORY_PALETTE), mesh = new Mesh(carrier.geometry, material);
      try {
        const g = carrier.geometry, box = g.boundingBox, p = g.attributes.position;
        near(box.min.x, -.85); near(box.max.x, .85);
        near(box.min.z, -.525); near(box.max.z, .525); near(box.min.y, -.06);
        assert.ok(box.max.y <= .340001); assert.equal(carrier.module, module);
        assert.equal(carrier.triangles, g.index.count / 3); assert.ok(carrier.triangles < 2500);
        assert.deepEqual(g.groups, []); assert.equal(carrier.supportPads.length, 4);
        assert.deepEqual(carrier.base.footprint, [1.7, 1.05]);
        near(carrier.base.flatUndersideFootprint[0], 1.684);
        near(carrier.base.flatUndersideFootprint[1], 1.034);
        near(carrier.base.bottomY, -.06); near(carrier.base.topY, 0);
        for (const attribute of Object.values(g.attributes)) for (const value of attribute.array) assert.ok(Number.isFinite(value));
        const a = new Vector3(), b = new Vector3(), c = new Vector3();
        for (let i = 0; i < g.index.count; i += 3) {
          for (let j = 0; j < 3; j++) assert.ok(g.index.getX(i + j) < p.count);
          a.fromBufferAttribute(p, g.index.getX(i)); b.fromBufferAttribute(p, g.index.getX(i + 1)); c.fromBufferAttribute(p, g.index.getX(i + 2));
          assert.ok(b.sub(a).cross(c.sub(a)).lengthSq() > 1e-18);
        }
        near(ray(mesh, [.8, .5, .47], [0, -1, 0]).point.y, carrier.base.topY);
        near(ray(mesh, [.8, -.1, .47], [0, 1, 0]).point.y, carrier.base.bottomY);
        mesh.position.y = 1.275;
        near(ray(mesh, [.8, 1.1, .47], [0, 1, 0]).point.y, 1.215);
      } finally { carrier.geometry.dispose(); }
    }
  } finally { material.dispose(); }
});

test('the bevel-inset underside spans at least two roller tangencies throughout a .8 m travel period', () => {
  const carrier = buildFactoryCarrier('frame', FACTORY_PALETTE);
  const material = new MeshBasicMaterial({ side: DoubleSide }), mesh = new Mesh(carrier.geometry, material);
  try {
    const spacing = .8, halfFlat = carrier.base.flatUndersideFootprint[0] / 2;
    for (let sample = 0; sample <= 160; sample++) {
      const centre = sample * spacing / 160;
      let count = 0;
      for (let roller = -2; roller <= 3; roller++) {
        const localX = roller * spacing - centre;
        if (Math.abs(localX) > halfFlat) continue;
        count++;
        near(ray(mesh, [localX, -.1, .47], [0, 1, 0]).point.y, carrier.base.bottomY);
      }
      assert.ok(count >= 2, `travel phase ${centre} has only ${count} flat underside roller contacts`);
    }
  } finally { carrier.geometry.dispose(); material.dispose(); }
});

test('real pad tops meet real module undersides in both configurations, without empty floating supports', () => {
  const material = new MeshBasicMaterial({ side: DoubleSide });
  try {
    for (const module of modules) {
      const carrier = buildFactoryCarrier(module, FACTORY_PALETTE), mesh = new Mesh(carrier.geometry, material);
      try {
        for (const configuration of ['nimble', 'steady']) {
          const model = buildFactoryCompanion({ configuration }), part = detach(model, module);
          try {
            for (const pad of carrier.supportPads) {
              const [x, y, z] = pad.at;
              const top = ray(mesh, [x, y + .01, z], [0, -1, 0]);
              const underside = ray(part, [x, y - .01, z], [0, 1, 0]);
              assert.ok(top && underside, `${configuration} ${module} has real supporting and supported faces`);
              near(top.point.y, y); near(underside.point.y, top.point.y, pad.toleranceM);
              // Sample the actual column's interior at 1 cm vertical intervals.
              // Exits in both X directions prove the centre remains inside the
              // narrow solid support, rather than merely below an isolated cap.
              for (let h = .001; h < y; h += .01) for (const side of [-1, 1]) {
                const exit = ray(mesh, [x, h, z], [side, 0, 0], .06);
                assert.ok(exit, `${module} support continues from base to pad at y=${h}`);
              }
            }
            checkLocatorClearance(part, carrier.locatorBounds);
          } finally { model.dispose(); }
        }
      } finally { carrier.geometry.dispose(); }
    }
  } finally { material.dispose(); }
});

test('wheel tread approximation stays within the declared 2 mm contact tolerance through a revolution', () => {
  const carrier = buildFactoryCarrier('wheels', FACTORY_PALETTE);
  try {
    for (const configuration of ['nimble', 'steady']) {
      const model = buildFactoryCompanion({ configuration });
      try {
        detach(model, 'wheels');
        for (let step = 0; step < 48; step++) {
          for (const wheel of model.wheels) {
            wheel.rotation.x = step * Math.PI / 24;
            const tyre = wheel.getObjectByName('companion-tyre');
            tyre.updateWorldMatrix(true, false);
            const bounds = new Box3().setFromObject(tyre, true);
            near(bounds.min.y, carrier.base.topY, .002);
          }
          checkLocatorClearance(model.wheelModule, carrier.locatorBounds);
        }
      } finally { model.dispose(); }
    }
  } finally { carrier.geometry.dispose(); }
});

test('shell nest leaves the existing hoist jaw corridor above .36 m clear', () => {
  const carrier = buildFactoryCarrier('shell', FACTORY_PALETTE);
  try {
    assert.ok(carrier.geometry.boundingBox.max.y < .36);
    assert.ok(carrier.supportPads.every(pad => pad.at[1] === .32 && Math.abs(pad.at[0]) === .2325));
  } finally { carrier.geometry.dispose(); }
});
