import test from 'node:test';
import assert from 'node:assert/strict';
import {useIbdYardStore} from './ibd-yard-store.ts';
import {createIbdYardGame,yardPackItem} from './ibd-yard-game.ts';
import {useWorldStore} from '../store.ts';
import {PLAYER_CENTER_HEIGHT} from '../actor-physics.ts';
import {ibdPackHome,ibdWorld} from './ibd-yard-layout.ts';
import {ibdPackInspectAnchors} from './ibd-pack-layout.ts';
import {ibdInspectionActor,ibdInspectionBody,ibdInspectionVisualSockets} from './ibd-inspection-motion.ts';
import {openIbdPack,useIbdPackPlay,requestIbdPackContact,tickIbdPackInspection,cancelIbdPack,selectIbdPackPocket,ibdPackVisual} from './ibd-pack-play.ts';
function setup(station='parts-a',caseIndex=0){
  cancelIbdPack(true);
  const game=createIbdYardGame(caseIndex);game.started=true;game.equipped=true;
  if(station.startsWith('stock'))game.stock={requested:true,originalReturned:true,assigned:null};
  const item=yardPackItem(game,station);game.core.opened=[item.id];
  useIbdYardStore.setState({game,active:true});
  const anchor=ibdPackInspectAnchors(item.specId,.54),home=ibdPackHome(station);
  const position=ibdWorld(anchor.stand.map((n,i)=>n+home[i]));position[1]+=PLAYER_CENTER_HEIGHT;
  useWorldStore.setState({position,paused:false,card:null,activeVehicle:null,seat:null,clubMode:null,shot:null,poolInspect:false});
  Object.assign(ibdInspectionActor,{position,yaw:anchor.yaw,grounded:true,available:true,mode:'guide'});
  useIbdPackPlay.setState({pack:null,selected:0,gap:.54,busy:false});openIbdPack(station);return item;
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
    assert.equal(ibdPackVisual.jaw,.54,'new sample starts with an open tool');
    assert.equal(requestIbdPackContact(),true);finish();
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
test('A/B and reserve jaws close visibly to their real shaft, with no guessed slider or early reading',()=>{
  const specs=new Set();
  for(const station of['parts-a','parts-b','stock-a','stock-b']){
    const item=setup(station,3),diameter=ibdPackInspectAnchors(item.specId,.54).diameter;specs.add(item.specId);
    requestIbdPackContact();finish();requestIbdPackContact();
    assert.equal(useIbdYardStore.getState().game.packInspections[item.id].measurement,null);
    let previous=.54,travel=0;
    for(let i=0;i<180&&ibdInspectionBody.action;i++){
      tick();const a=ibdInspectionBody.action,gap=ibdPackVisual.jaw;
      assert.ok(gap>=diameter-1e-8&&gap<=previous+1e-8,'closure cannot pass through the shaft');
      if(gap>diameter&&gap<.54)travel++;
      if(a){
        const home=ibdPackHome(station),local=ibdPackInspectAnchors(item.specId,gap);
        assert.deepEqual(a.anchor.rightTarget,ibdWorld(local.rightTarget.map((n,j)=>n+home[j])));
        if(!a.committed)assert.equal(useIbdYardStore.getState().game.packInspections[item.id].measurement,null);
      }
      previous=gap;
    }
    assert.ok(travel>10,'render multiple intermediate jaw poses');
    assert.equal(ibdPackVisual.jaw,diameter);
    assert.equal(useIbdYardStore.getState().game.packInspections[item.id].measurement,item.specId);
    requestIbdPackContact();finish();assert.equal(ibdPackVisual.jaw,.54,'reopen before the next sample');
    assert.equal(useIbdYardStore.getState().game.packInspections[item.id].slots[0].reading,item.specId);
    cancelIbdPack(true);
  }
  assert.deepEqual([...specs].sort(),['M6','M8']);
});
test('paused closure is inert; aborting it puts the unmeasured sample back without evidence',()=>{
  setup();requestIbdPackContact();finish();requestIbdPackContact();
  for(let i=0;i<40;i++)tick();assert.ok(ibdPackVisual.jaw<.54&&ibdPackVisual.jaw>.46);
  const elapsed=ibdInspectionBody.action.elapsed,gap=ibdPackVisual.jaw;
  useWorldStore.setState({paused:true});for(let i=0;i<90;i++)tick();
  assert.equal(ibdInspectionBody.action.elapsed,elapsed);assert.equal(ibdPackVisual.jaw,gap);
  assert.equal(requestIbdPackContact(),false);
  useWorldStore.setState({paused:false});cancelIbdPack();finish();tick();
  const inspection=useIbdYardStore.getState().game.packInspections['parts-a'];
  assert.equal(inspection.held,null);assert.equal(inspection.measurement,null);assert.equal(inspection.slots[0].complete,false);
});
test('closing the tool without rendered hand contact never produces a reading',()=>{
  setup();requestIbdPackContact();finish();requestIbdPackContact();
  ibdInspectionVisualSockets.valid=false;
  for(let i=0;i<180;i++)tickIbdPackInspection(1/60);
  assert.equal(ibdInspectionBody.action,null);
  assert.equal(useIbdYardStore.getState().game.packInspections['parts-a'].measurement,null);
  assert.equal(useIbdPackPlay.getState().feedback,'interrupted');
  cancelIbdPack(true);
});
test('hard recovery clears only inspection work and does not cancel unrelated cargo motion',()=>{
  setup();requestIbdPackContact();tick();cancelIbdPack(true);finish();
  assert.equal(ibdInspectionBody.carried,null);assert.equal(useIbdYardStore.getState().game.core.proofs['parts-a'],undefined);
  const g=useIbdYardStore.getState().game;g.pending={action:{kind:'load',station:'load-a',slot:'parts-a'},token:99,seconds:3};
  cancelIbdPack(true);assert.equal(useIbdYardStore.getState().game.pending.token,99);
});

test('advance to an unchecked pocket only after the measured sample and tray have returned',()=>{
  setup();selectIbdPackPocket(2);
  requestIbdPackContact();finish();requestIbdPackContact();finish();
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
