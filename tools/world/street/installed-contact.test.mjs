import test from 'node:test';
import * as React from 'react';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Matrix4, Mesh, MeshBasicMaterial, Object3D, Raycaster, Scene, Vector3 } from 'three';
import * as Assets from '../../../src/components/world/WorldStreetAssets.ts';
import { craftSeawallBay, craftSeawallEnd, craftTimberBeam, craftTimberPost } from '../../../src/components/world/WorldRailCraft.ts';
import { splitShelterGlazing } from '../../../src/components/world/WorldFacilityGlazing.ts';
import { streetFacilityCollision } from '../../../src/components/world/WorldStreetFacilityCraft.ts';
import { StreetBatch } from '../../../src/components/world/WorldStreetBatch.ts';
import { collisionInventory } from '../../../src/components/world/world-collision-inventory.ts';
import { installedStreetContact } from '../../../src/components/world/street-installed-contact.ts';
import { streetKnockContacts, streetKnockSources } from '../../../src/components/world/street-knock-contact.ts';
import { streetReachableContacts } from '../../../src/components/world/street-reachable-contact.ts';
import { knockablesV4, solidsV4 } from '../../../src/components/world/layout-v4.ts';
import { railLayout } from '../../../src/components/world/WorldStreetRails.tsx';
import { mountStreetContacts } from '../facility-craft/street/contact-fixture.mjs';
import { loadWorldModule } from '../facility-craft/street/runtime.mjs';

await R.init();
const cell = [0, 0, .1, .1];
const vector = p => new Vector3(...p);
const open = (collider, from, dir, end) => collider.castRay(new R.Ray(vector(from), vector(dir)), end, true) < 0;
function fixedGeometry(build, world, body, name = 'structure') {
  const geometry = build.build(), source = installedStreetContact(build, geometry, name);
  const positions = geometry.getAttribute('position').array;
  const collider = world.createCollider(R.ColliderDesc.trimesh(positions, source.indices), body);
  return { collider, geometry };
}

const installedKinds = {
  bench: Assets.benchGeometry, bollard: Assets.bollardGeometry,
  shelter: l => Assets.shelterGeometry(l, cell),
  seawall: l => craftSeawallBay(Assets.seawallBay(l, 2), 2, l),
  end: l => craftSeawallEnd(Assets.railEndPost(l, 'seawall'), l),
  guardPost: Assets.guardPost, timberPost: l => craftTimberPost(Assets.timberPost(l), l),
  parapet: l => Assets.parapet(l, 11.3), bridgePier: l => Assets.bridgePier(l, 2.95),
};

test('installed street furniture and rails leave visible gaps open but stop on the real adjacent parts', () => {
  const world = new R.World({ x: 0, y: 0, z: 0 }), body = world.createRigidBody(R.RigidBodyDesc.fixed());
  const material = new MeshBasicMaterial(), owned = [], results = [];
  try {
    for (const [kind, emptyFrom, emptyDir, range, solidFrom, solidDir] of [
      ['bench', [1.06,.17,0], [-1,0,0], .53, [0,1,-.12], [0,-1,0]],
      ['seawall', [.23,.35,.5], [0,0,-1], 1, [.23,.55,.5], [0,0,-1]],
    ]) {
      const builder = installedKinds[kind](0), { collider, geometry } = fixedGeometry(builder, world, body);
      owned.push(geometry);
      const original = streetFacilityCollision(builder).hulls().map(points => world.createCollider(R.ColliderDesc.convexHull(points), body));
      const mesh = new Mesh(geometry, material);
      assert.equal(new Raycaster(vector(emptyFrom), vector(emptyDir), 0, range).intersectObject(mesh).length, 0, kind);
      assert.ok(original.some(old => !open(old, emptyFrom, emptyDir, range)), kind + ' old proxy blocks the visible gap');
      assert.ok(open(collider, emptyFrom, emptyDir, range), kind);
      const strongest = new Raycaster(vector(solidFrom), vector(solidDir), 0, 2).intersectObject(mesh)[0];
      const actual = collider.castRay(new R.Ray(vector(solidFrom), vector(solidDir)), 2, true);
      assert.ok(strongest && actual >= 0 && Math.abs(actual - strongest.distance) < .001, kind);
      results.push({ kind, visibleGap: true, oldBlocked: true, visual: strongest.distance, actual });
    }
    const { collider, geometry } = fixedGeometry(Assets.guardPost(0), world, body);
    owned.push(geometry);
    const from = [0,.62,-.4], dir = [0,0,1];
    const hit = collider.castRay(new R.Ray(vector(from), vector(dir)), 1, true);
    assert.ok(Math.abs(hit - .21) < .001, 'actual guard bracket is in front of the post');
    console.log(JSON.stringify({ gaps: results, guardBlockout: hit }));
  } finally { world.free(); material.dispose(); owned.forEach(g => g.dispose()); }
});

function inventoryFor(name, geometries, ranges, memberIds, between) {
  const scene = new Scene(), root = new Object3D(), material = new MeshBasicMaterial();
  root.name = name; scene.add(root);
  const batch = new StreetBatch(`${name}-mesh`, [{ id: name, L0: geometries[0], L1: geometries[1], lodNear: 10, far: 50 }], [1], material);
  const pos = new Matrix4().makeTranslation(19, 1.02, 6), slot = batch.add(0, pos);
  const geometryIds = [batch.geometryId(0, 0), batch.geometryId(0, 1)], colliderPrefix = name + '/';
  batch.mesh.userData.worldCollisionBatchedInstances = { geometries: geometryIds.map((id, i) => ({ id, ranges: ranges[i] })),
    placements: [{ id: name, slot, matrix: batch.sourceMatrix(slot), geometryIds, colliderPrefix }] };
  root.add(batch.mesh);
  const nodes = memberIds.map(id => { const o = new Object3D(); o.name = colliderPrefix + id; root.add(o); return o; });
  try {
    for (const level of [0, 1]) {
      batch.mesh.setGeometryIdAt(slot, geometryIds[level]);
      if (between) between(batch, slot, level);
      const review = collisionInventory(scene, [batch.mesh], nodes, [name]);
      assert.deepEqual(review.errors, [], name);
      assert.equal(review.registrations[name], memberIds.length);
    }
  } finally { batch.dispose(); material.dispose(); }
}

test('each distance-based replacement supplies the same installed fixed members and shelter glazing stays separate', () => {
  for (const [kind, build] of Object.entries(installedKinds)) {
    const builders = [build(0), build(1)];
    const assets = builders.map(b => b.build());
    if (kind === 'shelter') {
      const split = assets.map(g => { const result = splitShelterGlazing(g); g.dispose(); return result; });
      for (const name of ['opaque', 'glass']) {
        const member = name === 'glass' ? 'glazing' : 'structure', geos = split.map(v => v[name]);
        const supplies = geos.map((g, i) => installedStreetContact(builders[i], g, member));
        const near = geos[0], source = supplies[0];
        const world = new R.World({ x: 0, y: 0, z: 0 });
        try {
          const body = world.createRigidBody(R.RigidBodyDesc.fixed());
          const shape = world.createCollider(R.ColliderDesc.trimesh(near.attributes.position.array, source.indices), body);
          const from = [-1,1,0], direction = [1,0,0];
          if (name === 'glass') assert.ok(Math.abs(shape.castRay(new R.Ray(vector(from), vector(direction)), 2, true) - 1.624) < .001);
          else assert.ok(open(shape, from, direction, 2), 'shelter front has a real open entrance');
        } finally { world.free(); }
        inventoryFor(`${kind}-${name}`, geos, supplies.map(p => p.ranges), [member]);
      }
    } else {
      const ranges = assets.map((g, i) => installedStreetContact(builders[i], g, 'structure').ranges);
      inventoryFor(kind, assets, ranges, ['structure']);
    }
  }
});

const movingKinds = {
  lamp: Assets.lampGeometry, signal: Assets.signalGeometry, bin: Assets.binGeometry,
  stop: l => Assets.stopGeometry(l, cell), direction: l => Assets.directionGeometry(l, cell),
  chevron: l => Assets.chevronGeometry(l, cell), delineator: Assets.delineatorGeometry,
  beam: l => craftTimberBeam(Assets.timberBeam(l, 3.2), 3.2, l), guard: l => Assets.guardPanel(l, 4.55),
};
// lampGeometry's options are richer than the other builders, use the actual public street asset.
movingKinds.lamp = l => Assets.lamp()[l === 0 ? 'L0' : 'L1'];

test('each dynamic street LOD claims the named members of the same moving Rapier body', () => {
  for (const [kind, build] of Object.entries(movingKinds)) {
    const builders = [build(0), build(1)], members = streetKnockContacts(builders[0], kind);
    const ids = members.map(c => c.id), world = new R.World({ x: 0, y: 0, z: 0 });
    try {
      const body = world.createRigidBody(R.RigidBodyDesc.dynamic());
      for (const { points } of members) {
        const shape = R.ColliderDesc.convexHull(points);
        assert.ok(shape, kind);
        world.createCollider(shape, body);
      }
      assert.equal(body.numColliders(), ids.length);
      const ranges = builders.map(b => streetKnockSources(b, kind, ids));
      inventoryFor(kind, builders.map(b => b.build()), ranges, ids, (batch, slot) => {
        body.setTranslation({ x: 5, y: 2, z: -8 }, false);
        const p = body.translation();
        batch.setMatrix(slot, new Matrix4().makeTranslation(p.x, p.y, p.z));
      });
    } finally { world.free(); }
  }
});

test('sign tubes do not use the footing width, and the knockable W-beam contacts its five drawn strips', () => {
  const world = new R.World({ x: 0, y: 0, z: 0 });
  try {
    for (const kind of ['stop', 'direction', 'chevron', 'delineator']) {
      const source = movingKinds[kind](0), members = streetKnockContacts(source, kind);
      const body = world.createRigidBody(R.RigidBodyDesc.dynamic());
      const shapes = members.map(({points}) => world.createCollider(R.ColliderDesc.convexHull(points), body));
      const y = kind === 'delineator' ? .5 : .75;
      assert.ok(shapes.every(c => open(c, [-.4,y,.085], [1,0,0], .8)), kind);
      assert.ok(shapes.some(c => !open(c, [-.4,y,0], [1,0,0], .8)), kind);
      assert.ok(shapes.some(c => !open(c, [-.4,.027,.075], [1,0,0], .8)), kind + ' has a real base');
      body.lockTranslations(true, false);
      body.applyImpulse({ x: 3, y: 0, z: 0 }, true); world.step();
      assert.equal(body.translation().x, 0, kind + ' locks before a walking contact');
      body.lockTranslations(false, false);
      body.setLinvel({ x: 0, y: 0, z: 0 }, false);
      body.applyImpulse({ x: 3, y: 0, z: 0 }, true); world.step();
      assert.ok(body.translation().x > 0, kind + ' remains a dynamic knockable when unlocked');
      world.removeRigidBody(body);
    }
    const source = movingKinds.guard(0), members = streetKnockContacts(source, 'guard');
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic());
    const shapes = members.map(({points}) => world.createCollider(R.ColliderDesc.convexHull(points), body));
    assert.equal(shapes.length, 5);
    const geometry = source.build(), material = new MeshBasicMaterial();
    try {
      const mesh = new Mesh(geometry, material);
      for (const y of [.46,.53,.60,.67,.74]) {
        const from = vector([0,y,-.6]), direction = vector([0,0,1]);
        const visible = new Raycaster(from, direction, 0, 1).intersectObject(mesh)[0];
        const contacts = shapes.map(shape => shape.castRay(new R.Ray(from, direction), 1, true)).filter(n => n >= 0);
        assert.ok(visible && Math.abs(visible.distance - Math.min(...contacts)) < .001);
      }
    } finally { geometry.dispose(); material.dispose(); }
  } finally { world.free(); }
});


test('the bin mouth admits a small object to the visible deep baffle while preserving its outer contact', () => {
  const builder = Assets.binGeometry(0);
  const world = new R.World({ x: 0, y: 0, z: 0 });
  const geometry = builder.build(), material = new MeshBasicMaterial();
  try {
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic());
    const members = streetKnockContacts(builder, 'bin');
    const shape = member => R.ColliderDesc.convexHull(member.points);
    const actual = members.map(member => world.createCollider(shape(member), body));
    const previous = streetReachableContacts(builder, 'bin').map(member => world.createCollider(shape(member)));
    const rays = (from, direction, limit, colliders) => Math.min(...colliders.map(c => c.castRay(new R.Ray(from, direction), limit, true)).filter(hit => hit >= 0));
    const start = vector([0,1.25,0]), down = vector([0,-1,0]), rendered = new Mesh(geometry, material);
    const oldTop = rays(start, down, 1, previous), actualBottom = rays(start, down, 1, actual);
    const shown = new Raycaster(start, down, 0, 1).intersectObject(rendered)[0];
    assert.ok(oldTop < .35, 'the previous lid hull capped the mouth');
    assert.ok(shown && Math.abs(actualBottom - shown.distance) < .001, JSON.stringify({ actualBottom, displayed: shown?.distance }));
    previous.forEach(c => world.removeCollider(c, false));
    world.step();
    const ball = new R.Ball(.06), pose = { x:0,y:0,z:0,w:1 };
    const drop = world.castShape(start, pose, down, ball, 0, 1, true);
    assert.ok(drop && Math.abs(drop.time_of_impact - (actualBottom - .06)) < .003, drop?.time_of_impact);
    const side = vector([0,.52,-.8]), towards = vector([0,0,1]);
    const visualSide = new Raycaster(side, towards, 0, 1).intersectObject(rendered)[0];
    const actualSide = rays(side, towards, 1, actual);
    assert.ok(visualSide && Math.abs(visualSide.distance - actualSide) < .012);
    console.log(JSON.stringify({ binMembers: members.length, previousMouthDepth: oldTop, actualBaffleDepth: actualBottom,
      movingSphereDepth: drop.time_of_impact, visibleSide: visualSide.distance, actualSide }));
  } finally { geometry.dispose(); material.dispose(); world.free(); }
});


test('production knock roots retain named real colliders across the full placed street and rail batches', t => {
  const ordinary = knockablesV4(), rails = railLayout();
  const fixed = solidsV4().filter(node => ['bench','bollard','shelter'].includes(node.kind));
  assert.equal(fixed.length, 26);
  assert.equal(rails.placements.length, 69);
  const registration = {};
  for (const [set, items] of [['knock',ordinary],['rail',rails.beams]]) {
    const host = mountStreetContacts(set, items);
    t.after(host.dispose);
    assert.equal(host.bodies.length, items.length);
    for (const camera of [[0,6,0],[90,8,-95]]) {
      host.frame(camera);
      const actual = host.inventory();
      assert.deepEqual(Array.from(actual.errors), [], set);
      assert.equal(actual.registrations[`street-${set}-group`], host.bodies.reduce((n,node) => n + node.colliders.length, 0));
      registration[set] = { placements: items.length, realColliders: actual.registrations[`street-${set}-group`] };
    }
  }
  console.log(JSON.stringify({ streetFixed: fixed.length, fixedRails: rails.placements.length, registration }));
});

test('a heavy sign unlocks for a real nearby vehicle impact and keeps the moved batch position', t => {
  const stop = knockablesV4().find(item => item.kind === 'stop');
  const host = mountStreetContacts('knock', [stop]);
  t.after(host.dispose);
  const {body,colliders} = host.bodies[0], home = { ...body.translation() };
  assert.equal(host.state()[0].lockedForPeople, true);
  const car = host.world.createRigidBody(R.RigidBodyDesc.dynamic().setCcdEnabled(true)
    .setTranslation(home.x + 1.9,home.y + .75,home.z).setLinvel(-6,0,0));
  car.userData = { vehicle:'probe' };
  const bumper = host.world.createCollider(R.ColliderDesc.ball(.3).setMass(65), car);
  host.beforePhysics();
  assert.equal(host.state()[0].lockedForPeople, false);
  let touched = false;
  for (let i=0;i<30;i++) {
    host.beforePhysics(); host.world.step();
    for (const {collider} of colliders) host.world.contactPair(bumper,collider, manifold => { touched ||= manifold.numSolverContacts() > 0; });
    host.frame([home.x+5,home.y+3,home.z]);
  }
  const at = body.translation();
  assert.ok(touched && Math.hypot(at.x-home.x,at.z-home.z)>.05);
  const rendered = new Matrix4(); host.mesh.getMatrixAt(0, rendered);
  assert.ok(new Vector3().setFromMatrixPosition(rendered).distanceTo(new Vector3(at.x,at.y,at.z)) < 1e-5);
  assert.deepEqual(Array.from(host.inventory().errors), []);
});


test('production fixed furniture and rail placement groups submit every actual shape under one review root', t => {
  const cleanups = [];
  const [fixed,rails] = loadWorldModule(['WorldStreetFixed.tsx','WorldStreetRails.tsx'], '', false, {
    react: { ...React, useMemo: make => make(), useEffect: effect => cleanups.push(effect()) },
    '@react-three/fiber': { useFrame() {} },
  });
  t.after(() => cleanups.forEach(release => release?.()));
  const furniture = fixed.default(), railRoot = rails.default(), rail = railRoot.props.children[0];
  assert.equal(furniture.props.seats.length, 14);
  assert.equal(new Set(furniture.props.seats.map(seat => seat.id)).size, 14);
  for (const [placed, rootName, expected] of [[furniture, 'street-fixed-group', 27], [rail, 'street-rails-group', 69]]) {
    const built = placed.type(placed.props);
    const world = new R.World({ x:0,y:0,z:0 }), body = world.createRigidBody(R.RigidBodyDesc.fixed());
    const scene = new Scene(), root = new Object3D(), supplied = [], submitted = [];
    root.name = rootName; scene.add(root);
    try {
      for (const child of built.props.children.flat(Infinity).filter(Boolean)) {
        if (child.type === 'primitive') { root.add(child.props.object); submitted.push(child.props.object); }
        if (!child.props.name?.endsWith('-solid')) continue;
        for (const contact of child.props.children) {
          const descriptor = R.ColliderDesc.trimesh(...contact.props.args);
          assert.ok(world.createCollider(descriptor, body));
          const node = new Object3D(); node.name = contact.props.name; root.add(node); supplied.push(node);
        }
      }
      assert.equal(body.numColliders(), expected);
      assert.equal(submitted.length, rootName === 'street-fixed-group' ? 2 : 1);
      const review = collisionInventory(scene, submitted, supplied, [rootName]);
      assert.deepEqual(review.errors, []);
      assert.equal(review.registrations[rootName], expected);
      if (rootName === 'street-rails-group') assert.notEqual(built.props.name, rootName, 'the outer review root is unique');
    } finally { world.free(); }
  }
});


test('the two published facility comparison modes compile and retain named dynamic supplies', t => {
  const item = knockablesV4().find(asset => asset.kind === 'bin');
  for (const search of ['?benchBin=r1','?facilityCraft=legacy']) {
    const host = mountStreetContacts('knock',[item],search);
    t.after(host.dispose);
    assert.deepEqual(Array.from(host.inventory().errors), [], search);
    assert.equal(host.inventory().registrations['street-knock-group'],host.bodies[0].colliders.length);
    assert.ok(host.bodies[0].body.isSleeping());
  }
});
