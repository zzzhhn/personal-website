import test from 'node:test';
import assert from 'node:assert/strict';
import { ParkAudio } from '../../../src/components/world/WorldParkAudio.ts';
const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}});
const node=()=>({gain:param(),threshold:param(),ratio:param(),frequency:param(),connect(n){return n;},disconnect(){},start(){},stop(){}});
class Context extends EventTarget {
  sampleRate=24000;currentTime=0;state='running';destination=node();buffers=[];sources=[];
  createGain(){return node();}createDynamicsCompressor(){return node();}createBiquadFilter(){return node();}
  createBuffer(_channels,length,sampleRate){const data=new Float32Array(length),buffer={length,sampleRate,getChannelData:()=>data};this.buffers.push(buffer);return buffer;}
  createBufferSource(){const source=node();this.sources.push(source);return source;}
  close(){this.state='closed';return Promise.resolve();}
}
test('context/roaming setup does not allocate noise; first hiss allocates once and later hiss reuses it',()=>{
 const previousWindow=globalThis.window,previousDocument=globalThis.document;
 globalThis.window=Object.assign(new EventTarget(),{AudioContext:Context});globalThis.document=new EventTarget();
 const audio=new ParkAudio();
 try{
  const context=audio.ensureContext();assert.equal(context.buffers.length,0);assert.equal(audio.ensureContext(),context);
  audio.hiss(node(),0,.05,.1,'highpass',1800);assert.equal(context.buffers.length,1);assert.equal(context.buffers[0].length,24000);
  assert.equal(context.sources[0].buffer,context.buffers[0]);assert.ok(context.buffers[0].getChannelData(0).some(v=>v!==0));
  audio.hiss(node(),.2,.3,.1,'lowpass',950);assert.equal(context.buffers.length,1);assert.equal(context.sources[1].buffer,context.sources[0].buffer);
  audio.dispose();assert.equal(audio.noise,null);const restored=audio.ensureContext();assert.notEqual(restored,context);assert.equal(restored.buffers.length,0);
 }finally{audio.dispose();globalThis.window=previousWindow;globalThis.document=previousDocument;}
});
