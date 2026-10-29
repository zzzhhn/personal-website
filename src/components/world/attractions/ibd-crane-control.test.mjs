import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_CENTER_HEIGHT } from '../actor-physics.ts';
import { useWorldStore } from '../store.ts';
import { createIbdYardGame } from './ibd-yard-game.ts';
import { ibdWorld } from './ibd-yard-layout.ts';
import { ibdCargoPose } from './ibd-yard-motion.ts';
import { createIbdMotionClock,stepIbdSafeMotion } from './ibd-yard-safety.ts';
import { ibdInspectionActor,ibdInspectionBody,ibdInspectionVisualSockets } from './ibd-inspection-motion.ts';
import { dispatchIbdAction,finishIbdAction,cancelIbdAction,tickIbdCoilInspection,useIbdYardStore } from './ibd-yard-store.ts';
import { CRANE_STAND,craneControl,useIbdCraneControl,setCraneInput,craneMayAdvance,craneLanded } from './ibd-crane-control.ts';
let clock,blocked=false;
function setup(){
  cancelIbdAction();ibdInspectionBody.carried=null;blocked=false;clock=createIbdMotionClock();
  const game=createIbdYardGame();game.started=true;game.equipped=true;
  const position=ibdWorld([CRANE_STAND[0],CRANE_STAND[1]+PLAYER_CENTER_HEIGHT,CRANE_STAND[2]]);
  useIbdYardStore.setState({game,active:true});useWorldStore.setState({position,paused:false,card:null,poolInspect:false,shot:null,activeVehicle:null,seat:null,clubMode:null});
  Object.assign(ibdInspectionActor,{position,yaw:Math.PI/2,grounded:true,available:true,mode:'guide'});
  dispatchIbdAction({kind:'crane',station:'crane'});assert.ok(useIbdYardStore.getState().game.pending);
}
// A rendered-palm substitute only for controller tests. Actual G24 transforms have a separate test.
function tick(sample=true){
  const a=ibdInspectionBody.action;
  if(a&&sample)Object.assign(ibdInspectionVisualSockets,{valid:true,reachable:true,sampledId:a.id,sampledElapsed:a.elapsed,
    leftHand:[...a.anchor.leftTarget],rightHand:[...a.anchor.rightTarget],leftContactError:0,rightContactError:0,contactError:0});
  else ibdInspectionVisualSockets.valid=false;
  tickIbdCoilInspection(1/60);
  const game=useIbdYardStore.getState().game,p=game.pending;if(!p)return;
  if(!useWorldStore.getState().paused&&craneMayAdvance(game,clock.elapsed/p.seconds)){
    const result=stepIbdSafeMotion(clock,p.seconds,1/60,{protectedMotion:true,stops:[0,1/3,2/3,1],blocked:()=>blocked},{},true);
    if(result.done)craneLanded();
  }
  finishIbdAction(p.token);
}
function ticks(n,sample=true){for(let i=0;i<n;i++)tick(sample);}
function ready(){ticks(50);assert.equal(useIbdCraneControl.getState().ready,true);}
test('elapsed time, wrong direction and timer completion cannot move or finish the crane',()=>{
  setup();ready();ticks(240);assert.equal(clock.elapsed,0);
  setCraneInput('travel');ticks(180);assert.equal(clock.elapsed,0);assert.equal(useIbdCraneControl.getState().wrong,true);
  assert.deepEqual(useIbdYardStore.getState().game.core.moved,[]);
  setCraneInput('raise');ticks(60);const partial=clock.elapsed;assert.ok(partial>0&&partial<2.2);
  setCraneInput(null);ticks(120);assert.equal(clock.elapsed,partial);
  setCraneInput('raise');ticks(180);assert.ok(Math.abs(clock.elapsed-2.2)<1e-8);assert.equal(useIbdCraneControl.getState().stage,1);
  assert.equal(useIbdCraneControl.getState().held,null);
  const pose=ibdCargoPose(useIbdYardStore.getState().game,'coil-front',1/3);assert.deepEqual(pose.at,[-12,3.9,-4]);
});
test('three held legs land cargo before releasing hands and granting the move once',()=>{
  setup();ready();
  for(const [stage,command]of['raise','travel','lower'].entries()){
    assert.equal(useIbdCraneControl.getState().stage,stage);setCraneInput(command);ticks(170);
  }
  ticks(40);const game=useIbdYardStore.getState().game;
  assert.equal(game.pending,null);assert.deepEqual(game.core.moved,['coil-front']);assert.equal(ibdInspectionBody.action,null);assert.equal(craneControl.token,null);
  finishIbdAction(game.revision);assert.equal(useIbdYardStore.getState().game,game);
});
test('pause, blocked path and missing live palms hold position without catching up',()=>{
  setup();ready();setCraneInput('raise');ticks(35);const before=clock.elapsed;
  useWorldStore.setState({paused:true});ticks(200);assert.equal(clock.elapsed,before);assert.equal(useIbdCraneControl.getState().held,null);
  useWorldStore.setState({paused:false});ticks(30);assert.equal(clock.elapsed,before);
  setCraneInput('raise');blocked=true;ticks(200);assert.equal(clock.elapsed,before);
  blocked=false;ticks(60);assert.ok(clock.elapsed>before&&clock.elapsed<2.2);
  const stopped=clock.elapsed;ticks(10,false);assert.equal(clock.elapsed,stopped);
});
test('cancel, unavailable actor, lost ground and round change discard the old operation',()=>{
  for(const mode of['cancel','unavailable','airborne','new-round']){
    setup();ready();setCraneInput('raise');ticks(15);const token=craneControl.token;
    if(mode==='cancel')cancelIbdAction();if(mode==='unavailable')ibdInspectionActor.available=false;
    if(mode==='airborne')ibdInspectionActor.grounded=false;
    if(mode==='new-round')useIbdYardStore.setState({game:createIbdYardGame(1,2)});
    ticks(60);finishIbdAction(token);assert.equal(ibdInspectionBody.action,null,mode);
    assert.equal(useIbdYardStore.getState().game.pending,null,mode);assert.deepEqual(useIbdYardStore.getState().game.core.moved,[],mode);
  }
});
test.after(()=>cancelIbdAction());
