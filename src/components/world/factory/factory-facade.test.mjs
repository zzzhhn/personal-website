import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Triangle, Vector3 } from 'three';
import { buildFactoryFacade } from './factory-facade.ts';
import { FACTORY_PALETTE } from './factory-geometry.ts';
import { FACTORY, FACTORY_STATIONS } from './factory-layout.ts';

const near = (a, b, epsilon = 1e-5) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const volume = (min, max) => new Box3(new Vector3(...min), new Vector3(...max));
function clear(facade, area, label) {
  for (const solid of facade.solids) {
    const box = new Box3().setFromCenterAndSize(new Vector3(...solid.at), new Vector3(...solid.size));
    assert.ok(!box.intersectsBox(area), `${label}: added collider at ${solid.at}`);
  }
  const p = facade.geometry.attributes.position, index = facade.geometry.index, triangle = new Triangle();
  for (let i = 0; i < index.count; i += 3) {
    triangle.a.fromBufferAttribute(p, index.getX(i)); triangle.b.fromBufferAttribute(p, index.getX(i + 1)); triangle.c.fromBufferAttribute(p, index.getX(i + 2));
    assert.ok(!area.intersectsTriangle(triangle), `${label}: visible triangle ${i / 3} crosses the reserved body space`);
  }
}

test('facade is one finite indexed batch inside the existing building and roof envelope', () => {
  const facade = buildFactoryFacade(FACTORY_PALETTE);
  try {
    const g = facade.geometry, p = g.attributes.position, a = new Vector3(), b = new Vector3(), c = new Vector3();
    assert.deepEqual(g.groups, []); assert.equal(facade.triangles, g.index.count / 3); assert.ok(facade.triangles < 11000);
    for (const name of ['position', 'normal', 'color', 'aMat', 'aSuv']) assert.ok(g.attributes[name]);
    for (const attribute of Object.values(g.attributes)) for (const value of attribute.array) assert.ok(Number.isFinite(value));
    for (let i = 0; i < g.index.count; i += 3) {
      for (let j = 0; j < 3; j++) assert.ok(g.index.getX(i + j) < p.count);
      a.fromBufferAttribute(p, g.index.getX(i)); b.fromBufferAttribute(p, g.index.getX(i + 1)); c.fromBufferAttribute(p, g.index.getX(i + 2));
      assert.ok(b.sub(a).cross(c.sub(a)).lengthSq() > 1e-16, 'no collapsed facade face');
    }
    const box = g.boundingBox;
    assert.ok(box.min.x >= FACTORY.building.minX - FACTORY.origin[0] && box.max.x <= FACTORY.building.maxX - FACTORY.origin[0]);
    assert.ok(box.min.z >= FACTORY.building.minZ - FACTORY.origin[2] && box.max.z <= FACTORY.building.maxZ - FACTORY.origin[2]);
    assert.ok(box.min.y >= .0999 && box.max.y < FACTORY.height + .2);
    assert.ok(facade.solids.length <= 64);
    for (const solid of facade.solids) for (const value of [...solid.at, ...solid.size]) assert.ok(Number.isFinite(value));
    assert.ok(facade.solids.every(s => s.size.every(v => v > 0)));
    console.log(JSON.stringify({ triangles: facade.triangles, colliders: facade.solids.length, vertices: p.count }));
  } finally { facade.geometry.dispose(); }
});

test('wall windows have opaque infill and thick entrance canopy while the entry remains genuinely open', () => {
  const facade = buildFactoryFacade(FACTORY_PALETTE), material = new MeshBasicMaterial({ side: DoubleSide });
  const mesh = new Mesh(facade.geometry, material);
  const hit = (origin, direction, far) => new Raycaster(new Vector3(...origin), new Vector3(...direction), 0, far).intersectObject(mesh, false)[0];
  try {
    const pane = hit([-39, 5.7, -35], [0, 0, 1], 6);
    assert.ok(pane, 'window field is a surface rather than floating thin mullions');
    const i = facade.geometry.index.getX(pane.faceIndex * 3), aMat = facade.geometry.attributes.aMat;
    near(aMat.getX(i), FACTORY_PALETTE.glass.rough); near(aMat.getY(i), FACTORY_PALETTE.glass.metal);
    assert.equal(hit([50, 1.4, -29.5], [-1, 0, 0], 8), undefined, 'entry sightline cannot be filled by opaque glass');
    assert.ok(hit([50, 4.1, -29.5], [-1, 0, 0], 8), 'portal has a real overhead volume');
    clear(facade, volume([42, .13, -30.1], [50, 2.4, -28.9]), 'east entrance');
    clear(facade, volume([38, .13, -13], [56, 4.1, -11]), 'test courtyard crossing');
    clear(facade, volume([37, .13, 11], [56, 3.5, 13]), 'rework courtyard crossing');
    clear(facade, volume([38, .13, 22.8], [56, 3.5, 25.2]), 'release courtyard crossing');
  } finally { facade.geometry.dispose(); material.dispose(); }
});

test('surveyed service doors remain clear while unassigned wall-bay gaps are physically closed', () => {
  const facade = buildFactoryFacade(FACTORY_PALETTE);
  const material = new MeshBasicMaterial({ side: DoubleSide }), mesh = new Mesh(facade.geometry, material);
  try {
    for (const [x, z] of [[-32.5, -31], [45, -31], [30, 31]])
      clear(facade, volume([x - .5, .13, z - .5], [x + .5, 2.4, z + .5]), `service door ${x},${z}`);
    clear(facade, volume([-46.5, .13, -17], [-45.5, 2.4, -16]), 'west raw service door');
    for (const z of [-31, 31]) for (const x of [-32.5, -17.5, -2.5, 13.5, 30, 45]) {
      if (z < 0 ? x === -32.5 || x === 45 : x === 30) continue;
      const point = new Vector3(x, 1.4, z);
      assert.ok(facade.solids.some(s => new Box3().setFromCenterAndSize(new Vector3(...s.at), new Vector3(...s.size)).containsPoint(point)), `unsealed bay ${x},${z}`);
      assert.ok(new Raycaster(new Vector3(x, 1.4, z - Math.sign(z) * 2), new Vector3(0, 0, Math.sign(z)), 0, 3)
        .intersectObject(mesh).length, `invisible wall ${x},${z}`);
    }
    for (const z of [-1.5, 14.5]) assert.ok(new Raycaster(new Vector3(-44, 1.4, z), new Vector3(-1, 0, 0), 0, 3).intersectObject(mesh).length);
  } finally { facade.geometry.dispose(); material.dispose(); }
});

test('all three path levels, both ramps and every station retain standing-body clearance', () => {
  const facade = buildFactoryFacade(FACTORY_PALETTE);
  try {
    clear(facade, volume([-43.3, 4.34, 25.5], [38.3, 6.5, 29.5]), 'L1 south gallery');
    clear(facade, volume([39.4, 4.34, 1.5], [45.55, 6.5, 35.5]), 'L1 east landing and its south-wall crossing');
    clear(facade, volume([2.2, 8.54, 25.2], [15.8, 10.75, 35.8]), 'L2 south platform/loggia');
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, z = -21 + 22 * t, y = .12 + 4.2 * t;
      clear(facade, volume([42.45, y + .02, z - .55], [43.55, y + 2.1, z + .55]), `first ramp ${i}`);
      const x = 39 - 23 * t, upper = 4.32 + 4.2 * t;
      clear(facade, volume([x - .55, upper + .02, 33.45], [x + .55, upper + 2.1, 34.55]), `upper ramp ${i}`);
    }
    for (const station of FACTORY_STATIONS) {
      const [x, y, z] = station.at;
      clear(facade, volume([x - .65, y + .02, z - .65], [x + .65, y + 2.1, z + .65]), `station ${station.id}`);
    }
  } finally { facade.geometry.dispose(); }
});

test('palette and independent instance resource ownership remain intact', () => {
  const palette = structuredClone(FACTORY_PALETTE), before = structuredClone(palette);
  const a = buildFactoryFacade(palette), b = buildFactoryFacade(palette);
  let otherDisposals = 0;
  b.geometry.addEventListener('dispose', () => otherDisposals++);
  try {
    assert.deepEqual(palette, before); assert.notEqual(a.geometry, b.geometry); assert.notEqual(a.solids, b.solids);
    a.geometry.dispose(); assert.equal(otherDisposals, 0);
    assert.ok(b.geometry.index.count > 0);
  } finally { b.geometry.dispose(); }
});

test('window interiors show the same glass infill, without a black backing or overlapping cross bars', () => {
  const facade = buildFactoryFacade(FACTORY_PALETTE), material = new MeshBasicMaterial({ side: DoubleSide });
  const mesh = new Mesh(facade.geometry, material);
  const ray = (x, y, z, dz) => new Raycaster(new Vector3(x, y, z), new Vector3(0, 0, dz), 0, 9).intersectObject(mesh, false);
  try {
    for (const [z, dz] of [[-35, 1], [-27, -1]]) {
      const pane = ray(-39, 5.7, z, dz)[0]; assert.ok(pane);
      const index = facade.geometry.index.getX(pane.faceIndex * 3), mat = facade.geometry.attributes.aMat;
      near(mat.getX(index), FACTORY_PALETTE.glass.rough); near(mat.getY(index), FACTORY_PALETTE.glass.metal);
      const hits = ray(-40 + 10.75 / 6 + .01, 4.8875 + .02, z, dz);
      assert.ok(hits.length); assert.equal(hits.filter(h => Math.abs(h.distance - hits[0].distance) < 1e-5).length, 1,
        'a cross joint must not draw two coplanar front faces');
    }
    assert.equal(ray(-32.5, 1.4, -35, 1).length, 0, 'ground door stays open');
    assert.ok(ray(-32.5, 5, -35, 1).length > 0, 'wall above the door reaches the eaves');
  } finally { facade.geometry.dispose(); material.dispose(); }
});
