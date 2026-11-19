import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import * as THREE from 'three';
import { Group, Matrix4 } from 'three';
import { compileWorldComponent } from '../../../tools/world/alpha-mine-tests/component-host.mjs';
import { mountFrameScene } from '../../../tools/world/alpha-mine-tests/frame-host.mjs';
import * as packLayout from './attractions/ibd-pack-layout.ts';
import * as packGeometry from './attractions/ibd-pack-geometry.ts';
import { EXCHANGE_PLAY_PROPS as P, EXCHANGE_PLAY_STATIONS as S } from './alpha-exchange-play-layout.ts';
import { exchangeWorld } from './alpha-exchange-layout.ts';
import { exchangeChamferBox } from './alpha-exchange-craft.ts';

const ibdComponent=compileWorldComponent(new URL('./attractions/WorldIbdPackInspection.tsx',import.meta.url));
const alphaComponent=compileWorldComponent(new URL('./WorldAlphaExchangePlay.tsx',import.meta.url));
const ref=current=>({current});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
function countPositionWrites(node) {
  let writes=0;
  const set=node.position.set;
  node.position.set=function(...args){writes++;return set.apply(this,args);};
  return ()=>writes;
}

async function ibdRig(t,slot,shared) {
  let previous,poseCalls=0,anchorCalls=0;
  const components=ibdComponent({
    react:{...React,useRef:value=>{
      const actual=React.useRef(value);
      if(value?.world?.isMatrix4)previous=actual;
      return actual;
    }},
    three:THREE, './ibd-pack-geometry':packGeometry,
    './ibd-pack-layout':{...packLayout,
      ibdPackTransferPose(...args){poseCalls++;return packLayout.ibdPackTransferPose(...args);},
      ibdPackInspectAnchors(...args){anchorCalls++;return packLayout.ibdPackInspectAnchors(...args);}},
    './ibd-pack-play':{ibdPackVisual:shared.visual}, './ibd-inspection-hands':{ibdInspectionHands:shared.hands},
    './ibd-inspection-motion':{ibdInspectionBody:shared.body}, './ibd-yard-store':{useIbdYardStore:{getState:()=>({game:shared.game})}},
  });
  const props={slot,item:{id:slot,specId:'M8',quantity:4},material:new THREE.MeshStandardMaterial()};
  t.after(()=>props.material.dispose());
  const host=await mountFrameScene(t,components.default,props);
  const root=host.scene.getObjectByName('ibd-inspection-'+slot);
  const mechanism=root.children.find(node=>node.isGroup);
  const carrier=mechanism.children.find(node=>node.isGroup);
  const carried=carrier.children.find(node=>!node.visible);
  assert.ok(carried);
  const writes=countPositionWrites(carrier);
  return {root:ref(root),parent:host.scene,mechanism:ref(mechanism),carrier:ref(carrier),carried:ref(carried),
    pockets:ref(root.children.filter(node=>node.isMesh)),previous,
    frame(){host.frame();shared.hands.left.updateMatrixWorld(true);},
    replaceParts(){return host.render({...props,item:{...props.item,quantity:3}});},
    counts:()=>({poseCalls,anchorCalls,writes:writes()})};
}
function ibdState() { return {visual:{pack:'parts-a',index:0,progress:1,jaw:.54},body:{carried:null},hands:{left:new Group()},
  game:{core:{opened:['parts-a','parts-b','stock-a','stock-b'],loaded:[]},pending:null,packInspections:{}}}; }

test('an existing dev rig upgrades its retained pre-cache ref on the first frame',async t=>{
  const rig=await ibdRig(t,'parts-a',ibdState());delete rig.previous.current.world;
  rig.frame();assert.ok(rig.previous.current.world instanceof Matrix4);
  assert.equal(rig.counts().writes,1);rig.frame();assert.equal(rig.counts().writes,1);
});

test('120 changing jaw frames update only the owning rig, with actual pose/anchor/setter counts',async t=>{
  const s=ibdState(), rigs=[];
  for(const slot of ['parts-a','parts-b','stock-a','stock-b'])rigs.push(await ibdRig(t,slot,s));
  rigs.forEach(r=>r.frame());
  for(let i=1;i<=120;i++){s.visual.jaw=.54-.08*i/120;rigs.forEach(r=>r.frame());}
  assert.deepEqual(rigs[0].counts(),{poseCalls:121,anchorCalls:121,writes:121});
  for(const r of rigs.slice(1))assert.deepEqual(r.counts(),{poseCalls:1,anchorCalls:1,writes:1});
  s.visual.index=1;rigs.forEach(r=>r.frame());
  assert.equal(rigs[0].counts().writes,122);
  for(const r of rigs.slice(1))assert.equal(r.counts().writes,1);
});

test('ownership exit returns a palm-held sample once and restores all occupied pockets',async t=>{
  const s=ibdState(),r=await ibdRig(t,'parts-a',s);s.body.carried='sample';s.game.packInspections['parts-a']={held:0};
  r.frame();assert.equal(r.carried.current.parent,s.hands.left);assert.equal(r.pockets.current[0].visible,false);
  s.visual.pack='parts-b';r.frame();
  assert.equal(r.carried.current.parent,r.carrier.current);assert.equal(r.carried.current.visible,false);
  assert.equal(r.mechanism.current.visible,false);assert.ok(r.pockets.current.every(p=>p.visible));
  const count=r.counts();for(let i=0;i<60;i++){s.visual.jaw=.3+i*.001;r.frame();}assert.deepEqual(r.counts(),count);
});

test('idle crate flushes opening/loading, parent identity/transform, reparenting and resource replacement once',async t=>{
  const s=ibdState(),r=await ibdRig(t,'stock-a',s);r.frame();
  const once=change=>{const n=r.counts().writes;change();r.frame();assert.equal(r.counts().writes,n+1);r.frame();assert.equal(r.counts().writes,n+1);};
  once(()=>{s.game.core.opened=[];});
  once(()=>{s.game.core.opened=['stock-a'];});
  once(()=>{s.game.core.loaded=['stock-a'];});
  once(()=>{const parent=new Group();r.parent.add(parent);parent.add(r.root.current);});
  // Model the renderer's completed world-matrix traversal. No extra traversal
  // is introduced by the production dirty check; the crate inherits movement.
  once(()=>{r.parent.position.set(7,2,1);r.parent.rotation.y=.4;r.parent.updateMatrixWorld(true);});
  once(()=>{s.hands.left.add(r.carried.current);});
  assert.equal(r.carried.current.parent,r.carrier.current);
  const count=r.counts().writes;await r.replaceParts();r.frame();assert.equal(r.counts().writes,count+1);r.frame();assert.equal(r.counts().writes,count+1);
  assert.equal(r.pockets.current[3].visible,false);
  once(()=>{s.visual.pack='stock-a';s.visual.progress=1;s.visual.index=1;});
  assert.equal(r.pockets.current[1].visible,false);
});

async function alphaRig(t) {
  const world={paused:false,card:null,shot:null,poolInspect:false}, document={hidden:false};
  const live={round:null,ticketReturned:false},body={action:null,carried:null},refs=new Set();
  const useExchangePlay=Object.assign(()=>live,{getState:()=>live});
  const {default:Component}=alphaComponent({
    react:{...React,useRef:value=>{const result=React.useRef(value);refs.add(result);return result;}},
    three:THREE,'./WorldInteract':{useInteractable(){}},'./store':{useWorldStore:{getState:()=>world}},
    './WorldAlphaArchiveTickets':()=>null,'./alpha-exchange-audio':{exchangeActionAudio:{mount(){return ()=>{};}}},
    './alpha-exchange-craft':{exchangeChamferBox},'./alpha-exchange-layout':{exchangeWorld},
    './alpha-exchange-play-layout':{EXCHANGE_PLAY_PROPS:P,EXCHANGE_PLAY_STATIONS:S},
    './alpha-exchange-motion':{exchangeBody:body},'./alpha-exchange-play':{useExchangePlay},
  },document);
  const material=new THREE.MeshStandardMaterial();
  t.after(()=>material.dispose());
  const host=await mountFrameScene(t,Component,{brass:material,paperFace:material});
  const names={stamp:'clearing-stamp',slider:'position-grip',ticket:'archive-ticket',receipt:'clearing-receipt',
    bell:'opening-bell',pull:'bell-pull',rope:'bell-cord'};
  const nodes=Object.fromEntries(Object.entries(names).map(([id,name])=>{
    const object=host.scene.getObjectByName('exchange-'+name);
    const owned=[...refs].find(r=>r.current===object);
    assert.ok(object&&owned,id);return [id,owned];
  }));
  return {world,document,live,body,nodes,frame:host.frame,count:countPositionWrites(nodes.slider.current)};
}

test('Alpha idle/away frames perform one initial update; ticket and receipt state changes flush exactly once',async t=>{
  const f=await alphaRig(t);for(let i=0;i<600;i++)f.frame();assert.equal(f.count(),1);
  assert.equal(f.nodes.ticket.current.visible,true);assert.equal(!!f.nodes.receipt.current.visible,false);
  const once=change=>{const n=f.count();change();f.frame();assert.equal(f.count(),n+1);f.frame();assert.equal(f.count(),n+1);};
  once(()=>{f.live.round={phase:'ticket',targetUnits:0};f.body.carried='ticket';});assert.equal(f.nodes.ticket.current.visible,false);
  once(()=>{f.live.ticketReturned=true;});assert.equal(f.nodes.ticket.current.visible,true);
  once(()=>{f.live.ticketReturned=false;f.live.round={phase:'selecting',targetUnits:30};f.body.carried=null;});
  near(f.nodes.slider.current.position.x,S.desk.slideStart[0]+(S.desk.slideEnd[0]-S.desk.slideStart[0])*.6);
  once(()=>{f.live.round.phase='clearing';});assert.equal(f.nodes.receipt.current.visible,true);
  once(()=>{f.live.round.phase='complete';f.body.carried='receipt';});assert.equal(f.nodes.receipt.current.visible,false);
  once(()=>{f.body.carried=null;});assert.equal(f.nodes.receipt.current.visible,true);
  once(()=>{f.live.round=null;});assert.equal(!!f.nodes.receipt.current.visible,false);
});

test('Alpha adjust/ring/collect retain interpolation and completion/cancel applies the resting pose once',async t=>{
  const f=await alphaRig(t);f.live.round={phase:'selecting',targetUnits:0};f.frame();
  for(const kind of ['adjust','ring','collect']){
    const a={id:1,kind,phase:'perform',elapsed:0,contactAt:1,duration:2,committed:true,anchor:{target:exchangeWorld(S.desk.slideEnd)}};
    f.body.action=a;const count=f.count();
    for(let i=1;i<=30;i++){a.elapsed=(kind==='ring'?1:0)+i/50;f.frame();}assert.equal(f.count(),count+30);
    if(kind==='adjust')assert.ok(f.nodes.slider.current.position.x>S.desk.slideStart[0]);
    if(kind==='ring')assert.notEqual(f.nodes.bell.current.rotation.z,0);
    // Finishing or cancellation removes the action while round can stay equal.
    f.body.action=null;f.frame();assert.equal(f.count(),count+31);f.frame();assert.equal(f.count(),count+31);
    near(f.nodes.slider.current.position.x,S.desk.slideStart[0]);near(f.nodes.stamp.current.position.y,P.clearing.stampRest[1]);
    near(f.nodes.bell.current.rotation.z,0);near(f.nodes.pull.current.position.y,P.bell.pullRest[1]);
    near(f.nodes.rope.current.scale.y,P.bell.clapperPivot[1]-P.bell.pullRest[1]);
  }
});

test('Alpha pause/hidden/card/shot/pool and missing refs preserve one final sync on return',async t=>{
  const f=await alphaRig(t);f.frame();
  for(const [state,key,value]of [[f.world,'paused',true],[f.document,'hidden',true],[f.world,'card',{}],[f.world,'shot','view'],[f.world,'poolInspect',true]]){
    const before=f.count(),old=state[key];state[key]=value;for(let i=0;i<20;i++)f.frame();assert.equal(f.count(),before);
    f.live.round={phase:'complete',targetUnits:40};f.body.carried='receipt';
    state[key]=old;f.frame();assert.equal(f.count(),before+1);assert.equal(f.nodes.receipt.current.visible,false);
    f.frame();assert.equal(f.count(),before+1);
  }
  const before=f.count(),stamp=f.nodes.stamp.current;f.nodes.stamp.current=null;f.frame();assert.equal(f.count(),before);
  f.nodes.stamp.current=stamp;f.frame();assert.equal(f.count(),before+1);f.frame();assert.equal(f.count(),before+1);
});
