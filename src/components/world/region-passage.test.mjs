import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Object3D } from 'three';
import { createRegionPassage, passageVelocity } from './region-passage.ts';
import { createColliderReadinessProbe, FIXED_TRIMESH } from './collider-readiness.ts';
import { WORLD_PORTALS } from './world-portals.ts';
import { worldPassageRegions } from './world-actor-sites.ts';
await R.init();

const requirement=[{name:'district',shape:FIXED_TRIMESH}];
const region={id:'district',requirements:requirement,contains:(p,r)=>p[0]>=-r&&p[0]<=2+r&&Math.abs(p[2])<=1+r};
function fixture() {
  const world=new R.World({x:0,y:-9.81,z:0}),states=new Map();let time=0,reads=0;
  const probe=createColliderReadinessProbe({getCollider(h){reads++;return world.getCollider(h);}},states,()=>time);
  const mount=(name='district')=>{
    const body=world.createRigidBody(R.RigidBodyDesc.fixed());
    const collider=world.createCollider(R.ColliderDesc.trimesh(new Float32Array([-5,0,-5,5,0,-5,-5,0,5,5,0,5]),new Uint32Array([0,2,1,1,2,3])),body);
    const object=new Object3D();object.name=name;states.set(collider.handle,{object});return {body,collider,object};
  };
  return {world,states,probe,mount,reads:()=>reads,tick:()=>{time+=101;}};
}

test('remote warm-up asks for missing real load sources at the candidate only', () => {
  const regions = [{ ...region, loadSource: 'shared' }, { ...region, id: 'another', loadSource: 'shared' },
    { ...region, id: 'separate', contains: p => p[0] > 20 }];
  let ready = false, failed = false;
  const passage = createRegionPassage(regions, needs => !needs.length || ready, [], id => id === 'shared' && failed);
  assert.deepEqual(passage.loadingSourcesAt([-15, 0, 0], .34), []);
  assert.deepEqual(passage.loadingSourcesAt([1, 0, 0], .34), ['shared']);
  assert.deepEqual(passage.loadingSourcesAt([30, 0, 0], .34), ['separate']);
  failed = true;
  assert.equal(passage.failureAt([1, 0, 0], .34), true);
  ready = true;
  assert.deepEqual(passage.loadingSourcesAt([1, 0, 0], .34), []);
  assert.equal(passage.failureAt([1, 0, 0], .34), false);
});

test('short path checks catch outside-to-outside crossings, radius contact and corner grazes',()=>{
  const gate=createRegionPassage([region],()=>false);
  assert.equal(gate.at([-1,1,0],.3),false,'base false is a global missing-ground gate');
  const local=createRegionPassage([region],needs=>needs.length===0);
  assert.equal(local.at([-1,1,0],.3),true);
  assert.equal(local.allows([-1,1,0],[3,1,0],.3),false);
  assert.equal(local.allows([-1,1,2],[3,1,2],.3),true);
  assert.equal(local.at([-.2,1,0],.3),false);
  assert.equal(local.allows([-.3,1,1.3],[.3,1,1.3],.3),false);
  assert.equal(local.allows([NaN,1,0],[0,1,0]),false);
  assert.equal(local.allows([-50,1,3],[50,1,3]),false,'teleports must use a destination query');
  assert.equal(local.at([50,1,3]),true);
});

test('cached positive readiness observes lost colliders immediately without scanning unrelated objects',()=>{
  const f=fixture();
  try {
    for(let i=0;i<50;i++)f.mount(`unrelated-${i}`);
    const target=f.mount();assert.equal(f.probe(requirement),true);
    const before=f.reads();for(let i=0;i<10;i++)assert.equal(f.probe(requirement),true);
    assert.equal(f.reads()-before,10,'one cached required handle per query');
    target.collider.setEnabled(false);assert.equal(f.probe(requirement),false);
    target.collider.setEnabled(true);f.tick();assert.equal(f.probe(requirement),true);
    target.object.name='different-district';assert.equal(f.probe(requirement),false);
    target.object.name='district';f.tick();assert.equal(f.probe(requirement),true);
    f.world.removeRigidBody(target.body);assert.equal(f.probe(requirement),false);
  } finally {f.world.free();}
});

test('missing groups throttle rescans but newly mounted handles release the same gate immediately',()=>{
  const f=fixture(),gate=createRegionPassage([region],f.probe);
  try {
    f.mount('other');assert.equal(gate.allows([-1,1,0],[1,1,0],.3),false);
    const before=f.reads();for(let i=0;i<20;i++)assert.equal(gate.at([1,1,0]),false);
    assert.equal(f.reads(),before);
    f.mount();assert.equal(gate.allows([-1,1,0],[1,1,0],.3),true);
  } finally {f.world.free();}
});

test('a same-size replacement is found after the bounded negative retry',()=>{
  const f=fixture();
  try {
    const target=f.mount('not-ready');assert.equal(f.probe(requirement),false);
    target.object.name='district';assert.equal(f.probe(requirement),false);
    f.tick();assert.equal(f.probe(requirement),true);
  } finally {f.world.free();}
});

test('all current district footprints supply nonempty live collider contracts; legacy layout omits absent attractions',()=>{
  const regions=worldPassageRegions(true);
  const points={'alpha-island':[235,1,190],'alpha-waterwheel':[206,24,199],'alpha-cave':[220,24,155],'mainland-pier':[-10,1,112],brain:[-84,1,-55],exchange:[60,2,-60],club:[45,1,55],
    factory:[-180,1,10],ibd:[-88,1,-177],coaster:[50,1,-195]};
  for (const site of WORLD_PORTALS) points['walking-portal-'+site.id]=site.position;
  for(const r of regions) {
    assert.ok(r.requirements.length,r.id);assert.equal(r.contains(points[r.id],0),true,r.id);
    const ready=new Set(regions.filter(v=>v!==r).map(v=>v.requirements));
    const gate=createRegionPassage(regions,needs=>!needs.length||ready.has(needs));
    assert.equal(gate.at(points[r.id],.3),false,r.id);
    ready.add(r.requirements);assert.equal(gate.at(points[r.id],.3),true,r.id);
  }
  assert.deepEqual(worldPassageRegions(false).map(r=>r.id),['alpha-island','alpha-waterwheel','alpha-cave',...WORLD_PORTALS.map(site=>'walking-portal-'+site.id),'mainland-pier','brain','exchange','club']);
});

test('the real body cannot walk across the cold boundary and resumes after mounting without a teleport',()=>{
  const f=fixture(),gate=createRegionPassage([region],f.probe);
  try {
    f.mount('existing-ground');
    const body=f.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(-1, .5, 0).lockRotations());
    f.world.createCollider(R.ColliderDesc.capsule(.3,.2),body);
    const walk=()=>{
      const p=body.translation(),v=body.linvel(),motion=passageVelocity(gate,[p.x,p.y,p.z],{x:3,y:v.y,z:0},1/60,.2);
      body.setLinvel(motion.velocity,true);f.world.step();return motion;
    };
    for(let i=0;i<60;i++)walk();
    assert.ok(body.translation().x<-.2);assert.ok(body.translation().x>-.5);
    const before=body.translation().x;f.mount();walk();
    assert.ok(body.translation().x>before&&body.translation().x-before<.1);
    for(let i=0;i<25;i++)walk();assert.ok(body.translation().x>.5);
    assert.deepEqual(passageVelocity(gate,[0,1,0],{x:1,y:-2,z:0},NaN,.2),{blocked:true,velocity:{x:0,y:0,z:0}});
  } finally {f.world.free();}
});
