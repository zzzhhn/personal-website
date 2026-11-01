import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import ts from 'typescript';
import {DataTexture,RGBAFormat,UnsignedByteType} from 'three';
import {createTrampleUploads,TRAMPLE_UPLOAD_MAX_ROWS,TRAMPLE_UPLOAD_FULL_FRACTION} from './grass-trample-uploads.ts';

const WIDTH=65,HEIGHT=49,MIN_X=-8,MIN_Z=-6,CELL=.5;
const initial=(width=WIDTH,height=HEIGHT)=>{
 const data=new Uint8Array(width*height*4);
 for(let i=0;i<data.length;i+=4){data[i+1]=128;data[i+2]=128;}
 return data;
};
function fixture(t){
 const data=initial(),texture=new DataTexture(data,WIDTH,HEIGHT,RGBAFormat,UnsignedByteType);
 const uploads=createTrampleUploads(texture,data,WIDTH,HEIGHT);
 t.after(()=>{uploads.dispose();texture.dispose();});
 return {data,texture,uploads};
}
/** Software reconstruction of Three's upload ranges/onUpdate, not a WebGL context. */
function gpu(texture){
 const out={data:new Uint8Array(texture.image.data.length),version:-1,bytes:0,uploads:0,calls:0,partialRows:0,maxPartialRows:0,fullUploads:0};
 out.consume=()=>{
  if(out.version===texture.version)return 0;
  const ranges=texture.updateRanges.length?texture.updateRanges:[{start:0,count:out.data.length}];
  if(texture.updateRanges.length){out.partialRows+=ranges.length;out.maxPartialRows=Math.max(out.maxPartialRows,ranges.length);}
  else out.fullUploads++;
  out.calls+=ranges.length;
  let bytes=0;
  for(const {start,count} of ranges){out.data.set(texture.image.data.subarray(start,start+count),start);bytes+=count;}
  // Match Three: ranges clear before onUpdate, which is the acknowledgement boundary.
  texture.clearUpdateRanges();texture.onUpdate?.(texture);out.version=texture.version;
  out.bytes+=bytes;out.uploads++;return bytes;
 };
 return out;
}
const offset=(x,z,component=0)=>(z*WIDTH+x)*4+component;
function boundedRanges(texture){
 const {width,height}=texture.image;
 assert.ok(texture.updateRanges.length<=height);
 const rows=new Set();
 for(const r of texture.updateRanges){
  assert.equal(r.start%4,0);assert.equal(r.count%4,0);
  assert.ok(r.start>=0&&r.count>0&&r.start+r.count<=width*height*4);
  const row=Math.floor(r.start/(width*4));assert.equal(row,Math.floor((r.start+r.count-1)/(width*4)));
  assert.ok(!rows.has(row),'one pending range per row');rows.add(row);
 }
}

// Exercise WorldGrass's real frame callback without a renderer, React mount or Rapier world.
const moduleUrl=source=>'data:text/javascript,'+encodeURIComponent(source);
const harnessUrl=moduleUrl('export const harness={current:null};');
const {harness}=await import(harnessUrl);
const controls=`import {harness} from ${JSON.stringify(harnessUrl)};`;
const stubs={
 react:moduleUrl(controls+`export const useRef=v=>({current:v}),useMemo=f=>f(),useEffect=f=>{harness.current.effects.push(f);const stop=f();if(stop)harness.current.cleanups.push(stop);};`),
 'react/jsx-runtime':moduleUrl('export const jsx=(type,props)=>({type,props});export const jsxs=jsx;'),
 '@react-three/fiber':moduleUrl(controls+`export const useFrame=f=>harness.current.frames.push(f),useThree=()=>harness.current.three;`),
 '@react-three/rapier':moduleUrl('export const useRapier=()=>{};'),
 './layout':moduleUrl("export const VEHICLES=[{id:'testcar',size:[4,1.4,2]}];"),
 './store':moduleUrl(controls+'export const useWorldStore={getState:()=>harness.current.store};'),
 './WorldWind':moduleUrl('export const windUniforms={uWindTime:{value:0},uWindStrength:{value:1}};'),
 './WorldLandform':moduleUrl('export const GRID={nx:472,nz:560,minX:-152,minZ:-160};'),
};
const grassUrl=new URL('./WorldGrass.tsx',import.meta.url).href;
const hook=registerHooks({resolve(specifier,context,next){
 if(context.parentURL===grassUrl){
  if(stubs[specifier])return {url:stubs[specifier],shortCircuit:true};
  if(specifier==='./alpha-mine-flora')return next(new URL('./alpha-mine-flora.ts',import.meta.url).href,context);
 }
 return next(specifier,context);
},load(url,context,next){
 if(url===grassUrl)return {format:'module',shortCircuit:true,source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX},
 }).outputText};
 return next(url,context);
}});
const {default:WorldGrass,actorState}=await import('./WorldGrass.tsx');
const {windUniforms}=await import(stubs['./WorldWind']);
hook.deregister();
function mounted(t){
 const events=new EventTarget();
 const h={effects:[],cleanups:[],frames:[],store:{quality:'high',shot:null,position:[0,0,0]},three:{scene:{},gl:{domElement:events}}};
 harness.current=h;windUniforms.uWindTime.value=0;actorState.actors=[];actorState.active=null;
 const element=WorldGrass({data:new Float32Array()});
 const shader={uniforms:{},vertexShader:'',fragmentShader:''};element.props.args[1].onBeforeCompile(shader,null);
 const texture=shader.uniforms.uTrample.value;
 t.after(()=>{h.cleanups.reverse().forEach(stop=>stop());actorState.actors=[];actorState.active=null;});
 return {h,events,texture,uniforms:shader.uniforms,frame(time,actors=[]){
  harness.current=h;windUniforms.uWindTime.value=time;actorState.actors=actors;actorState.active=actors.find(a=>a.active)??null;
  for(const f of h.frames)f({camera:{position:{x:0,y:0,z:0}}});
 }};
}
const player=(x,z,bottom=0)=>({kind:'player',id:'player',x,y:bottom+.85,z,bottom,radius:.45,active:true,speed:0});
const car=(x,z)=>({kind:'vehicle',id:'testcar',x,y:1.7,z,bottom:0,radius:1.35,active:false,speed:0,axle:[x+1.44,z,x-1.44,z]});

test('initial upload stays full even after multiple unseen frames of edits',t=>{
 const {data,texture,uploads}=fixture(t),g=gpu(texture);
 uploads.write(offset(3,4,1),19);uploads.flush();uploads.write(offset(50,38,3),211);uploads.flush();
 assert.equal(texture.updateRanges.length,0);assert.equal(g.consume(),data.length);assert.deepEqual(g.data,data);
 uploads.write(offset(4,5),120);uploads.flush();assert.equal(g.consume(),4);assert.deepEqual(g.data,data);
});

test('pending RGBA changes union by row until acknowledged and do not grow per frame',t=>{
 const {data,texture,uploads}=fixture(t),g=gpu(texture);g.consume();
 uploads.write(offset(3,2,1),37);uploads.write(offset(3,2,2),54);uploads.flush();
 uploads.write(offset(8,2,3),201);uploads.write(offset(14,9),255);uploads.flush();
 assert.deepEqual(texture.updateRanges.map(r=>({...r})).sort((a,b)=>a.start-b.start),[
  {start:offset(3,2),count:6*4},{start:offset(14,9),count:4},
 ]);boundedRanges(texture);
 const version=texture.version;for(let i=0;i<200;i++)uploads.flush();assert.equal(texture.version,version);
 assert.equal(g.consume(),28);assert.deepEqual(g.data,data);
 uploads.write(offset(40,30),12);uploads.flush();assert.equal(texture.updateRanges.length,1);
 assert.equal(texture.updateRanges[0].start,offset(40,30));g.consume();assert.deepEqual(g.data,data);
});

test('unchanged quantized bytes do not request an upload',t=>{
 const {texture,uploads}=fixture(t),g=gpu(texture);g.consume();const version=texture.version;
 for(let i=0;i<60;i++){uploads.write(offset(3,2),0);uploads.write(offset(3,2,1),128);uploads.flush();assert.equal(g.consume(),0);}
 assert.equal(texture.version,version);assert.equal(texture.updateRanges.length,0);
});

test('direction, height and final decay-to-zero are uploaded with all RGBA bytes intact',t=>{
 const {data,texture,uploads}=fixture(t),g=gpu(texture);g.consume();const at=offset(5,6);
 for(const [channel,value] of [[0,255],[1,29],[2,230],[3,198]])uploads.write(at+channel,value);
 uploads.flush();g.consume();assert.deepEqual(Array.from(g.data.slice(at,at+4)),[255,29,230,198]);
 uploads.write(at,0);uploads.flush();assert.equal(g.consume(),4);
 assert.deepEqual(Array.from(g.data.slice(at,at+4)),[0,29,230,198]);assert.deepEqual(g.data,data);
});

test('sparse row call limit falls back to one full upload and stays full until consumed',t=>{
 const {data,texture,uploads}=fixture(t),g=gpu(texture);g.consume();
 for(let row=0;row<TRAMPLE_UPLOAD_MAX_ROWS;row++)uploads.write(offset(2,row),100);
 uploads.flush();assert.equal(texture.updateRanges.length,TRAMPLE_UPLOAD_MAX_ROWS);boundedRanges(texture);
 uploads.write(offset(2,TRAMPLE_UPLOAD_MAX_ROWS),100);uploads.flush();assert.equal(texture.updateRanges.length,0);
 uploads.write(offset(4,2,3),200);uploads.flush();assert.equal(texture.updateRanges.length,0);
 const calls=g.calls;assert.equal(g.consume(),data.length);assert.equal(g.calls-calls,1);assert.deepEqual(g.data,data);
});

test('broad coverage falls back before the row call limit, without splitting rows',t=>{
 const {data,texture,uploads}=fixture(t),g=gpu(texture);g.consume();
 const rows=Math.ceil(HEIGHT*TRAMPLE_UPLOAD_FULL_FRACTION);assert.ok(rows<=TRAMPLE_UPLOAD_MAX_ROWS);
 for(let row=0;row<rows;row++){uploads.write(offset(0,row),100);uploads.write(offset(WIDTH-1,row),100);}
 uploads.flush();assert.equal(texture.updateRanges.length,0);assert.equal(g.consume(),data.length);assert.deepEqual(g.data,data);
});

test('long offscreen edits retain bounded pending ranges and catch up exactly once',t=>{
 const {data,texture,uploads}=fixture(t),g=gpu(texture);g.consume();const before=g.uploads;
 for(let i=0;i<600;i++){
  uploads.write(offset(i%WIDTH,Math.floor(i/WIDTH)%HEIGHT,i%4),i);uploads.flush();boundedRanges(texture);
  assert.ok(texture.updateRanges.length<=TRAMPLE_UPLOAD_MAX_ROWS);
 }
 g.consume();assert.equal(g.uploads,before+1);assert.deepEqual(g.data,data);assert.equal(g.consume(),0);
});

test('reset requests full data again, including pending changes, and disposal restores callbacks',t=>{
 const data=initial(),texture=new DataTexture(data,WIDTH,HEIGHT,RGBAFormat,UnsignedByteType);let acknowledgements=0;
 const previous=()=>acknowledgements++;texture.onUpdate=previous;
 const uploads=createTrampleUploads(texture,data,WIDTH,HEIGHT),g=gpu(texture);g.consume();
 uploads.write(offset(5,6),111);uploads.flush();uploads.reset();assert.equal(texture.updateRanges.length,0);
 uploads.write(offset(40,30,2),87);uploads.flush();assert.equal(g.consume(),data.length);assert.deepEqual(g.data,data);
 assert.equal(acknowledgements,2);uploads.dispose();uploads.dispose();assert.equal(texture.onUpdate,previous);
 const version=texture.version;uploads.write(0,42);uploads.flush();uploads.reset();assert.equal(texture.version,version);texture.dispose();
});

test('byte conversion matches the original Uint8Array assignment',t=>{
 const {data,texture,uploads}=fixture(t),g=gpu(texture);g.consume();const expected=initial();
 for(const [i,value] of [-1,257,2.8,NaN,Infinity,-258].entries()){expected[i]=value;uploads.write(i,value);}
 uploads.flush();assert.deepEqual(data,expected);g.consume();assert.deepEqual(g.data,data);
});

// Frozen legacy equations from the pre-fix frame path. Only the upload strategy differs.
function legacy(){
 const width=473,height=561,minX=-152,minZ=-160,data=initial(width,height),amount=new Float32Array(width*height),active=new Set();
 let lastTime=-1,fullRequests=0;
 const stamp=(x,z,radius,strength,ground)=>{
  const r=Math.ceil(radius/CELL),cx=Math.round((x-minX)/CELL),cz=Math.round((z-minZ)/CELL);
  for(let j=-r;j<=r;j++)for(let i=-r;i<=r;i++){
   const wx=minX+(cx+i)*CELL-x,wz=minZ+(cz+j)*CELL-z,l=Math.hypot(wx,wz);if(l>radius)continue;
   const k=strength*Math.min(1,1.6*(1-l/radius)),ti=cz+j,tj=cx+i;
   if(ti<0||ti>=height||tj<0||tj>=width)continue;const idx=ti*width+tj;if(k<=amount[idx])continue;
   amount[idx]=k;const o=idx*4;
   data[o+1]=Math.round((wx/Math.max(l,1e-3)*.5+.5)*255);
   data[o+2]=Math.round((wz/Math.max(l,1e-3)*.5+.5)*255);
   data[o+3]=Math.round(Math.max(0,Math.min(1,(ground+8)/32))*255);active.add(idx);
  }
 };
 return {data,get fullRequests(){return fullRequests;},step(time,actors){
  const dt=lastTime<0?0:Math.max(0,Math.min(.1,time-lastTime));lastTime=time;if(!dt)return;
  const focus=actors.find(a=>a.active),fx=focus?.x??0,fz=focus?.z??0,push=[];
  for(const a of actors){
   if(Math.hypot(a.x-fx,a.z-fz)>40)continue;
   if(a.kind==='player'&&push.length<8)push.push([a.x,a.z,.6,1,a.bottom]);
   else if(a.kind==='vehicle'){
    const foot=a.y-(1.4*.28+.42+Math.min(.5,Math.max(.34,1.4*.28)));
    for(let k=0;k<2&&push.length<8;k++)push.push([a.axle[k*2],a.axle[k*2+1],a.radius,1,foot]);
   }
  }
  for(const [x,z,r,,ground] of push)stamp(x,z,r*.9,.95,ground);
  const dirty=active.size>0;
  for(const idx of active){
   const v=amount[idx]-.2*dt;
   if(v<=0){amount[idx]=0;data[idx*4]=0;active.delete(idx);continue;}
   amount[idx]=v;data[idx*4]=Math.round(Math.min(1,v*1.25)**.7*255);
  }
  if(dirty)fullRequests++;
 }};
}

test('real frame path matches legacy RGBA through walking, height changes, multiple actors and full recovery',t=>{
 const world=mounted(t),ref=legacy(),g=gpu(world.texture);let time=0;
 for(let frame=0;frame<480;frame++){
  time+=frame===130?.3:frame===90?0:1/60;
  const actors=frame<80?[player(frame*.018,Math.sin(frame*.1)*.35)]:frame<120?[player(1.4,0,3)]:frame<155?
   [player(1.4,0),car(-5,6),car(7,-5),car(80,80)]:[];
  world.h.store.quality=frame<200?'high':'balanced';world.frame(time,actors);ref.step(time,actors);
  assert.deepEqual(world.texture.image.data,ref.data,`CPU bytes at frame ${frame}`);
  boundedRanges(world.texture);assert.ok(world.texture.updateRanges.length<=TRAMPLE_UPLOAD_MAX_ROWS);
  g.consume();assert.deepEqual(g.data,ref.data,`GPU reconstruction at frame ${frame}`);
  if(frame===110)assert.equal(world.uniforms.uPushHeight.value[0],3,'landing height remains an input, not flattened');
 }
 assert.ok(Array.from(ref.data).every((v,i)=>i%4!==0||v===0),'all bend channels eventually recover');
 const version=world.texture.version;world.frame(time+1,[]);assert.equal(world.texture.version,version);
});

test('real offscreen frames, separated wheel tracks and context restoration lose no pending bytes',t=>{
 const world=mounted(t),ref=legacy(),g=gpu(world.texture);world.frame(0);ref.step(0,[]);g.consume();
 for(let frame=1;frame<=240;frame++){
  const actors=[player(-3+frame*.012,2),car(5,-5+frame*.025),car(-6,8-frame*.018)];
  world.frame(frame/60,actors);ref.step(frame/60,actors);assert.deepEqual(world.texture.image.data,ref.data);
  boundedRanges(world.texture);assert.ok(world.texture.updateRanges.length<=TRAMPLE_UPLOAD_MAX_ROWS);
  if(frame===160){world.events.dispatchEvent(new Event('webglcontextrestored'));assert.equal(world.texture.updateRanges.length,0);}
  // Simulated offscreen until the final frame; CPU updates continue at their original frequency.
 }
 g.consume();assert.deepEqual(g.data,ref.data);assert.equal(g.consume(),0);
 const version=world.texture.version;world.events.dispatchEvent(new Event('webglcontextrestored'));
 assert.ok(world.texture.version>version);assert.equal(g.consume(),world.texture.image.data.length);assert.deepEqual(g.data,ref.data);
});

test('real stationary, walking and vehicle tracks report both bytes and bounded upload call counts',t=>{
 for(const scenario of ['stationary','walk','vehicle-slow','vehicle-fast']){
  const world=mounted(t),ref=legacy(),g=gpu(world.texture);world.frame(0);ref.step(0,[]);g.consume();
  for(let frame=1;frame<=240;frame++){
   const actors=scenario.startsWith('vehicle')?[car(0,-2+frame*(scenario==='vehicle-fast'?8/60:.025))]:[player(scenario==='walk'?frame*.025:0,0)];
   world.frame(frame/60,actors);ref.step(frame/60,actors);g.consume();assert.deepEqual(g.data,ref.data);
  }
  assert.ok(g.maxPartialRows<=TRAMPLE_UPLOAD_MAX_ROWS);
  assert.ok(g.bytes-world.texture.image.data.length<=ref.fullRequests*world.texture.image.data.length);
  t.diagnostic(JSON.stringify({scenario,frames:240,speedMps:scenario==='stationary'?0:scenario==='vehicle-fast'?8:1.5,
   legacyBytes:ref.fullRequests*world.texture.image.data.length,
   updatedBytes:g.bytes-world.texture.image.data.length,partialRows:g.partialRows,maxRowsPerUpload:g.maxPartialRows,
   fullFallbacks:g.fullUploads-1,modeledTexSubImageCalls:g.calls-1}));
 }
});

test('the real context-restoration listener is released with the grass component',t=>{
 const world=mounted(t),g=gpu(world.texture);g.consume();const before=world.texture.version;
 world.events.dispatchEvent(new Event('webglcontextrestored'));assert.ok(world.texture.version>before);
 world.h.cleanups.reverse().forEach(stop=>stop());world.h.cleanups.length=0;
 const disposed=world.texture.version;world.events.dispatchEvent(new Event('webglcontextrestored'));assert.equal(world.texture.version,disposed);
});

test('effect cleanup/setup can reuse the same memoized texture without losing its upload acknowledgement',t=>{
 const world=mounted(t),ref=legacy(),g=gpu(world.texture);world.frame(0);ref.step(0,[]);g.consume();
 world.frame(1/60,[player(0,0)]);ref.step(1/60,[player(0,0)]);g.consume();
 world.h.cleanups.reverse().forEach(stop=>stop());world.h.cleanups.length=0;
 // Simulate StrictMode's effect re-setup with the existing memoized helper/texture.
 for(const setup of world.h.effects){const stop=setup();if(stop)world.h.cleanups.push(stop);}
 assert.equal(world.texture.updateRanges.length,0);assert.equal(g.consume(),world.texture.image.data.length);
 world.frame(2/60,[player(.1,0)]);ref.step(2/60,[player(.1,0)]);g.consume();assert.deepEqual(g.data,ref.data);
 assert.equal(g.consume(),0);
});
