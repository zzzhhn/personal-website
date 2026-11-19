import {placeSandRouteBall,SAND_BALL_RADIUS} from './alpha-sand-route';
import { ConvexHullCollider, RigidBody, TrimeshCollider, useRapier } from '@react-three/rapier';
import { useOwnedWorldVisual } from '../useOwnedWorldVisual';
import { createWindFlagStand } from './alpha-wind-flag-stand';
import { useEffect,useMemo,useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { DoubleSide,Group,InstancedMesh,Mesh,MeshStandardMaterial,Object3D } from 'three';
import { useInteractable } from '../WorldInteract';
import { useWorldStore } from '../store';
import { interactionActor } from '../actor-activities';
import { guideActionHand } from '../rides/guide-action-hand';
import { alphaLocal,alphaWorld,alphaContainsWorld } from './alpha-layout';
import { alphaMotion,useAlphaStore,advanceAlphaHand,cancelAlphaHand,canReleaseAlphaLantern,releaseAlphaLantern,visitAlphaStation,saveAlphaProgress,ALPHA_LANTERN_CAP,ALPHA_LANTERN_LIFETIME,type AlphaAction } from './alpha-state';
import { ALPHA_TRAIL_STOPS } from './alpha-trail';
import AlphaTumblingSign from './AlphaTumblingSign';
import { alphaMaterial } from './alpha-materials';
import { alphaLanternGeometry } from './alpha-art';
import { primeAlphaAudio,ringAlphaBell,stopAlphaAudio } from './alpha-audio';
import AlphaLantern from './AlphaLantern';
import { lanternHandleHeight } from './alpha-lantern-layout';
import { alphaActionNotice,alphaStonePlacementTarget,alphaMeasuredHandError,alphaLanternCarryTarget,alphaLanternReleaseInteraction } from './alpha-action-reach';
import { alphaActorCanAct, alphaStationInteraction } from './alpha-station-interaction';
import { heldPropPoint } from '../accepted-action';
import { alphaPersonalStone, alphaPersonalStones, createPersonalCairnGeometry } from './alpha-personal-cairn';
const announce=(zh:string,en:string)=>useWorldStore.setState({toast:{zh,en,at:performance.now()}});
function Action({kind}:{kind:AlphaAction}) {
  const wind = useAlphaStore(s => kind === 'wind' ? s.wind : 0);
  const stones = useAlphaStore(s => kind === 'stone' ? s.stones : 0);
  const station = useMemo(() => alphaStationInteraction(kind, wind, primeAlphaAudio, stones), [kind, wind, stones]);
  useInteractable(station);
  return null;
}
function FlyingLanterns(){const b=useMemo(()=>alphaLanternGeometry(),[]),m=useMemo(()=>b.map(x=>alphaMaterial(x.finish)),[b]),refs=useRef<(InstancedMesh|null)[]>([]),dummy=useMemo(()=>new Object3D(),[]);
 useFrame(()=>{const lanterns=alphaMotion.lanterns;refs.current.forEach(mesh=>{if(!mesh)return;mesh.count=lanterns.length;lanterns.forEach((l,i)=>{const t=l.age;dummy.position.set(l.position[0]+t*(.26+l.drift),l.position[1]+t*.62,l.position[2]+Math.sin(t*.25+l.id)*.7+t*.12);dummy.rotation.set(Math.sin(t*.7)*.04,t*.04+l.id,Math.sin(t*.55)*.06);dummy.scale.setScalar(Math.min(1,(ALPHA_LANTERN_LIFETIME-t)/3));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();});});
 useEffect(()=>()=>{b.forEach(x=>x.geometry.dispose());m.forEach(x=>x.dispose());},[b,m]);return <group name="alpha-released-paper-lantern-pool" userData={{worldCollision:'none',collisionReason:'Released paper lights drift upwards, shrink, and expire without blocking the player'}}>{b.map((x,i)=><instancedMesh key={x.finish} ref={v=>{refs.current[i]=v;}} args={[x.geometry,m[i],ALPHA_LANTERN_CAP]} count={0} />)}</group>;}
function WindFlagStand({index}: {index: number}) {
  const stand = useMemo(() => createWindFlagStand(index), [index]);
  useOwnedWorldVisual(stand);
  return <RigidBody type="fixed" colliders={false} position={stand.position} userData={{solid:true, assetId:'alpha-wind-flag-stand'}}>
    {stand.parts.map(part => <group key={part.id}>
      <mesh geometry={part.geometry} userData={{worldCollision:'solid',surfaceId:part.id}}>
        {part.kind === 'mast'
          ? <meshStandardMaterial color="#8c8372" metalness={.6} roughness={.4}/>
          : <meshStandardMaterial color="#898d85"/>}
      </mesh>
      <TrimeshCollider name={part.id} args={[part.vertices,part.indices]}/>
    </group>)}
    <AlphaFlag color={index === 1 ? '#c69a58' : '#b86343'}/>
  </RigidBody>;
}
function WindFlags() {
  useFrame(() => {
    flagUniforms.time.value = alphaMotion.time;
    flagUniforms.strength.value = useAlphaStore.getState().wind;
  });
  return <group><group name="alpha-wind-flag-stands">{[0,1,2].map(index=><WindFlagStand key={index} index={index}/>)}</group><AlphaTumblingSign/></group>;
}
export default function AlphaInteractions(){const carried=useAlphaStore(s=>s.carried),hand=useRef<Group>(null),stoneRef=useRef<Mesh>(null),ball=useRef<Mesh>(null);
 const {world:physics,rapier}=useRapier();
 const marble=useMemo(()=>new rapier.Ball(SAND_BALL_RADIUS),[rapier]);
 const canRelease=()=>alphaActorCanAct()&&canReleaseAlphaLantern();
 useInteractable({id:'alpha-card',position:alphaWorld([-66.3,5.4,-36.9]),radius:1.8,kind:'exhibit',label:{zh:'摘下登山卡和猜想木牌',en:'Take a trail card and idea tag'},enabled:()=>!useAlphaStore.getState().card,onInteract:()=>{useAlphaStore.setState({card:true});visitAlphaStation(1);saveAlphaProgress();announce('登山卡已收好，只记录来过的地方。','Trail card kept. It records places, without a score.');}});
 useInteractable(carried?alphaLanternReleaseInteraction(()=>interactionActor.position,canRelease,()=>{
  if(!canRelease())return;
  const palm=heldPropPoint(guideActionHand.palm,alphaLanternCarryTarget(interactionActor.position,interactionActor.yaw));
  const p=alphaLocal(palm);p[1]-=lanternHandleHeight;if(releaseAlphaLantern(p))announce('纸灯乘风而上。','The paper lantern rises into the clouds.');
 }):null);
 useEffect(()=>{const off=useWorldStore.subscribe((s,p)=>{if(s.paused||s.card||s.activeVehicle||s.seat||s.poolInspect||s.campReturnRequest!==p.campReturnRequest||!alphaContainsWorld(s.position,12))cancelAlphaHand();if(s.paused)stopAlphaAudio();});const hide=()=>{if(document.hidden){cancelAlphaHand();stopAlphaAudio();}};document.addEventListener('visibilitychange',hide);window.addEventListener('blur',cancelAlphaHand);return()=>{off();document.removeEventListener('visibilitychange',hide);window.removeEventListener('blur',cancelAlphaHand);cancelAlphaHand();stopAlphaAudio();};},[]);
 useFrame((_,delta)=>{const world=useWorldStore.getState();if(world.paused||world.shot||document.hidden)return;const dt=Math.min(delta,.08);alphaMotion.time+=dt;alphaMotion.lanterns=alphaMotion.lanterns.filter(l=>(l.age+=dt)<ALPHA_LANTERN_LIFETIME);
 const s=useAlphaStore.getState(),age=alphaMotion.actionClock?.elapsed??0,placing=s.action==='stone'&&age>=.36;if(s.action){const target=alphaMotion.handTarget;if(!interactionActor.available||!target||guideActionHand.owner!=='alpha-island'||guideActionHand.target!==target){cancelAlphaHand();return;}
 if(s.carried){const q=alphaLanternCarryTarget(interactionActor.position,interactionActor.yaw);target[0]=q[0];target[1]=q[1];target[2]=q[2];guideActionHand.facing=null;}
 if(placing){const q=alphaWorld(alphaStonePlacementTarget(s.stones,Math.min(1,(age-.36)/.8)));target[0]=q[0];target[1]=q[1];target[2]=q[2];}
 alphaMotion.handError=alphaMeasuredHandError(guideActionHand.palm,target,guideActionHand.owner);
 const completed=advanceAlphaHand(dt,interactionActor.position,alphaActorCanAct()&&interactionActor.grounded);
 if(completed){if(completed.kind==='bell')ringAlphaBell();const notice=alphaActionNotice(completed.kind,completed.wind);announce(notice.zh,notice.en);}
 }
 if(stoneRef.current){stoneRef.current.visible=useAlphaStore.getState().action==='stone'&&placing;if(stoneRef.current.visible&&alphaMotion.handTarget){
   const stone=alphaPersonalStone(s.stones),p=alphaLocal(heldPropPoint(guideActionHand.palm,alphaMotion.handTarget));
   stoneRef.current.position.set(p[0],p[1]-stone.gripLift,p[2]);stoneRef.current.rotation.y=stone.yaw;stoneRef.current.scale.set(...stone.scale);
 }}
 if(hand.current){hand.current.visible=useAlphaStore.getState().carried;const p=alphaLocal(heldPropPoint(guideActionHand.palm,alphaLanternCarryTarget(interactionActor.position,interactionActor.yaw)));hand.current.position.set(p[0],p[1]-lanternHandleHeight,p[2]);}
 if(ball.current){const t=((alphaMotion.time-alphaMotion.sandAt)/6);ball.current.visible=t>=0&&t<1&&placeSandRouteBall(physics,marble,t,ball.current.position);}
 const pos=alphaLocal(world.position);for(const {n,point:p} of ALPHA_TRAIL_STOPS){if(Math.hypot(pos[0]-p[0],pos[2]-p[2])<8&&Math.abs(pos[1]-p[1])<4)visitAlphaStation(n);}
 });
 return <group name="alpha-playable-stations">{(['bell','sand','tree','wind','stone','lantern'] as AlphaAction[]).map(kind=><Action key={kind} kind={kind}/>)}<group name="alpha-shelf-lanterns">{!carried&&<AlphaLantern shelf={0}/>}<AlphaLantern shelf={1}/></group><AlphaLantern hand={hand}/><FlyingLanterns/><WindFlags/><mesh ref={ball} name="alpha-sand-route-ball" userData={{worldCollision:'none',collisionReason:'Animated marble demonstrates the route after pressing the sand-table button'}} visible={false}><sphereGeometry args={[SAND_BALL_RADIUS,12,8]}/><meshStandardMaterial color="#dba650" metalness={.6} roughness={.3}/></mesh><mesh ref={stoneRef} name="alpha-carried-summit-stone" userData={{worldCollision:'none',collisionReason:'Stone held in the placing hand until the action commits'}} visible={false} scale={[.32,.1,.25]}><sphereGeometry args={[1,10,6]}/><meshStandardMaterial color="#adb3a6" roughness={.94}/></mesh><PlayerCairn/></group>;
}
export function PlayerCairn(){
 const count=useAlphaStore(s=>s.stones);
 const visual=useMemo(createPersonalCairnGeometry,[]);
 useOwnedWorldVisual(visual);
 if(!count)return null;
 return <group name="alpha-personal-cairn">
   <RigidBody type="fixed" colliders={false} userData={{solid:true,assetId:'alpha-personal-cairn'}}>
    {alphaPersonalStones.slice(0,count).map(({id,position,yaw,scale,color},i)=><group key={id} position={position} rotation={[0,yaw,0]}>
      <mesh name={id+'-mesh'} geometry={visual.geometry} scale={scale} userData={{worldCollision:'solid',surfaceId:id}} castShadow>
        <meshStandardMaterial color={color} roughness={.96}/>
      </mesh>
      <ConvexHullCollider name={id} args={[visual.hulls[i]]} friction={.8} restitution={0}/>
    </group>)}
   </RigidBody>
 </group>;
}

const flagUniforms={time:{value:0},strength:{value:0}};
function AlphaFlag({color}:{color:string}){const m=useMemo(()=>{const material=new MeshStandardMaterial({color,side:DoubleSide,roughness:.95});material.onBeforeCompile=s=>{s.uniforms.uAlphaFlagTime=flagUniforms.time;s.uniforms.uAlphaFlagStrength=flagUniforms.strength;s.vertexShader='uniform float uAlphaFlagTime;uniform float uAlphaFlagStrength;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfloat freeEdge=pow(clamp((position.x+.65)/1.3,0.,1.),1.5); transformed.z+=sin(position.x*8.-uAlphaFlagTime*(2.5+uAlphaFlagStrength*1.8)+position.y*4.)*freeEdge*(.04+.065*uAlphaFlagStrength);');};material.customProgramCacheKey=()=> 'alpha-woven-flag-v1';return material;},[color]);useEffect(()=>()=>m.dispose(),[m]);return <mesh position={[.7,3,0]} material={m} userData={{worldCollision:'none',collisionReason:'The flexible single-sided cloth is traversable beside its solid mast'}}><planeGeometry args={[1.3,.65,12,4]}/></mesh>;}
