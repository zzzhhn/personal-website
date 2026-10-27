import { useWorldStore } from './store';
import { exchangeEquity, useAlphaExchange } from './alpha-exchange-state';
import { readDrivingTelemetry } from './vehicle-telemetry';
import { grassDebug } from './WorldGrass';
import { mineActor } from './alpha-mine-state';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { clubWaterDebug } from './WorldClubWaterCapture';
import { readRenderSnapshot } from './world-render-readout';
import { setMineNetworkFailureForQA } from './alpha-mine-online';
import { worldActorDebug } from './WorldActors';
import { vehicleLodSnapshot } from './WorldVehicleVisual';
import { clubAudio } from './WorldClubAudio';
import { readClubGuestPoses } from './WorldClubDancer';
import { waterContacts, WATER_IMPACT_LIFETIME } from './WorldWaterInteraction';
import { windUniforms } from './WorldWind';

function readContactSnapshot() {
  const value=worldActorDebug.actor(),physics=worldActorDebug.snapshot();
  const actor=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  return {actor:{animation:actor.animation,root:actor.root,seatSupport:actor.seatSupport,vehicleStage:actor.vehicleStage,vehicleRotation:actor.vehicleRotation,vehicle:actor.vehicle},
    doors:Object.fromEntries(Object.entries(vehicleLodSnapshot()).map(([id,v])=>[id,{level:v.level,triangles:v.l0Triangles,doors:v.doors}])),
    physics:{player:physics.player,grounded:physics.grounded,vehicles:physics.vehicles.map(v=>({id:v.id,position:v.position,waterSeconds:v.waterSeconds,wheelContacts:v.wheelContacts}))}};
}

/** Development QA controls and visible diagnostics. Reuses actor publication without polling. */
export default function WorldPlaytestReadout() {
  const world=useWorldStore(),exchange=useAlphaExchange();
  const [renderSnapshot,setRenderSnapshot]=useState<unknown>(null);
  const [networkFailure,setNetworkFailure]=useState(false);
  if(world.shot)return null;
  const renderPanel=<aside style={{position:'fixed',zIndex:80,left:16,bottom:12,width:280,maxHeight:'32vh',overflow:'auto',background:'#17231def',color:'#e7eddf',padding:8,font:'10px/1.25 monospace'}}>
      <button onClick={()=>setRenderSnapshot(readRenderSnapshot())}>QA · 读取当前渲染开销</button>
      {import.meta.env.DEV&&<>
        <button onClick={()=>{worldActorDebug.teleportPlayer([49,2.3,55]);useWorldStore.setState({paused:false,clubMode:null,seat:null});}}>QA · 到泳池西岸</button>
        <button onClick={()=>{clubWaterDebug.enabled=!clubWaterDebug.enabled;setRenderSnapshot({poolOptics:{...clubWaterDebug}});}}>QA · 切换泳池光学对照</button>
        <button onClick={()=>setRenderSnapshot({poolOptics:{...clubWaterDebug}})}>QA · 读取泳池光学开销</button>
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
      exchange:{phase:exchange.phase,date:exchange.history[exchange.day]?.date,days:exchange.history.length,day:exchange.day,
        cash:exchange.cash,units:exchange.units,equity:exchangeEquity(exchange),message:exchange.message,ledger:exchange.ledger}},null,1)}
  </output>}
  </>;
}
