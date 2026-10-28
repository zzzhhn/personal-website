import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { buildAlphaExchangeGeometry } from './WorldAlphaExchangeGeometry.ts';
import { ALPHA_EXCHANGE_ORIGIN, ALPHA_EXCHANGE_APPROACH, EXCHANGE_HALL, EXCHANGE_WALK_PATHS, EXCHANGE_OUTER_ROUTES, EXCHANGE_PIT_REAR_ROUTE, EXCHANGE_ENTRY_DESK_ROUTE, exchangeWorld } from './alpha-exchange-layout.ts';
import { BOARDWALK_POINTS, BOARDWALK_WIDTH } from './layout.ts';
import { PLAYER_HALF_HEIGHT, PLAYER_RADIUS, PLAYER_CENTER_HEIGHT } from './actor-physics.ts';
import { playerSupport, followPlayerGround, compensatePlayerSlopeGravity, clearPlayerSlopeGravity } from './player-ground.ts';
import { createPlayerClearance, sweptPlayerVelocity, playerVelocityChange } from './player-motion.ts';
await R.init();
const dt=1/60,restHeight=PLAYER_HALF_HEIGHT+PLAYER_RADIUS,q={x:0,y:0,z:0,w:1};
const point=v=>({x:v[0],y:v[1],z:v[2]});
const gallerySole=exchangeWorld([0,EXCHANGE_HALL.galleryY,-37.6]);
const p=point([gallerySole[0],gallerySole[1]+restHeight,gallerySole[2]]);
// The rebuilt hall has no old low clock beam. This explicit regression obstacle retains
// the 3 cm head-clearance bug case over the actual 5.2 m gallery, without adding runtime art.
const beamUnderside=p.y+restHeight+.03;
function fixture(run,{includeSurface=true,overhead=false,start=p,park=false}={}){
  const built=buildAlphaExchangeGeometry(),world=new R.World({x:0,y:-12.5,z:0}),kinds=new Map();world.timestep=dt;
  try{
    for(const[kind,mesh]of Object.entries(built.colliders)){
      if(kind==='surface'&&!includeSurface)continue;
      const owner=world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...ALPHA_EXCHANGE_ORIGIN));
      const collider=world.createCollider(R.ColliderDesc.trimesh(mesh.vertices,mesh.indices,mesh.flags),owner);kinds.set(collider.handle,kind);
    }
    if(overhead){
      const c=world.createCollider(R.ColliderDesc.cuboid(5.5,.11,.325).setTranslation(p.x,beamUnderside+.11,p.z-.13));
      kinds.set(c.handle,'regression-beam');
    }
    if(park){
      const[a,b]=BOARDWALK_POINTS,dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz),n=[-dz/length,dx/length];
      const vertices=[[a,-1],[b,-1],[b,1],[a,1]].flatMap(([v,s])=>[v[0]+n[0]*s*BOARDWALK_WIDTH/2,v[1],v[2]+n[1]*s*BOARDWALK_WIDTH/2]);
      const c=world.createCollider(R.ColliderDesc.trimesh(new Float32Array(vertices),new Uint32Array([0,2,1,0,3,2])));kinds.set(c.handle,'surface');
    }
    const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(start.x,start.y,start.z).lockRotations().setLinearDamping(.2).setCcdEnabled(true).setSoftCcdPrediction(.1));
    world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS).setMass(72).setFriction(0)
      .setFrictionCombineRule(R.CoefficientCombineRule.Min).setRestitution(0),body);
    world.step();run(world,body,kinds);
  }finally{world.free();built.body.dispose();built.glass.dispose();}
}
test('actual v2 gallery remains support when the full-height probe meets a test-only near-clearance beam',t=>fixture((world,body,kinds)=>{
  const at=body.translation(),lifted={...at,y:at.y+.06};
  const old=world.castShape(lifted,q,{x:0,y:-1,z:0},new R.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),0,.09,true,undefined,undefined,undefined,body);
  assert.equal(old.time_of_impact,0);assert.ok(old.normal1.y<0);
  assert.equal(kinds.get(old.collider.handle),'regression-beam');
  assert.ok(Math.abs(old.witness1.y-beamUnderside)<.001);
  t.diagnostic(`standing cast ${JSON.stringify({at,toi:old?.time_of_impact,normal:old?.normal1,witness:old?.witness1,kind:kinds.get(old?.collider.handle)})}`);
  const support=playerSupport(world,R,body);
  t.diagnostic(`support ${JSON.stringify(support)}`);
  assert.equal(support?.grounded,true);
  assert.equal(kinds.get(support.handle),'surface','actual gallery floor, not the overhead beam');
  assert.ok(Math.abs(support.centerY-p.y)<.001&&support.normal.y>.999);
  for(let i=0;i<180;i++){
    assert.equal(playerSupport(world,R,body)?.grounded,true,`stationary frame ${i}`);
    followPlayerGround(world,R,body,body.linvel(),dt,false);world.step();
  }
  assert.ok(Math.abs(body.translation().y-p.y)<.002);
},{overhead:true}));

test('leaving the regression beam by 1.2 m retains real rear-gallery support',()=>fixture((world,body,kinds)=>{
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
  assert.ok(Math.abs(body.translation().z-(p.z+1.2))<.025);
  assert.ok(Math.abs(body.translation().y-p.y)<.002);
},{overhead:true}));

test('the actual gallery query preserves its contact threshold and requires a floor below the foot',()=>fixture((world,body)=>{
  for(const[gap,expected]of [[.011,true],[.014,false],[.02,false],[.04,false],[.18,false]]){
    const support=playerSupport(world,R,body,{...p,y:p.y+gap});
    assert.equal(support?.grounded??false,expected,`sole gap ${gap}`);
    if(gap>=.04)assert.equal(support,null,'outside the unchanged 3 cm search');
  }
}));

test('a near-clearance beam without the v2 gallery floor cannot report grounded or ground-following force',()=>fixture((world,body)=>{
  assert.equal(playerSupport(world,R,body),null);
  assert.equal(followPlayerGround(world,R,body,body.linvel(),dt,false),null);
},{includeSurface:false,overhead:true}));

test('a real jump on the open v2 gallery remains airborne until the floor is contacted again',t=>fixture((world,body)=>{
  body.setTranslation({...p,z:p.z+1.2},true);body.setLinvel({x:0,y:0,z:0},true);
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

function walkRoute(route,{park=false}={}){
  const start=route[0],spawn=point([start[0],start[1]+PLAYER_CENTER_HEIGHT,start[2]]);
  fixture((world,body,kinds)=>{
    const guard=createPlayerClearance(world);
    try{
      const tick=(vx=0,vz=0,requireContact=true)=>{
        const support=playerSupport(world,R,body),v=body.linvel();
        if(requireContact)assert.equal(support?.grounded,true,`route contact before step at ${JSON.stringify(body.translation())}`);
        compensatePlayerSlopeGravity(world,body,support,dt,false);
        const change=playerVelocityChange(v,{x:vx,y:0,z:vz},dt,!!support?.grounded);
        body.applyImpulse({x:change.x*body.mass(),y:0,z:change.z*body.mass()},true);
        body.setLinvel(sweptPlayerVelocity(guard,body,body.linvel(),dt,R.QueryFilterFlags.EXCLUDE_SENSORS),true);
        followPlayerGround(world,R,body,body.linvel(),dt,false);world.step();clearPlayerSlopeGravity(body);
        if(requireContact){
          assert.equal(playerSupport(world,R,body)?.grounded,true,`route contact after step at ${JSON.stringify(body.translation())}`);
          const at=body.translation(),blockers=[];
          // Same 12 mm query lift as production playerRouteClear: preserve the full
          // standing capsule while excluding the solver's millimetre floor contact skin.
          world.intersectionsWithShape({...at,y:at.y+.012},q,new R.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),c=>{
            if(kinds.get(c.handle)==='solid')blockers.push(c.handle);return true;
          });
          assert.deepEqual(blockers,[],`full standing route clearance at ${JSON.stringify(at)}`);
        }
      };
      for(let i=0;i<45;i++)tick(0,0,false);
      for(let k=1;k<route.length;k++){
        const target=route[k];let arrived=false;
        for(let frame=0;frame<1200;frame++){
          const at=body.translation(),dx=target[0]-at.x,dz=target[2]-at.z,d=Math.hypot(dx,dz);
          if(d<.07){arrived=true;break;}
          const speed=Math.min(3.6,d*4);tick(dx/d*speed,dz/d*speed);
        }
        assert.ok(arrived,`route leg ${k} reaches ${target}, got ${JSON.stringify(body.translation())}`);
        for(let i=0;i<30;i++)tick();
      }
      for(let i=0;i<90;i++)tick();
      const last=route.at(-1);
      assert.ok(Math.abs(body.translation().y-(last[1]+restHeight))<.002,'stopped capsule rests on the destination floor');
    }finally{clearPlayerSlopeGravity(body);world.removeCharacterController(guard);}
  },{start:spawn,park});
}

test('the production capsule crosses the real park, 3.1 m bridge, porch and entrance floor in both directions',()=>{
  const route=[ALPHA_EXCHANGE_APPROACH[0],ALPHA_EXCHANGE_ORIGIN,exchangeWorld([0,0,-3])];
  for(const reverse of [false,true])walkRoute(reverse?[...route].reverse():route,{park:true});
});

test('the production capsule climbs and descends the published west ramp and connected 5.2 m gallery',()=>{
  const route=EXCHANGE_WALK_PATHS.find(path=>path.some(p=>p[1]===EXCHANGE_HALL.galleryY));
  assert.ok(route,'published gallery access route exists');
  const worldRoute=route.map(exchangeWorld);
  for(const reverse of [false,true])walkRoute(reverse?[...worldRoute].reverse():worldRoute);
});

test('the production capsule crosses the second exit landing and its downhill return to ground in both directions',()=>{
  // Last five public waypoints cover the inside approach, open doorway, landing and
  // exterior ramp. The reverse run checks the uphill return through the same opening.
  const route=EXCHANGE_OUTER_ROUTES[0].slice(-5).map(exchangeWorld);
  for(const reverse of [false,true])walkRoute(reverse?[...route].reverse():route);
});

test('the production capsule reaches the bell from the dealing desk through the continuous rear pit ramp and returns',()=>{
  const route=EXCHANGE_PIT_REAR_ROUTE.map(exchangeWorld);
  for(const reverse of [false,true])walkRoute(reverse?[...route].reverse():route);
});

test('ordinary porch entry crosses both central ramps to the desk and back at the centre and both corridor margins with continuous contact',()=>{
  for(const offset of [-.8,0,.8]){
    const route=EXCHANGE_ENTRY_DESK_ROUTE.map((p,i)=>[p[0]+(i<EXCHANGE_ENTRY_DESK_ROUTE.length-2?offset:0),p[1],p[2]]);
    // Do not brake at every slope boundary: cross both ramps at the normal walking
    // speed, keeping only horizontal turns and the fixed desk approach as targets.
    const corners=route.filter((p,i,all)=>{
      if(i===0||i===all.length-1)return true;
      const a=all[i-1],b=all[i+1];return Math.abs((p[0]-a[0])*(b[2]-p[2])-(p[2]-a[2])*(b[0]-p[0]))>1e-8;
    }).map(exchangeWorld);
    for(const reverse of [false,true])walkRoute(reverse?[...corners].reverse():corners);
  }
});
