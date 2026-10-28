import test from 'node:test';
import assert from 'node:assert/strict';
import {useIbdYardStore} from './ibd-yard-store.ts';
import {createIbdYardGame} from './ibd-yard-game.ts';
import {useWorldStore} from '../store.ts';
import {PLAYER_CENTER_HEIGHT} from '../actor-physics.ts';
import {IBD_CARGO_HOME,ibdWorld} from './ibd-yard-layout.ts';
import {ibdPackInspectAnchors} from './ibd-pack-layout.ts';
import {ibdInspectionActor,ibdInspectionBody,ibdInspectionVisualSockets} from './ibd-inspection-motion.ts';
import {openIbdPack,useIbdPackPlay,requestIbdPackContact,tickIbdPackInspection,adjustIbdPackGap,cancelIbdPack,selectIbdPackPocket,ibdPackVisual} from './ibd-pack-play.ts';
function setup(){
  cancelIbdPack(true);
  const game=createIbdYardGame(0);game.started=true;game.equipped=true;game.core.opened=['parts-a'];
  useIbdYardStore.setState({game,active:true});
  const anchor=ibdPackInspectAnchors('M8',.54),home=IBD_CARGO_HOME['parts-a'];
  const position=ibdWorld(anchor.stand.map((n,i)=>n+home[i]));position[1]+=PLAYER_CENTER_HEIGHT;
  useWorldStore.setState({position,paused:false,card:null,activeVehicle:null,seat:null,clubMode:null,shot:null,poolInspect:false});
  Object.assign(ibdInspectionActor,{position,yaw:anchor.yaw,grounded:true,available:true,mode:'guide'});
  useIbdPackPlay.setState({pack:null,selected:0,gap:.54,busy:false});openIbdPack('parts-a');
}
// Controller tests substitute a valid pose sample; actual G24 reach is tested independently.
function tick(){const a=ibdInspectionBody.action;if(a)Object.assign(ibdInspectionVisualSockets,{valid:true,reachable:true,
  sampledId:a.id,sampledElapsed:a.elapsed,leftHand:[...a.anchor.leftTarget],rightHand:[...a.anchor.rightTarget],
  leftContactError:0,rightContactError:0,contactError:0});tickIbdPackInspection(1/60);}
function finish(){for(let i=0;i<600&&(ibdInspectionBody.action||ibdPackVisual.retracting);i++)tick();assert.equal(ibdInspectionBody.action,null);}
test('four pockets require physical attempts, fitted jaws, and original-pocket return before evidence',()=>{
  setup();
  for(let index=0;index<4;index++){
    assert.equal(useIbdPackPlay.getState().selected,index);assert.equal(requestIbdPackContact(),true);finish();
    assert.equal(useIbdYardStore.getState().game.packInspections['parts-a'].held,index);
    adjustIbdPackGap(.54);assert.equal(requestIbdPackContact(),true);finish();
    assert.equal(useIbdYardStore.getState().game.packInspections['parts-a'].measurement,null);
    assert.equal(useIbdPackPlay.getState().feedback,'clamp-misaligned');
    assert.equal(requestIbdPackContact(),true);finish();
    assert.equal(useIbdYardStore.getState().game.packInspections['parts-a'].measurement,null);
    assert.equal(useIbdPackPlay.getState().feedback,'clamp-misaligned');
    adjustIbdPackGap(.46);assert.equal(requestIbdPackContact(),true);finish();
    assert.equal(useIbdYardStore.getState().game.packInspections['parts-a'].measurement,'M8');
    assert.equal(requestIbdPackContact(),true);finish();
    if(index<3)assert.equal(useIbdYardStore.getState().game.core.proofs['parts-a'],undefined);
  }
  assert.equal(useIbdPackPlay.getState().pack,null);
  assert.deepEqual(useIbdYardStore.getState().game.core.proofs['parts-a'],['identity','quantity','specification','quality-contents']);
});
test('soft cancel physically puts an unmeasured piece back without completing a pocket',()=>{
  setup();requestIbdPackContact();finish();cancelIbdPack();finish();tick();
  assert.equal(ibdInspectionBody.carried,null);assert.equal(ibdPackVisual.progress,0);
  assert.equal(useIbdYardStore.getState().game.packInspections['parts-a'].slots[0].complete,false);
  assert.equal(useIbdPackPlay.getState().pack,null);
});
test('hard recovery clears only inspection work and does not cancel unrelated cargo motion',()=>{
  setup();requestIbdPackContact();tick();cancelIbdPack(true);finish();
  assert.equal(ibdInspectionBody.carried,null);assert.equal(useIbdYardStore.getState().game.core.proofs['parts-a'],undefined);
  const g=useIbdYardStore.getState().game;g.pending={action:{kind:'load',station:'load-a',slot:'parts-a'},token:99,seconds:3};
  cancelIbdPack(true);assert.equal(useIbdYardStore.getState().game.pending.token,99);
});

test('advance to an unchecked pocket only after the measured sample and tray have returned',()=>{
  setup();selectIbdPackPocket(2);
  requestIbdPackContact();finish();adjustIbdPackGap(.46);requestIbdPackContact();finish();
  assert.equal(useIbdPackPlay.getState().selected,2,'holding a measured piece keeps its original pocket');
  requestIbdPackContact();
  for(let i=0;i<120&&!ibdInspectionBody.action?.committed;i++)tick();
  assert.equal(useIbdYardStore.getState().game.packInspections['parts-a'].slots[2].complete,true);
  assert.ok(ibdPackVisual.progress>0,'tray is still out after the return contact');
  assert.equal(useIbdPackPlay.getState().selected,2,'do not switch during the physical return');
  finish();
  assert.equal(useIbdPackPlay.getState().selected,0,'resume at the first remaining pocket');
  assert.equal(requestIbdPackContact(),true,'the primary action must work without an extra selection');
  finish();
  assert.equal(useIbdYardStore.getState().game.packInspections['parts-a'].held,0);
  cancelIbdPack(true);
});

test('reopening preserves an unfinished choice, but a new carton or batch starts at its first unchecked pocket',()=>{
  setup();selectIbdPackPocket(2);cancelIbdPack();tick();openIbdPack('parts-a');
  assert.equal(useIbdPackPlay.getState().selected,2);
  cancelIbdPack(true);
  const g=useIbdYardStore.getState().game;
  useIbdYardStore.setState({game:{...g,core:{...g.core,opened:[...g.core.opened,'parts-b']}}});
  openIbdPack('parts-b');assert.equal(useIbdPackPlay.getState().selected,0);
  selectIbdPackPocket(3);cancelIbdPack(true);
  useIbdYardStore.setState({game:{...useIbdYardStore.getState().game,round:g.round+1}});
  openIbdPack('parts-b');assert.equal(useIbdPackPlay.getState().selected,0);
  cancelIbdPack(true);
});
