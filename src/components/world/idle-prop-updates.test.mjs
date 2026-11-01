import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { Group, Matrix4, Mesh, Vector3 } from 'three';
import { IBD_PACK_INSPECTION, IBD_PACK_SLOTS, ibdPackInspectAnchors, ibdPackTransferPose } from './attractions/ibd-pack-layout.ts';
import { EXCHANGE_PLAY_PROPS as P, EXCHANGE_PLAY_STATIONS as S } from './alpha-exchange-play-layout.ts';
import { exchangeWorld } from './alpha-exchange-layout.ts';

// Execute the actual production frame callbacks and cache initializers against
// real Three objects. No React/GL/browser mount, geometry build or fake timings.
function sourceParts(path) {
  const js = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const file = ts.createSourceFile(path, js, ts.ScriptTarget.Latest, true), variables = new Map(), frames = [];
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.initializer) variables.set(node.name.getText(file), node.initializer.getText(file));
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'useFrame') frames.push(node.arguments[0].getText(file));
    ts.forEachChild(node, visit);
  };
  visit(file); assert.equal(frames.length, 1);
  const bind = (expression, env) => new Function(...Object.keys(env), `return (${expression});`)(...Object.values(env));
  return { variable: (name, env) => bind(variables.get(name), env), frame: env => bind(frames[0], env) };
}
const ibdSource = sourceParts('./attractions/WorldIbdPackInspection.tsx');
const alphaSource = sourceParts('./WorldAlphaExchangePlay.tsx');
const ref = current => ({ current });
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);

function ibdRig(slot, shared) {
  const parent = new Group(), root = ref(new Group()), mechanism = ref(new Group()), carrier = ref(new Group()), carried = ref(new Mesh());
  parent.add(root.current); root.current.add(mechanism.current); mechanism.current.add(carrier.current); carrier.current.add(carried.current);
  const pockets = ref(IBD_PACK_SLOTS.map(() => new Mesh())); pockets.current.forEach(m=>root.current.add(m));
  const fixed=ref(new Mesh()), jaw=ref(new Mesh()), mast=ref(new Mesh()), boom=ref(new Mesh()), tether=ref(new Mesh());
  mechanism.current.add(fixed.current,jaw.current,mast.current,boom.current,tether.current);
  let parts = { slots: IBD_PACK_SLOTS.map(s=>({...s,occupied:true})) }, poseCalls=0, anchorCalls=0, writes=0;
  const set = carrier.current.position.set;
  carrier.current.position.set = function(...args) { writes++; return set.apply(this,args); };
  const previous = ibdSource.variable('previous', { useRef:ref, Matrix4, parts });
  const scratch = { a:new Vector3(),b:new Vector3(),up:new Vector3(0,1,0) };
  const rod = ibdSource.variable('rod', {scratch});
  const item={id:slot,specId:'M8'};
  const env=()=>({root,mechanism,carrier,carried,pockets,fixed,jaw,mast,boom,tether,previous,scratch,rod,parts,item,slot,
    IBD_PACK_INSPECTION, Matrix4, ibdPackVisual:shared.visual,ibdInspectionBody:shared.body,ibdInspectionHands:shared.hands,
    useIbdYardStore:{getState:()=>({game:shared.game})},
    ibdPackTransferPose(...args){poseCalls++;return ibdPackTransferPose(...args);},
    ibdPackInspectAnchors(...args){anchorCalls++;return ibdPackInspectAnchors(...args);}});
  let callback=ibdSource.frame(env());
  return {root,parent,mechanism,carrier,carried,pockets,previous,
    frame(){ callback(); parent.updateMatrixWorld(true); shared.hands.left.updateMatrixWorld(true); },
    replaceParts(){parts={slots:parts.slots.map(s=>({...s,occupied:s.index!==3}))};callback=ibdSource.frame(env());},
    counts:()=>({poseCalls,anchorCalls,writes})};
}
function ibdState() { return {visual:{pack:'parts-a',index:0,progress:1,jaw:.54},body:{carried:null},hands:{left:new Group()},
  game:{core:{opened:['parts-a','parts-b','stock-a','stock-b'],loaded:[]},pending:null,packInspections:{}}}; }

test('an existing dev rig upgrades its retained pre-cache ref on the first frame',()=>{
  const rig=ibdRig('parts-a',ibdState());delete rig.previous.current.world;
  rig.frame();assert.ok(rig.previous.current.world instanceof Matrix4);
  assert.equal(rig.counts().writes,1);rig.frame();assert.equal(rig.counts().writes,1);
});

test('120 changing jaw frames update only the owning rig, with actual pose/anchor/setter counts',()=>{
  const s=ibdState(), rigs=['parts-a','parts-b','stock-a','stock-b'].map(slot=>ibdRig(slot,s));
  rigs.forEach(r=>r.frame());
  for(let i=1;i<=120;i++){s.visual.jaw=.54-.08*i/120;rigs.forEach(r=>r.frame());}
  assert.deepEqual(rigs[0].counts(),{poseCalls:121,anchorCalls:121,writes:121});
  for(const r of rigs.slice(1))assert.deepEqual(r.counts(),{poseCalls:1,anchorCalls:1,writes:1});
  s.visual.index=1;rigs.forEach(r=>r.frame());
  assert.equal(rigs[0].counts().writes,122);
  for(const r of rigs.slice(1))assert.equal(r.counts().writes,1);
});

test('ownership exit returns a palm-held sample once and restores all occupied pockets',()=>{
  const s=ibdState(),r=ibdRig('parts-a',s);s.body.carried='sample';s.game.packInspections['parts-a']={held:0};
  r.frame();assert.equal(r.carried.current.parent,s.hands.left);assert.equal(r.pockets.current[0].visible,false);
  s.visual.pack='parts-b';r.frame();
  assert.equal(r.carried.current.parent,r.carrier.current);assert.equal(r.carried.current.visible,false);
  assert.equal(r.mechanism.current.visible,false);assert.ok(r.pockets.current.every(p=>p.visible));
  const count=r.counts();for(let i=0;i<60;i++){s.visual.jaw=.3+i*.001;r.frame();}assert.deepEqual(r.counts(),count);
});

test('idle crate flushes opening/loading, parent identity/transform, reparenting and resource replacement once',()=>{
  const s=ibdState(),r=ibdRig('stock-a',s);r.frame();
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
  once(()=>r.replaceParts());assert.equal(r.pockets.current[3].visible,false);
  once(()=>{s.visual.pack='stock-a';s.visual.progress=1;s.visual.index=1;});
  assert.equal(r.pockets.current[1].visible,false);
});

function alphaRig() {
  const world={paused:false,card:null,shot:null,poolInspect:false},document={hidden:false};
  const live={round:null,ticketReturned:false},exchangeBody={action:null,carried:null};
  const nodes=Object.fromEntries(['stamp','slider','ticket','receipt','bell','pull','rope'].map(k=>[k,ref(new Mesh())]));
  let writes=0;const set=nodes.slider.current.position.set;
  nodes.slider.current.position.set=function(...args){writes++;return set.apply(this,args);};
  const previous=alphaSource.variable('previous',{useRef:ref});
  const sliderStart=alphaSource.variable('sliderStart',{useRef:ref});
  const detent=alphaSource.variable('detent',{S});
  const callback=alphaSource.frame({...nodes,previous,sliderStart,detent,P,exchangeWorld,exchangeBody,document,
    useWorldStore:{getState:()=>world},useExchangePlay:{getState:()=>live}});
  return {world,document,live,body:exchangeBody,nodes,frame:callback,count:()=>writes};
}

test('Alpha idle/away frames perform one initial update; ticket and receipt state changes flush exactly once',()=>{
  const f=alphaRig();for(let i=0;i<600;i++)f.frame();assert.equal(f.count(),1);
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

test('Alpha adjust/ring/collect retain interpolation and completion/cancel applies the resting pose once',()=>{
  const f=alphaRig();f.live.round={phase:'selecting',targetUnits:0};f.frame();
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

test('Alpha pause/hidden/card/shot/pool and missing refs preserve one final sync on return',()=>{
  const f=alphaRig();f.frame();
  for(const [state,key,value]of [[f.world,'paused',true],[f.document,'hidden',true],[f.world,'card',{}],[f.world,'shot','view'],[f.world,'poolInspect',true]]){
    const before=f.count(),old=state[key];state[key]=value;for(let i=0;i<20;i++)f.frame();assert.equal(f.count(),before);
    f.live.round={phase:'complete',targetUnits:40};f.body.carried='receipt';
    state[key]=old;f.frame();assert.equal(f.count(),before+1);assert.equal(f.nodes.receipt.current.visible,false);
    f.frame();assert.equal(f.count(),before+1);
  }
  const before=f.count(),stamp=f.nodes.stamp.current;f.nodes.stamp.current=null;f.frame();assert.equal(f.count(),before);
  f.nodes.stamp.current=stamp;f.frame();assert.equal(f.count(),before+1);f.frame();assert.equal(f.count(),before+1);
});
