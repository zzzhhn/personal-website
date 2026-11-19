import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import R from '@dimforge/rapier3d-compat';
import { act, createElement as h, Suspense } from 'react';
import { AnimationMixer, Group, Object3D, PerspectiveCamera, Vector3 } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { compileWorldComponent } from '../../../tools/world/alpha-mine-tests/component-host.mjs';
import { loadG24Fixture } from '../../../tools/world/guide/dance/load-g24-fixture.ts';
import * as appearance from './WorldClubGuestAppearance.ts';
import { createClubGuestAppearance } from './WorldClubGuestAppearance.ts';
import * as dance from './WorldGuideDance.ts';
import { createClubDanceClips } from './WorldGuideDance.ts';
import * as plan from './WorldClubDancePlan.ts';
import { advanceClubGuestClock, clubGuestAnimationInterval, clubGuestPlan, createClubGuestClock, createClubGuestGreeting } from './WorldClubDancePlan.ts';
import * as guestContact from './club-guest-contact.ts';
import { clubGuestContactCenter, clubGuestContactId, DJC_GUESTS, fitClubGuestContact } from './club-guest-contact.ts';
import { CLUB } from './djc-club-layout.ts';
import { buildDjcClubGeometry } from './WorldDjcClubGeometry.ts';
import { PLAYER_CENTER_HEIGHT, PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from './actor-physics.ts';

await R.init();
const source=await loadG24Fixture();

function danceFloorContact({vertices,indices}) {
  // Limit the query world to real geometry near the guests. Preserve whole triangles
  // crossing the edge of this patch so long deck faces can still support the avatar.
  const local=[];
  for(let i=0;i<indices.length;i+=3){
    const tri=[indices[i],indices[i+1],indices[i+2]].map(index=>vertices.subarray(index*3,index*3+3));
    if(Math.max(...tri.map(p=>p[0]))<37||Math.min(...tri.map(p=>p[0]))>46)continue;
    if(Math.max(...tri.map(p=>p[2]))<48||Math.min(...tri.map(p=>p[2]))>61)continue;
    for(const p of tri)local.push(...p);
  }
  return R.ColliderDesc.trimesh(Float32Array.from(local),Uint32Array.from({length:local.length/3},(_,i)=>i));
}

test('the two custom guests retain the same fitted contact at both animation rates, with real dance-floor clearance around them',async t=>{
  const geometry=buildDjcClubGeometry({separateDaybeds:true,separatePoolLanterns:true,separateUmbrellas:true,separateFurniture:true});
  const world=new R.World({x:0,y:0,z:0}), up=new Vector3(0,1,0), east=new Vector3(1,0,0), rotation={x:0,y:0,z:0,w:1};
  const fixed=new Map(Object.entries(geometry.colliders).map(([id,contact])=>[world.createCollider(danceFloorContact(contact)).handle,id]));
  const player=new R.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS);
  const diagnostics=[];
  for(const {position,facing,step} of DJC_GUESTS){
    const scene=clone(source.scene),guest=createClubGuestAppearance(scene,step);
    const mixer=new AnimationMixer(scene),idle=mixer.clipAction(source.animations.find(a=>a.name==='Idle'));
    const dances=createClubDanceClips(scene).map(clip=>mixer.clipAction(clip));
    const greeting=mixer.clipAction(createClubGuestGreeting(scene));
    for(const action of [idle,...dances,greeting]){action.play();action.paused=true;action.setEffectiveWeight(action===idle?1:0);}
    mixer.update(0);scene.scale.setScalar(guest.scale);
    const pelvis=guest.mesh.skeleton.bones.find(b=>b.name.toLowerCase()==='pelvis');
    const chest=guest.mesh.skeleton.bones.find(b=>b.name.toLowerCase()==='chest');
    const point=new Vector3(),upper=new Vector3();
    const torso=()=>pelvis.getWorldPosition(point).lerp(chest.getWorldPosition(upper),.5);
    const rest=torso().clone(),profile=fitClubGuestContact(guest.mesh,guest.scale);
    const base=new Vector3(...position),neutral=profile.center.clone().applyAxisAngle(up,facing).add(base),target=new Vector3();
    scene.position.copy(base);scene.rotation.y=facing;
    assert.ok(profile.radius>.16&&profile.radius<.24);
    assert.ok(Math.abs(neutral.y-profile.radius-profile.halfHeight-position[1])<.01);
    assert.ok(profile.halfHeight+profile.radius>.81);
    const body=world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(...neutral.toArray()));
    const collider=world.createCollider(R.ColliderDesc.capsule(profile.halfHeight,profile.radius),body);
    world.step();
    const deck=world.castRay(new R.Ray({x:base.x+1,y:4,z:base.z},{x:0,y:-1,z:0}),4,true,undefined,undefined,undefined,undefined,c=>c!==collider);
    assert.ok(Math.abs((4-deck.timeOfImpact)-CLUB.dance[1])<.001);
    let moved=0,blocking=0,clear=0,maxStep=0;
    for(const d of [11,23]){
      const interval=clubGuestAnimationInterval(d*d,false)||1/60;
      const clock=createClubGuestClock(),weights=[0,0],preceding=neutral.clone();
      for(let elapsed=0;elapsed<64;elapsed+=interval){
        const beat=elapsed*2,plan=clubGuestPlan(beat,step),times=advanceClubGuestClock(clock,beat,interval,dances.map(a=>a.getClip().duration));
        dances.forEach((action,i)=>{
          const goal=Number(i===plan.move);weights[i]+=(goal-weights[i])*(1-Math.exp(-interval/.26));
          action.time=times[i];action.setEffectiveWeight(weights[i]);
        });
        idle.time=elapsed%idle.getClip().duration;idle.setEffectiveWeight(Math.max(0,1-weights[0]-weights[1]));
        greeting.time=plan.greet?Math.min(1.9,beat%2):1.9;greeting.setEffectiveWeight(plan.greet?.8:0);
        mixer.update(0);
        const measured=torso();
        clubGuestContactCenter(profile,base,rest,measured,facing,target);
        moved=Math.max(moved,target.distanceTo(neutral));maxStep=Math.max(maxStep,target.distanceTo(preceding));preceding.copy(target);
        if(Math.round(elapsed/interval)%Math.round(4/interval)!==0)continue;
        body.setNextKinematicTranslation(target);world.step();
        assert.ok(Math.hypot(collider.translation().x-target.x,collider.translation().z-target.z)<2e-5);
        const from=new Vector3(target.x-1.4,CLUB.dance[1]+PLAYER_CENTER_HEIGHT,target.z);
        const toward=world.castShape(from,rotation,east,player,0,2.8,true,undefined,undefined,undefined,undefined,c=>c===collider);
        assert.ok(toward&&toward.time_of_impact>.7&&toward.time_of_impact<1);
        blocking++;
        const passages=[-.9,.9].map(offset=>world.castShape(new Vector3(from.x,from.y,from.z+offset),rotation,east,player,0,2.8,true));
        assert.ok(passages.some(hit=>!hit),`adjacent paths at ${target.toArray()} blocked by ${passages.map(hit=>hit&&`${fixed.get(hit.collider.handle)} at ${hit.time_of_impact} m`)}`);
        clear++;
      }
    }
    assert.ok(moved>.008&&moved<.25);
    assert.ok(maxStep<.045);
    diagnostics.push({step,radius:profile.radius,height:2*(profile.radius+profile.halfHeight),moved,maxStep,blocking,clear});
    world.removeRigidBody(body);mixer.stopAllAction();mixer.uncacheRoot(scene);guest.dispose();
  }
  assert.equal(clubGuestAnimationInterval(49*49,false),null);
  t.diagnostic(JSON.stringify(diagnostics));
  for(const key of ['batches','daybeds','poolLanterns','umbrellas','furniture'])Object.values(geometry[key]).forEach(g=>g.dispose());
  geometry.pool.dispose();world.free();
});

test('the shipping dancers publish both rendered sources and real kinematic capsules when their model resolves',async()=>{
  const require=createRequire(import.meta.url),fiber=require('@react-three/fiber'),physics=require('@react-three/rapier');
  const wasm=createRequire(require.resolve('@react-three/rapier'))('@dimforge/rapier3d-compat');
  await wasm.init();
  fiber.extend({Group,Object3D});
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const root=fiber.createRoot({}),camera=new PerspectiveCamera();
  const renderer={render(){},setSize(){},setPixelRatio(){},capabilities:{getMaxAnisotropy:()=>4}};
  await root.configure({gl:renderer,camera,frameloop:'never',dpr:1,size:{width:320,height:200,top:0,left:0}});
  let asset,release;
  const pending=new Promise(resolve=>{release=resolve;});
  const {default:Guest}=compileWorldComponent(new URL('WorldClubDancer.tsx',import.meta.url))({
    '@react-three/fiber':{...fiber,useLoader:()=>{if(!asset)throw pending;return asset;}},
    '@react-three/rapier':physics,
    './WorldAssetDecoder':{withWorldAssetDecoder(){}}, './WorldClubGuestAppearance':appearance,
    './WorldGuideDance':dance, './WorldClubDancePlan':plan, './club-guest-contact':guestContact,
    './store':{useWorldStore:{getState:()=>({paused:false,poolInspect:false,shot:null})}},
  });
  let context,store,beat=0;
  function ReadWorld(){context=physics.useRapier();return null;}
  try{
    await act(async()=>{
      store=root.render(h(Suspense,{fallback:null},h(physics.Physics,{paused:true,colliders:false},h(ReadWorld),
        ...DJC_GUESTS.map(guest=>h(Guest,{key:guest.step,...guest,beat:()=>beat,playing:()=>true})))));
    });
    const colliders=()=>[...context.colliderStates].map(([handle,entry])=>({name:entry.object.name,collider:context.world.getCollider(handle)}));
    assert.equal(colliders().length,0,'no invisible obstacle while the shared asset is pending');
    await act(async()=>{asset=source;release();});
    const bodies=colliders();
    assert.equal(bodies.length,2);
    const scene=store.getState().scene;
    for(const {step} of DJC_GUESTS){
      const name=clubGuestContactId(step),{collider}=bodies.find(row=>row.name===name);
      assert.equal(collider.shapeType(),wasm.ShapeType.Capsule);
      assert.equal(collider.parent().isKinematic(),true);
      assert.equal(collider.parent().isCcdEnabled(),false);
      const draw=scene.getObjectByName(step===0?'club-guest-curly-shorts':'club-guest-bucket-linen');
      assert.equal(draw.userData.surfaceId,name);
    }
    const tick=async(distance)=>{
      camera.position.set(41,3.1,55+distance);
      await act(async()=>{for(let i=0;i<12;i++){beat+=1/30;store.getState().advance(beat/2,false);context.step(1/60);}});
      return bodies.map(({collider})=>[{...collider.translation()},collider.handle]);
    };
    const close=await tick(7),far=await tick(28),hidden=await tick(52);
    assert.ok(close.every(([pose],i)=>Math.hypot(pose.x-far[i][0].x,pose.z-far[i][0].z)>.001));
    assert.deepEqual(far,hidden,'leaving the render radius freezes the same loaded contacts');
    assert.ok(DJC_GUESTS.every(({step})=>scene.getObjectByName(`club-dancer-${step}`).visible===false));
  }finally{await act(async()=>root.unmount());}
});
