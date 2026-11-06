import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { Builder, cbox } from '../WorldStreetGeometry.ts';
import { buildIbdTruck } from './ibd-truck-geometry.ts';
import { IBD_TRUCK_FLOOR as floor, IBD_TRUCK_WHEELS as wheels } from './ibd-yard-layout.ts';

const b = new Builder(), solids = [];
buildIbdTruck(b, (at, size, surface, solid = false, bevel = .03, rotation) => {
  if (rotation) b.tr(at, rotation, () => cbox(b, [0, 0, 0], size, surface, bevel));
  else cbox(b, at, size, surface, bevel);
  if (solid) solids.push({ at, size, ...(rotation ? { rotation } : {}) });
}, solids);
const geometry = b.build(), material = new MeshBasicMaterial({ side: DoubleSide }), mesh = new Mesh(geometry, material);
const role = geometry.attributes.aMat, ray = new Raycaster();
after(() => { geometry.dispose(); material.dispose(); });
function hit(from, direction, far) {
  ray.set(new Vector3(...from), new Vector3(...direction)); ray.far = far;
  return ray.intersectObject(mesh, false)[0];
}

test('the full crafted truck keeps every original collision envelope and ramp transform', () => {
  assert.deepEqual(solids, [
    { at: [16, 1.05, 12.5], size: [4, .3, 9] },
    { at: [18, 2.3, 12.5], size: [.2, 3.1, 9] },
    { at: [16, 3.9, 12.5], size: [4, .16, 9] },
    { at: [16, 2.3, 8], size: [4, 3.1, .15] },
    { at: [16, 2.3, 17], size: [4, 3.1, .15] },
    { at: [16, 1.55, 19.5], size: [3.8, 2.6, 3.5] },
    ...[10.5, 14.5].map(z => ({ at: [12.5, .6, z], size: [Math.hypot(3, floor), .14, 2.9], rotation: [0, 0, Math.atan2(floor, 3)] })),
  ]);
  assert.equal(geometry.groups.length, 0, 'physical finishes stay in the merged draw');
  for (const attribute of Object.values(geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite));
  const p = geometry.attributes.position, idx = geometry.index, a = new Vector3(), edge = new Vector3(), other = new Vector3();
  for (let i = 0; i < idx.count; i += 3) {
    a.fromBufferAttribute(p, idx.getX(i)); edge.fromBufferAttribute(p, idx.getX(i + 1)).sub(a);
    other.fromBufferAttribute(p, idx.getX(i + 2)).sub(a);
    assert.ok(edge.cross(other).length() > 1e-9, `collapsed truck triangle ${i / 3}`);
  }
});

test('all six steel wheels have actual open webs with recessed brake drums', () => {
  for (const z of wheels.axles) for (const side of [-1, 1]) {
    const sample = angle => hit([wheels.centerX + side*2.4,
      wheels.centerY - side*.22*Math.cos(angle), z + .22*Math.sin(angle)], [-side, 0, 0], 1);
    const web = sample(0), opening = sample(Math.PI/6);
    assert.ok(web && opening, 'wheel web or backing drum is absent');
    assert.equal(role.getW(web.face.a), -2, 'first visible web is not bare milled steel');
    assert.ok(side*(web.point.x-opening.point.x) > .045, 'wheel ventilation is painted onto a filled face');
    assert.ok(role.getX(opening.face.a) > .6 && role.getY(opening.face.a) < .3, 'ventilation must reveal the darker brake drum');
  }
});

test('wear boards share the real cargo floor datum, with shallow joints and the two open loading lanes', () => {
  const uv = geometry.attributes.aSuv;
  for (const z of [10.5, 14.5]) {
    for (const x of [14.335, 15.285, 16.235, 17.66]) {
      const top = hit([x, 1.5, z], [0, -1, 0], .5);
      assert.ok(top && Math.abs(top.point.y-floor) < 1e-6, 'wood deck floats above or below the carrying datum');
      assert.equal(role.getW(top.face.a), -3, 'wear board does not use the wood finish');
      assert.ok(Math.abs(uv.getX(top.face.a)) > 8, 'board manufacturing coordinates were discarded');
    }
    const joint = hit([14.5725, 1.5, z], [0, -1, 0], .5);
    assert.ok(joint && floor-joint.point.y > .02 && floor-joint.point.y < .03, 'board joint must expose the nearby steel carrier');
    for (const y of [1.3, 2.2, 3.3]) {
      const opening = hit([13.8, y, z], [1, 0, 0], 4.5);
      assert.ok(opening && opening.point.x > 17.85, 'truck framing closes the west loading aperture');
    }
  }
});
