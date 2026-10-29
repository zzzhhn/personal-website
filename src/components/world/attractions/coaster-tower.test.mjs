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

test('the 85 metre open tower preserves two finite batches within its geometry budget', () => {
  for (const detailed of [true, false]) {
    const g = tower(detailed);
    try {
      const total = (g.body.attributes.position.count + g.lamps.attributes.position.count) / 3;
      assert.ok(total <= (detailed ? 9000 : 7500));
      for (const geometry of [g.body, g.lamps]) {
        assert.equal(geometry.groups.length, 0);
        for (const attribute of Object.values(geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite));
        assert.equal(geometry.attributes.nightRadiance.count, geometry.attributes.position.count);
      }
    } finally { g.dispose(); }
  }
});

test('tower equipment and platforms receive real diffuse light at each service level', () => {
  const g = tower(), p = g.body.attributes.position, n = g.body.attributes.normal, fill = g.body.attributes.nightRadiance;
  try {
    for (const level of [12,36,60,83]) {
      let count=0,warm=0;
      for(let i=0;i<p.count;i++) {
        const selected=p.getX(i)>4.6&&p.getX(i)<7.4&&Math.abs(p.getZ(i)+344.8)<.03&&n.getZ(i)>.9&&Math.abs(p.getY(i)-(level+2.3))<1.2;
        if(!selected)continue;count++;
        if(fill.getX(i)>.25&&fill.getX(i)>fill.getZ(i))warm++;
      }
      assert.ok(count>=6, `service level ${level} has real opaque faces`);
      assert.ok(warm/count>.5, `service level ${level}: ${warm}/${count} lit faces`);
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
    for(const y of [2,18,34,52,75])cases.push([[-40,y,-151],[-44,y,-151]]);
    for(const y of [12,36,60,83]){
      cases.push([[-46,y+3,-150],[-46,y-1,-150]]);
      cases.push([[-46,y+1.2,-142],[-46,y+1.2,-147]]);
    }
    for (const [from, to] of cases) {
      const result = sweepCamera(world, R, point(from), point(to), .22, undefined, () => true);
      assert.notEqual(result.hit, null, `missing camera collider between ${from} and ${to}`);
      assert.ok(result.distance < point(from).distanceTo(point(to)) - .2);
    }
  } finally { world.free(); g.dispose(); }
});
