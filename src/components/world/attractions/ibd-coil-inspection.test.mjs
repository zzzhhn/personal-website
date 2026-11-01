import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_CENTER_HEIGHT } from '../actor-physics.ts';
import { useWorldStore } from '../store.ts';
import { createIbdYardGame } from './ibd-yard-game.ts';
import { ibdWorld } from './ibd-yard-layout.ts';
import { ibdCoilInspectAnchor, ibdCoilBeamFocus } from './ibd-coil-inspection.ts';
import { ibdInspectionActor, ibdInspectionBody, ibdInspectionVisualSockets } from './ibd-inspection-motion.ts';
import { useIbdYardStore, dispatchIbdAction, finishIbdAction, cancelIbdAction, tickIbdCoilInspection } from './ibd-yard-store.ts';
const scan={kind:'scan',station:'coil-front',slot:'coil-front'};
function setup() {
  cancelIbdAction();ibdInspectionBody.carried=null;
  const game=createIbdYardGame();game.started=true;game.equipped=true;
  const position=ibdWorld([-12,.1+PLAYER_CENTER_HEIGHT,-1.7]);
  useIbdYardStore.setState({game,active:true});
  useWorldStore.setState({position,paused:false,card:null,poolInspect:false,shot:null,activeVehicle:null,seat:null,clubMode:null});
  Object.assign(ibdInspectionActor,{position,yaw:ibdCoilInspectAnchor(game,scan,position).yaw,grounded:true,available:true,mode:'guide'});
}
// Controller fixture only; actual G24 palm transforms are tested in WorldGuideIbdInspection.test.mjs.
function tick(sample=true) {
  const a=ibdInspectionBody.action;
  if(a&&sample)Object.assign(ibdInspectionVisualSockets,{valid:true,reachable:true,sampledId:a.id,sampledElapsed:a.elapsed,
    leftHand:[...a.anchor.leftTarget],rightHand:[...a.anchor.rightTarget],leftContactError:0,rightContactError:0,contactError:0});
  tickIbdCoilInspection(1/60);
}
function finish(){for(let i=0;i<350&&ibdInspectionBody.action;i++)tick();}
test('timer completion cannot grant coil evidence before the real-palm gate and recovery finish',()=>{
  setup();dispatchIbdAction(scan);const token=useIbdYardStore.getState().game.pending.token;
  finishIbdAction(token);assert.equal(useIbdYardStore.getState().game.core.proofs['coil-front'],undefined);
  for(let i=0;i<200&&!ibdInspectionBody.action?.committed;i++)tick();
  assert.equal(ibdInspectionBody.action.committed,true);assert.ok(useIbdYardStore.getState().game.pending);
  finishIbdAction(token);assert.equal(useIbdYardStore.getState().game.core.proofs['coil-front'],undefined);
  const before=structuredClone(ibdInspectionBody.action);useWorldStore.setState({paused:true});
  for(let i=0;i<120;i++)tick();assert.deepEqual(ibdInspectionBody.action,before);
  useWorldStore.setState({paused:false});finish();
  const game=useIbdYardStore.getState().game;
  assert.equal(game.pending,null);assert.deepEqual(game.core.proofs['coil-front'],['identity','quantity','specification','quality-front']);
  finishIbdAction(token);assert.equal(useIbdYardStore.getState().game,game);
});
test('cancel before or after pose confirmation, missing render samples and lost footing grant no proof',()=>{
  for(const interruption of['early','after-pose','no-render','airborne','unavailable','new-round']) {
    setup();dispatchIbdAction(scan);const token=useIbdYardStore.getState().game.pending.token;
    if(interruption==='after-pose')for(let i=0;i<200&&!ibdInspectionBody.action?.committed;i++)tick();
    else for(let i=0;i<25;i++)tick(interruption!=='no-render');
    if(interruption==='early'||interruption==='after-pose')cancelIbdAction();
    if(interruption==='airborne')ibdInspectionActor.grounded=false;
    if(interruption==='unavailable')ibdInspectionActor.available=false;
    if(interruption==='new-round')useIbdYardStore.setState({game:createIbdYardGame(1,2)});
    for(let i=0;i<350;i++)tick(interruption!=='no-render');
    finishIbdAction(token);
    assert.equal(ibdInspectionBody.action,null,interruption);
    assert.equal(useIbdYardStore.getState().game.pending,null,interruption);
    assert.equal(useIbdYardStore.getState().game.core.proofs['coil-front'],undefined,interruption);
  }
});
test('rear observation still requires the turntable; blocked rear cargo and occupied hands cannot bypass the rules',()=>{
  setup();dispatchIbdAction(scan);finish();
  const rear={...scan,kind:'rear'};dispatchIbdAction(rear);
  assert.equal(ibdInspectionBody.action,null);assert.equal(useIbdYardStore.getState().game.pending,null);
  const game=useIbdYardStore.getState().game;
  useIbdYardStore.setState({game:{...game,core:{...game.core,turned:['coil-front']}}});
  dispatchIbdAction(rear);assert.equal(ibdInspectionBody.action.kind,'coil-check');finish();
  assert.ok(useIbdYardStore.getState().game.core.proofs['coil-front'].includes('quality-rear'));
  setup();ibdInspectionBody.carried={spec:'M8'};dispatchIbdAction(scan);
  assert.equal(ibdInspectionBody.action,null);assert.equal(useIbdYardStore.getState().game.pending,null);
  setup();ibdInspectionActor.grounded=false;dispatchIbdAction(scan);
  assert.equal(ibdInspectionBody.action,null);assert.equal(useIbdYardStore.getState().game.notice,'inspection-stand-clear');
  setup();const position=ibdWorld([-12,.1+PLAYER_CENTER_HEIGHT,-6.7]);
  useWorldStore.setState({position});ibdInspectionActor.position=position;
  dispatchIbdAction({kind:'scan',station:'coil-rear',slot:'coil-rear'});
  assert.equal(ibdInspectionBody.action,null);assert.equal(useIbdYardStore.getState().game.pending,null);
  assert.equal(useIbdYardStore.getState().game.core.proofs['coil-rear'],undefined);
});
test('anchor leaves feet in place, follows the lifted cargo, and beam scans steel rather than the central bore',()=>{
  setup();const game=useIbdYardStore.getState().game,position=ibdInspectionActor.position;
  const a=ibdCoilInspectAnchor(game,scan,position);
  assert.deepEqual(a.stand,[position[0],position[1]-PLAYER_CENTER_HEIGHT,position[2]]);
  game.core.moved.push('coil-front');const moved=ibdCoilInspectAnchor(game,scan,position);
  assert.equal(moved.focus[0],a.focus[0]-8);
  for(let t=.6;t<=2.5;t+=.05){const p=ibdCoilBeamFocus(a.focus,t),radius=Math.hypot(p[0]-(a.focus[0]-.72),p[1]-(a.focus[1]-.82));
    assert.ok(radius>.7&&radius<1.985);assert.equal(p[2],a.focus[2]);}
  assert.deepEqual(ibdCoilBeamFocus(a.focus,2.5),a.focus);
});
test.after(()=>{cancelIbdAction();ibdInspectionBody.carried=null;});
