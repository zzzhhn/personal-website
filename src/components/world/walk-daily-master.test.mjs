import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {masterDailyPcm} from '../../../tools/world/master-walk-daily.mjs';
const root=new URL('../../../',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
const report=JSON.parse(readFileSync(new URL('docs/world/phase-2-playground/qa-20261029/walk-daily-master-v36/analysis.json',root),'utf8'));
const wav=readFileSync(new URL(report.asset,root)),frames=(wav.length-44)/4;
const sample=(i,c)=>wav.readInt16LE(44+((i%frames)*2+c)*2)/32768;
test('master derives exactly from the preserved approved audition; no note, tempo or form replacement',()=>{
  const original=readFileSync(new URL(report.source,root));assert.equal(sha(original),report.sourceSha256);
  assert.equal(sha(wav),report.sha256);assert.equal(wav.length,3840044);assert.equal(frames,960000);
  assert.equal(sha(readFileSync(new URL('tools/world/master-walk-daily.mjs',root))),report.codeSha256);
  const input=[0,1].map(c=>Float32Array.from({length:frames},(_,i)=>original.readInt16LE(44+(i*2+c)*2)/32768));
  const {channels}=masterDailyPcm(input,24000);
  for(let c=0;c<2;c++)for(let i=0;i<frames;i++)assert.equal(wav.readInt16LE(44+(i*2+c)*2),Math.round(channels[c][i]*32767)||0);
});
test('actual delivered PCM retains headroom, quiet contrast and two continuous repeat boundaries',()=>{
  let peak=0,energy=0;const sectionEnergy=[0,0,0,0];
  for(let c=0;c<2;c++)for(let i=0;i<frames;i++){
    const value=sample(i,c);assert.ok(Number.isFinite(value));peak=Math.max(peak,Math.abs(value));energy+=value*value;
    sectionEnergy[Math.floor(i/(frames/4))]+=value*value;
  }
  assert.ok(20*Math.log10(peak)<-12);assert.ok(Math.abs(10*Math.log10(energy/(frames*2))+29.7)<.02);
  assert.ok(10*Math.log10(sectionEnergy[0]/sectionEnergy[2])>4,'the quieter middle remains quieter, without dynamic flattening');
  for(const join of[frames,frames*2])for(let c=0;c<2;c++){
    const step=sample(join,c)-sample(join-1,c);
    assert.ok(Math.abs(step)<.001);assert.ok(Math.abs(sample(join,c))>.0001);
    assert.ok(Math.max(Math.abs(step-(sample(join-1,c)-sample(join-2,c))),Math.abs(sample(join+1,c)-sample(join,c)-step))<.0003);
  }
});
test('offline master rejects silent, non-finite and oversized work without a compressor or live processing',()=>{
  assert.throws(()=>masterDailyPcm([new Float32Array(8),new Float32Array(8)],24000),RangeError);
  assert.throws(()=>masterDailyPcm([Float32Array.of(NaN),Float32Array.of(1)],24000),RangeError);
  assert.throws(()=>masterDailyPcm([new Float32Array(2),new Float32Array(3)],24000),RangeError);
  assert.throws(()=>masterDailyPcm([new Float32Array(2),new Float32Array(2)],96000),RangeError);
});
