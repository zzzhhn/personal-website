import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { actorActivities } from './actor-activities.ts';
import { handleWorldEscape, requestCampReturn, useWorldStore } from './store.ts';
import { registerCampActivity } from './camp-actor-activity.ts';
import { registerFactoryActivity } from './factory/factory-actor-activity.ts';
import { registerClubActivity } from './club-actor-activity.ts';
import { startCampPropInteraction, currentCampPropInteraction, campPropHand } from './camp-prop-interactions.ts';
import { guideActionHand, releaseGuideActionHand } from './rides/guide-action-hand.ts';
import { startAlphaHand, advanceAlphaHand, useAlphaStore, alphaMotion } from './alpha-island/alpha-state.ts';
import { factoryControl, useFactoryStore, connectFactoryWorld } from './factory/factory-store.ts';

let releases=[];
const initialWorld=useWorldStore.getState(),initialFactory=useFactoryStore.getState();
beforeEach(()=>{
  useWorldStore.setState({...initialWorld,paused:false,poolInspect:false,card:null,clubMode:null,factoryStation:null});
  // Registration order intentionally differs from dismissal order.
  releases=[registerClubActivity(),registerFactoryActivity(),registerCampActivity(),connectFactoryWorld()];
});
afterEach(()=>{releaseGuideActionHand();for(const release of releases.reverse())release();
  useWorldStore.setState(initialWorld);useFactoryStore.setState(initialFactory);});

test('Escape releases the active Alpha hand through its callback, including a carried lantern',()=>{
  for(const kind of ['wind','lantern']) {
    startAlphaHand(kind,[.4,1,0],[0,0,0]);
    if(kind==='lantern') {for(let i=0;i<5;i++)advanceAlphaHand(.08,[0,0,0],true);assert.equal(useAlphaStore.getState().carried,true);}
    const revision=useAlphaStore.getState().revision;
    handleWorldEscape();
    assert.equal(useAlphaStore.getState().action,null);assert.equal(useAlphaStore.getState().carried,false);
    assert.equal(useAlphaStore.getState().revision,revision+1);assert.equal(alphaMotion.actionClock,null);
    assert.equal(guideActionHand.owner,null);assert.equal(guideActionHand.target,null);
    assert.equal(useWorldStore.getState().paused,false);
  }
  handleWorldEscape();assert.equal(useWorldStore.getState().paused,true);
});

test('Escape exits one layer per press: scene hand, camp item, workstation, Club, inspection, card, map',()=>{
  let handReleases=0,propReleases=0;
  startCampPropInteraction({id:'camp-prop-suitcase',anchor:[0,1,0],release(){propReleases++;}});
  campPropHand.target=[.5,1,0];campPropHand.palm=[.45,1,0];
  Object.assign(guideActionHand,{owner:'cave-lamp',target:[.5,1,0],cancel:()=>handReleases++});
  useWorldStore.setState({factoryStation:'raw',clubMode:'dj',poolInspect:true,card:{kind:'note',id:'qa'}});
  Object.assign(factoryControl.input,{x:1,z:-1,held:true,confirm:true});
  handleWorldEscape();assert.equal(handReleases,1);assert.equal(propReleases,0);
  assert.equal(useWorldStore.getState().factoryStation,'raw');
  handleWorldEscape();assert.equal(propReleases,1);assert.equal(currentCampPropInteraction(),null);
  assert.equal(campPropHand.palm,null);assert.equal(useWorldStore.getState().factoryStation,'raw');
  handleWorldEscape();assert.equal(useWorldStore.getState().factoryStation,null);
  assert.deepEqual(factoryControl.input,{x:0,z:0,held:false,confirm:false});
  assert.equal(useWorldStore.getState().clubMode,'dj');
  handleWorldEscape();assert.equal(useWorldStore.getState().clubMode,null);assert.equal(useWorldStore.getState().poolInspect,true);
  handleWorldEscape();assert.equal(useWorldStore.getState().poolInspect,false);assert.ok(useWorldStore.getState().card);
  handleWorldEscape();assert.equal(useWorldStore.getState().card,null);assert.equal(useWorldStore.getState().paused,false);
  handleWorldEscape();assert.equal(useWorldStore.getState().paused,true);
  handleWorldEscape();assert.equal(useWorldStore.getState().paused,false);
  assert.equal(handReleases,1);assert.equal(propReleases,1);
});

test('recovery releases mounted activities before publishing the request, even with no physics frame',()=>{
  let released=0,handReleased=0,observed=0;
  startCampPropInteraction({id:'camp-tool',anchor:[0,1,0],release(){released++;}});
  Object.assign(guideActionHand,{owner:'cave-lamp',target:[.5,1,0],cancel:()=>handReleased++});
  useWorldStore.setState({factoryStation:'raw',clubMode:'dance',paused:true});
  Object.assign(factoryControl.input,{x:1,z:1,held:true,confirm:true});
  const before=useWorldStore.getState().campReturnRequest;
  const unsubscribe=useWorldStore.subscribe((s,p)=>{
    if(s.campReturnRequest===p.campReturnRequest)return;
    observed++;assert.equal(s.factoryStation,null);assert.equal(s.clubMode,null);
    assert.equal(currentCampPropInteraction(),null);assert.equal(guideActionHand.owner,null);
    assert.deepEqual(factoryControl.input,{x:0,z:0,held:false,confirm:false});
  });
  try {
    requestCampReturn();assert.equal(observed,1);assert.equal(released,1);assert.equal(handReleased,1);
    assert.equal(useWorldStore.getState().campReturnRequest,before+1);
    // Physical recovery may notify again; item release remains exactly once.
    actorActivities.interrupt('recovery');assert.equal(released,1);
    assert.equal(useWorldStore.getState().paused,true,'only actual relocation resumes the world');
  } finally {unsubscribe();}
});

test('paused UI closes without silently discarding its underlying card',()=>{
  useWorldStore.setState({paused:true,card:{kind:'note',id:'qa'}});
  handleWorldEscape();assert.equal(useWorldStore.getState().paused,false);assert.ok(useWorldStore.getState().card);
  handleWorldEscape();assert.equal(useWorldStore.getState().card,null);
});

test('the built global store imports only generic contracts, not a venue or its physics',async()=>{
  const result=await build({entryPoints:[new URL('./store.ts',import.meta.url).pathname],
    bundle:true,write:false,format:'esm',packages:'external',metafile:true,logLevel:'silent'});
  const inputs=Object.keys(result.metafile.inputs);
  assert.ok(inputs.some(p=>p.endsWith('/actor-activities.ts')));
  assert.deepEqual(inputs.filter(p=>/(?:\/attractions\/|\/alpha-island\/|\/factory\/|\/alpha-(?:mine|exchange)|\/camp-prop-|actor-physics|WorldLandform|\/layout\.ts)/.test(p)),[]);
});
