import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody, TrimeshCollider } from '@react-three/rapier';
import { BufferGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { useInteractable } from '../../WorldInteract';
import { useWorldStore } from '../../store';
import { useWorldAudioSettings } from '../../world-audio-settings';
import { campPropActor, cancelCampPropInteraction } from '../../camp-prop-interactions';
import { guideActionHand, releaseGuideActionHand } from '../../rides/guide-action-hand';
import { cancelAlphaHand } from '../alpha-state';
import { alphaLocal, alphaWorld } from '../alpha-layout';
import { alphaMaterial } from '../alpha-materials';
import type { AlphaFinish } from '../alpha-art';
import type { Vec3 } from '../../types';
import { caveChime, caveChimeTarget, caveLampRack, caveMinerLamp, caveMural, caveScaffold, createCaveArt } from './cave-art';
import { createCaveAudio } from './cave-audio';
import { CAVE_CHIME_ANCHOR, CAVE_CHIME_YAW, CAVE_ECHO_SECONDS, CAVE_LAMP_HOME, alphaCaveLight, registerCaveCancellation, cancelCaveState, caveEchoSequence, caveNear, caveRingPulse, createCaveState, startCaveEcho, tickCaveState, type CaveChime } from './cave-state';
import { CAVE_LAMP_LABELS,caveLampInteraction,caveLampPickupReach,caveLampPickupNotice,caveLampApproach } from './batch2-station-feedback';
import { PICKUP_DISCOVERY_RADIUS } from '../../pickup-approach';
import { heldPropPoint } from '../../accepted-action';
import { startCaveLamp } from './cave-state';
import { surfaceColliderBuffers, type StaticSurface } from '../../static-surface-asset';
import type { CavePart } from './cave-artifact';
import { advanceCaveExploration, readCaveMural, caveReturnEchoSequence, caveGuideRingOpacity, caveAtWaypoint, caveRoutePoints } from './cave-exploration';
const OWNER='alpha-echo-cave';
const LAMP_HOOK=alphaWorld([CAVE_LAMP_HOME[0]+.32,CAVE_LAMP_HOME[1]+1.48,CAVE_LAMP_HOME[2]]);
type Parts=({finish:AlphaFinish;geometry:BufferGeometry}&Partial<StaticSurface>)[];
function Craft({parts,name,wet=false,glow=false}:{parts:Parts;name:string;wet?:boolean;glow?:boolean}) {
  const materials=useMemo(()=>parts.map(p=>{const m=alphaMaterial(p.finish);
    if(wet&&p.finish==='stone'){m.color.set('#777c78');m.roughness=.71;}
    if(p.finish==='roof'){m.color.set('#526467');m.roughness=.55;}
    if(glow&&(p.finish==='metal'||p.finish==='glass')){m.emissive.set('#e9a45a');m.emissiveIntensity=p.finish==='glass'?.65:.22;}
    return m;}),[parts,wet,glow]);
  useEffect(()=>()=>{materials.forEach(m=>m.dispose());},[materials]);
  return <group name={name}>{parts.map((p,i)=><mesh key={p.finish} geometry={p.geometry} material={materials[i]} userData={p.id?{surfaceId:p.id,collision:p.collision,surfaceRole:p.role}:undefined} castShadow receiveShadow/>)}</group>;
}
function SameMeshCollider({part}:{part:CavePart}) {
  const buffers=useMemo(()=>surfaceColliderBuffers(part),[part]);
  return buffers?<group name={`${part.id}/collider`} userData={{surfaceId:part.id,collision:part.collision,surfaceRole:part.role}}>
    <TrimeshCollider args={[buffers.vertices,buffers.indices]} friction={.9}/>
  </group>:null;
}
function StaticCraft({parts,name,bodyName,wet=false}:{parts:CavePart[];name:string;bodyName:string;wet?:boolean}) {
  return <RigidBody type="fixed" colliders={false} userData={{solid:parts.some(p=>p.role==='enclosure'),surface:parts.some(p=>p.role==='floor')}} name={bodyName}>
    <Craft parts={parts} name={name} wet={wet}/>
    {parts.map(p=><SameMeshCollider key={p.id} part={p}/>)}
  </RigidBody>;
}
function ChimeInteraction({index,onRing,enabled}:{index:CaveChime;onRing:(n:CaveChime)=>void;enabled:()=>boolean}) {
  useInteractable({id:`alpha-cave-chime-${index}`,position:alphaWorld(caveChimeTarget(index)),radius:1.45,kind:'exhibit',
    label:index===2?{zh:'敲沉铜管，听左侧回声',en:'Strike the low chime'}:{zh:index===1?'敲高铜管，听穿山回声':'敲铜管，循回声穿洞',en:index===1?'Strike the high chime':'Strike the bronze chime'},
    enabled,onInteract:()=>onRing(index)});return null;
}

/** Mount once inside the existing ALPHA_ORIGIN group. Floor, shell and solid
 * collision share the authored mesh. No cap or collider covers the daylight exit. */
export default function AlphaEchoCave({onVisit,onComplete}:{onVisit?:()=>void;onComplete?:()=>void}={}) {
  const built=useMemo(createCaveArt,[]),rack=useMemo(caveLampRack,[]),lamp=useMemo(caveMinerLamp,[]),scaffold=useMemo(caveScaffold,[]),mural=useMemo(caveMural,[]),chimes=useMemo(()=>[0,1,2].map(caveChime),[]);
  const state=useRef(createCaveState()),audio=useMemo(createCaveAudio,[]),handLamp=useRef<Group>(null),rackLamp=useRef<Group>(null),rings=useRef<(Mesh|null)[]>([]),chimeRefs=useRef<(Group|null)[]>([]);
  const echoFromChime=useRef(true);
  const sequence=useRef(caveEchoSequence(0)),target=useRef<Vec3|null>(null),cancelling=useRef(false);
  const forward=useMemo(()=>new Vector3(),[]),up=useMemo(()=>new Vector3(),[]);
  const ringMaterials=useMemo(()=>Array.from({length:4},()=>new MeshBasicMaterial({color:'#ffd18c',transparent:true,opacity:0,depthWrite:false,side:DoubleSide,toneMapped:false})),[]);
  function cancel() {
    if(cancelling.current)return;cancelling.current=true;
    if(state.current.lamp==='rack'&&state.current.echoAge>=CAVE_ECHO_SECONDS&&guideActionHand.owner!==OWNER&&!alphaCaveLight.active&&!state.current.exploration.route){cancelling.current=false;return;}
    cancelCaveState(state.current);audio.stop();alphaCaveLight.active=false;alphaCaveLight.intensity=0;target.current=null;
    if(handLamp.current)handLamp.current.visible=false;if(rackLamp.current)rackLamp.current.visible=true;
    if(guideActionHand.owner===OWNER)Object.assign(guideActionHand,{owner:null,target:null,facing:null,palm:null,cancel:null,mode:'reach'});
    rings.current.forEach(r=>{if(r)r.visible=false;});chimeRefs.current.forEach(g=>{if(g)g.rotation.z=0;});cancelling.current=false;
  }
  const pick=()=>{
    if(state.current.lamp!=='rack'||!caveLampPickupReach(campPropActor.position,LAMP_HOOK,campPropActor.grounded))return;
    cancelAlphaHand();cancelCampPropInteraction('cave-lamp');releaseGuideActionHand();
    const grip=[...LAMP_HOOK] as Vec3;
    target.current=grip;startCaveLamp(state.current);
    Object.assign(guideActionHand,{owner:OWNER,target:grip,facing:grip,mode:'grip',cancel});
  };
  const lampAction=()=>caveLampInteraction(state.current.lamp,guideActionHand.owner===OWNER,
    caveLampPickupReach(campPropActor.position,LAMP_HOOK,campPropActor.grounded));
  const canUseLamp=()=>{
    const w=useWorldStore.getState(),p=campPropActor.position;
    return !!lampAction()&&campPropActor.available&&
      !w.paused&&!w.shot&&!w.card&&!w.activeVehicle&&!w.seat&&!w.poolInspect&&!document.hidden&&
      Math.hypot(p[0]-LAMP_HOOK[0],p[2]-LAMP_HOOK[2])<=PICKUP_DISCOVERY_RADIUS&&Math.abs(p[1]-LAMP_HOOK[1])<=2.5;
  };
  useInteractable({id:'alpha-cave-miner-lamp',position:LAMP_HOOK,radius:PICKUP_DISCOVERY_RADIUS,kind:'exhibit',
    get label(){return CAVE_LAMP_LABELS[lampAction()==='return'?'return':'take'];},
    get approach(){return state.current.lamp==='rack'?caveLampApproach(LAMP_HOOK):undefined;},
    enabled:canUseLamp,onInteract:()=>{
      if(!canUseLamp())return;
      const action=lampAction();
      if(action==='return'){
        cancel();useWorldStore.setState({toast:{zh:'矿灯已挂回。',en:'The miner lamp is back on its hook.',at:performance.now()}});
      }else if(action==='take')pick();
      else useWorldStore.setState({toast:{zh:'靠近挂架伸出矿灯的一侧，再按 E 取灯。',en:'Move to the lamp side of the rack, then press E to take it.',at:performance.now()}});
    }});
  const canExplore=()=>{
    const w=useWorldStore.getState();
    return campPropActor.available&&!w.paused&&!w.shot&&!w.card&&!w.poolInspect&&!w.activeVehicle&&!w.seat&&!document.hidden;
  };
  const ring=(index:CaveChime)=>{
    const firstVisit=!state.current.exploration.visited;
    if(!canExplore()||!startCaveEcho(state.current,index))return;
    echoFromChime.current=true;sequence.current=caveEchoSequence(index);audio.play(sequence.current);
    if(firstVisit)onVisit?.();
    useWorldStore.setState({toast:{zh:index===2?'沉声向左折去。沿暖色矿环看看，岔口始终能走回来。':'清亮回声逐段穿过岩洞，下一道矿环会留在前方。',en:index===2?'The low echo bends left. Follow the warm rings; the fork remains open behind you.':'The clear echo travels through the cave. Its next warm ring stays ahead.',at:performance.now()}});
  };
  useInteractable({id:'alpha-cave-mural',position:alphaWorld([built.muralPosition[0],built.muralPosition[1]+1.4,built.muralPosition[2]]),radius:1.9,kind:'exhibit',
    label:{zh:'看看山水日轮壁画，循原路回岔口',en:'Read the mountain, water and sun relief; retrace the side passage'},
    enabled:()=>canExplore()&&caveAtWaypoint(alphaLocal(campPropActor.position),caveRoutePoints('mural').at(-1)!),
    onInteract:()=>{
      const end=caveRoutePoints('mural').at(-1)!;
      if(!canExplore()||!caveAtWaypoint(alphaLocal(campPropActor.position),end))return;
      const returning=readCaveMural(state.current.exploration);
      if(returning){state.current.echoAge=0;echoFromChime.current=false;sequence.current=caveReturnEchoSequence();audio.play(sequence.current);}
      // The relief remains readable without ringing a chime; only a genuine
      // echo-led round trip publishes this optional experience's completion.
      const message=returning?{zh:'岩面刻着山、水和日轮。暖色矿环正沿来路回到岔口。',en:'Mountains, water and a sun are carved into the rock. The warm rings retrace your way to the fork.'}
        :{zh:'岩面刻着山、水和日轮。沿来时的侧道就能回到岔口。',en:'Mountains, water and a sun are carved into the rock. The side passage leads back to the fork.'};
      useWorldStore.setState({toast:{...message,at:performance.now()}});
    }});

  useEffect(()=>{
    const unregister=registerCaveCancellation(cancel);
    const off=useWorldStore.subscribe((s,p)=>{
      if(s.paused||s.shot||s.card||s.poolInspect||s.activeVehicle||s.seat||s.recoverRequest!==p.recoverRequest||s.campReturnRequest!==p.campReturnRequest||!caveNear(alphaLocal(s.position),2))cancel();
      if((s.paused&&!p.paused)||(!caveNear(alphaLocal(s.position),2)&&caveNear(alphaLocal(p.position),2)))audio.stop();
    });
    const mute=useWorldAudioSettings.subscribe(()=>audio.sync());
    const blur=()=>{cancel();audio.stop();},hide=()=>{if(document.hidden)blur();};window.addEventListener('blur',blur);document.addEventListener('visibilitychange',hide);
    return()=>{off();mute();window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',hide);cancel();audio.dispose();unregister();};
  },[audio]);
  useEffect(()=>()=>{for(const parts of [built.solid,built.floor,built.detail,built.seams,rack,lamp,scaffold,mural,...chimes])parts.forEach(p=>p.geometry.dispose());ringMaterials.forEach(m=>m.dispose());},[built,rack,lamp,scaffold,mural,chimes,ringMaterials]);
  useFrame(({camera},delta)=>{
    const w=useWorldStore.getState(),s=state.current,near=caveNear(alphaLocal(w.position));
    if(!near){if(s.lamp!=='rack'||s.echoAge<CAVE_ECHO_SECONDS||s.exploration.route)cancel();return;}
    if(!canExplore())return;
    if(s.lamp!=='rack'){
      if(!campPropActor.available||guideActionHand.owner!==OWNER||!target.current){cancel();return;}
      if(s.lamp==='carried'){
        const p=campPropActor.position,yaw=campPropActor.yaw,t=target.current;
        t[0]=p[0]+Math.cos(yaw)*.43+Math.sin(yaw)*.24;t[1]=p[1]+.34;t[2]=p[2]-Math.sin(yaw)*.43+Math.cos(yaw)*.24;
        guideActionHand.facing=null;
      }
    }
    const palm=guideActionHand.owner===OWNER?guideActionHand.palm:null,t=target.current;
    const was=s.lamp;tickCaveState(s,delta,
      s.lamp!=='reaching'||caveLampPickupReach(campPropActor.position,LAMP_HOOK,campPropActor.grounded));
    if(was==='reaching'&&s.lamp==='rack'){cancel();return;}
    const pickupNotice=caveLampPickupNotice(was,s.lamp);
    if(pickupNotice)useWorldStore.setState({toast:{...pickupNotice,at:performance.now()}});
    if(rackLamp.current)rackLamp.current.visible=s.lamp!=='carried';
    const held=t?heldPropPoint(palm,t):null;
    if(handLamp.current){handLamp.current.visible=s.lamp==='carried'&&!!held;if(held){const p=alphaLocal(held);handLamp.current.position.set(p[0],p[1]-.76,p[2]);handLamp.current.rotation.y=campPropActor.yaw;}}
    alphaCaveLight.active=s.lamp==='carried'&&!!held;
    if(alphaCaveLight.active&&held){alphaCaveLight.position[0]=held[0];alphaCaveLight.position[1]=held[1]-.43;alphaCaveLight.position[2]=held[2];alphaCaveLight.intensity=7.5;}
    else alphaCaveLight.intensity=0;
    if(s.echoAge<CAVE_ECHO_SECONDS){
      camera.getWorldDirection(forward);up.set(0,1,0).applyQuaternion(camera.quaternion);audio.listener(camera.position.toArray(),forward.toArray(),up.toArray());
    }
    const explored=advanceCaveExploration(s.exploration,alphaLocal(w.position),s.echoAge);
    if(explored){
      const message=explored.kind==='mural'?{zh:'沉声落在这面壁画前。走近看看，再循原路回岔口。',en:'The low echo ends at this relief. Look closer, then return along the side passage.'}
        :explored.kind==='return'?{zh:'回到岔口了，清亮的回声通向洞外。',en:'Back at the fork. The clear chimes lead toward daylight.'}
        :{zh:'回声带你穿过了岩洞，前面接回山路。',en:'The echoes have led you through the cave and back to the mountain trail.'};
      useWorldStore.setState({toast:{...message,at:performance.now()}});
      if(explored.firstComplete)onComplete?.();
    }
    rings.current.forEach((mesh,i)=>{
      if(!mesh)return;
      const echo=sequence.current[i],pulse=echo?caveRingPulse(s.echoAge,echo.delay):null;
      const guide=echo?caveGuideRingOpacity(s.exploration,i,s.echoAge,echo.delay):0;
      mesh.visible=!!pulse||guide>0;
      if(echo&&mesh.visible){mesh.position.fromArray(echo.position);mesh.scale.setScalar(pulse?.scale??1.35);mesh.quaternion.copy(camera.quaternion);(mesh.material as MeshBasicMaterial).opacity=Math.max(pulse?.opacity??0,guide);}
    });
    chimeRefs.current.forEach((g,i)=>{if(g)g.rotation.z=echoFromChime.current&&i===s.chime&&s.echoAge<2.5?Math.sin(s.echoAge*19)*Math.exp(-s.echoAge*1.8)*.15:0;});
  });
  return <group name="alpha-echo-cave-station-6">
    <StaticCraft parts={built.solid} name="alpha-cave-thick-faceted-rock-shell" bodyName="alpha-cave-solid-rock"/>
    <StaticCraft parts={built.floor} name="alpha-cave-walkable-graded-floor" bodyName="alpha-cave-floor-support" wet/>
    <Craft parts={built.detail} name="alpha-cave-gravel-wetstone-moss" wet/>
    <Craft parts={built.seams} name="alpha-cave-warm-mineral-bedding" glow/>
    <group position={CAVE_LAMP_HOME}><Craft parts={rack} name="alpha-cave-forged-lamp-hook"/><group ref={rackLamp} position={[.32,.72,0]}><Craft parts={lamp} name="alpha-cave-racked-miner-lamp" glow/></group>
      <RigidBody type="fixed" colliders={false} userData={{solid:true}}><CuboidCollider position={[0,.18,0]} args={[.41,.18,.375]}/><CuboidCollider position={[0,.98,0]} args={[.08,.68,.08]}/></RigidBody>
    </group>
    <group ref={handLamp} visible={false}><Craft parts={lamp} name="alpha-cave-held-miner-lamp" glow/></group>
    <group position={CAVE_CHIME_ANCHOR} rotation={[0,CAVE_CHIME_YAW,0]}>
      <Craft parts={scaffold} name="alpha-cave-joined-timber-chime-frame"/>
      {chimes.map((parts,i)=><group key={i} ref={g=>{chimeRefs.current[i]=g;}} position={[(i-1)*.65,3.05,.05]}><Craft parts={parts} name={`alpha-cave-bronze-chime-${i}`}/></group>)}
      <RigidBody type="fixed" colliders={false} userData={{solid:true}}>{[-1.12,1.12].map(x=><group key={x}><CuboidCollider position={[x,.19,0]} args={[.32,.19,.37]}/><CuboidCollider position={[x,1.93,0]} args={[.115,1.63,.145]}/></group>)}<CuboidCollider position={[0,3.56,0]} args={[1.325,.13,.175]}/></RigidBody>
    </group>
    <group position={built.muralPosition} rotation={[0,built.muralYaw,0]}><Craft parts={mural} name="alpha-cave-carved-mountain-water-sun-mural" glow/></group>
    {([0,1,2] as CaveChime[]).map(index=><ChimeInteraction key={index} index={index} onRing={ring} enabled={canExplore}/>)}
    {[0,1,2,3].map(i=><mesh key={i} ref={m=>{rings.current[i]=m;}} material={ringMaterials[i]} visible={false} name={`alpha-cave-echo-ring-${i}`}><torusGeometry args={[.55,.023,5,36]}/></mesh>)}
  </group>;
}
