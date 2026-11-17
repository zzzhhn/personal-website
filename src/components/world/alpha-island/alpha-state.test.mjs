import test from 'node:test';
import assert from 'node:assert/strict';
import { guideActionHand } from '../rides/guide-action-hand.ts';
import { ALPHA_LANTERN_CAP,alphaMotion,useAlphaStore,startAlphaHand,advanceAlphaHand,cancelAlphaHand,canReleaseAlphaLantern,releaseAlphaLantern,visitAlphaStation } from './alpha-state.ts';
const position=[1,83,40];
function finish(){let receipt=null;for(let i=0;i<20;i++){const r=advanceAlphaHand(.08,position,true);if(r)receipt=r;}return receipt;}
test('paper lantern release pool stays bounded and a cancelled hold returns to rack',()=>{
  for(let i=0;i<40;i++){
    startAlphaHand('lantern',[1,84,40],position);guideActionHand.palm=null;alphaMotion.handError=Infinity;
    assert.equal(finish().kind,'lantern');assert.equal(releaseAlphaLantern([1,83,40]),true);
    assert.equal(releaseAlphaLantern([1,83,40]),false,'cannot release the same lantern twice');
  }
  assert.equal(alphaMotion.lanterns.length,ALPHA_LANTERN_CAP);assert.equal(useAlphaStore.getState().carried,false);
  assert.equal(useAlphaStore.getState().action,null);startAlphaHand('lantern',[1,84,40],position);finish();
  assert.equal(cancelAlphaHand(),true);assert.equal(guideActionHand.target,null);
  assert.equal(guideActionHand.owner,null);assert.equal(useAlphaStore.getState().carried,false);
});
test('alpha cancellation cannot clear a later owners hand target; visits are idempotent',()=>{startAlphaHand('tree',[1,2,3]);const other=[9,8,7];guideActionHand.target=other;guideActionHand.owner='other';cancelAlphaHand();assert.equal(guideActionHand.target,other);visitAlphaStation(3);visitAlphaStation(3);assert.equal(useAlphaStore.getState().visits.filter(n=>n===3).length,1);guideActionHand.owner=null;guideActionHand.target=null;});

test('every Alpha station commits its effect once even if the visual rig never reports contact',()=>{
  for(const kind of ['bell','sand','tree','wind','stone','lantern']){
    cancelAlphaHand();useAlphaStore.setState({stones:0,wind:0});alphaMotion.time=100;
    startAlphaHand(kind,[1,84,40],position);guideActionHand.palm=null;alphaMotion.handError=Infinity;
    let count=0;
    for(let i=0;i<80;i++)if(advanceAlphaHand(.08,position,true))count++;
    assert.equal(count,1,kind);
    if(kind==='wind')assert.equal(useAlphaStore.getState().wind,1);
    if(kind==='stone')assert.equal(useAlphaStore.getState().stones,1);
    if(kind==='lantern')assert.equal(useAlphaStore.getState().carried,true);
    if(['bell','sand','tree'].includes(kind))assert.equal(alphaMotion[`${kind}At`],100);
  }
  cancelAlphaHand();
});

test('leaving the accepted stance, losing ownership or losing support cannot finish a station later',()=>{
  for(const cause of ['walk','ownership','support','cancel']){
    useAlphaStore.setState({wind:0});startAlphaHand('wind',[1,84,40],position);
    for(let i=0;i<4;i++)assert.equal(advanceAlphaHand(.08,position,true),null);
    if(cause==='ownership'){guideActionHand.owner='another-station';guideActionHand.target=[9,9,9];}
    if(cause==='cancel')cancelAlphaHand();
    const moved=cause==='walk'?[1.5,83,40]:position;
    assert.equal(advanceAlphaHand(.08,moved,cause!=='support'),null);
    assert.equal(finish(),null);assert.equal(useAlphaStore.getState().wind,0,cause);
    if(cause==='ownership')assert.equal(guideActionHand.owner,'another-station');
  }
});

test('lantern release requires the current hold owner and finite position, not palm precision',()=>{
  startAlphaHand('lantern',[1,84,40],position);finish();guideActionHand.palm=null;
  assert.equal(canReleaseAlphaLantern(),true);assert.equal(releaseAlphaLantern([NaN,0,0]),false);
  guideActionHand.owner='other';assert.equal(canReleaseAlphaLantern(),false);assert.equal(releaseAlphaLantern(position),false);
  guideActionHand.owner='alpha-island';assert.equal(releaseAlphaLantern(position),true);
  assert.equal(canReleaseAlphaLantern(),false);
});
