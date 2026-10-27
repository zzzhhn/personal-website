import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Triangle, Vector3 } from 'three';
import R from '@dimforge/rapier3d-compat';
import { addCoasterTower, CoasterBatch } from './coaster-geometry.ts';
import { coasterColliderDescriptor } from './coaster-collision.ts';
import { coasterFrame, coasterRidePose, coasterWorld } from './coaster-track.ts';
import { sweepCamera } from '../camera-collision.ts';

function tower(detailed = true) {
  const steel = new CoasterBatch(), glow = new CoasterBatch(), colliders = [];
  addCoasterTower(steel, glow, colliders, detailed);
  const body = steel.finish(), lamps = glow.finish();
  return { body, lamps, colliders, dispose() { body.dispose(); lamps.dispose(); } };
}

test('tower alone adds at most 6000 triangles and preserves two finite batched surfaces', () => {
  for (const detailed of [true, false]) {
    const g = tower(detailed);
    try {
      const total = (g.body.attributes.position.count + g.lamps.attributes.position.count) / 3;
      // Original tower: 972 near / 828 far triangles, measured before this refinement.
      assert.ok(total - (detailed ? 972 : 828) <= 6000);
      for (const geometry of [g.body, g.lamps]) {
        assert.equal(geometry.groups.length, 0);
        for (const attribute of Object.values(geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite));
        assert.equal(geometry.attributes.nightRadiance.count, geometry.attributes.position.count);
      }
    } finally { g.dispose(); }
  }
});

test('both opaque tower facades receive warm diffuse vertex light near the bulkheads', () => {
  const g = tower(), p = g.body.attributes.position, n = g.body.attributes.normal, fill = g.body.attributes.nightRadiance;
  try {
    for (const face of ['east', 'front']) {
      let count = 0, warm = 0;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i) - 1;
        const selected = face === 'east'
          ? p.getX(i) > 13.35 && p.getX(i) < 13.6 && n.getX(i) > .9 && [10, 26, 42].some(h => Math.abs(y - h) < 3)
          : p.getX(i) > 6 && p.getX(i) < 14 && Math.abs(p.getZ(i) + 270.5) < .06 && n.getZ(i) > .9 && y > 10 && y < 45;
        if (!selected) continue;
        count++; if (fill.getX(i) > .25 && fill.getX(i) > fill.getZ(i)) warm++;
      }
      assert.ok(count >= 12, `${face} needs interior lighting samples`);
      assert.ok(warm / count > .5, `${face}: ${warm}/${count} warm opaque vertices`);
    }
  } finally { g.dispose(); }
});

test('actual tower triangles clear the swept train and seated head envelope', () => {
  const g = tower(), p = g.body.attributes.position, bounds = new Box3().setFromBufferAttribute(p);
  const triangles = [], closest = new Vector3();
  for (let i = 0; i < p.count; i += 3) triangles.push(new Triangle(...[0, 1, 2].map(k => new Vector3().fromBufferAttribute(p, i + k))));
  let checked = 0, minimum = Infinity;
  try {
    for (let i = 0; i < 2400; i++) {
      const f = coasterFrame(i / 2400);
      if (bounds.distanceToPoint(f.point) > 6) continue;
      checked++;
      // Sampling the whole centreline also covers all three cars' longitudinal offsets.
      for (const [up, radius] of [[.1, 1.2], [1.2, 1.1], [2.15, .5]]) {
        const centre = f.point.clone().addScaledVector(f.up, up);
        for (const triangle of triangles) {
          const distance = triangle.closestPointToPoint(centre, closest).distanceTo(centre);
          minimum = Math.min(minimum, distance - radius);
          assert.ok(distance > radius, `tower intersects train/head at u=${i / 2400}`);
        }
      }
    }
    assert.ok(checked > 10);
    console.log(`tower surface clearance: ${minimum.toFixed(3)} m beyond sampled train/head envelopes`);
  } finally { g.dispose(); }
});

test('tower surfaces leave chase, comfort and first-person sight lines clear at uniform arc samples', () => {
  const g = tower(), material = new MeshBasicMaterial({ side: DoubleSide });
  const objects = [new Mesh(g.body, material), new Mesh(g.lamps, material)], ray = new Raycaster();
  objects.forEach(mesh => mesh.updateMatrixWorld());
  try {
    for (let i = 0; i < 2400; i++) for (const mode of ['chase', 'comfort', 'first-person']) {
      const u = i / 2400, pose = coasterRidePose(u, mode), eye = new Vector3(...pose.cameraPosition);
      const head = coasterFrame(u).point.addScaledVector(coasterFrame(u).up, 2.2);
      for (const target of mode === 'first-person' ? [new Vector3(...pose.cameraTarget)] : [head, new Vector3(...pose.cameraTarget)]) {
        const direction = target.sub(eye);
        ray.set(eye, direction.clone().normalize()); ray.near = .05; ray.far = mode === 'first-person' ? 2 : direction.length();
        assert.equal(ray.intersectObjects(objects, false).length, 0, `${mode} tower obstruction at u=${u}`);
      }
    }
  } finally { g.dispose(); material.dispose(); }
});

test('free orbit camera sweeps stop at tower skins, platforms and guardrails', async () => {
  await R.init();
  const g = tower(), world = new R.World({ x: 0, y: 0, z: 0 });
  try {
    for (const c of g.colliders) world.createCollider(coasterColliderDescriptor(R, c));
    world.step();
    const point = p => new Vector3(...coasterWorld(p));
    const cases = [];
    for (const y of [2, 12, 18, 25, 34, 42, 52]) {
      cases.push([[-32, y, -80], [-40, y, -80]], [[-40, y, -68], [-40, y, -80]]);
    }
    for (const y of [5, 15, 28, 41].map(v => v * 54 / 44)) {
      cases.push([[-40, y + 3, -74.8], [-40, y - 1, -74.8]]);
      cases.push([[-40, y + 1.8, -72], [-40, y + 1.8, -75]]);
    }
    for (const [from, to] of cases) {
      const result = sweepCamera(world, R, point(from), point(to), .22, undefined, () => true);
      assert.notEqual(result.hit, null, `missing camera collider between ${from} and ${to}`);
      assert.ok(result.distance < point(from).distanceTo(point(to)) - .2);
    }
  } finally { world.free(); g.dispose(); }
});
