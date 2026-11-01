#!/usr/bin/env node
// Offline mastering of the user's approved 40-second direction. No runtime DSP or service.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const DAILY_MASTER = { rmsDb: -29.7, reflections: [{ seconds: .041, gain: .055 }, { seconds: .073, gain: .035 }] };
export function masterDailyPcm(channels, rate) {
  if (!Number.isInteger(rate)||rate<8000||rate>48000||channels.length!==2||channels[0].length!==channels[1].length
    ||!channels[0].length||channels[0].length>rate*45) throw new RangeError('Unsupported source budget');
  const frames=channels[0].length, output=channels.map(()=>new Float32Array(frames));
  let energy=0;
  for(let c=0;c<2;c++)for(let i=0;i<frames;i++) {
    let value=channels[c][i];
    // Two quiet early reflections add a small room, while preserving every note and its dynamics.
    // Circular convolution keeps the final phrase tail continuous across the loop boundary.
    for(const tap of DAILY_MASTER.reflections) value+=channels[1-c][(i-Math.round(tap.seconds*rate)+frames)%frames]*tap.gain;
    if(!Number.isFinite(value))throw new RangeError('Non-finite source');
    output[c][i]=value;energy+=value*value;
  }
  if(energy<=0)throw new RangeError('Silent source');
  const gain=10**(DAILY_MASTER.rmsDb/20)/Math.sqrt(energy/(frames*2));
  for(const channel of output)for(let i=0;i<frames;i++){
    channel[i]*=gain;if(Math.abs(channel[i])>=.5)throw new RangeError('Insufficient peak headroom');
  }
  return {channels:output,gain};
}

function main(){
  const index=process.argv.indexOf('--lock-owner'),owner=process.argv[index+1];
  if(index<0||!owner||JSON.parse(readFileSync('/tmp/bobby-world-phase2-heavy.lock/owner.json','utf8')).owner!==owner)
    throw new Error('Acquire the shared heavy-task lock before exporting');
  const root=new URL('../../',import.meta.url),folder=new URL('docs/world/phase-2-playground/qa-20261029/walk-daily-master-v36/',root);
  const sourcePath='docs/world/phase-2-playground/qa-20261029/walk-daily-candidate-v24/walk-daily-candidate.wav';
  const source=readFileSync(new URL(sourcePath,root)),sha=b=>createHash('sha256').update(b).digest('hex');
  if(sha(source)!=='695e2902aea13630d2db43afa7fbacf8b0218daa152929d41d737f8a2f0c9b1c')throw new Error('Approved audition identity changed');
  const rate=source.readUInt32LE(24),frames=(source.length-44)/4;
  if(source.length!==3840044||source.readUInt16LE(22)!==2||source.readUInt16LE(34)!==16||rate!==24000)
    throw new Error('Unexpected approved PCM format');
  const asset=new URL('public/assets/world/park/audio/island-walk-daily-v1.wav',root),reportPath=new URL('analysis.json',folder);
  if(existsSync(asset)||existsSync(reportPath))throw new Error('Preserve the existing master; choose a new version');
  const input=[0,1].map(c=>Float32Array.from({length:frames},(_,i)=>source.readInt16LE(44+(i*2+c)*2)/32768));
  const {channels,gain}=masterDailyPcm(input,rate),wav=Buffer.from(source);
  let peak=0,energy=0;
  for(let c=0;c<2;c++)for(let i=0;i<frames;i++){
    const value=Math.round(channels[c][i]*32767);wav.writeInt16LE(value,44+(i*2+c)*2);
    const sample=value/32768;peak=Math.max(peak,Math.abs(sample));energy+=sample*sample;
  }
  const sample=(i,c)=>wav.readInt16LE(44+(i*2+c)*2)/32768;
  const seam=[0,1].map(c=>{
    const step=sample(0,c)-sample(frames-1,c);
    return {channel:c,step,slopeChange:Math.max(Math.abs(step-(sample(frames-1,c)-sample(frames-2,c))),Math.abs(sample(1,c)-sample(0,c)-step))};
  });
  if(seam.some(s=>Math.abs(s.step)>.001||s.slopeChange>.0003))throw new Error('Loop seam QC failed');
  const report={date:'2026-10-29',status:'direction approved; final master numerical QC; runtime and listening verification separate',
    source:sourcePath,sourceSha256:sha(source),settings:DAILY_MASTER,gainDb:20*Math.log10(gain),sha256:sha(wav),
    asset:'public/assets/world/park/audio/island-walk-daily-v1.wav',seconds:frames/rate,bpm:96,rate,channels:2,frames,
    fileBytes:wav.length,decodedBytesAt24k:frames*8,peakDbfs:20*Math.log10(peak),rmsDbfs:10*Math.log10(energy/(frames*2)),seam,
    codeSha256:sha(readFileSync(new URL(import.meta.url)))};
  mkdirSync(folder,{recursive:true});mkdirSync(new URL('.',asset),{recursive:true});
  writeFileSync(asset,wav,{flag:'wx'});writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({asset:asset.pathname,bytes:wav.length,peakDbfs:report.peakDbfs,rmsDbfs:report.rmsDbfs,seam}));
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)main();
