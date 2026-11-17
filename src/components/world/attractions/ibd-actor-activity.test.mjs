import test from 'node:test';
import assert from 'node:assert/strict';
import { createActorActivities } from '../actor-activities.ts';
import { registerIbdActivity } from './ibd-actor-activity.ts';
import { registerMineActivity } from '../alpha-mine-activity.ts';
import { resetMineSession, mineActor, useAlphaMineStore } from '../alpha-mine-state.ts';
import { PLAYER_CENTER_HEIGHT } from '../actor-physics.ts';
import { useWorldStore } from '../store.ts';
import { useIbdYardStore, dispatchIbdAction, cancelIbdAction } from './ibd-yard-store.ts';
import { createIbdYardGame, yardPackItem } from './ibd-yard-game.ts';
import { ibdWorld, ibdPackHome } from './ibd-yard-layout.ts';
import { ibdPackInspectAnchors } from './ibd-pack-layout.ts';
import { ibdInspectionActor, ibdInspectionBody, ibdInspectionVisualSockets } from './ibd-inspection-motion.ts';
import { openIbdPack, requestIbdPackContact, cancelIbdPack, useIbdPackPlay, ibdPackVisual } from './ibd-pack-play.ts';
import { CRANE_STAND, craneControl, useIbdCraneControl } from './ibd-crane-control.ts';

function fixture(){
  cancelIbdPack(true);cancelIbdAction();resetMineSession();
  const game=createIbdYardGame();game.started=true;game.equipped=true;
  const item=yardPackItem(game,'parts-a');game.core.opened=[item.id];useIbdYardStore.setState({game,active:true});
  const home=ibdPackHome('parts-a'),anchor=ibdPackInspectAnchors(item.specId,.54);
  let position=ibdWorld(anchor.stand.map((n,i)=>n+home[i]));position[1]+=PLAYER_CENTER_HEIGHT;
  let yaw=anchor.yaw;
  useWorldStore.setState({position,paused:false,card:null,activeVehicle:null,seat:null,clubMode:null,shot:null,poolInspect:false});
  useIbdPackPlay.setState({pack:null,selected:0,busy:false,gap:.54});
  ibdInspectionVisualSockets.valid=false;
  const registry=createActorActivities(),release=registerIbdActivity(registry);
  const sync=()=>registry.sync({position,yaw,available:true,grounded:true,mode:'guide'});
  const move=(point,heading)=>{position=point;yaw=heading;useWorldStore.setState({position});sync();};
  sync();openIbdPack('parts-a');
  const tick=(n=1)=>{for(let i=0;i<n;i++){sync();registry.advance(1/60);}};
  const finish=()=>{for(let i=0;i<600&&(ibdInspectionBody.action||ibdPackVisual.retracting);i++)tick();assert.equal(ibdInspectionBody.action,null);};
  return {registry,release,tick,finish,sync,move,item};
}

test('registered yard completes four real sample cycles without render samples and frames the actual tray',()=>{
  const f=fixture();
  try{
    const view=f.registry.camera(),home=ibdWorld(ibdPackHome('parts-a'));
    assert.deepEqual(view.target,[home[0],home[1]+.45,home[2]+1.65]);
    assert.deepEqual(view.eye,[home[0]-2.7,home[1]+2.8,home[2]+4]);assert.equal(view.fov,42);
    for(let index=0;index<4;index++){
      assert.equal(requestIbdPackContact(),true);f.finish();
      assert.equal(f.registry.busy(),false);assert.equal(f.registry.movementLocked(),true);
      assert.equal(ibdInspectionActor.available,true,'holding the sample does not revoke ownership');
      assert.equal(requestIbdPackContact(),true);f.finish();
      assert.equal(useIbdYardStore.getState().game.packInspections[f.item.id].measurement,'M8');
      assert.equal(requestIbdPackContact(),true);f.finish();
      assert.equal(f.registry.movementLocked(),false);
      if(index<3)assert.equal(useIbdYardStore.getState().game.core.proofs[f.item.id],undefined);
    }
    assert.deepEqual(useIbdYardStore.getState().game.core.proofs[f.item.id],['identity','quantity','specification','quality-contents']);
    assert.equal(ibdInspectionVisualSockets.valid,false);assert.equal(f.registry.camera(),null);
  }finally{f.release();}
});

test('foreign carried ore prevents inspection; an inspection sample prevents foreign ownership',()=>{
  const f=fixture(),releaseMine=registerMineActivity(f.registry);
  try{
    useAlphaMineStore.setState({carried:'REVERSAL_5'});f.sync();
    assert.equal(ibdInspectionActor.available,false);assert.equal(mineActor.available,true);
    assert.equal(requestIbdPackContact(),false);
    useAlphaMineStore.setState({carried:null});f.sync();openIbdPack('parts-a');
    assert.equal(requestIbdPackContact(),true);f.finish();f.sync();
    assert.equal(mineActor.available,false);assert.equal(ibdInspectionActor.available,true);
  }finally{releaseMine();f.release();resetMineSession();}
});

test('an open idle carton cannot cancel or double-tick a later crane action',()=>{
  const f=fixture();
  try{
    const position=ibdWorld(CRANE_STAND);position[1]+=PLAYER_CENTER_HEIGHT;f.move(position,Math.PI/2);
    dispatchIbdAction({kind:'crane',station:'crane'});
    assert.equal(ibdInspectionBody.action.kind,'crane-control');assert.equal(f.registry.camera(),null);
    f.tick(1);assert.equal(ibdInspectionBody.action.phase,'perform');assert.equal(ibdInspectionBody.action.elapsed,0);
    f.tick(15);assert.ok(Math.abs(ibdInspectionBody.action.elapsed-.25)<1e-8);
    f.tick(35);assert.equal(useIbdCraneControl.getState().ready,true);
    f.registry.interrupt('recovery');assert.equal(craneControl.token,null);
    assert.equal(ibdInspectionBody.action,null);assert.equal(useIbdYardStore.getState().game.pending,null);
    assert.deepEqual(useIbdYardStore.getState().game.core.moved,[]);
  }finally{f.release();}
});

test('paused work stays still and unmount returns held samples without manufacturing evidence or late callbacks',()=>{
  const f=fixture();
  assert.equal(requestIbdPackContact(),true);f.tick(15);
  const elapsed=ibdInspectionBody.action.elapsed;
  useWorldStore.setState({paused:true});f.tick(90);assert.equal(ibdInspectionBody.action.elapsed,elapsed);
  useWorldStore.setState({paused:false});f.finish();assert.ok(ibdInspectionBody.carried);
  f.release();f.registry.advance(10);
  assert.equal(ibdInspectionBody.carried,null);assert.equal(ibdInspectionActor.available,false);
  assert.equal(useIbdYardStore.getState().game.packInspections[f.item.id].slots[0].complete,false);
  assert.equal(useIbdYardStore.getState().game.core.proofs[f.item.id],undefined);
  assert.equal(f.registry.camera(),null);assert.equal(f.registry.movementLocked(),false);
});
