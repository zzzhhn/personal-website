import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';

import R from '@dimforge/rapier3d-compat';
import { Matrix4, Object3D, PerspectiveCamera, Quaternion, Raycaster, Scene, Vector3 } from 'three';
import { loadWorldModule } from '../facility-craft/street/runtime.mjs';
import { compareContact, meshFromBatch } from '../facility-craft/street/contact-fixture.mjs';
import { collisionInventory } from '../../../src/components/world/world-collision-inventory.ts';

// Load the renderer bridge after Three's ESM exports are initialized on Node 22.16.
const RapierReact = await import('@react-three/rapier');
await R.init();
const identity = { x:0,y:0,z:0,w:1 }, axis = new Vector3(1,0,0);
const close = (a,b,margin = .001) => assert.ok(Math.abs(a-b)<margin, `${a} vs ${b}`);

function mount(time, t) {
  const releases = [], frames = [], world = new R.World({ x:0,y:0,z:0 });
  let tick;
  const [landmark, wind, layout] = loadWorldModule(['WorldStreetLandmarks.tsx','WorldWind.ts','layout-v4.ts'],'', false, {
    react: { ...React, useMemo: build => build(), useRef: current => ({ current }), useEffect: effect => releases.push(effect()) },
    '@react-three/fiber': { useFrame: callback => frames.push(callback) },
    '@react-three/rapier': { ...RapierReact, useBeforePhysicsStep: step => { tick = step; } },
  });
  t.after(() => { world.free(); releases.forEach(release=>release?.()); });
  wind.windUniforms.uWindTime.value = time;
  const tree = landmark.StreetWindmill(), [towerElement, rotorElement, rotorBody] = tree.props.children;
  const tower = towerElement.type(towerElement.props);
  const structure = tower.props.children.find(element => element?.props?.name === 'street-windmill-tower-solid');
  const towerDraw = tower.props.children.find(element => element?.type === 'primitive').props.object;
  const rotorDraw = rotorElement.props.object;
  assert.equal(rotorBody.props.type, 'kinematicPosition');
  const fixed = world.createRigidBody(R.RigidBodyDesc.fixed());
  const [rx, ry, rz, rw] = rotorBody.props.quaternion;
  const turning = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(...rotorBody.props.position).setRotation({ x:rx,y:ry,z:rz,w:rw }));
  rotorBody.props.ref.current = turning;
  const scene = new Scene(), root = new Object3D(), supplied = [];
  root.name = tree.props.name; scene.add(root); root.add(towerDraw,rotorDraw);
  const add = (parent, props) => {
    const collider = world.createCollider(R.ColliderDesc.trimesh(...props.args),parent);
    const node=new Object3D(); node.name=props.name; root.add(node); supplied.push(node);
    return { collider, name: props.name };
  };
  const towerContacts = structure.props.children.map(leaf=>add(fixed,leaf.props));
  const rotorContacts = [add(turning,rotorBody.props.children.props)];
  const camera = new PerspectiveCamera();
  const update = (time, offset) => {
    wind.windUniforms.uWindTime.value=time;
    const p=turning.translation(); camera.position.set(p.x + offset,p.y,p.z);
    tick(); world.step(); frames.forEach(draw=>draw({camera}));
  };
  return { world, towerContacts, rotorContacts, turning, towerDraw, rotorDraw, update, layout,
    inventory: () => collisionInventory(scene,[towerDraw,rotorDraw],supplied,[root.name]) };
}

test('the installed ridge tower owns its actual footing, leaves the circular approach clear and has one fixed source', t => {
  const host=mount(0,t), {world,layout,towerDraw,towerContacts}=host;
  const [x,z]=layout.RIDGE_V4.center,y=layout.RIDGE_V4.topY;
  host.update(0,5);
  const model=meshFromBatch(towerDraw,0);
  t.after(()=>{model.geometry.dispose();model.material.dispose();});
  for (const [at,dir] of [[[2,.055,0],[-1,0,0]], [[1,2.1,0],[-1,0,0]], [[0,1,2],[0,0,-1]]]) {
    const hit=compareContact(model,towerContacts,at,dir,2);
    assert.ok(hit.visual!==null && hit.physical!==null);
    close(hit.physical,hit.visual);
  }
  const guide=new R.Capsule(.48,.34), start={x:x-2,y:y+.88,z:z+1.51}, east={x:1,y:0,z:0};
  const shape=towerContacts[0].collider;
  assert.equal(world.castShape(start,identity,east,guide,0,4,true,undefined,undefined,undefined,undefined,c=>c.handle===shape.handle),null);
  assert.ok(world.castShape({...start,z:z+.1},identity,east,guide,0,4,true,undefined,undefined,undefined,undefined,c=>c.handle===shape.handle));
  assert.equal(host.inventory().registrations['street-windmill-group'],2);
  assert.deepEqual(host.inventory().errors,[]);
});

test('the physical spindle pose drives both blade LODs and preserves a rotating opening through the swept disc', t => {
  const initial=1.23,host=mount(initial,t), {rotorDraw,rotorContacts,world,turning}=host;
  const q=new Quaternion(), pose=new Matrix4(), p=turning.translation(), expected=new Quaternion().setFromAxisAngle(axis,initial*.65);
  assert.ok(q.copy(turning.rotation()).angleTo(expected)<.0005);
  const far=165, near=12;
  const reports=[];
  for (const [wind,range,check] of [[0,near,true],[.73,near,false],[0,far,true],[.73,far,false],[3.22,near,true]]) {
    host.update(wind,range);
    q.copy(turning.rotation()); expected.setFromAxisAngle(axis,wind*.65);
    assert.ok(q.angleTo(expected)<.0005);
    rotorDraw.getMatrixAt(0,pose);
    const physics=new Matrix4().compose(new Vector3(p.x,p.y,p.z),q,new Vector3(1,1,1));
    assert.ok(physics.elements.every((value,i)=>Math.abs(value-pose.elements[i])<1e-6));
    assert.equal(rotorDraw.getGeometryIdAt(0),range===far?1:0);
    assert.deepEqual(host.inventory().errors,[]);
    if (wind===3.22) continue;
    const rotor=rotorContacts[0].collider;
    const hit=world.castShape({x:p.x-1,y:p.y+3.55,z:p.z},identity,{x:1,y:0,z:0},new R.Ball(.025),0,2,true,
      undefined,undefined,undefined,undefined,c=>c.handle===rotor.handle);
    assert.equal(!!hit,check);
    const visual = meshFromBatch(rotorDraw,0), from = new Vector3(p.x-1,p.y+3.55,p.z), direction = new Vector3(1,0,0);
    try {
      const shown = new Raycaster(from,direction,0,2).intersectObject(visual)[0];
      assert.equal(!!shown,check);
      const physicalRay = rotor.castRay(new R.Ray(from,direction),2,true);
      if (range===near && shown) close(shown.distance,physicalRay);
      reports.push({wind,level:rotorDraw.getGeometryIdAt(0),contact:hit?.time_of_impact??null,visible:shown?.distance??null});
    } finally { visual.geometry.dispose(); visual.material.dispose(); }
  }
  const held=new Matrix4(); rotorDraw.getMatrixAt(0,held);
  host.update(3.22,near);
  rotorDraw.getMatrixAt(0,pose);
  assert.deepEqual(pose.elements,held.elements,'a stopped wind clock freezes both poses');
  console.log(JSON.stringify({ sweep: reports, position:[p.x,p.y,p.z], cullingReach:rotorDraw.boundingSphere.radius }));
});

test('a turning blade produces an actual Rapier contact against a moving body', t => {
  const host=mount(-.245,t),{world,turning,rotorContacts}=host,p=turning.translation();
  const moving=world.createRigidBody(R.RigidBodyDesc.dynamic().setCcdEnabled(true)
    .setTranslation(p.x-.8,p.y+3.55,p.z).setLinvel(3,0,0));
  const probe=world.createCollider(R.ColliderDesc.ball(.08).setMass(2),moving),rotor=rotorContacts[0].collider;
  const encounters=[];
  for(let step=0;step<43;step++){
    host.update(-.245+step/60,12);
    world.contactPair(probe,rotor,manifold=>{
      if(manifold.numSolverContacts())encounters.push({step,position:{...moving.translation()},velocity:{...moving.linvel()}});
    });
  }
  assert.ok(encounters.length>0,'the actual blade must enter the narrow phase');
  assert.ok(encounters.some(hit=>hit.velocity.x<2),'the collision transfers impulse to the moving probe');
  console.log(JSON.stringify({ bladeCollision:encounters[0], finalPosition:moving.translation() }));
});
