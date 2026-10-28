import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { Euler, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Vector3 } from 'three';
import { createWorkshopGeometry } from './intent-workshop-geometry.ts';
import { WORKSHOP_INTAKE, WORKSHOP_INTAKE_PANELS, WORKSHOP_TOOLS, WORKSHOP_CARRIER_Y, WORKSHOP_TARGETS, workshopColliders, workshopLocal } from './intent-workshop-layout.ts';
import { coasterWorld } from './coaster-track.ts';
import { PLAYER_CENTER_HEIGHT, PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from '../actor-physics.ts';

await RAPIER.init();
const data=createWorkshopGeometry(),material=new MeshBasicMaterial(),mesh=new Mesh(data.body,material);
mesh.updateMatrixWorld();
const identity={x:0,y:0,z:0,w:1},capsule=new RAPIER.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),direction={x:0,y:0,z:-1};
const point=(at,p)=>new Vector3(...coasterWorld(at.map((v,i)=>v+p[i])));
function fixture(contact=true,base=true) {
  const world=new RAPIER.World({x:0,y:0,z:0});
  if(base)for(const s of workshopColliders())world.createCollider(RAPIER.ColliderDesc.cuboid(...s.half).setTranslation(...s.position)
    .setRotation(new Quaternion().setFromEuler(new Euler(...(s.rotation??[0,0,0])))));
  if(contact)world.createCollider(RAPIER.ColliderDesc.trimesh(data.contactSurface.vertices,data.contactSurface.indices));
  world.step();return world;
}
after(()=>{data.body.dispose();data.glow.dispose();material.dispose();});

test('tabletop contacts reuse visible triangles without an enlarged enclosure',()=>{
  const key=ps=>ps.map(p=>p.join(',')).sort().join('|'),visible=new Set(),p=data.body.attributes.position;
  for(let i=0;i<p.count;i+=3)visible.add(key([0,1,2].map(j=>[p.getX(i+j),p.getY(i+j),p.getZ(i+j)])));
  const {vertices,indices}=data.contactSurface;
  for(let i=0;i<indices.length;i+=3)assert.ok(visible.has(key([0,1,2].map(j=>Array.from(vertices.slice(indices[i+j]*3,indices[i+j]*3+3))))));
  assert.equal(workshopColliders().length,44 + WORKSHOP_INTAKE_PANELS.length);
  assert.ok(indices.length/3<4000,'bounded tabletop contact cost');
  console.log(JSON.stringify({visibleTriangles:p.count/3,contactTriangles:indices.length/3,contactVertices:vertices.length/3,
    contactBytes:vertices.byteLength+indices.byteLength,colliderIncrement:1}));
});

test('real capsule sweeps reproduce old penetration and now stop at four visible tabletop machines',()=>{
  const before=fixture(false),after=fixture(),cases=[['lookup',-1.04,1.76],['debug',.86,1.7],['rewrite',0,1.78],['act',.98,1.7]],evidence=[];
  try {for(const [id,dx,height] of cases) {
    const at=WORKSHOP_TOOLS.find(t=>t.id===id).at,origin=point(at,[dx,height,1.7]);
    const visible=new Raycaster(origin,new Vector3(0,0,-1),0,1.8).intersectObject(mesh)[0];
    assert.ok(visible,`${id}: visible machine not found`);
    // Sole 1 cm above the old cabinet top: full ordinary capsule at tabletop height.
    const start=point(at,[dx,1.37+PLAYER_HALF_HEIGHT+PLAYER_RADIUS,1.7]);
    assert.ok(!before.castShape(start,identity,direction,capsule,0,1.8,true),`${id}: old shell unexpectedly blocked`);
    const hit=after.castShape(start,identity,direction,capsule,0,1.8,true);
    assert.ok(hit&&hit.time_of_impact>0&&hit.time_of_impact<1.8,`${id}: missing tabletop contact`);
    const physical=after.castRay(new RAPIER.Ray(origin,direction),1.8,true);
    assert.ok(physical&&Math.abs(physical.timeOfImpact-visible.distance)<.0001,`${id}: contact face differs from visible surface`);
    evidence.push({id,visibleDistance:visible.distance,capsuleStop:hit.time_of_impact});
  }}finally{before.free();after.free();}
  console.log(JSON.stringify({penetrationRegressions:evidence}));
});

test('a falling player capsule lands on the scanner and front roller instead of inside them',()=>{
  const evidence=[];
  // Broad landing patches away from the overhead rail. The small route pegs are
  // sloped obstacles, not stable platforms; their side contacts are covered above.
  for(const [id,dx,dz] of [['lookup',-1.04,.57],['rewrite',0,.65]]) {
    const heights=[];
    for(const contact of [false,true]) {
      const world=fixture(contact);world.gravity={x:0,y:-12.5,z:0};
      const at=WORKSHOP_TOOLS.find(t=>t.id===id).at;
      const start=point(at,[dx,3.1+PLAYER_CENTER_HEIGHT,dz]);
      const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(start.x,start.y,start.z)
        .setCcdEnabled(true).lockRotations());
      world.createCollider(RAPIER.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS).setMass(72).setFriction(0),body);
      try {
        for(let frame=0;frame<180;frame++)world.step();
        const p=body.translation(),foot=p.y-point(at,[0,0,0]).y-PLAYER_CENTER_HEIGHT;
        assert.ok(Math.abs(p.x-start.x)<.4&&Math.abs(p.z-start.z)<.4,`${id}: unexpected lateral ejection`);
        assert.ok(Math.abs(body.linvel().y)<.01,`${id}: must finish supported`);heights.push(foot);
      }finally{world.free();}
    }
    assert.ok(heights[1]>heights[0]+.1,`${id}: new device must support above the old cabinet`);
    evidence.push({id,beforeFoot:heights[0],afterFoot:heights[1]});
  }
  console.log(JSON.stringify({fallingCapsule:evidence}));
});

test('all seven counters have device contact above the old cabinet top',()=>{
  const world=fixture(true,false);
  const probes=[['intake',[-.2,1.42,1.5]],['lookup',[-1.04,1.76,1.5]],['plan',[.45,1.45,1.5]],['debug',[.86,1.7,1.5]],
    ['rewrite',[0,1.78,1.5]],['extract',[.91,1.9,1.5]],['act',[.98,1.7,1.5]]];
  try {for(const [id,p] of probes) {
    const at=id==='intake'?WORKSHOP_INTAKE:WORKSHOP_TOOLS.find(t=>t.id===id).at;
    assert.ok(world.castRay(new RAPIER.Ray(point(at,p),direction),3,true),`${id}: no static machine contact`);
  }}finally{world.free();}
});

test('ground approaches and previously open full-height side passages stay open',()=>{
  const world=fixture(),before=fixture(false);let sweeps=0,existingObstructions=0;
  try {for(const id of WORKSHOP_TARGETS) {
    const at=workshopLocal(id),start=point(at,[0,.1+PLAYER_CENTER_HEIGHT,3.1]);
    assert.ok(!world.castShape(start,identity,direction,capsule,0,1.4,true),`${id}: front stance blocked`);sweeps++;
    if(id==='bell')continue;
    for(const side of [-1,1]) {
      const from=point(at,[side*1.9,.1+PLAYER_CENTER_HEIGHT,1.7]);
      const prior=before.castShape(from,identity,direction,capsule,0,2.8,true)?.time_of_impact??null;
      const current=world.castShape(from,identity,direction,capsule,0,2.8,true)?.time_of_impact??null;
      if(prior===null){assert.equal(current,null,`${id}: side passage newly blocked`);sweeps++;}
      else {assert.ok(current!==null&&Math.abs(current-prior)<.0001,`${id}: existing obstruction moved`);existingObstructions++;}
    }
  }}finally{world.free();before.free();}
  assert.ok(sweeps>=20);console.log(JSON.stringify({clearPlayerApproachSweeps:sweeps,unchangedExistingObstructions:existingObstructions}));
});

test('intake text faces remain clear of carrier beams and their own supports from front and oblique approaches',()=>{
  let samples=0;
  for(const camera of [[-16,6,88],[-23,6,84],[-9,6,84]])for(const {at,size} of WORKSHOP_INTAKE_PANELS) {
    const origin=new Vector3(...coasterWorld(camera));
    for(const x of [-.45,0,.45])for(const y of [-.35,0,.35]) {
      const target=new Vector3(...coasterWorld([at[0]+x*size[0],at[1]+y*size[1],at[2]]));
      const distance=origin.distanceTo(target),ray=new Raycaster(origin,target.sub(origin).normalize(),0,distance-.005);
      assert.equal(ray.intersectObject(mesh).length,0,`sign row ${at[1]} obscured from ${camera} at ${x},${y}`);samples++;
    }
  }
  console.log(JSON.stringify({unobstructedIntakeTextRays:samples}));
});

test('a full capsule at tabletop height can pass beside the machines without an enlarged enclosure',()=>{
  const world=fixture();let sweeps=0;
  try {for(const at of [WORKSHOP_INTAKE,...WORKSHOP_TOOLS.map(t=>t.at)])for(const side of [-1,1]) {
    const from=point(at,[side*1.9,1.37+PLAYER_HALF_HEIGHT+PLAYER_RADIUS,1.7]);
    assert.ok(!world.castShape(from,identity,direction,capsule,0,2.2,true),`${at}: tabletop side ${side} blocked`);sweeps++;
  }}finally{world.free();}
  console.log(JSON.stringify({clearTabletopSideSweeps:sweeps}));
});

test('machine apertures stay open and the suspended transport height gains no static obstruction',()=>{
  const world=fixture(true,false),ball=new RAPIER.Ball(.04);
  try {
    for(const [id,offset] of [['rewrite',[0,1.53,1.2]],['extract',[0,1.8,1.2]],['debug',[-.85,1.84,.4]]]) {
      const at=WORKSHOP_TOOLS.find(t=>t.id===id).at;
      assert.ok(!world.castShape(point(at,offset),identity,direction,ball,0,id==='debug'?1.5:2.4,true),`${id}: aperture filled`);
    }
    const carrier=new RAPIER.Cuboid(.325,.205,.245);
    for(const {at} of WORKSHOP_TOOLS) {
      const path=[coasterWorld([-16,WORKSHOP_CARRIER_Y,72.15]),coasterWorld([-16,WORKSHOP_CARRIER_Y,67]),coasterWorld([at[0],WORKSHOP_CARRIER_Y,at[2]-.85])];
      for(let i=1;i<path.length;i++) {
        const from=new Vector3(...path[i-1]),to=new Vector3(...path[i]);
        assert.ok(!world.castShape(from,identity,to.sub(from),carrier,0,1,true));
      }
    }
  }finally{world.free();}
});
