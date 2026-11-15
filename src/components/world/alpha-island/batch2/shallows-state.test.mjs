import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { createShallowsState,pushShallowsStone,stepShallowsStone,resetShallows,shallowsComplete,
  shallowsStonePosition,SHALLOWS_BYPASS,SHALLOWS_STONE_SIZE,SHALLOWS_DECK_Y } from './shallows-state.ts';
import { playerSupport,followPlayerGround,compensatePlayerSlopeGravity,clearPlayerSlopeGravity } from '../../player-ground.ts';
const safe=[-43.6,12.82,-58.45];
test('one push moves exactly one stone, freezes without catch-up and snaps eight continuous slabs',()=>{
  const s=createShallowsState();
  for(let i=0;i<8;i++){
    assert.ok(pushShallowsStone(s,i,safe));assert.equal(pushShallowsStone(s,(i+1)%8,safe),false);
    const before=[...s.progress];assert.equal(stepShallowsStone(s,10,safe,true),false);assert.deepEqual(s.progress,before);
    stepShallowsStone(s,10,safe);assert.ok(s.progress[i]<=.05*.85+.00001,'long frame is bounded');
    for(let k=0;k<40;k++)stepShallowsStone(s,.05,safe);
    assert.equal(s.active,null);assert.equal(s.progress[i],1);
    assert.ok(s.progress.slice(i+1).every(p=>p===0));
  }
  assert.ok(shallowsComplete(s));
  for(let i=1;i<8;i++){const a=shallowsStonePosition(i-1,1),b=shallowsStonePosition(i,1);assert.equal(a[2],b[2]);assert.ok(b[0]-a[0]<=SHALLOWS_STONE_SIZE[0]);}
});
test('standing, landing and entering a moving groove stop motion; reset cannot remove support',()=>{
  const s=createShallowsState(),p=shallowsStonePosition(0),standing=[p[0],SHALLOWS_DECK_Y+.82,p[2]];
  assert.equal(pushShallowsStone(s,0,standing),false);
  assert.ok(pushShallowsStone(s,0,safe));
  assert.equal(stepShallowsStone(s,.05,standing),false);assert.equal(s.progress[0],0);
  assert.equal(resetShallows(s,safe),false,'do not reset a moving stone');
  for(let i=0;i<30;i++)stepShallowsStone(s,.05,safe);
  const end=shallowsStonePosition(0,1);assert.equal(resetShallows(s,[end[0],SHALLOWS_DECK_Y+.82,end[2]]),false);
  assert.equal(resetShallows(s,[end[0],SHALLOWS_DECK_Y+1.9,end[2]]),false,'airborne capsule may land on support');
  assert.ok(resetShallows(s,safe));assert.equal(s.resets,1);assert.ok(s.progress.every(p=>p===0));
});
await RAPIER.init();
test('real capsule walks both fixed completed bridge and always-open southern bypass without gaps',()=>{
  for(const kind of ['bridge','bypass']){
    const world=new RAPIER.World({x:0,y:-12.5,z:0});world.timestep=1/60;
    const centres=kind==='bridge'?Array.from({length:8},(_,i)=>shallowsStonePosition(i,1)):SHALLOWS_BYPASS;
    const size=kind==='bridge'?SHALLOWS_STONE_SIZE:[1.38,.48,1.8];
    for(const [i,p] of centres.entries()){const body=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...p));body.userData={surface:true};world.createCollider(RAPIER.ColliderDesc.cuboid(...size.map(v=>v/2)).setFriction(.85),body);
      if(kind==='bridge')world.createCollider(RAPIER.ColliderDesc.cuboid(.55,.28,.07).setTranslation(0,SHALLOWS_STONE_SIZE[1]/2+.27,(i%2?1:-1)*.72),body);
    }
    const start=centres[0],end=centres.at(-1),body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(start[0],SHALLOWS_DECK_Y+.82,start[2]).lockRotations());
    world.createCollider(RAPIER.ColliderDesc.capsule(.48,.34).setMass(72).setFriction(0),body);
    let minY=Infinity,maxY=-Infinity;
    for(let i=0;i<600;i++){
      const p=body.translation(),support=playerSupport(world,RAPIER,body),dx=end[0]-p.x;
      body.setLinvel({x:Math.min(3.6,Math.max(0,dx*5)),y:body.linvel().y,z:0},true);
      compensatePlayerSlopeGravity(world,body,support,1/60,false);followPlayerGround(world,RAPIER,body,body.linvel(),1/60,false);world.step();clearPlayerSlopeGravity(body);
      minY=Math.min(minY,body.translation().y);maxY=Math.max(maxY,body.translation().y);
    }
    assert.ok(Math.abs(body.translation().x-end[0])<.1,kind+' reaches opposite bank');
    assert.ok(minY>SHALLOWS_DECK_Y+.77,kind+' has continuous support');assert.ok(maxY<SHALLOWS_DECK_Y+.9,kind+' does not launch');world.free();
  }
});
