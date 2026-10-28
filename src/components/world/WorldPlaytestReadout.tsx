import { useWorldStore } from './store';
import { roundEquity } from './alpha-exchange-round';
import { exchangeReview } from './alpha-exchange-review';
import { readDrivingTelemetry } from './vehicle-telemetry';
import { grassDebug } from './WorldGrass';
import { mineActor } from './alpha-mine-state';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clubWaterDebug, clubWaterSnapshot } from './WorldClubWaterCapture';
import { clubWaterFrameWindow } from './WorldClubWaterBudget';
import { readRenderSnapshot } from './world-render-readout';
import { setMineNetworkFailureForQA } from './alpha-mine-online';
import { worldActorDebug } from './WorldActors';
import { vehicleLodSnapshot } from './WorldVehicleVisual';
import { clubAudio } from './WorldClubAudio';
import { parkAudio } from './WorldParkAudio';
import { readClubGuestPoses } from './WorldClubDancer';
import { waterContacts, WATER_IMPACT_LIFETIME } from './WorldWaterInteraction';
import { windUniforms } from './WorldWind';
import { IBD_YARD, INTENT_COASTER } from './attractions/attraction-layout';
import { WORKSHOP_TARGETS, workshopTarget } from './attractions/intent-workshop-layout';
import { attractionRide } from './attractions/attraction-ride';
import { attractionLook } from './attractions/attraction-camera';
import { PLAYER_CENTER_HEIGHT } from './actor-physics';
import { INTENT_TARGETS } from './attractions/intent-stations';
import { IBD_STATIONS, ibdWorld } from './attractions/ibd-yard-layout';
import { intentRideClock, intentRideQaHold, useIntentStore } from './attractions/intent-state';
import { readCoasterMotionAudioSnapshot } from './attractions/coaster-motion-audio';
import { shadowRebuildProbe, shadowChunkWork } from './WorldShadows';
import { sceneWorkProbe } from './world-scene-work';
import { coasterStructureMemory } from './attractions/coaster-structure-cache';
import { coasterStructureJobs } from './attractions/coaster-structure-job';
import { coasterDropHeight } from './attractions/coaster-terrain-relief';
import { coasterWorld } from './attractions/coaster-track';
import { worldResumeProbe } from './world-resume-probe';
import { useExchangePlay } from './alpha-exchange-play';
import { exchangeBody, exchangeActor, exchangeVisualSockets } from './alpha-exchange-motion';
import { ibdInspectionActor,ibdInspectionBody,ibdInspectionVisualSockets } from './attractions/ibd-inspection-motion';
import { currentIbdPack,useIbdPackPlay,ibdPackVisual } from './attractions/ibd-pack-play';
import { useIbdYardStore } from './attractions/ibd-yard-store';
import { exchangeWorld } from './alpha-exchange-layout';
import { EXCHANGE_PLAY_STATIONS } from './alpha-exchange-play-layout';

function readContactSnapshot() {
  const value=worldActorDebug.actor(),physics=worldActorDebug.snapshot();
  const actor=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  return {ride:{active:attractionRide.active,...attractionRide.pose,look:{...attractionLook},phase:attractionRide.transition?.phase},camera:worldActorDebug.camera(),actor:{animation:actor.animation,root:actor.root,seatSupport:actor.seatSupport,vehicleStage:actor.vehicleStage,vehicleRotation:actor.vehicleRotation,vehicle:actor.vehicle},
    doors:Object.fromEntries(Object.entries(vehicleLodSnapshot()).map(([id,v])=>[id,{level:v.level,triangles:v.l0Triangles,doors:v.doors,
      material:v.materialUuid,bodyNear:v.bodyNearGeometry,bodyFar:v.bodyLodGeometry,wheel:v.wheelGeometry}])),
    physics:{player:physics.player,grounded:physics.grounded,vehicles:physics.vehicles.map(v=>({id:v.id,position:v.position,waterSeconds:v.waterSeconds,wheelContacts:v.wheelContacts}))}};
}

/** Development QA controls and visible diagnostics. Reuses actor publication without polling. */
export default function WorldPlaytestReadout() {
  const world=useWorldStore(),exchange=useExchangePlay(),round=exchange.round;
  const [renderSnapshot,setRenderSnapshot]=useState<unknown>(null);
  const [networkFailure,setNetworkFailure]=useState(false);
  const waterWindow=useRef<ReturnType<typeof clubWaterSnapshot>|null>(null);
  if(world.shot&&!world.paused)return null;
  const renderPanel=<aside style={{position:'fixed',zIndex:80,left:16,bottom:12,width:280,maxHeight:'32vh',overflow:'auto',background:'#17231def',color:'#e7eddf',padding:8,font:'10px/1.25 monospace'}}>
      <button onClick={()=>setRenderSnapshot(readRenderSnapshot())}>QA · 读取当前渲染开销</button>
      <button onClick={()=>setRenderSnapshot({parkAudio:parkAudio.snapshot()})}>QA · 读取环境音频</button>
      {import.meta.env.DEV&&<>
        <button onClick={()=>{const c=currentIbdPack(),a=ibdInspectionBody.action,g=useIbdYardStore.getState().game,id=useIbdPackPlay.getState().itemId;setRenderSnapshot(structuredClone({packInspection:{
          view:useIbdPackPlay.getState(),visual:ibdPackVisual,actor:ibdInspectionActor,held:ibdInspectionBody.carried,
          action:a?{kind:a.kind,phase:a.phase,elapsed:a.elapsed,committed:a.committed,anchor:a.anchor}:null,
          sockets:ibdInspectionVisualSockets,inspection:c?.inspection??g.packInspections[id],proofs:g.core.proofs[id],loaded:g.core.loaded}}));}}>QA · 读取逐槽接触</button>
        <button onClick={()=>{const p=exchangeWorld([...EXCHANGE_PLAY_STATIONS.archive.stand]);worldActorDebug.teleportPlayer([p[0],p[1]+PLAYER_CENTER_HEIGHT,p[2]+.5]);useWorldStore.setState({paused:false,seat:null,clubMode:null});}}>QA · 到交易所档案台</button>
        <button onClick={()=>{const s=useExchangePlay.getState(),v=exchangeReview(s.round,s.reviewIndex);setRenderSnapshot({exchangeReview:{index:s.reviewIndex,phase:s.round?.phase,
          intervals:s.round?.choices.length,contact:s.lastContact,contacts:s.contacts,carried:exchangeBody.carried,
          selection:v?{from:v.from,through:v.through,units:v.units,pnl:v.pnl,previousPnl:v.previousPnl,difference:v.difference,marks:v.marks.length,previousMarks:v.previous?.length??0}:null}});}}>QA · 读取回廊复盘</button>
        <button onClick={()=>{const s=useExchangePlay.getState(),r=s.round,a=exchangeBody.action;setRenderSnapshot({exchange:{phase:r?.phase??s.notice,checkpoint:r?.checkpoint??0,day:r?.day??0,target:r?.targetUnits??0,units:r?.units??0,contacts:s.contacts,lastContact:s.lastContact,carried:exchangeBody.carried,ticketReturned:s.ticketReturned,error:s.error,actor:exchangeActor,action:a?{kind:a.kind,phase:a.phase,elapsed:a.elapsed,target:a.anchor.target}:null,sockets:exchangeVisualSockets,receipt:r?.receipt?{equity:r.receipt.finalEquity,pnl:r.receipt.pnl,choices:r.receipt.choices.length}:null}});}}>QA · 读取交易所接触</button>
        {[IBD_YARD,INTENT_COASTER].map(site=><button key={site.title.en} onClick={()=>{
          const p=site.entrance;worldActorDebug.teleportPlayer([p[0],p[1]+PLAYER_CENTER_HEIGHT,p[2]]);
          useWorldStore.setState({paused:false,clubMode:null,seat:null});
        }}>QA · 到{site.title.zh}</button>)}
        <details><summary>QA · 设施操作点</summary>
          {(['desk','bell','clearing','review'] as const).map(id=><button key={`exchange-${id}`} onClick={()=>{
            const p=exchangeWorld([...EXCHANGE_PLAY_STATIONS[id].stand]);worldActorDebug.teleportPlayer([p[0],p[1]+PLAYER_CENTER_HEIGHT,p[2]+.25]);
            useWorldStore.setState({paused:false,seat:null,clubMode:null});
          }}>QA · 到交易所 {id}</button>)}
          {[3.5, 32.5, 79.5, 99.3, 110.7].map(second=><button key={`hold-${second}`} disabled={attractionRide.transition?.phase!=='riding'} onClick={()=>{
            if(attractionRide.transition?.phase!=='riding')return;
            Object.assign(intentRideQaHold,{second,revision:attractionRide.revision});
            intentRideClock.elapsed=second;useIntentStore.setState({rideSecond:second});useWorldStore.setState({paused:false});
          }}>QA · 定格乘坐 {second} s</button>)}
          <button disabled={!attractionRide.active} onClick={()=>{intentRideQaHold.second=null;useWorldStore.setState({paused:false});}}>QA · 继续列车</button>
          {([['首降',37],['倒置',45],['灯廊',60]] as const).map(([label,second])=><button key={label} disabled={!attractionRide.active} onClick={()=>{
            if(!attractionRide.active)return;
            intentRideQaHold.second=null;
            intentRideClock.elapsed=second;useIntentStore.setState({rideSecond:second});
            useWorldStore.setState({paused:false});
          }}>QA · 乘坐定位{label}</button>)}
          {Object.entries(INTENT_TARGETS).filter(([id])=>!['route','press','visitor'].includes(id)).map(([id,p])=><button key={id} disabled={attractionRide.active} onClick={()=>{
            worldActorDebug.teleportPlayer([p[0],INTENT_COASTER.center[1]+.1+PLAYER_CENTER_HEIGHT,p[2]+1]);
            useWorldStore.setState({paused:false,seat:null});
          }}>QA · 到意图 {id}</button>)}
          {WORKSHOP_TARGETS.map(id=><button key={id} disabled={attractionRide.active} onClick={()=>{
            const p=workshopTarget(id);worldActorDebug.teleportPlayer([p[0],INTENT_COASTER.center[1]+.1+PLAYER_CENTER_HEIGHT,p[2]+.8]);
            useWorldStore.setState({paused:false,seat:null});
          }}>QA · 到分流工坊 {id}</button>)}
          {IBD_STATIONS.filter(s=>['manifest','crane','gallery-rear','parts-a','dispatch'].includes(s.id)).map(s=><button key={s.id} disabled={attractionRide.active} onClick={()=>{
            const p=ibdWorld(s.at);worldActorDebug.teleportPlayer([p[0],IBD_YARD.center[1]+(s.id.startsWith('gallery')?4.1:.1)+PLAYER_CENTER_HEIGHT,p[2]+.6]);
            useWorldStore.setState({paused:false,seat:null});
          }}>QA · 到{s.title.zh}</button>)}
          <button disabled={attractionRide.active||!useIntentStore.getState().active} onClick={()=>{
            const ground=coasterDropHeight(23,-160);if(ground===null)return;
            worldActorDebug.teleportPlayer(coasterWorld([23,ground+PLAYER_CENTER_HEIGHT+.1,-160]));
            useWorldStore.setState({paused:false,seat:null});
          }}>QA · 到首降岩肩</button>
          <button disabled={attractionRide.active} onClick={()=>{
            worldActorDebug.teleportPlayer([-85,1.9,-174.9]);
            useWorldStore.setState({paused:false,seat:null});
          }}>QA · 到仓棚边立柱</button>
          <button disabled={attractionRide.active} onClick={()=>{
            worldActorDebug.teleportPlayer([44.64528,1.81885,-140.40560]);
            useWorldStore.setState({paused:false,seat:null});
          }}>QA · 到车站出口边柱</button>
          <button disabled={attractionRide.active} onClick={()=>{
            worldActorDebug.teleportPlayer([24.96,5,-129.43]);
            useWorldStore.setState({paused:false,seat:null});
          }}>QA · 落到探照仪设备</button>
        </details>
        <button onClick={()=>{shadowRebuildProbe.start();sceneWorkProbe.start();clubWaterFrameWindow.start();setRenderSnapshot({frameWindow:'started'});}}>QA · 开始场景帧采样</button>
        <button onClick={()=>setRenderSnapshot({frameWindow:clubWaterFrameWindow.stop(),shadowRebuilds:shadowRebuildProbe.stop(),shadowWork:shadowChunkWork(),sceneWork:sceneWorkProbe.stop(),coasterStructureMemory:{...coasterStructureMemory},coasterStructureJobs:{...coasterStructureJobs},render:readRenderSnapshot()})}>QA · 结束场景帧采样</button>
        <button onClick={()=>setRenderSnapshot({shadowWork:shadowChunkWork()})}>QA · 读取阴影构建状态</button>
        <details><summary>QA · 恢复诊断</summary>
          <button disabled={!world.paused||world.poolInspect||!!world.shot} onClick={()=>{
            const result=worldResumeProbe.arm();
            if(result.started)useWorldStore.setState({paused:false});
            else setRenderSnapshot({resumeProbe:result});
          }}>QA · 恢复并采集 5 帧</button>
          <button onClick={()=>setRenderSnapshot({resumeProbe:worldResumeProbe.read()})}>QA · 读取恢复诊断</button>
        </details>
        <button onClick={()=>setRenderSnapshot({coasterAudio:readCoasterMotionAudioSnapshot()})}>QA · 读取过山车音频</button>
        <button onClick={()=>{worldActorDebug.teleportPlayer([49,2.3,55]);useWorldStore.setState({paused:false,clubMode:null,seat:null});}}>QA · 到泳池西岸</button>
        <button onClick={()=>{clubWaterFrameWindow.invalidate();clubWaterDebug.enabled=!clubWaterDebug.enabled;setRenderSnapshot({poolOptics:clubWaterSnapshot()});}}>QA · 启停泳池光学</button>
        <button onClick={()=>{clubWaterFrameWindow.invalidate();clubWaterDebug.budgeted=!clubWaterDebug.budgeted;setRenderSnapshot({poolOptics:clubWaterSnapshot()});}}>QA · 切换旧／新采样预算（均无倒影）</button>
        <button onClick={()=>setRenderSnapshot({poolOptics:clubWaterSnapshot()})}>QA · 读取泳池光学开销</button>
        <button onClick={()=>{waterWindow.current=clubWaterSnapshot();clubWaterFrameWindow.start();setRenderSnapshot({poolWindow:'started',mode:clubWaterDebug.budgeted?'budgeted':'baseline'});}}>QA · 开始泳池采样</button>
        <button onClick={()=>{
          const before=waterWindow.current,after=clubWaterSnapshot(),frames=clubWaterFrameWindow.stop();waterWindow.current=null;
          if(!before){setRenderSnapshot({poolWindow:'not started'});return;}
          const work=Object.fromEntries((['baseline','budgeted'] as const).map(mode=>[mode,Object.fromEntries(Object.entries(after.totals[mode]).map(([key,value])=>[key,value-before.totals[mode][key as keyof typeof after.totals.baseline]]))]));
          setRenderSnapshot({poolWindow:{mode:before.budgeted?'budgeted':'baseline',frames,work,comparable:!!frames?.frames&&!frames.changedDuringWindow&&before.budgeted===after.budgeted&&before.enabled===after.enabled,ending:after}});
        }}>QA · 结束泳池采样</button>
        <button onClick={()=>setRenderSnapshot(readContactSnapshot())}>QA · 读取动作与接触</button>
        <button onClick={()=>setRenderSnapshot({club:clubAudio.inspect(),energy:clubAudio.energy(),guests:readClubGuestPoses(),mode:useWorldStore.getState().clubMode,step:useWorldStore.getState().danceStep})}>QA · 读取 Club 音频</button>
        <button onClick={()=>setRenderSnapshot({water:{emitted:waterContacts.emitted,active:waterContacts.impacts.filter(p=>p.strength>0&&windUniforms.uWindTime.value-p.at<WATER_IMPACT_LIFETIME)}})}>QA · 读取水面接触</button>
        <button disabled={!world.activeVehicle} onClick={()=>{if(world.activeVehicle)worldActorDebug.flip(world.activeVehicle);}}>QA · 倾覆当前车辆</button>
        <button disabled={!world.activeVehicle} onClick={()=>{if(world.activeVehicle)worldActorDebug.flip(world.activeVehicle,true);}}>QA · 侧翻当前车辆</button>
        <button onClick={()=>{if(world.nearbyVehicle)worldActorDebug.enter(world.nearbyVehicle);worldActorDebug.holdVehicleTransition(.66);}}>QA · 上车并定格门洞</button>
        <button onClick={()=>worldActorDebug.holdVehicleTransition(.79)}>QA · 定格入座</button>
        <button onClick={()=>worldActorDebug.holdVehicleTransition(null)}>QA · 继续上下车动作</button>
        <button onClick={()=>worldActorDebug.water()}>QA · 当前角色或车辆落水</button>
      </>}
      <button aria-pressed={networkFailure} onClick={()=>{setMineNetworkFailureForQA(!networkFailure);setNetworkFailure(!networkFailure);}}>{networkFailure?'QA · 恢复真实回测连接':'QA · 模拟回测连接中断'}</button>
      {renderSnapshot!=null&&<output data-world-render-snapshot style={{display:'block',whiteSpace:'pre-wrap'}}>{JSON.stringify(renderSnapshot,null,1)}</output>}
    </aside>;
  const menu=world.paused?document.querySelector('.world-dialog'):null;
  return <>
    {menu?createPortal(renderPanel,menu):renderPanel}
    {!world.paused&&<output data-world-playtest style={{position:'fixed',left:16,top:110,width:255,maxHeight:'35vh',overflow:'auto',font:'10px/1.25 monospace',whiteSpace:'pre-wrap',background:'#17231dcc',color:'#e7eddf',padding:8,pointerEvents:'none'}}>
    {JSON.stringify({position:world.position.map(v=>+v.toFixed(2)),yaw:+mineActor.yaw.toFixed(2),grounded:mineActor.grounded,
      nearby:world.nearbyInteract?.id,vehicle:world.activeVehicle,drive:readDrivingTelemetry(),
      grass:{instances:grassDebug.instances,disturbers:grassDebug.disturbers,trampled:grassDebug.trampleActive,strength:grassDebug.maxTrample},
      exchange:{phase:round?.phase??exchange.notice,date:round?.history[round.day]?.date,day:round?.day,checkpoint:round?.checkpoint,
        cash:round?.cash,units:round?.units,equity:round?roundEquity(round):null,contacts:exchange.contacts,carried:exchangeBody.carried}},null,1)}
  </output>}
  </>;
}
