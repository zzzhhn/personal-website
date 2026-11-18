import { useEffect,useMemo,useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { DoubleSide,Group,InstancedMesh,Mesh,MeshStandardMaterial,Object3D } from 'three';
import { useInteractable } from '../WorldInteract';
import { useWorldStore } from '../store';
import { interactionActor } from '../actor-activities';
import { guideActionHand } from '../rides/guide-action-hand';
import { alphaLocal,alphaWorld,alphaContainsWorld,ALPHA_MAIN_PATH } from './alpha-layout';
import { alphaMotion,useAlphaStore,advanceAlphaHand,cancelAlphaHand,canReleaseAlphaLantern,releaseAlphaLantern,visitAlphaStation,saveAlphaProgress,ALPHA_LANTERN_CAP,ALPHA_LANTERN_LIFETIME,type AlphaAction } from './alpha-state';
import { ALPHA_TRAIL_STOPS } from './alpha-trail';
import { alphaGroundHeight as alphaHeight } from './alpha-terrain';
import { alphaMaterial } from './alpha-materials';
import { alphaLanternGeometry } from './alpha-art';
import { primeAlphaAudio,ringAlphaBell,stopAlphaAudio } from './alpha-audio';
import { AlphaLantern } from './AlphaScenery';
import { alphaActionNotice,alphaStonePlacementTarget,alphaMeasuredHandError,alphaLanternCarryTarget,alphaLanternReleaseInteraction } from './alpha-action-reach';
import { alphaActorCanAct, alphaStationInteraction } from './alpha-station-interaction';
import { heldPropPoint } from '../accepted-action';
const announce=(zh:string,en:string)=>useWorldStore.setState({toast:{zh,en,at:performance.now()}});
function Action({kind}:{kind:AlphaAction}) {
  const wind = useAlphaStore(s => kind === 'wind' ? s.wind : 0);
  const station = useMemo(() => alphaStationInteraction(kind, wind, primeAlphaAudio), [kind, wind]);
  useInteractable(station);
  return null;
}
function FlyingLanterns(){const b=useMemo(()=>alphaLanternGeometry(),[]),m=useMemo(()=>b.map(x=>alphaMaterial(x.finish)),[b]),refs=useRef<(InstancedMesh|null)[]>([]),dummy=useMemo(()=>new Object3D(),[]);
 useFrame(()=>{const lanterns=alphaMotion.lanterns;refs.current.forEach(mesh=>{if(!mesh)return;mesh.count=lanterns.length;lanterns.forEach((l,i)=>{const t=l.age;dummy.position.set(l.position[0]+t*(.26+l.drift),l.position[1]+t*.62,l.position[2]+Math.sin(t*.25+l.id)*.7+t*.12);dummy.rotation.set(Math.sin(t*.7)*.04,t*.04+l.id,Math.sin(t*.55)*.06);dummy.scale.setScalar(Math.min(1,(ALPHA_LANTERN_LIFETIME-t)/3));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();});});
 useEffect(()=>()=>{b.forEach(x=>x.geometry.dispose());m.forEach(x=>x.dispose());},[b,m]);return <group name="alpha-released-paper-lantern-pool">{b.map((x,i)=><instancedMesh key={x.finish} ref={v=>{refs.current[i]=v;}} args={[x.geometry,m[i],ALPHA_LANTERN_CAP]} count={0} />)}</group>;}
function WindFlags(){const g=useRef<Group>(null),paper=useRef<Group>(null);useFrame(()=>{const strength=useAlphaStore.getState().wind,t=alphaMotion.time;flagUniforms.time.value=t;flagUniforms.strength.value=strength;if(paper.current){const a=Math.min(9,Math.max(0,alphaMotion.time-alphaMotion.windAt)),x=22+Math.min(28,a*3.1)*(strength===2?1:0),theta=strength===2?a*3:0,z=-40+Math.sin(a*3)*.1,vertical=Math.max(Math.abs(Math.sin(theta))*.25+Math.abs(Math.cos(theta))*.25,Math.abs(Math.cos(theta))*.8+Math.abs(Math.sin(theta))*.04);paper.current.position.set(x,alphaHeight(x,z)+vertical,z);paper.current.rotation.set(0,0,theta);}});return <group><group ref={g}>{[0,1,2].map(i=><group key={i} position={[22+i*2.4,38,-45-i]}><mesh position={[0,1.8,0]}><cylinderGeometry args={[.04,.06,3.6,8]}/><meshStandardMaterial color="#8c8372" metalness={.6} roughness={.4}/></mesh><AlphaFlag color={i===1?'#c69a58':'#b86343'}/><mesh position={[0,.12,0]}><boxGeometry args={[.6,.24,.65]}/><meshStandardMaterial color="#898d85"/></mesh></group>)}</group><group ref={paper} position={[22,38.8,-40]}><mesh><boxGeometry args={[.5,.5,.04]}/><meshStandardMaterial color="#dbc696" roughness={.95}/></mesh><mesh position={[0,-.4,0]}><cylinderGeometry args={[.035,.04,.8,8]}/><meshStandardMaterial color="#82633f"/></mesh></group></group>;}
export default function AlphaInteractions(){const carried=useAlphaStore(s=>s.carried),hand=useRef<Group>(null),stoneRef=useRef<Mesh>(null),ball=useRef<Mesh>(null);
 const canRelease=()=>alphaActorCanAct()&&canReleaseAlphaLantern();
 useInteractable({id:'alpha-card',position:alphaWorld([-66.3,5.4,-36.9]),radius:1.8,kind:'exhibit',label:{zh:'摘下登山卡和猜想木牌',en:'Take a trail card and idea tag'},enabled:()=>!useAlphaStore.getState().card,onInteract:()=>{useAlphaStore.setState({card:true});visitAlphaStation(1);saveAlphaProgress();announce('登山卡已收好，只记录来过的地方。','Trail card kept. It records places, without a score.');}});
 useInteractable(carried?alphaLanternReleaseInteraction(()=>interactionActor.position,canRelease,()=>{
  if(!canRelease())return;
  const palm=heldPropPoint(guideActionHand.palm,alphaLanternCarryTarget(interactionActor.position,interactionActor.yaw));
  const p=alphaLocal(palm);p[1]-=.89;if(releaseAlphaLantern(p))announce('纸灯乘风而上。','The paper lantern rises into the clouds.');
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
 if(stoneRef.current){stoneRef.current.visible=useAlphaStore.getState().action==='stone'&&placing;if(alphaMotion.handTarget){const p=alphaLocal(heldPropPoint(guideActionHand.palm,alphaMotion.handTarget));stoneRef.current.position.set(p[0],p[1]-.08,p[2]);}}
 if(hand.current){hand.current.visible=useAlphaStore.getState().carried;const p=alphaLocal(heldPropPoint(guideActionHand.palm,alphaLanternCarryTarget(interactionActor.position,interactionActor.yaw)));hand.current.position.set(p[0],p[1]-.89,p[2]);}
 if(ball.current){const t=((alphaMotion.time-alphaMotion.sandAt)/6);ball.current.visible=t>=0&&t<1;if(t>=0&&t<1){const n=t*(ALPHA_MAIN_PATH.length-1),i=Math.floor(n),p=ALPHA_MAIN_PATH[i],q=ALPHA_MAIN_PATH[Math.min(i+1,ALPHA_MAIN_PATH.length-1)],f=n-i;ball.current.position.set(-64+(p[0]+(q[0]-p[0])*f)/95,5.49+(p[1]+(q[1]-p[1])*f)/180,-39.9+(p[2]+(q[2]-p[2])*f)/100);}}
 const pos=alphaLocal(world.position);for(const {n,point:p} of ALPHA_TRAIL_STOPS){if(Math.hypot(pos[0]-p[0],pos[2]-p[2])<8&&Math.abs(pos[1]-p[1])<4)visitAlphaStation(n);}
 });
 return <group name="alpha-playable-stations">{(['bell','sand','tree','wind','stone','lantern'] as AlphaAction[]).map(kind=><Action key={kind} kind={kind}/>)}<group visible={!carried}><AlphaLantern position={[-8.65,83.3,41.7]}/></group><AlphaLantern position={[-7.35,83.3,41.7]}/><AlphaLantern rootRef={hand}/><FlyingLanterns/><WindFlags/><mesh ref={ball} name="alpha-sand-route-ball" visible={false}><sphereGeometry args={[.075,12,8]}/><meshStandardMaterial color="#dba650" metalness={.6} roughness={.3}/></mesh><mesh ref={stoneRef} visible={false} scale={[.32,.1,.25]}><sphereGeometry args={[1,10,6]}/><meshStandardMaterial color="#adb3a6" roughness={.94}/></mesh><PlayerCairn/></group>;
}
function PlayerCairn(){const n=useAlphaStore(s=>s.stones);return <group name="alpha-personal-cairn" position={[1,83,39.2]}>{Array.from({length:n},(_,i)=><mesh key={i} position={[Math.sin(i*2.3)*(.15+(i%5)*.075),.12+Math.floor(i/8)*.19,Math.cos(i*2.3)*(.15+(i%5)*.075)]} scale={[.32-i*.003,.1,.25-i*.002]} castShadow><sphereGeometry args={[1,10,6]}/><meshStandardMaterial color={i%2?'#a6aba3':'#8c9693'} roughness={.96}/></mesh>)}</group>;}

const flagUniforms={time:{value:0},strength:{value:0}};
function AlphaFlag({color}:{color:string}){const m=useMemo(()=>{const material=new MeshStandardMaterial({color,side:DoubleSide,roughness:.95});material.onBeforeCompile=s=>{s.uniforms.uAlphaFlagTime=flagUniforms.time;s.uniforms.uAlphaFlagStrength=flagUniforms.strength;s.vertexShader='uniform float uAlphaFlagTime;uniform float uAlphaFlagStrength;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfloat freeEdge=pow(clamp((position.x+.65)/1.3,0.,1.),1.5); transformed.z+=sin(position.x*8.-uAlphaFlagTime*(2.5+uAlphaFlagStrength*1.8)+position.y*4.)*freeEdge*(.04+.065*uAlphaFlagStrength);');};material.customProgramCacheKey=()=> 'alpha-woven-flag-v1';return material;},[color]);useEffect(()=>()=>m.dispose(),[m]);return <mesh position={[.7,3,0]} material={m}><planeGeometry args={[1.3,.65,12,4]}/></mesh>;}
