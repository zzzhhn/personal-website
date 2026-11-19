import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRapier, useBeforePhysicsStep, useAfterPhysicsStep } from '@react-three/rapier';
import { Group } from 'three';
import { factoryVisualOnly } from './factory-live-contact';
import { useWorldStore } from '../store';
import { FACTORY } from './factory-layout';
import { buildFactoryCompanion } from './factory-companion';
import { createFactoryTrialRig, type FactoryTrialRig } from './factory-trial-physics';
import { useFactoryStore, sampleFactoryTrial, finishFactoryOperation } from './factory-store';
import type { FactoryMeasurement } from './factory-game';

type Visual={root:Group;model:ReturnType<typeof buildFactoryCompanion>;rig:FactoryTrialRig;contactHandle:number};
const measurement=(r:FactoryMeasurement):FactoryMeasurement=>({progress:r.progress,speedMps:r.speedMps,tiltDeg:r.tiltDeg,loadKg:r.loadKg});
/** Both lanes run in the world's one physics clock. Measurements come from the bodies after each step. */
export default function WorldFactoryTrial(){
  const {world,rapier,colliderStates}=useRapier();
  const token=useFactoryStore(s=>s.game.pending?.action.type==='test'?s.game.pending.token:null);
  const live=useRef<Visual[]>([]),lastSample=useRef(0),settled=useRef(false);
  const [visuals,setVisuals]=useState<Visual[]>([]);
  useEffect(()=>{
    const s=useFactoryStore.getState(),pending=s.game.pending;
    if(!token||!pending||pending.action.type!=='test'||!s.game.configuration)return;
    const list:Visual[]=[];
    const cleanup=()=>{for(const v of list){colliderStates.delete(v.contactHandle);v.rig.dispose();v.model.dispose();}};
    try{
      const count=pending.action.mode==='comparison'?2:1;
      for(let lane=0;lane<count;lane++){
        const kind=lane===0?s.game.configuration.kind:'steady';
        const rig=createFactoryTrialRig({world,rapier,configuration:{kind},conditions:pending.action.conditions,lane:lane as 0|1,origin:FACTORY.origin});
        let model:ReturnType<typeof buildFactoryCompanion>;
        try{model=buildFactoryCompanion({configuration:kind,shell:false});}
        catch(error){rig.dispose();throw error;}
        const root=new Group();
        root.name=`factory-trial-lane-${lane}`;
        const contact=new Group();contact.name=root.name+'-chassis-contact';
        const collider=rig.body.collider(0);
        list.push({root,model,rig,contactHandle:collider.handle});
        colliderStates.set(collider.handle,{collider,object:contact});
        for(const name of ['companion-chassis','companion-bumpers']){
          const mesh=model.group.getObjectByName(name)!;
          mesh.userData={...mesh.userData,worldCollision:'solid',surfaceId:contact.name,worldCollisionSharedSurface:true};
        }
        factoryVisualOnly(model.wheelModule,'The four dedicated Rapier vehicle suspension rays supply the active tyre contacts.');
        factoryVisualOnly(model.shell,'The shell is removed for active trial measurements.');
        model.group.position.copy(rig.visualOffset);root.add(model.group,contact);
      }
      live.current=list;setVisuals(list);lastSample.current=0;settled.current=false;
      const a=list[0].rig.read(),b=list[1]?.rig.read();
      sampleFactoryTrial(pending,{elapsedS:0,player:measurement(a),...(b?{reference:measurement(b)}:{})});
    }catch{
      cleanup();list.length=0;
      finishFactoryOperation(pending,{ok:false,reason:'test-rig-unavailable'});
    }
    return ()=>{live.current=[];cleanup();setVisuals([]);};
  },[token,world,rapier,colliderStates]);
  useBeforePhysicsStep(()=>{
    const w=useWorldStore.getState(),paused=w.paused||w.poolInspect||document.hidden;
    for(const {rig} of live.current){rig.setPaused(paused);if(!paused)rig.advance(world.timestep);}
  });
  useAfterPhysicsStep(()=>{
    const list=live.current,p=useFactoryStore.getState().game.pending;
    if(!list.length||settled.current||!p||p.action.type!=='test')return;
    const a=list[0].rig.read(),b=list[1]?.rig.read(),elapsed=Math.max(a.elapsedS,b?.elapsedS??0);
    const failed=a.status==='incomplete'||b?.status==='incomplete';
    const complete=a.status==='completed'&&(!b||b.status==='completed');
    if(elapsed-lastSample.current>=.2||failed||complete){
      sampleFactoryTrial(p,{elapsedS:elapsed,player:measurement(a),...(b?{reference:measurement(b)}:{})});lastSample.current=elapsed;
    }
    if(failed||complete){
      settled.current=true;
      finishFactoryOperation(p,complete?{outcome:'completed'}:{outcome:'incomplete',reason:a.reason??b?.reason??'course-incomplete'});
    }
  });
  useFrame(()=>{
    for(const v of live.current){
      const r=v.rig.read();v.root.position.set(r.position.x-FACTORY.origin[0],r.position.y-FACTORY.origin[1],r.position.z-FACTORY.origin[2]);
      v.root.quaternion.copy(r.quaternion);
      for(let i=0;i<4;i++){
        const wheel=v.model.wheels[i],w=r.wheels[i];
        wheel.position.set(w.connection.x,w.connection.y-w.suspensionLength-v.rig.visualOffset.y,w.connection.z);
        wheel.rotation.set(-w.rotation,w.steering,0,'YXZ');
      }
    }
  });
  if(!visuals.length)return null;
  return <group name="factory-physical-trials" dispose={null}>{visuals.map((v,i)=><primitive key={`${token}-${i}`} object={v.root}/>)}</group>;
}
