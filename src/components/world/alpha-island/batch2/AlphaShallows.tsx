import { useEffect,useMemo,useRef,useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider,RigidBody,type RapierRigidBody } from '@react-three/rapier';
import { Group,type BufferGeometry } from 'three';
import { useInteractable } from '../../WorldInteract';
import { useWorldStore } from '../../store';
import { campPropActor,cancelCampPropInteraction } from '../../camp-prop-interactions';
import { guideActionHand,releaseGuideActionHand } from '../../rides/guide-action-hand';
import { alphaLocal,alphaWorld } from '../alpha-layout';
import { alphaMaterial } from '../alpha-materials';
import { type AlphaFinish } from '../alpha-art';
import { cancelAlphaHand,useAlphaStore } from '../alpha-state';
import { ALPHA_SHALLOWS } from '../alpha-batch2-layout';
import { createShallowsRuneStone,createShallowsSite,createShallowsWater,createShallowsLever } from './shallows-art';
import { createShallowsState,SHALLOWS_BYPASS,SHALLOWS_STONE_COUNT,SHALLOWS_STONE_SIZE,SHALLOWS_DECK_Y,
  shallowsStonePosition,shallowsComplete,shallowsSweepClear,pushShallowsStone,stepShallowsStone,
  canResetShallows,resetShallows,type ShallowsState } from './shallows-state';
import type { Vec3 } from '../../types';
import { createShallowsArrivalReceipts,takeShallowsArrival,SHALLOWS_SLOT_NOTICE,SHALLOWS_BRIDGE_NOTICE } from './batch2-station-feedback';
import { createShallowsRipples,clearShallowsRipples,armShallowsRipple,takeShallowsRipple,stepShallowsRipples,withShallowsRippleShader,type ShallowsRipples } from './shallows-ripples';

type CraftPart={finish:AlphaFinish;geometry:BufferGeometry};
type ShallowsProps={onVisit?:()=>void;onCompleteChange?:(complete:boolean)=>void};
/** Session-only readback for integration/QA. No second player or global progress store. */
export const alphaShallowsProbe={visited:false,completed:false,snapped:0,moving:null as number|null,resets:0};
const HAND_OWNER='alpha-shallows';
const playerLocal=()=>alphaLocal(campPropActor.position);
function Craft({parts,name}:{parts:CraftPart[];name:string}) {
  const materials=useMemo(()=>new Map(parts.map(p=>[p.finish,alphaMaterial(p.finish)])),[parts]);
  useEffect(()=>()=>{parts.forEach(p=>p.geometry.dispose());materials.forEach(m=>m.dispose());},[parts,materials]);
  return <group name={name}>{parts.map(p=><mesh key={p.finish} geometry={p.geometry} material={materials.get(p.finish)} castShadow receiveShadow/>)}</group>;
}
function RuneStone({index,state,request,onArrival}:{index:number;state:ShallowsState;request:(i:number)=>void;onArrival:(i:number,error:number)=>boolean}) {
  const body=useRef<RapierRigidBody>(null),parts=useMemo(()=>createShallowsRuneStone(index),[index]);
  const confirmedReset=useRef(-1);
  const moving=state.active===index,p=shallowsStonePosition(index,state.progress[index]),side=index%2?1:-1;
  const handle:Vec3=[p[0],SHALLOWS_DECK_Y+.3,p[2]+side*.8];
  useInteractable({id:`alpha-shallows-stone-${index}`,position:alphaWorld(handle),radius:1.15,kind:'exhibit',
    label:{zh:'沿石槽推拢符文石',en:'Push the rune stone along its groove'},
    enabled:()=>state.active===null&&state.progress[index]<1&&campPropActor.available&&campPropActor.grounded&&
      !guideActionHand.owner&&!useAlphaStore.getState().carried&&shallowsSweepClear(index,state.progress[index],1,playerLocal()),
    onInteract:()=>request(index)});
  useFrame(()=>{
    if(!body.current)return;
    if(moving){const q=alphaWorld(shallowsStonePosition(index,state.progress[index]));body.current.setNextKinematicTranslation({x:q[0],y:q[1],z:q[2]});}
    if(state.progress[index]===1&&confirmedReset.current!==state.resets){
      const end=alphaWorld(shallowsStonePosition(index,1)),actual=body.current.translation();
      if(onArrival(index,Math.hypot(actual.x-end[0],actual.y-end[1],actual.z-end[2])))confirmedReset.current=state.resets;
    }
  });
  return <RigidBody ref={body} name={`alpha-shallows-rune-${index}`}
    type={moving?'kinematicPosition':'fixed'} position={p} colliders={false}
    userData={moving?{solid:true,assetId:`alpha-shallows-moving-${index}`}:{surface:true,solid:true,assetId:`alpha-shallows-stone-${index}`}}>
    <CuboidCollider args={[SHALLOWS_STONE_SIZE[0]/2,SHALLOWS_STONE_SIZE[1]/2,SHALLOWS_STONE_SIZE[2]/2]} friction={.85}/>
    <CuboidCollider position={[0,SHALLOWS_STONE_SIZE[1]/2+.27,side*.72]} args={[.55,.28,.07]} friction={.85}/>
    <Craft name={`alpha-shallows-carved-stone-${index}`} parts={parts}/>
  </RigidBody>;
}
function ShallowWater({clock,ripples}:{clock:{value:number};ripples:ShallowsRipples}) {
  const geometry=useMemo(createShallowsWater,[]),material=useMemo(()=>{
    // Reuse the facility PBR adapter; this water has no own lights or reflection pass.
    const m=alphaMaterial('glass');m.name='alpha-shallows-water';m.vertexColors=false;m.color.set('#6a9991');
    m.emissive.set('#000000');m.emissiveIntensity=0;m.transparent=true;m.opacity=.56;m.depthWrite=false;m.roughness=.26;
    m.onBeforeCompile=((base)=>(s,renderer)=>{base(s,renderer);s.uniforms.uShallowsTime=clock;s.uniforms.uShallowsRipples={value:ripples.values};s.uniforms.uShallowsRippleActive=ripples.active;
      s.vertexShader='uniform float uShallowsTime;\n'+s.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed.y+=sin(position.x*2.3+uShallowsTime*1.3+position.z)*.007+sin(position.z*3.1-uShallowsTime*.9)*.005;');
      s.fragmentShader='uniform float uShallowsTime;\n'+withShallowsRippleShader(s.fragmentShader.replace('#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor+=sin(vAlphaP.x*5.+vAlphaP.z*2.-uShallowsTime*.7)*.025;'));
    })(m.onBeforeCompile.bind(m));m.customProgramCacheKey=()=> 'alpha-shallows-shallow-water-v2-impacts';return m;
  },[clock,ripples]);
  useEffect(()=>()=>{geometry.dispose();material.dispose();},[geometry,material]);
  return <mesh name="alpha-shallows-moving-water" geometry={geometry} material={material} receiveShadow renderOrder={1}/>;
}

/** Mount inside ALPHA_ORIGIN. Props feed the island trail card; this module owns
 * only the eight-stone mechanism and its permanently open southern crossing. */
export default function AlphaShallows({onVisit,onCompleteChange}:ShallowsProps={}) {
  const state=useRef(createShallowsState()).current,site=useMemo(createShallowsSite,[]),leverParts=useMemo(createShallowsLever,[]),clock=useRef(0),waterClock=useRef({value:0}).current;
  const [,render]=useState(0),pending=useRef<{index:number;age:number;contact:number}|null>(null),visited=useRef(false),complete=useRef(false),lever=useRef<Group>(null);
  const callbacks=useRef({onVisit,onCompleteChange});callbacks.current={onVisit,onCompleteChange};
  const arrivals=useRef(createShallowsArrivalReceipts()).current;
  const ripples=useMemo(createShallowsRipples,[]);
  const confirmArrival=(index:number,error:number)=>{
    const w=useWorldStore.getState(),actor=playerLocal();
    if(!campPropActor.available||w.paused||w.shot||w.card||w.activeVehicle||w.seat||w.poolInspect||document.hidden||
      Math.hypot(actor[0]-ALPHA_SHALLOWS.center[0],actor[2]-ALPHA_SHALLOWS.center[2])>=28)return false;
    const arrival=takeShallowsArrival(arrivals,state,index,error);
    if(arrival){
      const p=shallowsStonePosition(index,1);takeShallowsRipple(ripples,index,p[0],p[2]);
      useWorldStore.setState({toast:{...(arrival.bridge?SHALLOWS_BRIDGE_NOTICE:SHALLOWS_SLOT_NOTICE),at:performance.now()}});
    }
    return arrivals.resets===state.resets&&arrivals.stones.has(index);
  };
  const release=()=>{pending.current=null;if(guideActionHand.owner===HAND_OWNER)releaseGuideActionHand();};
  const request=(index:number)=>{
    const w=useWorldStore.getState();if(w.paused||w.card||w.shot||document.hidden||state.active!==null||pending.current)return;
    if(!shallowsSweepClear(index,state.progress[index],1,playerLocal()))return;
    cancelCampPropInteraction('alpha-shallows');cancelAlphaHand();
    const p=shallowsStonePosition(index,state.progress[index]);p[1]=SHALLOWS_DECK_Y+.3;p[2]+=(index%2?1:-1)*.8;
    guideActionHand.owner=HAND_OWNER;guideActionHand.target=alphaWorld(p);guideActionHand.facing=guideActionHand.target;guideActionHand.mode='grip';
    guideActionHand.cancel=()=>{pending.current=null;};pending.current={index,age:0,contact:0};
  };
  const resetPoint:Vec3=[ALPHA_SHALLOWS.center[0]-7.6,12.96,ALPHA_SHALLOWS.center[2]+1.55];
  useInteractable({id:'alpha-shallows-reset',position:alphaWorld(resetPoint),radius:1.5,kind:'exhibit',
    label:{zh:'扳动回程杆，重排石桥',en:'Return the stones with the bank lever'},
    enabled:()=>!pending.current&&campPropActor.available&&campPropActor.grounded&&canResetShallows(state,playerLocal()),
    onInteract:()=>{if(resetShallows(state,playerLocal())){release();clearShallowsRipples(ripples);render(n=>n+1);}}});
  useEffect(()=>{
    const suspend=()=>{release();clearShallowsRipples(ripples);};
    const off=useWorldStore.subscribe((w,previous)=>{const p=alphaLocal(w.position);if(w.paused||w.shot||w.card||w.activeVehicle||w.seat||w.poolInspect||w.campReturnRequest!==previous.campReturnRequest||w.recoverRequest!==previous.recoverRequest||Math.hypot(p[0]-ALPHA_SHALLOWS.center[0],p[2]-ALPHA_SHALLOWS.center[2])>=28)suspend();});
    const hide=()=>{if(document.hidden)suspend();};window.addEventListener('blur',suspend);document.addEventListener('visibilitychange',hide);
    return()=>{off();window.removeEventListener('blur',suspend);document.removeEventListener('visibilitychange',hide);suspend();};
  },[]);
  useFrame((_,delta)=>{
    const w=useWorldStore.getState(),actor=playerLocal(),near=Math.hypot(actor[0]-ALPHA_SHALLOWS.center[0],actor[2]-ALPHA_SHALLOWS.center[2])<28;
    const frozen=w.paused||!!w.shot||!!w.card||!!w.activeVehicle||!!w.seat||w.poolInspect||document.hidden||!near||!campPropActor.available;
    stepShallowsRipples(ripples,delta,!frozen);
    if(frozen){release();return;}
    const dt=Math.min(delta,.05);clock.current=(clock.current+dt)%1024;waterClock.value=clock.current;
    if(!visited.current&&campPropActor.available&&Math.abs(actor[1]-12)<3&&Math.hypot(actor[0]-ALPHA_SHALLOWS.center[0],actor[2]-ALPHA_SHALLOWS.center[2])<10){visited.current=true;callbacks.current.onVisit?.();}
    const hand=pending.current;
    if(hand){
      hand.age+=dt;const palm=guideActionHand.palm,target=guideActionHand.target;
      if(guideActionHand.owner!==HAND_OWNER||!campPropActor.available||!campPropActor.grounded||!target||hand.age>2.5){release();}
      else{const touching=!!palm&&Math.hypot(palm[0]-target[0],palm[1]-target[1],palm[2]-target[2])<.12;
        hand.contact=touching?hand.contact+dt:0;
        if(hand.contact>.1&&pushShallowsStone(state,hand.index,actor)){release();render(n=>n+1);}
      }
    }
    const was=state.active;if(stepShallowsStone(state,dt,actor)&&was!==null)armShallowsRipple(ripples,was);
    if(was!==null&&state.active===null)render(n=>n+1);
    const done=shallowsComplete(state);if(done!==complete.current){complete.current=done;callbacks.current.onCompleteChange?.(done);}
    Object.assign(alphaShallowsProbe,{visited:visited.current,completed:done,snapped:state.progress.filter(p=>p===1).length,moving:state.active,resets:state.resets});
    if(lever.current)lever.current.rotation.x=(done?-.4:.3);
  });
  return <group name="alpha-shallows-eight-rune-crossing">
    <Craft name="alpha-shallows-grooves-banks-and-bypass" parts={site}/>
    <ShallowWater clock={waterClock} ripples={ripples}/>
    <RigidBody type="fixed" colliders={false} userData={{surface:true,solid:true,assetId:'alpha-shallows-independent-crossing'}}>
      {SHALLOWS_BYPASS.map((p,i)=><CuboidCollider key={i} position={p} args={[.69,.24,.9]} friction={.9}/>)}
      {[-1,1].map(side=><CuboidCollider key={side} position={[ALPHA_SHALLOWS.center[0]+side*7.2,SHALLOWS_DECK_Y-.25,ALPHA_SHALLOWS.center[2]-1]} args={[1.275,.25,1.125]}/>)}
    </RigidBody>
    {Array.from({length:SHALLOWS_STONE_COUNT},(_,i)=><RuneStone key={i} index={i} state={state} request={request} onArrival={confirmArrival}/>)}
    <group ref={lever} position={resetPoint}><Craft name="alpha-shallows-reset-lever" parts={leverParts}/></group>
  </group>;
}
