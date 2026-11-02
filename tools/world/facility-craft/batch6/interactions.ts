/** Test-only visible controls. Observe the real registered seat and Rapier body.
 * Direct teleport/impulse are declared fixture setup; E uses the actual UI input. */
import type { WebGLRenderer } from 'three';
import {worldActorDebug} from '../../../../src/components/world/WorldActors';
import {interactables} from '../../../../src/components/world/WorldInteract';
import {streetKnockRegistry,knockQa} from '../../../../src/components/world/WorldStreetKnock';
import {solidsV4} from '../../../../src/components/world/layout-v4';
import {useWorldStore} from '../../../../src/components/world/store';

export function installFacilityInteractionQA(gl:WebGLRenderer,invalidate:()=>void){
 if(new URLSearchParams(location.search).get('craftInteraction')!=='1')return;
 const panel=document.createElement('div'),report=document.createElement('pre');panel.dataset.facilityInteractions='true';
 panel.style.cssText='position:fixed;right:12px;top:12px;z-index:99999;background:#111e;color:white;padding:8px;font-size:11px;max-width:610px';
 report.style.cssText='white-space:pre-wrap;max-height:50vh;overflow:auto';
 const seatId='street-bench-'+solidsV4().findIndex(s=>s.kind==='bench'&&s.position[0]===30.1);
 const events:unknown[]=[],started=performance.now();let actionResult:unknown=null,probe:unknown=null,pushed=false,resetComplete=false,phase='';
 const bin=()=>streetKnockRegistry.find(s=>s.item.id==='bin-0');
 const bodySnapshot=()=>{const s=bin(),b=s?.body;if(!s||!b)return null;const p=b.translation(),q=b.rotation(),c=b.localCom();return{id:s.item.id,phase:s.phase,phaseSeconds:s.t,home:s.item.position,
   position:[p.x,p.y,p.z],rotation:[q.x,q.y,q.z,q.w],mass:b.mass(),localCom:[c.x,c.y,c.z],colliders:b.numColliders(),
   sleeping:b.isSleeping(),displacement:Math.hypot(p.x-s.item.position[0],p.z-s.item.position[2]),locked:s.locked};};
 const state=(guide=false)=>{const st=useWorldStore.getState(),actor=worldActorDebug.snapshot();const g=guide?worldActorDebug.actor() as Record<string,unknown>:null;
   const support=g?.seatSupport as Record<string,unknown>|null;return{elapsedMs:Math.round(performance.now()-started),actionResult,probe,resetComplete,events,
    paused:st.paused,shot:st.shot,seat:st.seat,nearby:st.nearbyInteract,player:actor.player,grounded:actor.grounded,physicsStep:actor.physicsStep,
    guide:g?{loaded:g.loaded,animation:g.animation,root:g.root,movementLocked:g.movementLocked,
      seatSupport:support?{centre:support.centre,target:support.target,errorXYZ:support.errorXYZ,idleElapsed:support.idleElapsed}:null}:null,
    bin:bodySnapshot(),renderer:{render:{...gl.info.render},memory:{...gl.info.memory}}};};
 const record=()=>{report.textContent=JSON.stringify(state(true),null,2);};
 const button=(label:string,fn:()=>void)=>{const b=document.createElement('button');b.textContent=label;b.onclick=()=>{fn();invalidate();record();};panel.appendChild(b);return b;};
 button('QA bench approach',()=>{const seat=[...interactables()].find(s=>s.id===seatId);if(!seat)throw new Error('Actual representative seat absent');
   useWorldStore.setState({paused:false,shot:null,seat:null,card:null,clubMode:null});worldActorDebug.clearInput();
   actionResult={kind:'fixture-teleport-to-actual-seat-anchor',seatId,anchor:seat.position,ok:worldActorDebug.teleportPlayer([seat.position[0]-.65,seat.position[1]+.9,seat.position[2]])};});
 button('QA actor clear',()=>{useWorldStore.setState({paused:false,shot:null,seat:null});worldActorDebug.clearInput();actionResult={kind:'fixture-teleport-away',ok:worldActorDebug.teleportPlayer([-42,5,30])};});
 button('QA bin collision probe',()=>{const s=bin();if(!s?.body)throw new Error('Actual bin absent');const[x,y,z]=s.item.position;
   probe=worldActorDebug.castPlayer([x,y+.96,z-1.2],[x,y+.96,z+.35]);actionResult={kind:'actual-Rapier-player-capsule-shape-cast',from:[x,y+.96,z-1.2],to:[x,y+.96,z+.35]};});
 button('QA bin impulse',()=>{const s=bin();if(!s?.body)throw new Error('Actual bin absent');useWorldStore.setState({paused:false,shot:null,seat:null});worldActorDebug.clearInput();
   const p=s.body.translation();s.body.applyImpulseAtPoint({x:0,y:0,z:20},{x:p.x,y:p.y+.8,z:p.z},true);pushed=true;resetComplete=false;
   actionResult={kind:'fixture-20Ns-impulse-on-actual-bin-body',point:[p.x,p.y+.8,p.z]};});
 button('QA record interactions',record);button('QA compact interactions',()=>{report.hidden=!report.hidden;});
 panel.appendChild(report);document.body.appendChild(panel);
 const timer=window.setInterval(()=>{const s=bin();if(!s)return;if(s.phase!==phase){phase=s.phase;events.push({elapsedMs:Math.round(performance.now()-started),phase,t:s.t,body:bodySnapshot()});
   if(pushed&&phase==='home'&&events.some((e:any)=>e.phase==='fadeIn'))resetComplete=true;}
   panel.dataset.binPhase=s.phase;panel.dataset.binReset=resetComplete?'complete':'pending';
   panel.dataset.seat=useWorldStore.getState().seat?.id??'none';panel.dataset.nearby=useWorldStore.getState().nearbyInteract?.id??'none';
 },150);
 record();return()=>{clearInterval(timer);panel.remove();};
}
