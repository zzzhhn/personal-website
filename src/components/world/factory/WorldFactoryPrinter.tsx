import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { useWorldStore } from '../store';
import { night } from '../WorldNight';
import { useFactoryStore } from './factory-store';
import { buildFactoryPrinter } from './factory-printer';
import { FACTORY_PALETTE } from './factory-geometry';
import { factoryLaneReadings, factoryTrialRound } from './factory-readings';

/** Printed evidence is a single event-updated texture. Feeding uses the existing
 * world frame loop, freezes on pause and never creates a timer or physics body. */
export default function WorldFactoryPrinter(){
  const report=useFactoryStore(s=>s.game.report),sequence=useFactoryStore(s=>s.printSequence);
  const lang=useWorldStore(s=>s.lang),zh=lang==='zh';
  const model=useMemo(()=>buildFactoryPrinter(FACTORY_PALETTE),[]);
  const motion=useRef({reportId:report?.id??null,sequence,feed:report?1:0});
  const texture=useMemo(()=>{
    if(!report)return null;
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=480;
    const c=canvas.getContext('2d')!;c.fillStyle='#f2ead8';c.fillRect(0,0,768,480);
    c.fillStyle='#213a3b';c.font='bold 38px sans-serif';c.fillText(zh?'机械伙伴 · 产品卡':'COMPANION / PRODUCT CARD',32,52);
    c.font='23px monospace';c.fillText(report.configuration.id.split(':').slice(-2).join(' '),32,88);
    c.strokeStyle='#8d9c91';c.beginPath();c.moveTo(32,106);c.lineTo(736,106);c.stroke();
    const game=useFactoryStore.getState().game;
    let y=145;
    for(const id of report.trialIds){
      const trial=game.trials.find(t=>t.id===id);if(!trial)continue;
      c.font='bold 25px sans-serif';
      c.fillText(`${trial.mode==='single'?(zh?'单机':'SINGLE'):(zh?'双机':'PAIRED')}  #${factoryTrialRound(trial)}  /  ${trial.conditions.loadKg} kg`,32,y);y+=34;
      for(const lane of trial.mode==='single'?['player'] as const:['player','reference'] as const){
        const reading=factoryLaneReadings(trial,lane);
        const label=lane==='player'?(zh?'本机':'YOURS'):(zh?'基准机':'REFERENCE');
        const time=reading.arrivalS===null?'—':`${reading.arrivalS.toFixed(1)} s`;
        const tilt=reading.recordedPeakTiltDeg===null?'—':`${reading.recordedPeakTiltDeg.toFixed(1)}°`;
        c.font='24px sans-serif';c.fillText(`${label}    ${time}    ${zh?'峰值倾角':'PEAK TILT'} ${tilt}`,48,y);y+=32;
      }
      y+=22;
    }
    c.font='21px sans-serif';c.fillText(zh?'本轮游戏试验记录':'RECORDED IN THIS GAME RUN',32,442);
    const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;return map;
  },[report,zh]);
  useEffect(()=>{
    model.card.material.map=texture;model.card.material.emissiveMap=texture;
    model.card.material.emissive.set('#ffffff');model.card.material.needsUpdate=true;
    return ()=>{model.card.material.map=null;model.card.material.emissiveMap=null;texture?.dispose();};
  },[model,texture]);
  useEffect(()=>()=>model.dispose(),[model]);
  useFrame((_,delta)=>{
    const w=useWorldStore.getState();
    if(w.paused||w.poolInspect||document.hidden)return;
    const state=motion.current,id=report?.id??null;
    if(state.reportId!==id||state.sequence!==sequence){state.reportId=id;state.sequence=sequence;state.feed=0;}
    if(id)state.feed=Math.min(1,state.feed+Math.min(delta,.05)/2.4);
    model.card.visible=!!id;model.update(state.feed);
    model.card.material.emissiveIntensity=night.value*.18;
  });
  return <>
    <primitive object={model.group}/>
    <RigidBody type="fixed" colliders={false} name="factory-printer-collision" userData={{solid:true}}>
      {model.solids.map((s,i)=><CuboidCollider key={i} args={[s.size[0]/2,s.size[1]/2,s.size[2]/2]} position={s.at}/>)}
    </RigidBody>
  </>;
}
