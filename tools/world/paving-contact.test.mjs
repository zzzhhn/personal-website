import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import React from 'react';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import { compileWorldComponent } from './alpha-mine-tests/component-host.mjs';

const paving = await import('../../src/components/world/WorldTerrainPaving.ts');
const { decorV4 } = await import('../../src/components/world/layout-v4.ts');
const { PARK_ROAD_HANDOVER_X } = await import('../../src/components/world/layout-v4-flag.ts');
const { collisionInventory } = await import('../../src/components/world/world-collision-inventory.ts');
const { decodeTerrainArtifact } = await import('../../src/components/world/terrain-artifact.ts');
const { PLAYER_HALF_HEIGHT, PLAYER_RADIUS } = await import('../../src/components/world/actor-physics.ts');
const { clearPlayerSlopeGravity, compensatePlayerSlopeGravity, followPlayerGround, playerSupport } =
  await import('../../src/components/world/player-ground.ts');
const { createPlayerClearance, playerVelocityChange, sweptPlayerVelocity } =
  await import('../../src/components/world/player-motion.ts');
await R.init();
const load = compileWorldComponent(new URL('../../src/components/world/WorldTerrainRoads.tsx', import.meta.url));

function installed(t, handover) {
  const scene = new THREE.Scene();
  const world = new R.World({ x:0, y:0, z:0 });
  const meshes = [], contacts = new Map(), nodes = [], cleanup = [];
  const Road = load({
    './WorldTerrainPaving':paving,
    './WorldVisualClaims':{useGreyboxClaim(){},useIsClaimed:()=>handover},
    react:{...React,memo:f=>f,useMemo:f=>f(),useEffect:f=>cleanup.push(f())},
    '@react-three/rapier':{RigidBody:'rigid-body',TrimeshCollider:'trimesh'},
  }).default;
  function mount(element, parent) {
    if (Array.isArray(element)) return element.forEach(child=>mount(child,parent));
    if (!element) return;
    const {type,props} = element;
    if (typeof type === 'function') return mount(type(props),parent);
    if (type === React.Fragment) return mount(props.children,parent);
    const node = type === 'mesh' ? new THREE.Mesh(props.geometry,props.material) : new THREE.Group();
    node.name = props.name; node.userData = props.userData ?? {};
    parent.add(node);
    if (type === 'mesh') meshes.push(node);
    if (type === 'trimesh') {
      const [vertices,indices] = props.args;
      const collider = world.createCollider(R.ColliderDesc.trimesh(vertices,indices));
      contacts.set(node.name,{vertices,indices,collider}); nodes.push(node);
    }
    mount(props.children,node);
  }
  mount(Road({}),scene); world.step();
  t.after(()=>{world.free(); for (const fn of cleanup.reverse()) fn?.();});
  return {scene,world,meshes,nodes,contacts};
}

for (const handover of [false,true]) test('mainland paving triangles and installed physical roles with park plaza '+(handover?'mounted':'loading'), t=>{
  const {scene,world,meshes,contacts,nodes} = installed(t,handover);
  assert.equal(meshes.length,4);
  const inventory = collisionInventory(scene,new Set(meshes),nodes,['world-paving-v4']);
  assert.deepEqual(inventory.errors,[]);
  assert.equal(inventory.registrations['world-paving-v4'],contacts.size);
  let solids=0,paint=0;
  const consumed = new Map();
  for (const mesh of meshes) {
    const p=mesh.geometry.getAttribute('position'), mode=mesh.geometry.getAttribute('paveMode');
    for (const part of mesh.userData.worldCollisionSources) {
      if (part.collision==='none') {
        for(let i=part.firstVertex;i<part.firstVertex+part.vertexCount;i++) assert.equal(mode.getX(i),paving.PAVE_MODE.paint);
        paint+=part.vertexCount/3; continue;
      }
      const {vertices,indices}=contacts.get(part.surfaceId);
      let at=consumed.get(part.surfaceId)??0;
      for (let i=part.firstVertex;i<part.firstVertex+part.vertexCount;i++) {
        const j=indices[at++]*3;
        assert.equal(p.getX(i),vertices[j]); assert.equal(p.getY(i),vertices[j+1]); assert.equal(p.getZ(i),vertices[j+2]);
      }
      consumed.set(part.surfaceId,at); solids+=part.vertexCount/3;
    }
  }
  for(const [name,{indices}] of contacts) assert.equal(consumed.get(name),indices.length,name+' has hidden collider triangles');
  const posts=decorV4().filter(p=>p.color==='#6E5642'); assert.equal(posts.length,32);
  let rays=0, maxError=0;
  for (const {position:[x,y,z],size} of posts) {
    for(let n=0;n<8;n++) {
      const a=(n+.5)*Math.PI/4, dx=Math.cos(a), dz=Math.sin(a);
      const ray=new R.Ray({x:x+dx*.4,y,z:z+dz*.4},{x:-dx,y:0,z:-dz});
      const hit=world.castRay(ray,.45,true);
      assert.ok(hit,'missing octagonal post at '+[x,z,n]);
      maxError=Math.max(maxError,Math.abs(hit.timeOfImpact-(.4-Math.cos(Math.PI/8)*size[0]/2))); rays++;
    }
  }
  assert.ok(maxError<.00002);
  const down=(x,z)=>world.castRay(new R.Ray({x,y:2,z},{x:0,y:-1,z:0}),1.1,true);
  assert.ok(down(PARK_ROAD_HANDOVER_X-.05,-44),'road just west of the shared edge');
  assert.equal(Boolean(down(PARK_ROAD_HANDOVER_X+.05,-44)),!handover,'park owns the threshold east of the shared edge');
  assert.equal(Boolean(down(45,-45)),!handover,'park owns the ground east of the shared edge after handover');
  t.diagnostic(JSON.stringify({handover,solids,paint,rays,maxError,colliders:contacts.size}));
});

test('the published camp terrain and rendered deck support walking across the lamp opening', async t => {
  const { world, contacts } = installed(t, false);
  const bytes = gunzipSync(await readFile(new URL('../../public/assets/world/terrain/mainland-v4.bin.gz', import.meta.url)));
  const { positions, surface, solid } = decodeTerrainArtifact(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), 'v4').terrain;

  // The full browser route separately exercises clearance from both actual lamps and the parked car.
  for (const partition of [surface, solid]) {
    const indices = [];
    for (let i = 0; i < partition.length; i += 3) {
      const a = partition[i], b = partition[i + 1], c = partition[i + 2];
      const ax = positions[3 * a], bx = positions[3 * b], cx = positions[3 * c];
      const az = positions[3 * a + 2], bz = positions[3 * b + 2], cz = positions[3 * c + 2];
      if (Math.max(ax, bx, cx) >= -33 && Math.min(ax, bx, cx) <= -27
        && Math.max(az, bz, cz) >= 31.5 && Math.min(az, bz, cz) <= 36.7) indices.push(a, b, c);
    }
    if (indices.length) world.createCollider(R.ColliderDesc.trimesh(
      positions, Uint32Array.from(indices), R.TriMeshFlags.FIX_INTERNAL_EDGES));
  }
  world.timestep = 1 / 60;
  world.gravity = { x: 0, y: -12.5, z: 0 };
  const clearance = createPlayerClearance(world);
  const lanes = [32.2, 34.42, 35.68];
  const samples = [];
  for (const z of lanes) for (const direction of [1, -1]) {
    const x = -30 - 1.55 * direction, floor = direction === 1 ? 4.8 : 4.84;
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic()
      .setTranslation(x, floor + PLAYER_HALF_HEIGHT + PLAYER_RADIUS, z)
      .lockRotations().setLinearDamping(.2).setCcdEnabled(true));
    world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS)
      .setMass(72).setFriction(0).setRestitution(0), body);
    for (let i = 0; i < 40; i++) world.step();
    let ungrounded = 0;
    for (let i = 0; i < 108 && direction * (body.translation().x + 30) < 1; i++) {
      const support = playerSupport(world, R, body);
      if (!support?.grounded) ungrounded++;
      const change = playerVelocityChange(body.linvel(), { x: direction * 3.2, y: 0, z: 0 }, world.timestep, support?.grounded);
      body.applyImpulse({ x: change.x * body.mass(), y: 0, z: change.z * body.mass() }, true);
      const speed = sweptPlayerVelocity(clearance, body, body.linvel(), world.timestep, R.QueryFilterFlags.EXCLUDE_SENSORS);
      body.setLinvel(speed, true);
      compensatePlayerSlopeGravity(world, body, support, world.timestep, false);
      followPlayerGround(world, R, body, speed, world.timestep, false);
      world.step();
      clearPlayerSlopeGravity(body);
    }
    const end = body.translation();
    samples.push({ z, direction, x: end.x, y: end.y, ungrounded });
    world.removeRigidBody(body);
  }
  t.diagnostic(JSON.stringify(samples));
  assert.ok(samples.every(({ direction, x }) => direction * (x + 30) >= 1), 'all six standing routes cross the entry');
  assert.ok(samples.every(({ ungrounded }) => ungrounded <= 2), 'the capsule remains supported through the entry');
  const deck = contacts.get('paving-v4-3-top').collider;
  for (const z of lanes) {
    const measured = [-29.95, -29.625, -29.2].map(x =>
      5 - deck.castRay(new R.Ray({ x, y: 5, z }, { x: 0, y: -1, z: 0 }), 1, true));
    assert.ok(measured[0] < 4.8 && Math.abs(measured[1] - 4.8175) < .0001 && Math.abs(measured[2] - 4.84) < .0001);
  }
});
