import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Matrix4, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Vector3 } from 'three';
import { ALPHA_TRANSPORT_ROUTES, alphaFerryRoute, alphaFerryGroundHeight } from './alpha-routes.ts';
import { cableCanopyPostGeometry, cableCanopyPostHeight, transportContactReady, transportGripPose, transportVehicleCollider, transportVehicleParts } from './transport-vehicle-geometry.ts';
import { sampleTransport, transportWorld } from '../../rides/transport-route.ts';
import { rideFootRouteClear } from '../../rides/ride-clearance.ts';
import { transportBoardingGeometry } from '../../rides/transport-boarding.ts';
import { readWorldCraftGltf, disposeWorldCraftGltf } from '../../world-craft-gltf-test.mjs';

await R.init();
const routes = [...ALPHA_TRANSPORT_ROUTES, alphaFerryRoute()];
const scale = new Vector3(1,1,1);
const poseMatrix = (p, q) => new Matrix4().compose(p,q,scale);

for (const route of routes) test(`${route.kind}: actual mounted mesh follows its route and both terminal clearance envelopes`, async t => {
  const asset = await readWorldCraftGltf([`public/assets/world/alpha-island/transports/${route.kind}.glb`]);
  const parts = transportVehicleParts(asset.scene,route.kind);
  const grouped = (group) => parts.filter(part=>part.group===group);
  const sourceShape = transportVehicleCollider(grouped('body'));
  const gripShape = transportVehicleCollider(grouped('grip'));
  assert.equal(new Set(parts.map(part=>part.name)).size,parts.length);
  assert.ok(!!gripShape === (route.kind==='cable'));
  const world = new R.World({x:0,y:0,z:0});
  t.after(()=>{world.free();parts.forEach(part=>part.geometry.dispose());disposeWorldCraftGltf(asset.scene);});
  const cabin = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
  const cabinCollider = world.createCollider(R.ColliderDesc.trimesh(sourceShape.vertices,sourceShape.indices),cabin);
  const grip = gripShape ? world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased()) : null;
  if(grip) world.createCollider(R.ColliderDesc.trimesh(gripShape.vertices,gripShape.indices),grip);
  const player = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0,-100,0));
  const setSample = u => {
    const sample=sampleTransport(route,u), position=new Vector3(...sample.vehicle), q=new Quaternion(...sample.orientation);
    cabin.setTranslation(position,true); cabin.setRotation(q,true);
    if(grip){const pose=transportGripPose(sample);grip.setTranslation(pose.position,true);grip.setRotation(pose.orientation,true);}
    world.step();
    return { position, q, sample };
  };
  const localRay = (worldPosition, quat, local, dir) => new R.Ray(new Vector3(...local).applyQuaternion(quat).add(worldPosition),new Vector3(...dir).applyQuaternion(quat));
  for(const u of [0,.14,.32,.68,.87,1]){
    const {position,q,sample}=setSample(u), m=poseMatrix(position,q);
    const local=route.kind==='ferry'?[3.54,.3,.12]:route.kind==='sled'?[1.025,.6,-.56]:[.95,.4,.2];
    const ray=localRay(position,q,local,[0,-1,0]), hit=cabinCollider.castRay(ray,1,true);
    assert.ok(hit>0,`${route.id}@${u} visible walking surface has no physical support`);
    asset.scene.matrixAutoUpdate=false; asset.scene.matrix.copy(m); asset.scene.updateMatrixWorld(true);
    const rendered=new Raycaster(ray.origin,ray.dir,0,1).intersectObject(asset.scene,true)[0];
    assert.ok(rendered);
    assert.ok(Math.abs(rendered.distance-hit)<.0001,`${route.id}@${u} render/physics deck difference`);
    asset.scene.matrix.identity();asset.scene.updateMatrixWorld(true);
    if(grip){
      const expected=m.clone().multiply(new Matrix4().makeTranslation(0,5.2,0)).multiply(new Matrix4().makeRotationZ(sample.cablePitch));
      const gp=grip.translation(),gq=grip.rotation();
      const actual=poseMatrix(new Vector3(gp.x,gp.y,gp.z),new Quaternion(gq.x,gq.y,gq.z,gq.w));
      assert.ok(expected.elements.every((value,i)=>Math.abs(value-actual.elements[i])<.00002));
    }
  }
  for(const [index,terminal] of route.terminals.entries()){
    const {position,q}=setSample(index);
    const data=transportBoardingGeometry(route,index,route.kind==='ferry'?alphaFerryGroundHeight:undefined);
    const gangway=world.createCollider(R.ColliderDesc.trimesh(data.positions,data.indices));world.step();
    const path=name=>terminal[name].map(point=>transportWorld(point,route.transform));
    assert.ok(rideFootRouteClear(world,R,player,path('boarding')),`${route.id}/${index}: approach`);
    assert.ok(rideFootRouteClear(world,R,player,path('egress')),`${route.id}/${index}: egress`);
    if(route.kind==='ferry'){
      const oldFloor=world.createCollider(R.ColliderDesc.cuboid(3.5,.1,1.45).setTranslation(...new Vector3(0,-.1,0).applyQuaternion(q).add(position)).setRotation(q));
      const bow=localRay(position,q,[3.54,.2,.12],[0,-1,0]);
      assert.equal(oldFloor.castRay(bow,1,true),-1);
      assert.ok(cabinCollider.castRay(bow,1,true)>0,'visible bow gets load-bearing surface');
      const rail=localRay(position,q,[2.2,.95,-2],[0,0,1]);
      assert.ok(cabinCollider.castRay(rail,1,true)>0,'the parked ferry rail blocks a cross-deck push');
      world.removeCollider(oldFloor,false);
    }
    if(route.kind==='cable'){
      // Reinsert the old forward offset at all cabin waypoints, leaving apron points unchanged.
      const old=[path('boarding')[0],new Vector3(1,0,2.1).applyQuaternion(q).add(position).toArray(),new Vector3(1,0,0).applyQuaternion(q).add(position).toArray()];
      assert.equal(rideFootRouteClear(world,R,player,old),false,'the former route contacts the actual grab rail');
      const windowGap=localRay(position,q,[1.9,.747,0],[-1,0,0]);
      assert.equal(cabinCollider.castRay(windowGap,.85,true),-1,'the gap between the end sill and glazing stays clear');
    }
    world.removeCollider(gangway,false);
  }
  t.diagnostic(`${parts.length} visible source meshes; ${sourceShape.indices.length/3} moving cabin triangles${gripShape?` and ${gripShape.indices.length/3} articulated grip triangles`:''}`);
});


test('transport contact admits a live cabin, suspends on disable and resumes on exact remount', () => {
  const world=new R.World({x:0,y:-9.81,z:0});
  try {
    const body=world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
    assert.equal(transportContactReady(body),false);
    const shape=()=>R.ColliderDesc.trimesh(new Float32Array([0,0,0, 1,0,0, 0,0,1]),new Uint32Array([0,1,2]));
    const first=world.createCollider(shape(),body);
    assert.equal(transportContactReady(body),true);
    first.setSensor(true);assert.equal(transportContactReady(body),false);
    first.setSensor(false);body.setEnabled(false);assert.equal(transportContactReady(body),false);
    body.setEnabled(true);assert.equal(transportContactReady(body),true);
    world.removeCollider(first,false);assert.equal(transportContactReady(body),false);
    world.createCollider(shape(),body);assert.equal(transportContactReady(body),true);
    world.removeRigidBody(body);assert.equal(transportContactReady(body),false);
  } finally { world.free(); }
});


test('cable station posts match the visible twelve-sided profile at both terminal poses', t => {
  const world=new R.World({x:0,y:0,z:0}), geometry=cableCanopyPostGeometry(), material=new MeshBasicMaterial();
  t.after(()=>{world.free();geometry.dispose();material.dispose();});
  const route=ALPHA_TRANSPORT_ROUTES[0];
  let max=0;
  for(const [index,terminal] of route.terminals.entries()){
    const orientation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),terminal.yaw+route.transform.yaw);
    const origin=new Vector3(...transportWorld(terminal.vehicle,route.transform));
    for(const x of [-2.1,2.1])for(const z of [-2.1,2.1]){
      const position=new Vector3(x,cableCanopyPostHeight/2,z).applyQuaternion(orientation).add(origin);
      const old=world.createCollider(R.ColliderDesc.cylinder(cableCanopyPostHeight/2,.17).setTranslation(...position).setRotation(orientation));
      const actual=world.createCollider(R.ColliderDesc.convexHull(geometry.attributes.position.array).setTranslation(...position).setRotation(orientation));
      const visual=new Mesh(geometry,material);visual.position.copy(position);visual.quaternion.copy(orientation);visual.updateMatrixWorld(true);
      const from=new Vector3(.6,cableCanopyPostHeight*.39,0).applyQuaternion(orientation).add(position), dir=new Vector3(-1,0,0).applyQuaternion(orientation);
      const ray=new R.Ray(from,dir), hit=new Raycaster(from,dir,0,1).intersectObject(visual)[0]?.distance;
      const physics=actual.castRay(ray,1,true);
      assert.ok(hit && physics>0 && Math.abs(hit-physics)<.00005,`station ${index}: same tapered contact plane`);
      max=Math.max(max,Math.abs(hit-physics));
      assert.ok(physics-old.castRay(ray,1,true)>.03,'old canopy post widened above actual surface');
      world.removeCollider(old,false);world.removeCollider(actual,false);
    }
  }
  t.diagnostic(`Eight installed post rays; maximum visual/physical separation ${max.toFixed(7)} m`);
});
