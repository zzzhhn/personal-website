// node --import ./tools/world/alpha-mine-tests/register.mjs --test src/components/world/club-audio.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { ClubAudio, clubGains, clubMixPlan } from './WorldClubAudio.ts';
import { useWorldStore } from './store.ts';
import { useWorldAudioSettings, setWorldAudioMuted, setWorldAudioVolume } from './world-audio-settings.ts';

class Context {
  static instances=[];
  state='suspended';currentTime=0;destination={};nodes=[];params=[];closed=false;gate=null;
  constructor(){Context.instances.push(this);}
  param(){const p={value:1,held:[],ramps:[],targets:[],setTargetAtTime(value,time){this.targets.push({value,time});},cancelScheduledValues(){},cancelAndHoldAtTime(t){this.held.push(t);},linearRampToValueAtTime(value,time){this.ramps.push({value,time});},setValueAtTime(){},setValueCurveAtTime(){}};this.params.push(p);return p;}
  createGain(){return {gain:this.param(),connect(){},disconnect(){}};}
  createBiquadFilter(){return {frequency:this.param(),connect(){},disconnect(){}};}
  createBufferSource(){const n={buffer:null,loop:false,connect(){},disconnect(){},start(){n.started=true;},stop(){n.stopped=true;}};this.nodes.push(n);return n;}
  async decodeAudioData(){return {duration:120,length:24000*120,numberOfChannels:2};}
  async resume(){if(this.gate)await this.gate;if(!this.closed)this.state='running';}
  async suspend(){this.state='suspended';}
  async close(){this.closed=true;this.state='closed';}
}
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function fixture(){
  globalThis.document=Object.assign(new EventTarget(),{hidden:false});
  globalThis.window=Object.assign(new EventTarget(),{AudioContext:Context});
  globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});
  useWorldStore.setState({paused:false,poolInspect:false,shot:null});
  useWorldAudioSettings.setState(useWorldAudioSettings.getInitialState(),true);
  const audio=new ClubAudio(),release=audio.retain();audio.proximity(0);return {audio,release};
}
test('one context, finite sources, pause/hidden/distance and BFCache preserve a bounded lifecycle',async()=>{
  const {audio,release}=fixture();await audio.enable();await settle();
  assert.equal(audio.inspect().sources,1);assert.equal(audio.inspect().buffers,2);
  audio.toggle(1);await settle();assert.equal(audio.inspect().sources,2);
  useWorldStore.setState({paused:true});await settle();assert.equal(audio.inspect().sources,0);assert.equal(audio.inspect().context,'suspended');
  useWorldStore.setState({paused:false});await settle();assert.equal(audio.inspect().sources,2);
  document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));await settle();assert.equal(audio.inspect().sources,0);
  document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));await settle();assert.equal(audio.inspect().sources,2);
  audio.proximity(100);await settle();assert.equal(audio.inspect().sources,0);audio.proximity(10);await settle();assert.equal(audio.inspect().sources,2);
  window.dispatchEvent(Object.assign(new Event('pagehide'),{persisted:true}));await settle();assert.equal(audio.inspect().sources,0);
  window.dispatchEvent(new Event('pageshow'));await settle();assert.equal(audio.inspect().sources,2);
  audio.mute();await settle();assert.equal(audio.inspect().sources,0);assert.equal(audio.energy(),0);
  release();await settle();assert.deepEqual(audio.inspect(),{phase:'off',context:'absent',sources:0,buffers:0,contextSeconds:0,transportBeats:0,decodedSeconds:[],bufferBytes:0,owners:0,timers:0});
});
test('a pending resume cannot revive audio after pause or release',async()=>{
  const {audio,release}=fixture();await audio.enable();await settle();const ctx=Context.instances.at(-1);
  useWorldStore.setState({paused:true});await settle();
  let resume;ctx.gate=new Promise(resolve=>resume=resolve);
  useWorldStore.setState({paused:false});useWorldStore.setState({paused:true});resume();await settle();
  assert.equal(audio.inspect().sources,0);assert.equal(ctx.state,'suspended');
  release();await settle();assert.equal(ctx.state,'closed');assert.ok(ctx.nodes.every(n=>!n.started||n.stopped));
});
test('release during fetch cancels loading, shared ownership does not multiply contexts',async()=>{
  const {audio,release}=fixture();const second=audio.retain();let reply;
  globalThis.fetch=()=>new Promise(resolve=>reply=resolve);
  const loading=audio.enable();const ctx=Context.instances.at(-1);release();assert.equal(audio.inspect().owners,1);
  second();reply({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});await loading;await settle();
  assert.equal(ctx.state,'closed');assert.equal(audio.inspect().buffers,0);assert.equal(audio.inspect().sources,0);
});
test('crossfade keeps equal power and inactive deck cannot become the dance clock',async()=>{
  for(const x of [0,.25,.5,.75,1]){const [a,b]=clubGains(x);assert.ok(Math.abs(a*a+b*b-1)<1e-10);}
  const {audio,release}=fixture();await audio.enable();await settle();Context.instances.at(-1).currentTime=10;
  audio.crossfade(.6);assert.ok(audio.beat()>0);audio.crossfade(1);assert.ok(audio.energy()<1e-10);release();
});
test('performance lands on a bar, swaps the audible record, and preserves the continuous dance clock',async()=>{
  const {audio,release}=fixture();await audio.enable();await settle();const ctx=Context.instances.at(-1);
  ctx.currentTime=1.35;const before=audio.beat(),plan=clubMixPlan(before,0);
  assert.equal(plan.start%4,0);assert.ok(plan.start>before);audio.performTransition();await settle();
  assert.equal(audio.read().performance,'queued');assert.equal(audio.inspect().sources,2);
  ctx.currentTime=(plan.start+1)*60/118;audio.tick();assert.equal(audio.read().performance,'build');
  ctx.currentTime=(plan.end+.01)*60/118;audio.tick();assert.equal(audio.read().performance,'landed');
  assert.equal(audio.read().crossfade,1);assert.deepEqual(audio.read().playing,[false,true]);assert.equal(audio.inspect().sources,1);
  const after=audio.beat();audio.cue(1);assert.equal(audio.beat(),after);audio.crossfade(0);assert.equal(audio.beat(),after);
  useWorldStore.setState({paused:true});await settle();assert.equal(audio.inspect().sources,0);release();await settle();
});
test('manual control cancels a queued performance and re-entering does not restart the muted deck',async()=>{
  const {audio,release}=fixture();await audio.enable();await settle();audio.performTransition();await settle();
  audio.crossfade(.25);assert.equal(audio.read().performance,'idle');
  audio.crossfade(1);audio.toggle(0);await settle();assert.deepEqual(audio.read().playing,[false,true]);
  await audio.enable();await settle();assert.deepEqual(audio.read().playing,[false,true]);release();
});
test('manual takeover preserves the exact in-flight fade between UI beat updates',async()=>{
  const {audio,release}=fixture();await audio.enable();await settle();const ctx=Context.instances.at(-1);
  const plan=clubMixPlan(audio.beat(),0);audio.performTransition();
  ctx.currentTime=(plan.fade+1)*60/118;audio.tick();assert.equal(audio.read().crossfade,.25);
  ctx.currentTime=(plan.fade+1.6)*60/118;audio.filter(.8);
  assert.ok(Math.abs(audio.read().crossfade-.4)<1e-9);
  assert.equal(audio.read().performance,'idle');
  assert.ok(ctx.params.filter(p=>p.held.includes(ctx.currentTime)).length>=4);
  release();
});
test('starting a performance from a manual blend eases into its lead deck',async()=>{
  const {audio,release}=fixture();await audio.enable();await settle();const ctx=Context.instances.at(-1);
  audio.crossfade(.4);ctx.currentTime=1;audio.performTransition();
  const ramps=ctx.params.flatMap(p=>p.ramps);
  assert.equal(ramps.length,2);assert.ok(ramps.every(r=>r.time>1&&r.time<=1.18));
  assert.deepEqual(ramps.map(r=>r.value),[1,0]);release();
});

test('shared music volume multiplies local controls, zero suspends, SFX volume is independent',async()=>{
  const {audio,release}=fixture();await audio.enable();await settle();const ctx=Context.instances.at(-1);
  audio.volume(.4);setWorldAudioVolume('music',.5);
  assert.ok(Math.abs(ctx.params[0].targets.at(-1).value-.4*.65*.5)<1e-12);
  assert.equal(audio.read().volume,.4);assert.equal(audio.energy(),.2);
  setWorldAudioVolume('sfx',0);await settle();assert.equal(audio.inspect().sources,1);
  setWorldAudioVolume('music',0);await settle();assert.equal(ctx.state,'suspended');assert.equal(audio.inspect().sources,0);
  setWorldAudioVolume('music',1);await settle();assert.equal(audio.inspect().sources,1);
  audio.mute();setWorldAudioMuted(true);setWorldAudioMuted(false);await settle();
  assert.equal(audio.read().muted,true);assert.equal(audio.inspect().sources,0);
  audio.mute();await settle();audio.volume(0);await settle();assert.equal(audio.inspect().sources,0);release();
});

test('master mute during pending resume cannot revive Club, pool inspection stops it too',async()=>{
  const {audio,release}=fixture();await audio.enable();await settle();const ctx=Context.instances.at(-1);
  setWorldAudioMuted(true);await settle();let resume;ctx.gate=new Promise(resolve=>resume=resolve);
  setWorldAudioMuted(false);setWorldAudioMuted(true);resume();await settle();
  assert.equal(ctx.state,'suspended');assert.equal(audio.inspect().sources,0);
  ctx.gate=null;setWorldAudioMuted(false);await settle();
  useWorldStore.setState({poolInspect:true});await settle();assert.equal(audio.inspect().sources,0);
  useWorldStore.setState({poolInspect:false});await settle();assert.equal(audio.inspect().sources,1);
  release();setWorldAudioMuted(true);setWorldAudioVolume('music',.2);await settle();
  assert.equal(ctx.state,'closed');assert.equal(audio.inspect().sources,0);
});
