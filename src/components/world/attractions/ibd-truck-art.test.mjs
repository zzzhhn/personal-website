import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { Builder, cbox } from '../WorldStreetGeometry.ts';
import { buildIbdCab } from './ibd-truck-geometry.ts';

const b = new Builder(), solids = [];
buildIbdCab(b, (at, size, surface, solid = false, bevel = .03, rotation) => {
  if (rotation) b.tr(at, rotation, () => cbox(b, [0, 0, 0], size, surface, bevel));
  else cbox(b, at, size, surface, bevel);
  if (solid) solids.push({ at, size, ...(rotation ? { rotation } : {}) });
}, solids);
const geometry = b.build(), material = new MeshBasicMaterial({ side: DoubleSide }), mesh = new Mesh(geometry, material);
after(() => { geometry.dispose(); material.dispose(); });
const ray = new Raycaster();
function front(x, y) { ray.set(new Vector3(x, y, 22), new Vector3(0, 0, -1)); ray.far = 5; return ray.intersectObject(mesh, false)[0]; }

test('the cab keeps its original solid envelope and merged batch, with finite noncollapsed faces', () => {
  assert.deepEqual(solids, [{ at: [16, 1.55, 19.5], size: [3.8, 2.6, 3.5] }]);
  const box = geometry.boundingBox;
  assert.ok(box.min.x >= 13.785 - 1e-5 && box.max.x <= 18.215 + 1e-5);
  assert.ok(box.min.y >= .25 && box.max.y <= 2.9 && box.min.z >= 17.74 && box.max.z <= 21.385 + 1e-5);
  assert.equal(geometry.groups.length, 0, 'cab surface properties must remain vertex attributes in the same draw');
  for (const attribute of Object.values(geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite));
  const p = geometry.attributes.position, idx = geometry.index, a = new Vector3(), edge = new Vector3(), other = new Vector3();
  for (let i = 0; i < idx.count; i += 3) {
    a.fromBufferAttribute(p, idx.getX(i)); edge.fromBufferAttribute(p, idx.getX(i + 1)).sub(a);
    other.fromBufferAttribute(p, idx.getX(i + 2)).sub(a);
    assert.ok(edge.cross(other).length() > 1e-9, `collapsed cab triangle ${i / 3}`);
  }
});

test('both windscreen panes genuinely rake backwards and the roof shoulders narrow above the doors', () => {
  for (const x of [15.35, 16.65]) {
    const low = front(x, 2.12), high = front(x, 2.52);
    assert.ok(low && high && low.point.z - high.point.z > .15, 'painted glazing on a vertical box cannot pass');
    assert.ok(low.face.normal.y > .3 && high.face.normal.y > .3, 'raked glass must carry its real face normal');
    for (const hit of [low, high]) assert.ok(geometry.attributes.aMat.getX(hit.face.a) < .4, 'first visible face must be glass');
  }
  assert.ok(front(17.8, 1.5), 'lower cab shoulder is absent');
  assert.equal(front(17.8, 2.78), undefined, 'upper cab must taper rather than remain a full-width box');
});

test('side glass is recessed inside the door frame and the wheel crown has an actual tyre air gap', () => {
  for (const side of [-1, 1]) {
    ray.set(new Vector3(16 + side * 2.3, 2.2, 19.5), new Vector3(-side, 0, 0)); ray.far = .9;
    const glass = ray.intersectObject(mesh, false)[0];
    assert.ok(glass && geometry.attributes.aMat.getX(glass.face.a) < .4, 'door opening is filled by an opaque body panel');
    assert.ok(Math.abs(glass.point.x - 16) < 1.81, 'glass must sit behind the tapered outer door plane');
    ray.set(new Vector3(16 + side * 2.3, 1.24, 19.5), new Vector3(-side, 0, 0)); ray.far = .7;
    assert.equal(ray.intersectObject(mesh, false).length, 0, 'body panel fills the gap above the unchanged .58m tyre');
    ray.set(new Vector3(16 + side * 2.3, 1.46, 19.5), new Vector3(-side, 0, 0));
    assert.ok(ray.intersectObject(mesh, false).length, 'wheel opening must still have its connected body crown');
  }
});

test('front lamps sit in real recesses and grille gaps extend behind physical slats', () => {
  const rib = front(16.5, 1.13), cavity = front(16.5, 1.185);
  assert.ok(rib && cavity && rib.point.z - cavity.point.z > .03, 'grille must have depth between its bars');
  for (const side of [-1, 1]) {
    const lens = front(16 + side * 1.42, 1.14), paint = front(16 + side * 1.74, 1.14);
    assert.ok(lens && paint && paint.point.z - lens.point.z > .025, 'lamp lens is pasted in front of the body');
    assert.ok(geometry.attributes.color.getX(lens.face.a) > .65, 'lamp reflector is hidden by the engine core');
  }
  assert.ok(Array.from(geometry.attributes.aMat.array).filter((_, i) => i % 4 === 2).every(v => v === 0),
    'a parked cab must not add emissive fake work lights');
});

test('each door has three separate non-slip tread levels outside the side panel', () => {
  for (const side of [-1, 1]) {
    ray.set(new Vector3(16 + side * 2, 1.25, 18.21), new Vector3(0, -1, 0)); ray.far = 1;
    const heights = [];
    for (const hit of ray.intersectObject(mesh, false)) {
      if (hit.face.normal.y < .95 || heights.some(y => Math.abs(y - hit.point.y) < .02)) continue;
      heights.push(hit.point.y);
    }
    assert.equal(heights.length, 3, `door ${side}: tread levels ${heights}`);
    assert.ok(heights[0] - heights[1] > .24 && heights[1] - heights[2] > .24, 'treads collapse into one decorative slab');
  }
});
