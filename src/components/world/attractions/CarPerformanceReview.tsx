/** Review-build only. DOM controls make each bounded measurement observable.
 * Intervals measure browser frame pacing, not GPU execution time.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useWorldStore } from '../store';
import { shadowChunkWork } from '../WorldShadows';
import { night, climate } from '../WorldNight';
import { useIntentStore, intentRideClock, commitIntentEvent } from './intent-state';
import { INTENT_TASKS } from './intent-tasks';
import { INTENT_TARGETS } from './intent-stations';
import { COASTER_BOARDING } from './coaster-transition';
import { worldActorDebug } from '../WorldActors';
import { PLAYER_CENTER_HEIGHT } from '../actor-physics';
import { reachableInteractables } from '../WorldInteract';
import { WORKSHOP_TARGETS, workshopTarget } from './intent-workshop-layout';
import { useWorkshopStore } from './intent-workshop-runtime';

export default function CarPerformanceReview() {
  const { gl, camera, scene, invalidate, get } = useThree();
  const run = useRef({ active: false, warm: 0, previous: 0, started: 0, label: '', values: [] as number[], calls: [] as number[], tris: [] as number[], output: null as HTMLOutputElement | null, reason: '' });
  const records = useRef<unknown[]>([]);
  useEffect(() => {
    const bar = document.createElement('nav'); bar.setAttribute('aria-label','列车性能验收');
    bar.style.cssText='position:fixed;top:75px;left:20px;z-index:9998;background:#142e36e8;color:#eee;padding:9px;border-radius:8px;font:12px system-ui;max-width:540px';
    const button = (text: string, action: () => void) => { const b=document.createElement('button');b.textContent=text;b.style.cssText='margin:3px;padding:5px 9px';b.onclick=action;bar.append(b); };
    const output=document.createElement('output');output.setAttribute('aria-label','帧时间结果');output.style.cssText='display:block;white-space:pre-wrap;max-height:150px;overflow:auto';
    run.current.output=output;
    const begin=()=>{
      const shadow=shadowChunkWork();
      if(shadow.pending || climate.blend<1 || useWorldStore.getState().loading.active) { output.textContent='等待加载和阴影收敛';invalidate();return; }
      Object.assign(run.current,{active:true,warm:0,previous:0,started:performance.now(),values:[],calls:[],tris:[],reason:'',label:[document.documentElement.dataset.carPilot??'unknown',document.documentElement.dataset.chestPilot??'unknown'].join('/')});
      output.textContent='预热 90 帧，然后采集 360 帧';invalidate();
    };
    button('测量 360 帧',begin);
    button('取消测量',()=>{run.current.active=false;output.textContent='已取消';});
    button('远景',()=>{useWorldStore.setState(s=>({shot:s.light==='night'?'scene-overview-night':'scene-overview-day',paused:false,timeRunning:false}));invalidate();});
    button('自由试玩',()=>{useWorldStore.setState({shot:null,paused:false,timeRunning:false});invalidate();});
    button('暂停',()=>{run.current.active=false;useWorldStore.setState({paused:true});invalidate();});
    button('输出记录',()=>{gl.domElement.dataset.carPerfRecords=JSON.stringify(records.current);output.textContent=JSON.stringify(records.current.slice(-1),null,2);});
    button('QA 六题就绪',()=>{
      for(const task of INTENT_TASKS.filter(task=>!task.clarification).slice(0,6))commitIntentEvent({type:'submit',taskId:task.id,answer:task.intent});
      const p=INTENT_TARGETS.chest;worldActorDebug.teleportPlayer([p[0],1.14+PLAYER_CENTER_HEIGHT,p[2]+1.65]);
      useWorldStore.setState({shot:null,paused:false,seat:null,timeRunning:false});invalidate();
    });
    button('QA 门前',()=>{const p=INTENT_TARGETS.gate;worldActorDebug.teleportPlayer([p[0],1.14+PLAYER_CENTER_HEIGHT,p[2]+1.6]);useWorldStore.setState({shot:null,paused:false,seat:null});invalidate();});
    button('QA 登乘口',()=>{const p=COASTER_BOARDING.approach;worldActorDebug.teleportPlayer([p[0],p[1]+PLAYER_CENTER_HEIGHT,p[2]]);useWorldStore.setState({shot:null,paused:false,seat:null});invalidate();});
    const destination=document.createElement('select');destination.setAttribute('aria-label','QA 工位');
    destination.append(new Option('选择工位',''));
    for(const id of WORKSHOP_TARGETS)destination.append(new Option(id,id));
    destination.onchange=()=>{
      const id=WORKSHOP_TARGETS.find(id=>id===destination.value);if(!id)return;
      const p=workshopTarget(id);worldActorDebug.teleportPlayer([p[0],1.14+PLAYER_CENTER_HEIGHT,p[2]+.35]);
      useWorldStore.setState({shot:null,paused:false,seat:null});invalidate();
    };bar.append(destination);
    button('QA 现场交互',()=>{
      const w=useWorldStore.getState();if(w.paused)return;
      reachableInteractables().find(item=>item.id===w.nearbyInteract?.id)?.onInteract();invalidate();
    });
    button('QA 工坊读数',()=>{
      const workshop=useWorkshopStore.getState(), station=scene.getObjectByName('coaster-station-craft');
      gl.domElement.dataset.workshopReadback=JSON.stringify({phase:workshop.phase,tool:workshop.tool,taskId:workshop.taskId,
        player:useWorldStore.getState().position,station:station?.userData.stationCraft??null,
        parts:['RequestCarrier','Motion_lookup','Motion_plan','Motion_debug','Motion_rewrite','Motion_extract','Motion_act'].map(name=>{const o=scene.getObjectByName(name);return {name,visible:o?.visible,position:o?.position.toArray()};})});
    });
    bar.append(output);document.body.append(bar);
    const cancel=()=>{if(document.hidden && run.current.active){run.current.active=false;output.textContent='标签页转入后台，测量作废';}};
    document.addEventListener('visibilitychange',cancel);
    return()=>{document.removeEventListener('visibilitychange',cancel);bar.remove();};
  },[gl,invalidate]);
  useFrame(()=>{
    const p=run.current;
    if(!p.active)return;
    const now=performance.now(), w=useWorldStore.getState();
    if(document.hidden || w.paused || w.poolInspect || shadowChunkWork().pending) {
      p.active=false;if(p.output)p.output.textContent='测量状态改变，本窗作废';return;
    }
    if(p.previous && p.warm++>=90) {p.values.push(now-p.previous);p.calls.push(gl.info.render.calls);p.tris.push(gl.info.render.triangles);}
    p.previous=now;
    if(p.values.length>=360 || now-p.started>45000) {
      const summary=(values:number[])=>{const s=values.slice().sort((a,b)=>a-b);return {n:s.length,p50:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)],max:s.at(-1)};};
      const actor=useIntentStore.getState(), craft=scene.getObjectByName('coaster-train-craft');
      const result={variant:p.label,at:new Date().toISOString(),durationMs:now-p.started,pageAgeMs:now,source:JSON.parse(gl.domElement.dataset.coasterReadback??'{}').source??null,url:location.href,shot:w.shot,quality:w.quality,canvas:[gl.domElement.width,gl.domElement.height],dpr:gl.getPixelRatio(),exposure:gl.toneMappingExposure,
        camera:camera.position.toArray(),worldMinutes:w.worldMinutes,night:night.value,shadowPending:shadowChunkWork().pending,loadingActive:w.loading.active,hidden:document.hidden,
        frameMs:summary(p.values),over33ms:p.values.filter(v=>v>33.34).length,over50ms:p.values.filter(v=>v>50).length,calls:summary(p.calls),triangles:summary(p.tris),
        residency:{geometries:gl.info.memory.geometries,textures:gl.info.memory.textures,programs:gl.info.programs?.length},craft:craft?.userData.carCraft??null,
        riding:actor.riding,ridePhase:actor.ridePhase,rideSecond:intentRideClock.elapsed,loop:get().frameloop};
      records.current.push(result);records.current=records.current.slice(-32);gl.domElement.dataset.carPerfRecords=JSON.stringify(records.current);
      if(p.output)p.output.textContent=JSON.stringify({variant:p.label,...result.frameMs,calls:result.calls.p50,triangles:result.triangles.p50,craft:result.craft});
      p.active=false;
    } else invalidate();
  }, -58);
  return null;
}
