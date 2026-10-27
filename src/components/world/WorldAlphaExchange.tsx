import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { TrimeshCollider, RigidBody } from '@react-three/rapier';
import { CanvasTexture, CircleGeometry, Group, LatheGeometry, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Vector2 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { parkMaterial } from './WorldParkKit';
import { buildAlphaExchangeGeometry } from './WorldAlphaExchangeGeometry';
import { night } from './WorldNight';
import { useInteractable } from './WorldInteract';
import { useWorldStore } from './store';
import { parkAudio } from './WorldParkAudio';
import { actExchange, exchangeEquity, releaseExchange, ringExchange, useAlphaExchange, type ExchangeMessage } from './alpha-exchange-state';
import { EXCHANGE_INITIAL_POINTS } from './alpha-exchange-data';
import { ALPHA_EXCHANGE_ORIGIN, EXCHANGE_HALL, EXCHANGE_STATIONS, exchangeWorld } from './alpha-exchange-layout';
import type { Vec3 } from './types';
export { ALPHA_EXCHANGE_ORIGIN, ALPHA_EXCHANGE_FOOTPRINT, ALPHA_EXCHANGE_APPROACH, ALPHA_EXCHANGE_APPROACH_WIDTH } from './alpha-exchange-layout';

const LABELS = {
  buy:{zh:'买入 10 份',en:'BUY 10 UNITS'},sell:{zh:'卖出 10 份',en:'SELL 10 UNITS'},
  next:{zh:'推进一个交易日',en:'NEXT TRADING DAY'},reset:{zh:'重开这段历史',en:'RESET REPLAY'},
};
const MESSAGES:Record<ExchangeMessage,[string,string]>={
  'ring-first':['敲响入口铜钟，开启历史交易日。','Ring the brass bell to open the historical floor.'],
  loading:['正在读取真实历史净值……','Loading the real historical benchmark…'],
  opened:['用虚拟点数买入份额，再向前走一个交易日。','Buy virtual units, then advance one historical trading day.'],
  bought:['已按这一天的净值买入 10 份。','Bought 10 units at this historical NAV.'],
  sold:['已按这一天的净值卖出 10 份。','Sold 10 units at this historical NAV.'],
  'next-day':['新的一天。看看你持有的份额发生了什么。','A new historical day. See what happened to your holding.'],
  insufficient:['虚拟点数不足。可以卖出，或重开。','Not enough virtual points. Sell units or reset.'],
  'position-limit':['沙盘最多持有 50 份，没有杠杆。','The sandbox holds at most 50 units, without leverage.'],
  'no-shares':['还没有可卖出的份额。先去买入席。','No units to sell. Visit the buy desk first.'],
  'last-day':['已到真实历史序列末日。可以卖出或重开。','The historical series is complete. Sell or reset to play again.'],
  reset:['虚拟点数和持仓已重置；仍使用同一段真实历史。','Points and positions reset; the same real history stays loaded.'],
  error:['历史暂时不可用。再次敲钟可重试，不会生成替代行情。','History is unavailable. Ring again to retry; no substitute prices are generated.'],
};
const money=(n:number)=>n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

function texturePlane(width:number,height:number,position:Vec3,rect:[number,number,number,number],circle=false,yaw=0) {
  const g=circle?new CircleGeometry(width/2,32):new PlaneGeometry(width,height),uv=g.getAttribute('uv');
  const [x,y,w,h]=rect;
  for(let i=0;i<uv.count;i++){uv.setXY(i,(x+uv.getX(i)*w)/1024,1-(y+(1-uv.getY(i))*h)/1024);}
  g.rotateY(yaw);g.translate(...position);return g;
}

function ExchangeInput({projectId}:{projectId?:string}) {
  const phase=useAlphaExchange(s=>s.phase);
  useInteractable(projectId?{id:'alpha-exchange-project',kind:'board',position:exchangeWorld(EXCHANGE_HALL.project),radius:1.8,
    label:{zh:'Alpha Agent · 项目与数据',en:'Alpha Agent · project & data'},
    onInteract:()=>useWorldStore.setState({card:{kind:'project',id:projectId}})}:null);
  useInteractable({id:'alpha-exchange-bell',kind:'exhibit',position:exchangeWorld(EXCHANGE_HALL.bell),radius:1.65,
    label:phase==='loading'?{zh:'历史净值读取中',en:'Historical benchmark loading'}:{zh:phase==='error'?'敲钟重试历史净值':'敲响开市钟',en:phase==='error'?'Ring to retry history':'Ring the opening bell'},
    enabled:()=>useAlphaExchange.getState().phase!=='loading',onInteract:()=>{parkAudio.cue('scan',.55);void ringExchange();}});
  return <>{EXCHANGE_STATIONS.map(s=><ExchangeStationInput key={s.action} station={s}/>)}</>;
}
function ExchangeStationInput({station}:{station:(typeof EXCHANGE_STATIONS)[number]}) {
  const label=LABELS[station.action];
  useInteractable({id:`alpha-exchange-${station.action}`,kind:'exhibit',position:exchangeWorld([station.stand[0],1.05,station.stand[2]]),radius:1.25,
    label:{zh:label.zh,en:label.en},onInteract:()=>{actExchange(station.action);parkAudio.cue('scan',.15);}});
  return null;
}

/** A walkable high trading hall. Architecture is one static vertex-colour batch; all board faces
 * share one 1024² atlas, redrawn only after a language or game-state change. No timer or mount fetch. */
export default function WorldAlphaExchange({projectId}:{projectId?:string}) {
  const state=useAlphaExchange(),lang=useWorldStore(s=>s.lang),zh=lang==='zh',bell=useRef<Group>(null);
  const bellClock=useRef({rings:state.rings,elapsed:1});
  const built=useMemo(()=>{
    const architecture=buildAlphaExchangeGeometry();
    const faceParts=[
      texturePlane(9.8,2.75,EXCHANGE_HALL.board,[0,0,1024,288]),
      texturePlane(8.6,.95,[0,5.65,1.15],[0,320,1024,128]),
      ...EXCHANGE_STATIONS.map((s,i)=>texturePlane(.72,.45,[s.at[0]+.2*Math.sin(s.yaw),1.49,s.at[2]+.2*Math.cos(s.yaw)],[i*256,464,256,128],false,s.yaw)),
      texturePlane(3,3,[EXCHANGE_HALL.clock[0],EXCHANGE_HALL.clock[1],EXCHANGE_HALL.clock[2]+.42],[0,640,256,256],true),
    ];
    const faces=mergeGeometries(faceParts)!;faceParts.forEach(g=>g.dispose());
    const bellGeometry=new LatheGeometry([new Vector2(.3,-.32),new Vector2(.31,-.27),new Vector2(.24,-.23),new Vector2(.16,-.04),new Vector2(.08,.02),new Vector2(.025,.03)],20);
    return {...architecture,faces,bellGeometry};
  },[]);
  const atlas=useMemo(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
    const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.anisotropy=4;
    return{canvas,texture,material:new MeshStandardMaterial({map:texture,roughness:.85,metalness:0,emissive:'#ffffff',emissiveMap:texture,emissiveIntensity:.16}),
      brass:new MeshStandardMaterial({color:'#b8975a',metalness:.55,roughness:.42}),glass:new MeshStandardMaterial({vertexColors:true,color:'#f3dba8',transparent:true,opacity:.29,roughness:.35,metalness:0,depthWrite:false,emissive:'#c19b56',emissiveIntensity:.04})};},[]);
  useEffect(()=>{
    const c=atlas.canvas.getContext('2d')!;c.clearRect(0,0,1024,1024);
    c.fillStyle='#253e39';c.fillRect(0,0,1024,608);c.textBaseline='alphabetic';
    const row=state.history[state.day],nav=row?.value??100,equity=exchangeEquity(state),pnl=equity-EXCHANGE_INITIAL_POINTS;
    c.fillStyle='#ccb88b';c.font='600 24px "Avenir Next","PingFang SC",sans-serif';
    c.fillText(zh?'SPY 历史净值沙盘':'SPY HISTORICAL NAV SANDBOX',30,35);
    c.textAlign='right';c.fillText(row?`${row.date}  ·  ${state.day+1}/${state.history.length}`:zh?'历史回放，非实时行情':'HISTORICAL REPLAY, NOT LIVE',994,35);c.textAlign='left';
    c.fillStyle='#f0e5cf';c.font='600 47px Georgia,"Songti SC",serif';c.fillText(state.phase==='open'?`NAV ${nav.toFixed(2)}`:zh?'等待开市钟':'RING TO OPEN',30,96);
    c.font='500 22px "Avenir Next","PingFang SC",sans-serif';c.fillStyle='#e6dccb';
    c.fillText(`${zh?'虚拟点数':'POINTS'}  ${money(state.cash)}`,365,75);c.fillText(`${zh?'指数份额':'INDEX UNITS'}  ${state.units}`,730,75);
    c.fillText(`${zh?'总权益':'EQUITY'}  ${money(equity)}`,365,107);
    c.fillStyle=pnl<0?'#e8a08a':'#afc89b';c.fillText(`${zh?'虚拟盈亏':'PAPER P/L'}  ${pnl>=0?'+':''}${money(pnl)}`,730,107);
    const message=MESSAGES[state.message][zh?0:1];c.fillStyle='#dccba6';c.font='500 20px "Avenir Next","PingFang SC",sans-serif';c.fillText(message,30,141,964);
    // Reveal the past only. Advancing a day, rather than an automatic animation, changes this curve.
    if(state.phase==='open'){
      const values=state.history.slice(0,state.day+1).map(x=>x.value),lo=Math.min(...values),hi=Math.max(...values),span=Math.max(.1,hi-lo);
      c.strokeStyle='#46594e';c.lineWidth=1;for(const y of [165,197,229]){c.beginPath();c.moveTo(32,y);c.lineTo(550,y);c.stroke();}
      c.strokeStyle='#c7b36d';c.lineWidth=3;c.beginPath();values.forEach((v,i)=>{const x=32+i/Math.max(1,state.day)*518,y=226-(v-lo)/span*64;i?c.lineTo(x,y):c.moveTo(x,y);});c.stroke();
      c.fillStyle='#cfbf9d';c.font='500 15px "Avenir Next","PingFang SC",sans-serif';c.fillText(zh?'真实 SPY 基准净值，首日 = 100':'REAL SPY BENCHMARK NAV, FIRST DAY = 100',32,253);
      c.font='500 17px "Avenir Next","PingFang SC",sans-serif';state.ledger.slice(-3).forEach((e,i)=>{const label=e.kind==='buy'?(zh?'买':'BUY'):(zh?'卖':'SELL');c.fillText(`${e.date}  ${label} ${e.units}  @ ${e.value.toFixed(2)}`,610,178+i*28);});
    }else{c.fillStyle='#91a295';c.font='500 22px "Avenir Next","PingFang SC",sans-serif';c.fillText(zh?'敲钟 → 买入 → 推进一天 → 卖出':'RING → BUY → NEXT DAY → SELL',32,205);}
    c.fillStyle='#8fa092';c.font='500 14px "Avenir Next","PingFang SC",sans-serif';
    c.fillText(zh?'来源：Alpha Agent API 的历史 SPY 基准。仅虚拟点数，无真实订单，不计手续费或滑点。':'SOURCE: ALPHA AGENT API SPY BENCHMARK. VIRTUAL POINTS; NO REAL ORDERS. FEES / SLIPPAGE EXCLUDED.',30,278,964);
    c.fillStyle='#d7ccb9';c.fillRect(0,320,1024,128);c.fillStyle='#354d43';c.textAlign='center';c.font='600 64px Georgia,"Songti SC",serif';c.fillText('ALPHA AGENT',512,390);
    c.font='600 23px "Avenir Next","PingFang SC",sans-serif';c.fillText(zh?'交易所 · 在历史里试一次决定':'THE EXCHANGE · PLAY A DECISION THROUGH HISTORY',512,429);
    EXCHANGE_STATIONS.forEach((s,i)=>{const x=i*256;c.fillStyle=s.action==='buy'?'#425e4c':s.action==='sell'?'#745547':'#334b46';c.fillRect(x,464,256,128);
      c.fillStyle='#eadfc5';c.font='600 23px "Avenir Next","PingFang SC",sans-serif';c.fillText(zh?LABELS[s.action].zh:LABELS[s.action].en,x+128,518,238);
      c.fillStyle='#c2b492';c.font='500 17px "Avenir Next","PingFang SC",sans-serif';c.fillText(s.action==='buy'||s.action==='sell'?(zh?'历史净值 · 虚拟份额':'HISTORICAL NAV · PAPER UNITS'):(zh?'走近后按 E':'WALK UP & PRESS E'),x+128,555,238);});
    c.fillStyle='#e6dccb';c.beginPath();c.arc(128,768,126,0,Math.PI*2);c.fill();c.strokeStyle='#867041';c.lineWidth=5;
    for(let i=0;i<12;i++){const a=i*Math.PI/6;c.beginPath();c.moveTo(128+Math.sin(a)*101,768-Math.cos(a)*101);c.lineTo(128+Math.sin(a)*112,768-Math.cos(a)*112);c.stroke();}
    c.strokeStyle='#354d43';c.lineWidth=9;c.beginPath();c.moveTo(128,768);c.lineTo(60,768);c.moveTo(128,768);c.lineTo(128,852);c.stroke();
    c.fillStyle='#867041';c.font='600 18px Georgia';c.fillText('REPLAY',128,718);c.textAlign='left';atlas.texture.needsUpdate=true;
  },[atlas,state,zh]);
  useEffect(()=>()=>{releaseExchange();built.body.dispose();built.glass.dispose();built.faces.dispose();built.bellGeometry.dispose();atlas.texture.dispose();atlas.material.dispose();atlas.brass.dispose();atlas.glass.dispose();},[built,atlas]);
  useEffect(()=>{
    if(new URLSearchParams(window.location.search).get('qa')!=='1')return;
    const api={read:()=>{const s=useAlphaExchange.getState();return{phase:s.phase,date:s.history[s.day]?.date??null,day:s.day,days:s.history.length,
      nav:s.history[s.day]?.value??null,cash:s.cash,units:s.units,equity:exchangeEquity(s),message:s.message,rings:s.rings,ledger:s.ledger,error:s.error};}};
    const host=window as unknown as {__worldExchange?:typeof api};host.__worldExchange=api;
    return()=>{if(host.__worldExchange===api)delete host.__worldExchange;};
  },[]);
  useFrame((_,dt)=>{
    atlas.glass.emissiveIntensity=.025+.13*night.value;
    if(useWorldStore.getState().paused||useWorldStore.getState().shot)return;
    const clock=bellClock.current,rings=useAlphaExchange.getState().rings;if(rings!==clock.rings){clock.rings=rings;clock.elapsed=0;}
    if(clock.elapsed>=1)return;clock.elapsed=Math.min(1,clock.elapsed+Math.min(.05,dt));
    if(bell.current)bell.current.rotation.z=clock.elapsed>=1?0:Math.sin(clock.elapsed*25)*.32*Math.exp(-clock.elapsed*5);
  });
  return <group name="alpha-agent-exchange" position={ALPHA_EXCHANGE_ORIGIN} userData={{noOcclusionFade:true}}>
    <mesh name="alpha-exchange-architecture" geometry={built.body} material={parkMaterial()} castShadow receiveShadow/>
    <mesh name="alpha-exchange-displays" geometry={built.faces} material={atlas.material}/>
    <mesh name="alpha-exchange-skylights" geometry={built.glass} material={atlas.glass} receiveShadow renderOrder={1}/>
    <pointLight position={[-6,6,-10]} color="#ffdb9d" intensity={80} distance={20} decay={2} castShadow={false}/>
    <pointLight position={[6,6,-21]} color="#ffd293" intensity={65} distance={18} decay={2} castShadow={false}/>
    <group ref={bell} position={[0,1.79,-1.8]}><mesh geometry={built.bellGeometry} material={atlas.brass} castShadow/>
      <mesh position={[0,-.3,0]} material={atlas.brass}><sphereGeometry args={[.055,8,6]}/></mesh></group>
    {(['surface','solid'] as const).map(kind=><RigidBody key={kind} type="fixed" colliders={false} userData={{[kind]:true,assetId:'alpha-exchange'}}>
      <TrimeshCollider name={`alpha-exchange-${kind}`} args={[built.colliders[kind].vertices,built.colliders[kind].indices]} friction={.85}/>
    </RigidBody>)}
    <ExchangeInput projectId={projectId}/>
  </group>;
}
