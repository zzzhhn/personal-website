import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneWorkProbe } from './world-scene-work.ts';

test('ordinary play does no clock/context reads, explicit windows share a renderer frame and stay bounded', () => {
  let reads=0,time=10,frame=500;
  const p=new SceneWorkProbe(()=>{reads++;return time;});
  const unbind=p.bind(()=>frame);
  assert.equal(p.measure('off',()=>42),42); assert.equal(reads,0);
  p.start(); const first=p.begin('structure');time=12;p.end(first);
  frame=501;time=13;p.measure('signs',()=>{time=15;});
  for(let i=0;i<100;i++)p.measure('bounded',()=>{time++;});
  const events=p.stop(),stoppedReads=reads;
  assert.equal(events.length,64);
  assert.deepEqual(events[0],{name:'structure',startMs:10,endMs:12,durationMs:2,lastRenderFrame:500});
  assert.equal(events[1].lastRenderFrame,501);
  p.measure('off-again',()=>null);assert.equal(reads,stoppedReads);
  unbind();p.start();assert.throws(()=>p.measure('failed',()=>{throw Error('expected');}),/expected/);
  assert.equal(p.stop()[0].lastRenderFrame,null);
});
