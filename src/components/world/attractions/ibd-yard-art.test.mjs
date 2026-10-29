import test from 'node:test';
import assert from 'node:assert/strict';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { Builder, cbox } from '../WorldStreetGeometry.ts';
import { buildIbdArchitecture, buildIbdStores } from './ibd-yard-architecture.ts';
import { buildIbdStatic } from './ibd-yard-geometry.ts';
import { IBD_SHEDS, IBD_TRUCK } from './ibd-yard-layout.ts';
import { IBD_FIXTURES, ibdWorkLight, nearestIbdFixtures } from './ibd-yard-lighting.ts';

function sample(build) {
  const b = new Builder(), solids = [];
  const cube = (at, size, surface, solid = false, bevel = .03, rotation) => {
    if (rotation) b.tr(at, rotation, () => cbox(b, [0, 0, 0], size, surface, bevel));
    else cbox(b, at, size, surface, bevel);
    if (solid) solids.push({ at, size, ...(rotation ? { rotation } : {}) });
  };
  build(b, cube, solids);
  const geometry = b.build(), material = new MeshBasicMaterial({ side: DoubleSide });
  return { geometry, mesh: new Mesh(geometry, material), dispose() { geometry.dispose(); material.dispose(); } };
}

test('all three front portal columns expose a recessed web between their structural flanges', () => {
  const data = sample(buildIbdArchitecture), ray = new Raycaster();
  try {
    const p = data.geometry.attributes.position, index = data.geometry.index;
    const a = new Vector3(), edge = new Vector3(), other = new Vector3();
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(p, index.getX(i));
      edge.fromBufferAttribute(p, index.getX(i + 1)).sub(a); other.fromBufferAttribute(p, index.getX(i + 2)).sub(a);
      assert.ok(edge.cross(other).length() > 1e-9, 'gable/rib tessellation contains a collapsed face');
    }
    for (const shed of IBD_SHEDS) {
      const x = shed.x - shed.width / 2, z = shed.z + shed.depth / 2;
      ray.set(new Vector3(x - 1, shed.eave / 2, z + .12), new Vector3(1, 0, 0)); ray.far = 1.5;
      const web = ray.intersectObject(data.mesh, false)[0];
      assert.ok(web && web.point.x > x - .1 && web.point.x < x, `${shed.id}: a solid post hides the web recess`);
      ray.set(new Vector3(x + .18, shed.eave / 2, z + 1), new Vector3(0, 0, -1)); ray.far = 1.5;
      const flange = ray.intersectObject(data.mesh, false)[0];
      assert.ok(flange && flange.point.z > z + .24, `${shed.id}: front flange is missing`);
    }
  } finally { data.dispose(); }
});

test('the rear parts rack contains actual hollow stock instead of a closed case or painted dark disc', () => {
  const data = sample(buildIbdStores), ray = new Raycaster();
  try {
    for (const x of [20.75, 22.15, 23.55]) {
      ray.set(new Vector3(x, 2.93, -21.5), new Vector3(0, 0, -1)); ray.far = 3;
      assert.equal(ray.intersectObject(data.mesh, false).length, 0, 'stock bore must be open through both cut ends');
      ray.set(new Vector3(x + .25, 2.93, -21.5), new Vector3(0, 0, -1));
      assert.ok(ray.intersectObject(data.mesh, false).length, 'the surrounding cut steel annulus must remain visible');
    }
  } finally { data.dispose(); }
});

test('the new ceiling lamps leave full closed-pallet headroom across both loaded bays, including their centres', () => {
  const { geometry } = buildIbdStatic(), material = new MeshBasicMaterial({ side: DoubleSide });
  const mesh = new Mesh(geometry, material), ray = new Raycaster();
  try {
    for (const slot of ['parts-a', 'parts-b']) {
      const [x, pivot, z] = IBD_TRUCK[slot];
      for (const dx of [-1.4, 0, 1.4]) for (const dz of [-1.2, 0, 1.2]) {
        ray.set(new Vector3(x + dx, pivot + 1.21, z + dz), new Vector3(0, 1, 0)); ray.far = 1;
        const hit = ray.intersectObject(mesh, false)[0];
        assert.ok(hit && hit.distance > .25, `${slot} closed lid clearance at ${dx},${dz}: ${hit?.distance}`);
      }
      for (const y of [1.53, 2.75]) {
        ray.set(new Vector3(x + 1.5, y, z), new Vector3(1, 0, 0)); ray.far = .7;
        const side = ray.intersectObject(mesh, false)[0];
        assert.ok(side && side.distance > .25, `${slot}: liner hardware occupies the loaded pallet side clearance`);
      }
    }
  } finally { geometry.dispose(); material.dispose(); }
});

test('task surfaces receive local warm fill and the live pair selects their actual desk/inside-truck fixtures', () => {
  const pair = [-1, -1];
  for (const [x, y, z] of [[-6, 1.2, 19], [-3, .9, 26], [10, .94, -12], [18, .94, -12]]) {
    assert.ok(ibdWorkLight(x, y, z, 0, 1, 0) > .4, `unlit working top ${x},${z}`);
  }
  nearestIbdFixtures(-6, 19, pair, 1.2);
  assert.equal(IBD_FIXTURES[pair[0]].mount, 'bench');
  for (const z of [10.5, 14.5]) {
    nearestIbdFixtures(16, z, pair, 2.8);
    assert.ok(pair.some(i => i >= 0 && IBD_FIXTURES[i].mount === 'truck' && Math.abs(IBD_FIXTURES[i].at[2] - z) < .1),
      'the active bay has its own interior source in the live pair');
  }
});

test('crossing between the two interior lamps preserves live-light assignments instead of restarting both fades', () => {
  const pair = [-1, -1];
  nearestIbdFixtures(16, 12.4, pair, 2.8);
  assert.ok(pair.every(i => i >= 0 && IBD_FIXTURES[i].mount === 'truck'));
  const before = [...pair];
  nearestIbdFixtures(16, 12.6, pair, 2.8);
  assert.deepEqual(pair, before, 'the same fixture pair must keep its two light slots');
});
