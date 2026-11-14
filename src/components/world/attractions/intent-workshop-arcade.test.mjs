import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Euler, Matrix3, Matrix4, Triangle, Vector3 } from 'three';
import { OBB } from 'three/examples/jsm/math/OBB.js';
import { createWorkshopArcade } from './intent-workshop-arcade.ts';
import { createWorkshopCapsule } from './intent-workshop-geometry.ts';
import { coasterWorld } from './coaster-track.ts';
import { WORKSHOP_INTAKE, WORKSHOP_INTAKE_PANELS, WORKSHOP_TARGETS, WORKSHOP_TOOLS,
  WORKSHOP_CARRIER_Y, WORKSHOP_HUB, workshopLocal, workshopTarget } from './intent-workshop-layout.ts';

const arcade = createWorkshopArcade();
const meshes = [arcade.body, arcade.glow];
const obbs = arcade.colliders.map(c => new OBB(new Vector3(...c.position), new Vector3(...c.half),
  new Matrix3().setFromMatrix4(new Matrix4().makeRotationFromEuler(new Euler(...(c.rotation ?? [0, 0, 0]))))));
const triangles = meshes.flatMap(geometry => {
  const p = geometry.getAttribute('position'), result = [];
  for (let i = 0; i < p.count; i += 3) result.push(new Triangle(...[0, 1, 2].map(j => new Vector3().fromBufferAttribute(p, i + j))));
  return result;
});
const localBox = (min, max) => new Box3(new Vector3(...coasterWorld(min)), new Vector3(...coasterWorld(max)));
const around = (p, half) => new Box3(new Vector3(...p).sub(new Vector3(...half)), new Vector3(...p).add(new Vector3(...half)));
function clear(box, label) {
  for (let i = 0; i < obbs.length; i++) assert.ok(!obbs[i].intersectsBox3(box), `${label}: collider ${i}`);
  for (let i = 0; i < triangles.length; i++) assert.ok(!box.intersectsTriangle(triangles[i]), `${label}: visible triangle ${i}`);
}
after(() => arcade.dispose());

test('two world-space batches stay within the 9000-triangle budget and own their resources', () => {
  assert.notEqual(arcade.body, arcade.glow);
  assert.equal(arcade.triangles, meshes.reduce((n, g) => n + g.getAttribute('position').count / 3, 0));
  assert.ok(arcade.triangles > 0 && arcade.triangles <= 9000);
  assert.ok(arcade.colliders.length > 0 && arcade.colliders.length < 250);
  for (const g of meshes) {
    assert.equal(g.index, null); assert.equal(g.groups.length, 0); assert.equal(g.getAttribute('uv'), undefined);
    assert.equal(g.getAttribute('color').count, g.getAttribute('position').count);
    assert.equal(g.getAttribute('nightRadiance').count, g.getAttribute('position').count);
    for (const a of Object.values(g.attributes)) for (const value of a.array) assert.ok(Number.isFinite(value));
  }
  const another = createWorkshopArcade(); let bodyDisposed = 0, glowDisposed = 0;
  another.body.addEventListener('dispose', () => bodyDisposed++);
  another.glow.addEventListener('dispose', () => glowDisposed++);
  another.dispose(); another.dispose();
  assert.equal(bodyDisposed, 1); assert.equal(glowDisposed, 1);
  assert.ok(arcade.body.getAttribute('position').count > 0);
  console.log(JSON.stringify({ triangles: arcade.triangles, colliders: arcade.colliders.length, colorDraws: 2 }));
});

test('all collider corners coincide with authored solid-box vertices, without an enclosing hull', () => {
  const p = arcade.body.getAttribute('position');
  const vertices = Array.from({ length: p.count }, (_, i) => new Vector3().fromBufferAttribute(p, i));
  for (const [i, c] of arcade.colliders.entries()) {
    const rotation = new Matrix4().makeRotationFromEuler(new Euler(...(c.rotation ?? [0, 0, 0])));
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const corner = new Vector3(x * c.half[0], y * c.half[1], z * c.half[2]).applyMatrix4(rotation).add(new Vector3(...c.position));
      assert.ok(vertices.some(v => v.distanceToSquared(corner) < 1e-6), `collider ${i}: unmatched visible corner`);
    }
  }
});

test('every actual workshopTarget and device operating volume remains open', () => {
  const originY = coasterWorld([0, 0, 0])[1];
  for (const id of WORKSHOP_TARGETS) {
    const target = workshopTarget(id);
    clear(around([target[0], originY + 1.25, target[2]], [.6, 1.2, .6]), `${id} standing/camera`);
    const [x, , z] = workshopLocal(id);
    clear(localBox([x - 1.6, .05, z - 1.35], [x + 1.6, 4.98, z + 1.35]), `${id} device and overhead frame`);
  }
  for (const { at: [x, y, z], size: [w, h] } of WORKSHOP_INTAKE_PANELS)
    clear(localBox([x - w / 2 - .1, y - h / 2 - .1, z - .25], [x + w / 2 + .1, y + h / 2 + .1, z + .1]), 'intake sign');
});

test('actual capsule geometry clears every intake, hub, branch and lowering segment', () => {
  const capsule = createWorkshopCapsule();
  capsule.computeBoundingBox();
  const capsuleBounds = capsule.boundingBox.clone().expandByScalar(.1);
  capsule.dispose();
  let samples = 0;
  for (const { id, at: [x, , z] } of WORKSHOP_TOOLS) {
    // Same world-space waypoints and unchanged capsule orientation as
    // WorldIntentWorkshop. Retain the finite capsule size during all motion.
    const path = [
      [WORKSHOP_INTAKE[0], 1.66, WORKSHOP_INTAKE[2]],
      [WORKSHOP_INTAKE[0], WORKSHOP_CARRIER_Y, WORKSHOP_INTAKE[2] - .85],
      [WORKSHOP_HUB[0], WORKSHOP_CARRIER_Y, WORKSHOP_HUB[2]],
      [x, WORKSHOP_CARRIER_Y, z - .85], [x, 1.6, z],
    ].map(p => new Vector3(...coasterWorld(p)));
    for (let segment = 1; segment < path.length; segment++) {
      const steps = Math.ceil(path[segment - 1].distanceTo(path[segment]) / .15);
      for (let i = 0; i <= steps; i++) {
        const p = path[segment - 1].clone().lerp(path[segment], i / steps);
        clear(capsuleBounds.clone().translate(p), `${id} carrier segment ${segment} sample ${i}`);
        samples++;
      }
    }
  }
  console.log(JSON.stringify({ carrierSamples: samples, clearance: .1 }));
});

test('front entrance, target approaches and a larger camera envelope remain clear', () => {
  clear(localBox([-13.2, .05, 69.5], [-11.8, 2.5, 80]), 'continuous front entrance');
  clear(localBox([-7, .05, 54.5], [7, 3, 57.5]), 'coaster main gate');
  for (const id of WORKSHOP_TARGETS) {
    const target = workshopLocal(id), end = [target[0], 0, target[2] + 1.7];
    const path = ['intake', 'bell', 'act'].includes(id)
      ? [[-12.5, 0, 79], [end[0], 0, 77], end]
      : [[-12.5, 0, 79], [-12.5, 0, 69.8], [-16, 0, 69.8], end];
    for (let segment = 1; segment < path.length; segment++) {
      const from = new Vector3(...path[segment - 1]), to = new Vector3(...path[segment]);
      const steps = Math.ceil(from.distanceTo(to) / .2);
      for (let i = 0; i <= steps; i++) {
        const p = from.clone().lerp(to, i / steps);
        clear(localBox([p.x - .6, .05, p.z - .6], [p.x + .6, 2.5, p.z + .6]), `${id} approach ${segment}:${i}`);
      }
    }
  }
});

test('central sky opening stays empty above the existing carrier and toward the coaster', () => {
  clear(localBox([-20.5, 5, 64.5], [-12.8, 30, 69.8]), 'open central sky');
  // Open frontage is a volume, not a gap obtained only by omitting collision.
  clear(localBox([-13.2, 2.5, 74], [-11.8, 5.2, 80]), 'front view opening');
});
