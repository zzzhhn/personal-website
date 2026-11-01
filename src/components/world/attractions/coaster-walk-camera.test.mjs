import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Mesh, MeshBasicMaterial, PlaneGeometry, Raycaster, Vector3 } from 'three';
import { createCoasterStructure } from './coaster-geometry.ts';
import { coasterColliderDescriptor } from './coaster-collision.ts';
import { cameraCollisionRadius, sweepCamera } from '../camera-collision.ts';
import { orbitDirection } from '../actor-physics.ts';
import { createIntentSignGeometry } from './intent-sign-layout.ts';
import { coasterSupports } from './coaster-track.ts';

await R.init();
const radius = cameraCollisionRadius(.1, 50, 1710 / 875);
const reported = { x: 65.82469177246091, y: 2.468825006484986, z: -139.4957122802735 };

function withStructure(check) {
  const structure = createCoasterStructure(true), world = new R.World({ x: 0, y: 0, z: 0 });
  try {
    for (const c of structure.colliders) world.createCollider(coasterColliderDescriptor(R, c));
    world.createCollider(R.ColliderDesc.trimesh(structure.track.vertices,structure.track.indices));
    world.step(); check(world, structure.colliders.length);
  } finally { world.free(); structure.steel.dispose(); structure.glow.dispose(); }
}

test('the reproduced station-side orbit passes through the real fence opening without hiding the guide', t => withStructure((world, count) => {
  const direction = orbitDirection(Math.PI / 2, Math.PI / 4);
  const target = new Vector3(reported.x, reported.y, reported.z).addScaledVector(new Vector3(...direction), 12);
  const result = sweepCamera(world, R, reported, target, radius, undefined, c => !c.isSensor());
  assert.ok(result.distance > 11.9, `legal orbit shortened to ${result.distance}`);
  // v4's independently audited 62 support bays contribute 389 members + 124 foundations.
  // The former 650 cap predated the 1.9 km / 85 m / eight-inversion installation.
  // Keep separate finite bounds so support growth cannot consume the park's contact budget.
  const supportContacts=coasterSupports(true).reduce((sum,bay)=>sum+bay.beams.length+2,0);
  assert.ok(supportContacts<=528, `support contacts unexpectedly grew to ${supportContacts}`);
  // 43f9507 had 561 other contacts, including 148 in the tower; this round adds six station members.
  assert.ok(count-supportContacts<=568, `non-support contacts unexpectedly grew to ${count-supportContacts}`);
  t.diagnostic(`station-side camera distance ${result.distance.toFixed(3)} m; fixed colliders ${count}`);
}));

test('actual lower rails still stop a standing capsule and posts remain solid', () => withStructure(world => {
  const shape = new R.Capsule(.48, .34), identity = { x: 0, y: 0, z: 0, w: 1 };
  for (const x of [62, 65.8247, 68]) {
    const hit = world.castShape({ x, y: 1.82, z: -141 }, identity, { x: 0, y: 0, z: 1 }, shape, 0, 4, true);
    assert.ok(hit && hit.time_of_impact < 2, `player passed through rail at ${x}`);
  }
  // A low eye crossing a post is blocked even though gaps between posts are open.
  const post = sweepCamera(world, R, { x: 65, y: 2.5, z: -141 }, { x: 65, y: 2.5, z: -137 }, radius, undefined, c => !c.isSensor());
  assert.ok(post.hit !== null && post.distance < 2);
}));

test('the station sign does not cover the guide through the physically clear entrance view', t => withStructure(world => {
  const material=new MeshBasicMaterial(),signs=new Mesh(createIntentSignGeometry(),material);
  const oldBoard=new Mesh(new PlaneGeometry(8.5,.95),material);
  oldBoard.position.set(48,6.6,-141.9);oldBoard.updateMatrixWorld();
  let legacyBlocked=0,blocked=0,samples=0;
  try {
    for(const x of [45,48,50,53])for(let z=-140;z>=-149;z-=.25)
    for(const yaw of [Math.PI/2-.3,Math.PI/2,Math.PI/2+.3])for(const pitch of [.45,Math.PI/4,1.05])
    for(const distance of [5,12,20]) {
      const pivot=new Vector3(x,2.47,z),direction=new Vector3(...orbitDirection(yaw,pitch));
      const result=sweepCamera(world,R,pivot,pivot.clone().addScaledVector(direction,distance),radius,undefined,c=>!c.isSensor());
      const camera=new Vector3(result.position.x,result.position.y,result.position.z);
      for(const bodyY of [1.3,1.9,2.47]) {
        const aim=new Vector3(x,bodyY,z),ray=new Raycaster(camera,aim.clone().sub(camera).normalize(),0,camera.distanceTo(aim)-.1);
        legacyBlocked+=ray.intersectObject(oldBoard).length>0?1:0;
        blocked+=ray.intersectObject(signs).length>0?1:0;samples++;
      }
    }
    assert.ok(legacyBlocked>0,'the old hanging board must reproduce actual view obstruction');
    assert.equal(blocked,0,'the real rendered sign batch must leave the guide visible');
    assert.equal(signs.geometry.index.count/3,6,'retain one six-triangle atlas batch');
    t.diagnostic(JSON.stringify({samples,legacyBlocked,blocked}));
  } finally { signs.geometry.dispose();oldBoard.geometry.dispose();material.dispose(); }
}));
