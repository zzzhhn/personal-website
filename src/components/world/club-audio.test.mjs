// node --import ./tools/world/alpha-mine-tests/register.mjs --test src/components/world/club-audio.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { ClubAudio, clubGains } from './WorldClubAudio.ts';
import { useWorldStore } from './store.ts';

class Context {
  static instances=[];
  state='suspended';currentTime=0;destination={};nodes=[];closed=false;gate=null;
  constructor(){Context.instances.push(this);}
  createGain(){return {gain:{value:1,setTargetAtTime(){}},connect(){},disconnect(){}};}
  createBiquadFilter(){return {frequency:{value:0,setTargetAtTime(){}},connect(){},disconnect(){}};}
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
  release();await settle();assert.deepEqual(audio.inspect(),{phase:'off',context:'absent',sources:0,buffers:0,bufferBytes:0,owners:0,timers:0});
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
