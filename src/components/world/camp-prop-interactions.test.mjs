import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import R from '@dimforge/rapier3d-compat';
import { angleDelta, rotateVector, yawRotation } from './actor-physics.ts';
import {
  CAMP_DUMBBELL_REACH, campDumbbellDrop, campDumbbellGrip, campMissingSignalTime, campPalmTouches, campPropActor, campPropHand, campPushablePrompt, campSuitcaseHandleZ, campSuitcasePull, campSuitcaseTowTarget, campSuitcaseTurn, canReachCampProp,
  cancelCampPropInteraction, currentCampPropInteraction, holdCampDumbbell, nearestCampToolLane, readCampPropActivity, startCampPropInteraction,
} from './camp-prop-interactions.ts';

test('a camp prop can take over and release only its own session, clearing stale palm contact', () => {
  const released = [];
  startCampPropInteraction({ id: 'tool', anchor: [0, 0, 0], inspect: () => ({ phase: 'held' }), release: () => released.push('tool') });
  Object.assign(campPropHand, { target: [1, 0, 0], mode: 'grip', palm: [1.08, 0, 0], facing: [1, 0, 0] });
  assert.equal(campPalmTouches([1, 0, 0], .1), true);
  assert.equal(campPalmTouches([1, 0, 0], .06), false);
  startCampPropInteraction({ id: 'weight', anchor: [0, 0, 0], release: () => released.push('weight') });
  assert.equal(currentCampPropInteraction().id, 'weight');
  assert.equal(readCampPropActivity().lastCancel.reason, 'superseded');
  assert.equal(readCampPropActivity().lastCancel.state.phase, 'held');
  assert.deepEqual(readCampPropActivity().lastCancel.hand.palm, [1.08, 0, 0]);
  assert.deepEqual(campPropHand, { target: null, mode: 'reach', palm: null, facing: null });
  assert.equal(cancelCampPropInteraction(), true);
  assert.equal(cancelCampPropInteraction(), false);
  assert.equal(readCampPropActivity().lastCancel.reason, 'manual');
  assert.deepEqual(released, ['tool', 'weight']);
});

test('a transient lost signal resets without accumulating separated misses', () => {
  const step = 1 / 60;
  let elapsed = 0;
  for (let i = 0; i < 60; i++) elapsed = campMissingSignalTime(elapsed, i % 2 === 0, step);
  assert.equal(elapsed, step);
  for (let i = 0; i < 11; i++) elapsed = campMissingSignalTime(elapsed, false, step);
  assert.ok(elapsed > .18);
  assert.equal(campMissingSignalTime(elapsed, true, step), 0);
});

test('pickup range uses live grounded actor coordinates and rejects far or high targets', () => {
  Object.assign(campPropActor, { position: [10, 5.7, 15], grounded: true, available: true });
  assert.equal(canReachCampProp([10.4, 5, 15.2], .64), true);
  assert.equal(canReachCampProp([10.75, 5, 15.2], .64), false);
  assert.equal(canReachCampProp([10.4, 7.5, 15.2], .64), false);
  campPropActor.grounded = false;
  assert.equal(canReachCampProp([10.4, 5, 15.2], .64), false);
});

test('the settled collision-safe stance can reach the near surface of the dumbbell grip', () => {
  const actor = [-41.1026, 5.7188, 16.2269];
  const body = [-41.1, 4.904, 15.62], rotation = yawRotation(-Math.PI / 2 + .12);
  const local = campDumbbellGrip(body, rotation, actor);
  const point = rotateVector(local, rotation).map((offset, i) => body[i] + offset);
  Object.assign(campPropActor, { position: actor, grounded: true, available: true });
  const centreDistance = Math.hypot(actor[0] - body[0], actor[2] - body[2]);
  const surfaceDistance = Math.hypot(actor[0] - point[0], actor[2] - point[2]);
  assert.ok(centreDistance > .60 && surfaceDistance < .59, JSON.stringify({ centreDistance, surfaceDistance, point }));
  assert.ok(Math.abs(Math.hypot(local[0], local[1] - .1001) - .0272) < 1e-8);
  assert.ok(Math.abs(local[2]) <= .03);
  assert.equal(canReachCampProp(point, CAMP_DUMBBELL_REACH), true);
});

test('the moving suitcase prompt is reachable from the handle side as well as the front', () => {
  const grip = [-26.874, 5.746, 29.985];
  for (const actor of [[-26.4, 5.7188, 30], [-27.5, 5.7188, 30]]) {
    Object.assign(campPropActor, { position: actor, grounded: true, available: true });
    assert.equal(canReachCampProp(grip, .66), true);
    const anchor = campPushablePrompt(grip, actor, .05);
    assert.ok(Math.hypot(anchor[0] - actor[0], anchor[2] - actor[2]) < .27, JSON.stringify(anchor));
    assert.ok(Math.abs(anchor[1] - (grip[1] + .05)) < 1e-8);
  }
});

test('the workshop pack actually has five separate tool lanes across the existing material batches', () => {
  const bytes = readFileSync(new URL('../../../public/assets/world/camp-workshop-craft/camp-workshop.glb', import.meta.url));
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength));
  const binaryStart = 28 + jsonLength;
  const tools = gltf.nodes.find(node => node.name === 'C11_tools');
  const wall = gltf.nodes.find(node => node.name === 'C11');
  const centres = JSON.parse(wall.extras.panelCentresGLB_z);
  assert.equal(tools.children.length, 3);
  assert.equal(centres.length, 5);
  const faces = centres.map(() => 0);
  function get(accessorIndex, element, component, size) {
    const accessor = gltf.accessors[accessorIndex], view = gltf.bufferViews[accessor.bufferView];
    return binaryStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + element * (view.byteStride ?? size) + component * 4;
  }
  for (const child of tools.children) {
    for (const primitive of gltf.meshes[gltf.nodes[child].mesh].primitives) {
      const indices = gltf.accessors[primitive.indices];
      const stride = indices.componentType === 5123 ? 2 : 4;
      const readIndex = element => bytes.readUIntLE(get(primitive.indices, element, 0, stride), stride);
      const z = vertex => bytes.readFloatLE(get(primitive.attributes.POSITION, vertex, 2, 12));
      for (let face = 0; face < indices.count; face += 3) {
        const lane = nearestCampToolLane(z(readIndex(face)), centres);
        assert.equal(nearestCampToolLane(z(readIndex(face + 1)), centres), lane);
        assert.equal(nearestCampToolLane(z(readIndex(face + 2)), centres), lane);
        faces[lane]++;
      }
    }
  }
  assert.ok(faces.every(count => count > 100), JSON.stringify(faces));
});

test('a held hex weight can sweep through the player capsule without a solver impulse, then restore at a safe pose', async () => {
  await R.init();
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  try {
    const home = [-41.1, 4.904, 15.62], yaw = -Math.PI / 2 + .12;
    const start = [-41.0995, 5.7188, 16.1104];
    world.createCollider(R.ColliderDesc.cuboid(4, .1, 4).setTranslation(-41, 4.8, 15.5));
    const actor = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...start).lockRotations()
      .setGravityScale(12.5 / 9.81).setLinearDamping(.2).setCcdEnabled(true).setSoftCcdPrediction(.1));
    const capsule = world.createCollider(R.ColliderDesc.capsule(.48, .34).setMass(72).setFriction(0), actor);
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...home).setRotation(yawRotation(yaw))
      .setLinearDamping(.35).setAngularDamping(.8).setCcdEnabled(true));
    const vertices = [];
    for (const z of [-.287, .287]) for (let side = 0; side < 6; side++) {
      const angle = side * Math.PI / 3;
      vertices.push(.1156 * Math.cos(angle), .1001 + .1156 * Math.sin(angle), z);
    }
    const collider = world.createCollider(R.ColliderDesc.convexHull(new Float32Array(vertices)).setMass(16).setFriction(.7), body);
    const originalGroups = [collider.collisionGroups(), collider.solverGroups()];
    for (let i = 0; i < 12; i++) world.step();
    const before = actor.translation(), p = body.translation();
    const release = holdCampDumbbell(body, R.RigidBodyType);
    for (let i = 0; i < 14; i++) {
      const t = (i + 1) / 14;
      body.setNextKinematicTranslation({ x: p.x + .08 * t, y: p.y + .70 * t, z: p.z + .47 * t });
      body.setNextKinematicRotation(yawRotation(yaw + Math.PI * t));
      world.step();
      world.contactPair(capsule, collider, manifold => assert.equal(manifold.numSolverContacts(), 0));
      const v = actor.linvel();
      assert.ok(Math.hypot(v.x, v.y, v.z) < .05, JSON.stringify(v));
    }
    const held = body.translation(), after = actor.translation();
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z) < .01, JSON.stringify(after));
    const pose = campDumbbellDrop(world, body, [after.x, after.y, after.z], home, yaw);
    assert.ok(pose);
    assert.ok(Math.hypot(pose.position.x - held.x, pose.position.z - held.z) > .40);
    release(pose);
    assert.equal(body.bodyType(), R.RigidBodyType.Dynamic);
    assert.equal(collider.isEnabled(), true);
    assert.equal(collider.isSensor(), false);
    assert.deepEqual([collider.collisionGroups(), collider.solverGroups()], originalGroups);
    for (let i = 0; i < 20; i++) world.step();
    assert.ok(body.translation().y < pose.position.y - .2, JSON.stringify(body.translation()));
    const settled = actor.translation();
    assert.ok(Math.hypot(settled.x - before.x, settled.y - before.y, settled.z - before.z) < .02, JSON.stringify(settled));
  } finally {
    world.free();
  }
});

test('a dynamic suitcase follows a 75 degree turn around the player and presents the handle on the right', async () => {
  await R.init();
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  try {
    world.createCollider(R.ColliderDesc.cuboid(10, .1, 10).setTranslation(0, -.1, 0));
    const actor = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, .82, 0));
    world.createCollider(R.ColliderDesc.capsule(.48, .34), actor);
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(-.60, 0, 0).setRotation(yawRotation(Math.PI))
      .setLinearDamping(.35).setAngularDamping(.8).setCcdEnabled(true));
    world.createCollider(R.ColliderDesc.cuboid(.14, .34, .25).setTranslation(0, .34, 0).setMass(12).setFriction(.7), body);
    body.setEnabledRotations(false, true, false, true);
    let x = 0, z = 0, actorYaw = Math.PI, handleZ = .015, localHandle;
    const dt = world.timestep;
    for (let i = 0; i < 120; i++) {
      if (i >= 60) actorYaw -= Math.min(9 * dt, actorYaw - 7 * Math.PI / 12);
      const speed = Math.max(0, Math.min(2, (i - 12) * .2));
      const vx = speed * Math.cos(actorYaw), vz = -speed * Math.sin(actorYaw);
      x += vx * dt; z += vz * dt;
      actor.setNextKinematicTranslation({ x, y: .82, z });
      const p = body.translation(), v = body.linvel(), q = body.rotation();
      const caseX = p.x - x, caseZ = p.z - z;
      const target = campSuitcaseTowTarget(caseX, caseZ, actorYaw);
      assert.ok(Math.abs(angleDelta(Math.atan2(caseZ, caseX), Math.atan2(target.z, target.x))) <= .500001);
      body.applyImpulse(campSuitcasePull(target.x - caseX, target.z - caseZ, v.x, v.z, body.mass(), dt, vx, vz), true);
      const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
      body.applyTorqueImpulse({ x: 0, y: campSuitcaseTurn(yaw, caseX, caseZ, body.angvel().y, body.principalInertia().y, dt), z: 0 }, true);
      world.step();
      const next = body.translation(), nextQ = body.rotation();
      assert.ok(Math.hypot(next.x - p.x, next.z - p.z) < .065);
      handleZ = campSuitcaseHandleZ(next.x - x, next.z - z, nextQ, actorYaw, handleZ, dt);
      assert.ok(handleZ >= -.07501 && handleZ <= .10501);
      const grip = rotateVector([-.126, .846, handleZ], nextQ);
      localHandle = rotateVector([grip[0] + next.x - x, grip[1] + next.y, grip[2] + next.z - z], yawRotation(-actorYaw));
      if (i === 55 || i === 119) {
        assert.ok(Math.abs(localHandle[0]) < .19 && localHandle[2] > .36 && localHandle[2] < .58, JSON.stringify(localHandle));
        assert.ok(Math.abs(localHandle[1] - .846) < .01, JSON.stringify(localHandle));
      }
    }
    assert.equal(body.isDynamic(), true);
    assert.equal(body.collider(0).isEnabled(), true);
  } finally {
    world.free();
  }
});

test('the suitcase motor pulls along the floor and stops at a real blocking collider', async () => {
  await R.init();
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  try {
    world.createCollider(R.ColliderDesc.cuboid(6, .1, 6).setTranslation(0, -.1, 0));
    world.createCollider(R.ColliderDesc.cuboid(.1, 1, 3).setTranslation(2, 1, 0));
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, .34, 0).setCcdEnabled(true));
    body.setEnabledRotations(false, true, false, true);
    world.createCollider(R.ColliderDesc.cuboid(.14, .34, .25).setMass(12).setFriction(.7), body);
    for (let i = 0; i < 240; i++) {
      const p = body.translation(), v = body.linvel();
      const impulse = campSuitcasePull(4 - p.x, -p.z, v.x, v.z, body.mass(), world.timestep);
      assert.equal(impulse.y, 0);
      body.applyImpulse(impulse, true);
      world.step();
    }
    const p = body.translation();
    assert.ok(p.x > 1.6 && p.x < 1.81, JSON.stringify(p));
    assert.ok(Math.abs(p.y - .34) < .015, JSON.stringify(p));
  } finally {
    world.free();
  }
});
