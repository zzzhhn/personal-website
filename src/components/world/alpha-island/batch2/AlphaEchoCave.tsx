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
const OWNER='alpha-echo-cave';
type Parts={finish:AlphaFinish;geometry:BufferGeometry}[];
function Craft({parts,name,wet=false,glow=false}:{parts:Parts;name:string;wet?:boolean;glow?:boolean}) {
  const materials=useMemo(()=>parts.map(p=>{const m=alphaMaterial(p.finish);
    if(wet&&p.finish==='stone'){m.color.set('#777c78');m.roughness=.71;}
    if(p.finish==='roof'){m.color.set('#526467');m.roughness=.55;}
    if(glow&&(p.finish==='metal'||p.finish==='glass')){m.emissive.set('#e9a45a');m.emissiveIntensity=p.finish==='glass'?.65:.22;}
    return m;}),[parts,wet,glow]);
  useEffect(()=>()=>{materials.forEach(m=>m.dispose());},[materials]);
  return <group name={name}>{parts.map((p,i)=><mesh key={p.finish} geometry={p.geometry} material={materials[i]} castShadow receiveShadow/>)}</group>;
}
function SameMeshCollider({geometry}:{geometry:BufferGeometry}) {
  const buffers=useMemo(()=>({v:new Float32Array(geometry.getAttribute('position').array),i:geometry.index?new Uint32Array(geometry.index.array):new Uint32Array(Array.from({length:geometry.getAttribute('position').count},(_,i)=>i))}),[geometry]);
  return <TrimeshCollider args={[buffers.v,buffers.i]} friction={.9}/>;
}
function ChimeInteraction({index,onRing}:{index:CaveChime;onRing:(n:CaveChime)=>void}) {
  useInteractable({id:`alpha-cave-chime-${index}`,position:alphaWorld(caveChimeTarget(index)),radius:1.45,kind:'exhibit',
    label:index===2?{zh:'敲沉铜管，听左侧回声',en:'Strike the low chime'}:{zh:index===1?'敲高铜管，听穿山回声':'敲铜管，循回声穿洞',en:index===1?'Strike the high chime':'Strike the bronze chime'},
    onInteract:()=>onRing(index)});return null;
}

/** Mount once inside the existing ALPHA_ORIGIN group. Floor, shell and solid
 * collision share the authored mesh. No cap or collider covers the daylight exit. */
export default function AlphaEchoCave() {
  const built=useMemo(createCaveArt,[]),rack=useMemo(caveLampRack,[]),lamp=useMemo(caveMinerLamp,[]),scaffold=useMemo(caveScaffold,[]),mural=useMemo(caveMural,[]),chimes=useMemo(()=>[0,1,2].map(caveChime),[]);
  const state=useRef(createCaveState()),audio=useMemo(createCaveAudio,[]),handLamp=useRef<Group>(null),rackLamp=useRef<Group>(null),rings=useRef<(Mesh|null)[]>([]),chimeRefs=useRef<(Group|null)[]>([]);
  const sequence=useRef(caveEchoSequence(0)),target=useRef<Vec3|null>(null),cancelling=useRef(false);
  const forward=useMemo(()=>new Vector3(),[]),up=useMemo(()=>new Vector3(),[]);
  const ringMaterials=useMemo(()=>Array.from({length:4},()=>new MeshBasicMaterial({color:'#ffd18c',transparent:true,opacity:0,depthWrite:false,side:DoubleSide,toneMapped:false})),[]);
  function cancel() {
    if(cancelling.current)return;cancelling.current=true;
    if(state.current.lamp==='rack'&&state.current.echoAge>=CAVE_ECHO_SECONDS&&guideActionHand.owner!==OWNER&&!alphaCaveLight.active){cancelling.current=false;return;}
    cancelCaveState(state.current);audio.stop();alphaCaveLight.active=false;alphaCaveLight.intensity=0;target.current=null;
    if(handLamp.current)handLamp.current.visible=false;if(rackLamp.current)rackLamp.current.visible=true;
    if(guideActionHand.owner===OWNER)Object.assign(guideActionHand,{owner:null,target:null,facing:null,palm:null,cancel:null,mode:'reach'});
    rings.current.forEach(r=>{if(r)r.visible=false;});chimeRefs.current.forEach(g=>{if(g)g.rotation.z=0;});cancelling.current=false;
  }
  const pick=()=>{
    if(state.current.lamp!=='rack')return;
    cancelAlphaHand();cancelCampPropInteraction('cave-lamp');releaseGuideActionHand();
    const grip=alphaWorld([CAVE_LAMP_HOME[0]+.32,CAVE_LAMP_HOME[1]+1.48,CAVE_LAMP_HOME[2]]);
    target.current=grip;state.current.lamp='reaching';state.current.reachTime=0;
    Object.assign(guideActionHand,{owner:OWNER,target:grip,facing:grip,mode:'grip',cancel});
  };
  useInteractable({id:'alpha-cave-miner-lamp',position:alphaWorld([CAVE_LAMP_HOME[0]+.32,CAVE_LAMP_HOME[1]+1.48,CAVE_LAMP_HOME[2]]),radius:1.35,kind:'exhibit',label:{zh:'从挂钩取矿灯',en:'Take the miner lamp'},enabled:()=>state.current.lamp==='rack',onInteract:pick});
  const ring=(index:CaveChime)=>{
    const w=useWorldStore.getState();if(w.paused||document.hidden||!startCaveEcho(state.current,index))return;
    sequence.current=caveEchoSequence(index);audio.play(sequence.current);
    useWorldStore.setState({toast:{zh:index===2?'沉声停在壁画前，回头还能看见岔口。':'回声和暖色光环一起通向洞外。',en:index===2?'The dull echo ends at a mural. The fork remains behind you.':'Follow the echoes and warm rings toward daylight.',at:performance.now()}});
  };
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
    if(!near){if(s.lamp!=='rack'||s.echoAge<CAVE_ECHO_SECONDS)cancel();return;}
    if(w.paused||w.shot||document.hidden)return;
    if(s.lamp!=='rack'){
      if(!campPropActor.available||guideActionHand.owner!==OWNER||!target.current){cancel();return;}
      if(s.lamp==='carried'){
        const p=campPropActor.position,yaw=campPropActor.yaw,t=target.current;
        t[0]=p[0]+Math.cos(yaw)*.43+Math.sin(yaw)*.24;t[1]=p[1]+.34;t[2]=p[2]-Math.sin(yaw)*.43+Math.cos(yaw)*.24;
        guideActionHand.facing=null;
      }
    }
    const palm=guideActionHand.owner===OWNER?guideActionHand.palm:null,t=target.current;
    const error=palm&&t?Math.hypot(palm[0]-t[0],palm[1]-t[1],palm[2]-t[2]):Infinity;
    const was=s.lamp;tickCaveState(s,delta,error);
    if(was==='reaching'&&s.lamp==='rack'){cancel();return;}
    if(rackLamp.current)rackLamp.current.visible=s.lamp!=='carried';
    if(handLamp.current){handLamp.current.visible=s.lamp==='carried'&&!!palm;if(palm){const p=alphaLocal(palm);handLamp.current.position.set(p[0],p[1]-.76,p[2]);handLamp.current.rotation.y=campPropActor.yaw;}}
    alphaCaveLight.active=s.lamp==='carried'&&!!palm;
    if(alphaCaveLight.active&&palm){alphaCaveLight.position[0]=palm[0];alphaCaveLight.position[1]=palm[1]-.43;alphaCaveLight.position[2]=palm[2];alphaCaveLight.intensity=7.5;}
    else alphaCaveLight.intensity=0;
    if(s.echoAge<CAVE_ECHO_SECONDS){
      camera.getWorldDirection(forward);up.set(0,1,0).applyQuaternion(camera.quaternion);audio.listener(camera.position.toArray(),forward.toArray(),up.toArray());
    }
    rings.current.forEach((mesh,i)=>{if(!mesh)return;const echo=sequence.current[i],pulse=echo?caveRingPulse(s.echoAge,echo.delay):null;mesh.visible=!!pulse;if(pulse){mesh.position.fromArray(echo.position);mesh.scale.setScalar(pulse.scale);(mesh.material as MeshBasicMaterial).opacity=pulse.opacity;}});
    chimeRefs.current.forEach((g,i)=>{if(g)g.rotation.z=i===s.chime&&s.echoAge<2.5?Math.sin(s.echoAge*19)*Math.exp(-s.echoAge*1.8)*.15:0;});
  });
  return <group name="alpha-echo-cave-station-6">
    <Craft parts={built.solid} name="alpha-cave-thick-faceted-rock-shell"/>
    <Craft parts={built.floor} name="alpha-cave-walkable-graded-floor" wet/>
    <Craft parts={built.detail} name="alpha-cave-gravel-wetstone-moss" wet/>
    <Craft parts={built.seams} name="alpha-cave-warm-mineral-bedding" glow/>
    <RigidBody type="fixed" colliders={false} userData={{solid:true}} name="alpha-cave-solid-rock">{built.solid.map(p=><SameMeshCollider key={p.finish} geometry={p.geometry}/>)}</RigidBody>
    <RigidBody type="fixed" colliders={false} userData={{surface:true}} name="alpha-cave-floor-support">{built.floor.map(p=><SameMeshCollider key={p.finish} geometry={p.geometry}/>)}</RigidBody>
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
    {([0,1,2] as CaveChime[]).map(index=><ChimeInteraction key={index} index={index} onRing={ring}/>)}
    {[0,1,2,3].map(i=><mesh key={i} ref={m=>{rings.current[i]=m;}} material={ringMaterials[i]} visible={false} name={`alpha-cave-echo-ring-${i}`}><torusGeometry args={[.55,.023,5,36]}/></mesh>)}
  </group>;
}
