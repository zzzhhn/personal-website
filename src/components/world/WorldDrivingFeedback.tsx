import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useWorldStore } from './store';
import { readDrivingTelemetry } from './vehicle-telemetry';

/** Quiet procedural engine, tyre scrub and boost. No downloads, timers, or persistent audio after
 * unmount. The AudioContext is created only by a gesture while actually driving the benchmark car. */
export default function WorldDrivingFeedback() {
  const sound=useRef<{ctx:AudioContext; engine:OscillatorNode; harmonic:OscillatorNode;
    motor:GainNode; tyre:GainNode; boost:GainNode; filter:BiquadFilterNode}|null>(null);
  useEffect(()=>{
    const start=()=>{
      const s=useWorldStore.getState();if(s.activeVehicle!=='coupe'||s.paused||s.shot||document.hidden)return;
      if(sound.current){if(sound.current.ctx.state==='suspended')void sound.current.ctx.resume();return;}
      if(!window.AudioContext)return;
      const ctx=new AudioContext(),master=ctx.createGain();master.gain.value=.12;master.connect(ctx.destination);
      const engine=ctx.createOscillator(),harmonic=ctx.createOscillator(),motor=ctx.createGain(),filter=ctx.createBiquadFilter();
      engine.type='triangle';harmonic.type='sine';motor.gain.value=0;filter.type='lowpass';filter.frequency.value=420;
      engine.connect(motor);harmonic.connect(motor);motor.connect(filter).connect(master);engine.start();harmonic.start();
      const noise=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate),data=noise.getChannelData(0);
      for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
      const source=ctx.createBufferSource();source.buffer=noise;source.loop=true;
      const tyre=ctx.createGain(),boost=ctx.createGain(),scrub=ctx.createBiquadFilter(),air=ctx.createBiquadFilter();
      tyre.gain.value=0;boost.gain.value=0;scrub.type='bandpass';scrub.frequency.value=950;scrub.Q.value=2;
      air.type='highpass';air.frequency.value=1800;source.connect(scrub).connect(tyre).connect(master);
      source.connect(air).connect(boost).connect(master);source.start();sound.current={ctx,engine,harmonic,motor,tyre,boost,filter};
    };
    const silence=()=>{
      const a=sound.current,s=useWorldStore.getState();
      if(a&&(s.activeVehicle!=='coupe'||s.paused||s.shot||document.hidden))void a.ctx.suspend();
    };
    const unsubscribe=useWorldStore.subscribe(silence);
    window.addEventListener('keydown',start);window.addEventListener('pointerdown',start);
    document.addEventListener('visibilitychange',silence);
    return()=>{unsubscribe();window.removeEventListener('keydown',start);window.removeEventListener('pointerdown',start);
      document.removeEventListener('visibilitychange',silence);void sound.current?.ctx.close();sound.current=null;};
  },[]);
  useFrame(()=>{
    const a=sound.current,d=readDrivingTelemetry(),s=useWorldStore.getState();if(!a)return;
    const live=d&&s.activeVehicle==='coupe'&&!s.paused&&!s.shot&&!document.hidden;
    const speed=live?Math.abs(d.speed):0,load=live?Math.abs(d.power):0,t=a.ctx.currentTime;
    // A small virtual gear drop conveys acceleration without prescribing a simulated gearbox.
    const gear=Math.min(4,Math.floor(speed/7)),pitch=38+(speed-gear*5)*3+load*12;
    a.engine.frequency.setTargetAtTime(pitch,t,.08);a.harmonic.frequency.setTargetAtTime(pitch*2,t,.08);
    a.motor.gain.setTargetAtTime(live ? .12+load*.16 : 0,t,.08);
    a.filter.frequency.setTargetAtTime(300+load*550,t,.12);
    const scrub=live&&d.contacts>=2?Math.min(.28,Math.max(0,Math.abs(d.slipAngle)-.08)*.45)*Math.min(1,speed/6):0;
    a.tyre.gain.setTargetAtTime(scrub,t,.06);a.boost.gain.setTargetAtTime(live&&d.boosting ? .15 : 0,t,.08);
  });
  return null;
}
