import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { buildAlphaExchangeGeometry } from './WorldAlphaExchangeGeometry.ts';
import { ALPHA_EXCHANGE_ORIGIN } from './alpha-exchange-layout.ts';
import { PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from './actor-physics.ts';
import { playerSupport, followPlayerGround } from './player-ground.ts';
await R.init();
const dt=1/60,p={x:57.05,y:6.36,z:-81.99},q={x:0,y:0,z:0,w:1};
function fixture(run,includeSurface=true){
  const built=buildAlphaExchangeGeometry(),world=new R.World({x:0,y:-12.5,z:0}),kinds=new Map();world.timestep=dt;
  try{
    for(const[kind,mesh]of Object.entries(built.colliders)){
      if(kind==='surface'&&!includeSurface)continue;
      const owner=world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...ALPHA_EXCHANGE_ORIGIN));
      const collider=world.createCollider(R.ColliderDesc.trimesh(mesh.vertices,mesh.indices),owner);kinds.set(collider.handle,kind);
    }
    const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(p.x,p.y,p.z).lockRotations().setLinearDamping(.2).setCcdEnabled(true));
    world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS).setMass(72).setFriction(0)
      .setFrictionCombineRule(R.CoefficientCombineRule.Min).setRestitution(0),body);
    world.step();run(world,body,kinds);
  }finally{world.free();built.body.dispose();built.glass.dispose();}
}
test('actual exchange gallery floor remains support while the lifted standing capsule intersects the beam',t=>fixture((world,body,kinds)=>{
  const at=body.translation(),lifted={...at,y:at.y+.06};
  const old=world.castShape(lifted,q,{x:0,y:-1,z:0},new R.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),0,.09,true,undefined,undefined,undefined,body);
  assert.equal(old.time_of_impact,0);assert.ok(old.normal1.y<0);
  assert.equal(kinds.get(old.collider.handle),'solid');
  assert.ok(Math.abs(old.witness1.x-57.2)<.001&&Math.abs(old.witness1.y-7.15)<.001);
  t.diagnostic(`standing cast ${JSON.stringify({at,toi:old?.time_of_impact,normal:old?.normal1,witness:old?.witness1,kind:kinds.get(old?.collider.handle)})}`);
  const support=playerSupport(world,R,body);
  t.diagnostic(`support ${JSON.stringify(support)}`);
  assert.equal(support?.grounded,true);
  assert.equal(kinds.get(support.handle),'surface','actual gallery floor, not the overhead beam');
  assert.ok(Math.abs(support.centerY-6.36)<.001&&support.normal.y>.999);
  for(let i=0;i<180;i++){
    assert.equal(playerSupport(world,R,body)?.grounded,true,`stationary frame ${i}`);
    followPlayerGround(world,R,body,body.linvel(),dt,false);world.step();
  }
  assert.ok(Math.abs(body.translation().y-6.36)<.002);
}));

test('leaving the beam by the observed 1.2 m retains continuous gallery support',()=>fixture((world,body,kinds)=>{
  for(let i=0;i<120;i++){
    const support=playerSupport(world,R,body);
    assert.equal(support?.grounded,true,`walking frame ${i}`);assert.equal(kinds.get(support.handle),'surface');
    body.setLinvel({x:0,y:body.linvel().y,z:.6},true);
    followPlayerGround(world,R,body,body.linvel(),dt,false);world.step();
  }
  body.setLinvel({x:0,y:body.linvel().y,z:0},true);
  for(let i=0;i<120;i++){
    assert.equal(playerSupport(world,R,body)?.grounded,true,`clear of beam, stationary frame ${i}`);
    followPlayerGround(world,R,body,body.linvel(),dt,false);world.step();
  }
  assert.ok(Math.abs(body.translation().z+80.79)<.025);
  assert.ok(Math.abs(body.translation().y-6.36)<.002);
}));

test('the actual gallery query preserves its contact threshold and requires a floor below the foot',()=>fixture((world,body)=>{
  for(const[gap,expected]of [[.011,true],[.014,false],[.02,false],[.04,false],[.18,false]]){
    const support=playerSupport(world,R,body,{...p,y:p.y+gap});
    assert.equal(support?.grounded??false,expected,`sole gap ${gap}`);
    if(gap>=.04)assert.equal(support,null,'outside the unchanged 3 cm search');
  }
}));

test('the clock beam alone cannot report grounded or create a ground-following force',()=>fixture((world,body)=>{
  assert.equal(playerSupport(world,R,body),null);
  assert.equal(followPlayerGround(world,R,body,body.linvel(),dt,false),null);
},false));

test('a real jump clear of the gallery beam remains airborne until the floor is contacted again',t=>fixture((world,body)=>{
  body.setTranslation({...p,z:-80.8},true);body.setLinvel({x:0,y:0,z:0},true);
  for(let i=0;i<60;i++){followPlayerGround(world,R,body,body.linvel(),dt,false);world.step();}
  const start=body.translation().y;assert.equal(playerSupport(world,R,body)?.grounded,true);
  assert.equal(followPlayerGround(world,R,body,{x:0,y:5,z:0},dt,true),null);
  body.setLinvel({x:0,y:5,z:0},true);world.step();
  let peak=0,landing=-1;
  for(let i=0;i<80;i++){
    const support=playerSupport(world,R,body),grounded=support?.grounded??false;
    if(i<25)assert.equal(grounded,false,`ascending/upper flight frame ${i}`);
    if(i>25&&grounded){landing=i;break;}
    assert.equal(followPlayerGround(world,R,body,body.linvel(),dt,false),null,'no ground servo in flight');
    peak=Math.max(peak,body.translation().y-start);world.step();
  }
  assert.ok(peak>.85&&peak<1.05);assert.ok(landing>40&&landing<55);
  t.diagnostic(`actual gallery jump: peak=${peak.toFixed(4)} m; landing frame=${landing}`);
}));

test('the lower-hemisphere probe keeps the 25 degree walkable slope boundary',()=>{
  for(const degrees of [20,35]){
    const angle=degrees*Math.PI/180,world=new R.World({x:0,y:0,z:0});
    try{
      // Exact tangent height of the real round foot on the tilted slab's upper plane.
      const y=.5/Math.cos(angle)-.5+PLAYER_HALF_HEIGHT+PLAYER_RADIUS/Math.cos(angle);
      const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0,y,0).lockRotations());
      world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),body);
      world.createCollider(R.ColliderDesc.cuboid(5,.5,5).setTranslation(0,-.5,0)
        .setRotation({x:0,y:0,z:Math.sin(angle/2),w:Math.cos(angle/2)}));world.step();
      const support=playerSupport(world,R,body);
      if(degrees<25){assert.equal(support?.grounded,true);assert.ok(Math.abs(support.normal.y-Math.cos(angle))<.001);}
      else assert.equal(support,null,'a steep face remains unwalkable');
    }finally{world.free();}
  }
});
