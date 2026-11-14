import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Mesh, MeshBasicMaterial, DoubleSide, Raycaster, Triangle, Vector3 } from 'three';
import { buildFactoryProductionDetail, FACTORY_TOOL_RACKS } from './factory-production-detail.ts';
import { FACTORY_PALETTE } from './factory-geometry.ts';
import { FACTORY_STATIONS, FACTORY_WORK_VIEWS } from './factory-layout.ts';
import { FACTORY_WALK_EDGES, FACTORY_WALK_NODES } from './factory-navigation.ts';
import { FACTORY_RAW_PICK, FACTORY_RAW_HALF_HEIGHT, FACTORY_CONVEYOR_TOP, FACTORY_LINE_Z } from './factory-operation.ts';
import { FACTORY_MODULES } from './factory-game.ts';
import { factoryIntakePath, factoryRoutingPath, sampleFactoryRoute } from './factory-routing.ts';

const model = buildFactoryProductionDetail(FACTORY_PALETTE), geometry = model.geometry;
const material = new MeshBasicMaterial({ side: DoubleSide }), mesh = new Mesh(geometry, material);
const boxes = model.solids.map(s => new Box3().setFromCenterAndSize(new Vector3(...s.at), new Vector3(...s.size)));
const triangles = [], p = geometry.attributes.position, index = geometry.index;
for (let i = 0; i < index.count; i += 3) triangles.push(new Triangle(...[0, 1, 2].map(j => new Vector3().fromBufferAttribute(p, index.getX(i + j)))));
const bounds = (min, max) => new Box3(new Vector3(...min), new Vector3(...max));
function clear(box, label) {
  for (let i = 0; i < boxes.length; i++) if (box.intersectsBox(boxes[i])) assert.fail(`${label}: collider ${i}`);
  for (let i = 0; i < triangles.length; i++) if (box.intersectsTriangle(triangles[i])) assert.fail(`${label}: visible triangle ${i}`);
}
after(() => { geometry.dispose(); material.dispose(); });

test('production details merge as one finite static batch with bounded exact boxes and seven fixtures', () => {
  assert.equal(model.triangles, index.count / 3); assert.ok(model.triangles < 5600);
  assert.ok(model.solids.length > 0 && model.solids.length <= 190); assert.equal(model.lamps.length, 7); assert.equal(FACTORY_TOOL_RACKS.length, 3);
  assert.deepEqual(geometry.groups, []);
  for (const a of Object.values(geometry.attributes)) for (const value of a.array) assert.ok(Number.isFinite(value));
  for (const box of boxes) assert.ok(box.min.y >= .1199);
  console.log(JSON.stringify({ triangles: model.triangles, colliders: model.solids.length, addedColorDrawsAfterMerge: 0, realtimeLights: 0 }));
});

test('reserve stock supports each live source blank at its real underside, below the extraction sweep', () => {
  for (const module of FACTORY_MODULES) {
    const [x, y, z] = FACTORY_RAW_PICK[module], top = y - FACTORY_RAW_HALF_HEIGHT[module];
    const hit = new Raycaster(new Vector3(x + .013, y + .5, z + .017), new Vector3(0, -1, 0), 0, 2).intersectObject(mesh)[0];
    assert.ok(hit); assert.ok(Math.abs(hit.point.y - top) < 1e-5, module);
    clear(bounds([x - .34, top + .01, z - .37], [x + .34, y + .6, z + .37]), `${module} live blank and magnet`);
  }
  clear(bounds([-43.5, 1.72, -23.5], [-31.5, 7.65, -13.5]), 'gantry load and trolley envelope');
});

test('all stations, signed walking edges and real operating camera rays retain clearance', () => {
  for (const station of FACTORY_STATIONS) {
    const [x, y, z] = station.at;
    clear(bounds([x - .6, y + .02, z - .6], [x + .6, y + 2.3, z + .6]), station.id);
  }
  for (const [a, b] of FACTORY_WALK_EDGES) {
    const from = new Vector3(...FACTORY_WALK_NODES[a]), to = new Vector3(...FACTORY_WALK_NODES[b]);
    const steps = Math.ceil(from.distanceTo(to) / .3);
    for (let i = 0; i <= steps; i++) {
      const at = from.clone().lerp(to, i / steps);
      clear(bounds([at.x - .4, at.y + .02, at.z - .4], [at.x + .4, at.y + 2.2, at.z + .4]), `${a}->${b}:${i}`);
    }
  }
  for (const [id, view] of Object.entries(FACTORY_WORK_VIEWS)) {
    const from = new Vector3(...view.eye), to = new Vector3(...view.target), distance = from.distanceTo(to);
    assert.equal(new Raycaster(from, to.sub(from).normalize(), 0, distance).intersectObject(mesh).length, 0, `${id} work view`);
  }
});

test('intake, every routing destination and all manufactured carrier paths stay free of new details', () => {
  for (const module of FACTORY_MODULES) {
    const h = FACTORY_RAW_HALF_HEIGHT[module];
    for (const path of [factoryIntakePath(module), ...FACTORY_MODULES.map(line => factoryRoutingPath(module, line))]) {
      for (let i = 0; i <= 160; i++) {
        const [x, y, z] = sampleFactoryRoute(path, i / 160, [0, 0, 0]);
        clear(bounds([x - .32, y - h + .012, z - .36], [x + .32, y + h, z + .36]), `${module} raw:${i}`);
      }
    }
    for (let x = -27; x <= 20; x += .2) clear(bounds([x - .85, FACTORY_CONVEYOR_TOP + .012, FACTORY_LINE_Z[module] - .6],
      [x + .85, FACTORY_CONVEYOR_TOP + 1, FACTORY_LINE_Z[module] + .6]), `${module} finished carrier:${x}`);
  }
});
