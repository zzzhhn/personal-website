import { useState, type CSSProperties } from 'react';
import { useWorldStore } from './store';
import { ALPHA_FACTORS } from './alpha-mine-data';
import { ALPHA_MINE_FOOTPRINT, mineLocalToWorld } from './alpha-mine-layout';
import { mineActor, mineContactEvidence, mineVisualSockets, useAlphaMineStore } from './alpha-mine-state';
import { useMineManifest } from './alpha-mine-assets';
import { mineOnlineMessage, requestMineBacktest, useMineOnline } from './alpha-mine-online';
import { FACTOR_FAMILIES } from './alpha-mine-labels';
import './alpha-mine.css';

/** A field instrument, refreshed by the existing actor publication, with no polling timer. */
export default function WorldAlphaMineHud() {
  const world=useWorldStore(), mine=useAlphaMineStore(), online=useMineOnline();
  const manifest=useMineManifest(s=>s.manifest),[details,setDetails]=useState(false);
  const zh=world.lang==='zh',t=(cn:string,en:string)=>zh?cn:en;
  const [x,y,z]=world.position, b=ALPHA_MINE_FOOTPRINT;
  if(world.paused||world.poolInspect||world.card||world.shot||world.activeVehicle||x<b.minX-5||x>b.maxX+5||z<b.minZ-5||z>b.maxZ+10)return null;
  const carried=ALPHA_FACTORS.find(f=>f.id===mine.carried);
  const pool=mineLocalToWorld(manifest?.basin.center??[1.8,0,-6.5]),atPool=Math.hypot(x-pool[0],z-pool[2])<10;
  const targets=(manifest?.veins??[]).map((v,i)=>({p:mineLocalToWorld(v.socket),id:ALPHA_FACTORS[i].id}));
  const nearest=targets.filter(v=>!mine.veins[v.id].collected).sort((a,b)=>Math.hypot(a.p[0]-x,a.p[1]-y,a.p[2]-z)-Math.hypot(b.p[0]-x,b.p[1]-y,b.p[2]-z))[0];
  const target=carried?pool:nearest?.p,dist=target?Math.hypot(target[0]-x,target[2]-z):0;
  const angle=target?Math.atan2(-(target[2]-z),target[0]-x)-mineActor.yaw:0;
  const radius=Math.min(63,Math.max(9,dist*2.1)),strength=target?Math.max(.08,1-dist/45):0;
  const revealed=nearest&&mine.veins[nearest.id].revealed, family=carried?FACTOR_FAMILIES[carried.id]:revealed?FACTOR_FAMILIES[nearest.id]:null;
  const seen=Object.values(mine.veins).filter(v=>v.collected).length;
  const action=mine.action?.kind;
  const instruction=action?({equip:t('取下勘探工具','COLLECTING TOOLS'),scan:t('分析矿脉频谱','READING THE SEAM'),strike:t('开凿岩面','CHIPPING THE ROCK'),pickup:t('取出因子矿','COLLECTING ORE'),deposit:t('放入池中计算','CASTING THE ORE')}[action]):!mine.equipped?t('入口左侧取工具 · E','TOOLS ON YOUR LEFT · E'):carried?t('沿指针返回回测池','FOLLOW THE NEEDLE TO THE POOL'):nearest?t('靠近矿纹 · E 探测／开采','APPROACH A SEAM · E SCAN / MINE'):t('三条矿线已采完 · 回池边比较','ALL SEAMS COLLECTED · COMPARE AT THE POOL');
  return <aside className="alpha-mine-hud" aria-label={t('WorldQuant 因子勘探仪','WorldQuant factor detector')}>
    <div className="mine-device-top"><span>WQ / FIELDWORK</span><small>{seen.toString().padStart(2,'0')} / 03</small></div>
    <div className="mine-instrument">
      <svg viewBox="0 0 200 200" role="img" aria-label={t('相对人物朝向的矿脉方位','Seam bearing relative to your heading')}>
        <circle cx="100" cy="100" r="90" className="mine-bezel"/><circle cx="100" cy="100" r="76" className="mine-screen"/>
        {[25,50,73].map(r=><circle key={r} cx="100" cy="100" r={r} className="mine-radar-ring"/>)}
        <path d="M100 28V172M28 100H172" className="mine-crosshair"/>
        {Array.from({length:24},(_,i)=><path key={i} d={`M100 13V${i%3?17:21}`} transform={`rotate(${i*15} 100 100)`} className="mine-tick"/>)}
        {mine.equipped&&target&&<g transform={`translate(${100-Math.sin(angle)*radius} ${100-Math.cos(angle)*radius})`}>
          <circle r="12" className="mine-echo"/><circle r="4" fill={carried?'#d7b978':'#b4e5be'}/>
        </g>}
        <path d="M100 88L106 107L100 103L94 107Z" fill="#dedfbe"/>
        <text x="100" y="45" textAnchor="middle" className="mine-dial-label">{carried?'POOL':t('前方','FWD')}</text>
        <text x="100" y="152" textAnchor="middle" className="mine-dial-number">{mine.equipped&&target?`${Math.round(dist)} m`:'—'}</text>
      </svg>
      <div className="mine-frequency"><span>{t('信号','SIGNAL')}</span><div>{Array.from({length:10},(_,i)=><i key={i} className={mine.equipped&&strength>i/10?'is-on':''}/>)}</div><b>{family?(zh?family.zh:family.en):t('未辨认矿线','UNIDENTIFIED SEAM')}</b></div>
      <div className="mine-altitude">{target&&mine.equipped?(target[1]-y>1.5?t('↑ 上层岩壁','↑ UPPER GALLERY'):target[1]-y< -2?t('↓ 下层通道','↓ LOWER GALLERY'):t('同层信号','SAME LEVEL')):t('等待工具接入','DETECTOR OFFLINE')}</div>
    </div>
    <p className="mine-command">{instruction}</p>
    <div className="mine-samples">{ALPHA_FACTORS.map(f=><span key={f.id} title={zh?FACTOR_FAMILIES[f.id].zh:FACTOR_FAMILIES[f.id].en} className={mine.veins[f.id].collected?'is-collected':''} style={{'--ore':f.color} as CSSProperties}><i>{FACTOR_FAMILIES[f.id].mark}</i><small>{mine.veins[f.id].revealed?(zh?FACTOR_FAMILIES[f.id].zh:FACTOR_FAMILIES[f.id].en):'???'}</small></span>)}</div>
    {carried&&<p className="mine-key"><kbd>F</kbd> {t('在暂存台放下','SET DOWN AT A SHELF')}</p>}
    {mine.notice&&<p className="mine-notice" role="status">{zh?mine.notice.zh:mine.notice.en}</p>}
    {atPool&&<div className="mine-pool-control">
      <p>{t('将矿石投入 A／B，结果会从池面升起。','Cast into A / B. Results rise above the water.')}</p>
      {mine.bays.some(id=>id&&online.factors[id].status==='ready')&&<button id="mine-pool-inspect" className="mine-inspect-action" onClick={()=>useWorldStore.setState({poolInspect:true})}>{t('聚焦检视 · 曲线与指标','Inspect curves & metrics')}</button>}
      {Array.from(new Set(mine.bays)).map(id=>{if(!id)return null;const entry=online.factors[id];if(entry.status!=='error'&&entry.status!=='loading')return null;const message=mineOnlineMessage(entry,zh);return <section key={id} className="mine-connection" role="status" aria-live="polite">
        <small>{zh?FACTOR_FAMILIES[id].zh:FACTOR_FAMILIES[id].en}</small><strong>{message.title}</strong><p>{message.detail}</p>
        {entry.status==='error'&&<button onClick={()=>void requestMineBacktest(id,true)}>{t('再试一次','Retry backtest')}</button>}
      </section>;})}
      <button aria-expanded={details} onClick={()=>setDetails(!details)}>{t('计算口径与来源','METHOD & SOURCE')} {details?'−':'+'}</button>
      {details&&<div className="mine-method"><p>{t('WorldQuant 实习经历的个人玩法改编。计算由独立项目 Alpha Agent 提供，不是 BRAIN 官方回测。','A personal playable interpretation of the WorldQuant experience. Computed by Alpha Agent, not the BRAIN platform.')}</p>
        {Array.from(new Set(mine.bays)).map(id=>{const issue=id?online.factors[id].issue:null;return issue?<p key={id}>{t('连接诊断','Connection diagnostic')} · {id}<br/>{issue.kind}{issue.httpStatus?` · HTTP ${issue.httpStatus}`:''}<br/>{issue.requestId} · {t('第','Attempt ')}{issue.attempt}{t('次','')} · {(issue.elapsedMs/1000).toFixed(1)} s</p>:null;})}
        <p>{t('固定多空组合；前后 30%，80% 训练段，10 bps 成本。曲线为完整历史净值；收益、IC、回撤只对应测试段。灰线为 SPY。','Fixed long/short, top/bottom 30%, 80% training, 10 bps costs. Full-history NAV; return, IC and drawdown cover the test segment. Grey: SPY.')}</p>
        {mine.bays.filter(Boolean).map(id=>{if(!id)return null;const r=online.factors[id].result;return r?<p key={id}>{zh?FACTOR_FAMILIES[id].zh:FACTOR_FAMILIES[id].en} · {r.metadata.survivorshipCorrected?t('历史成分修正已启用','Historical membership corrected'):t('未启用历史成分修正','No membership correction')}<br/>{r.metadata.dateRange.start} → {r.metadata.dateRange.end}<br/>{t('本次访问缓存；收到于','Visit cache; received')} {new Date(r.metadata.computedAt).toLocaleTimeString(zh?'zh-CN':'en-GB')}</p>:null;})}
        <a href="https://alpha.bobbyzhong.com/data" target="_blank" rel="noreferrer">{t('打开 Alpha Agent 数据源','Open Alpha Agent data')}</a>
      </div>}
    </div>}
    {import.meta.env.DEV&&new URLSearchParams(window.location.search).get('qa')==='1'&&<output data-alpha-mine-qa className="mine-qa">{JSON.stringify({position:world.position.map(v=>+v.toFixed(2)),yaw:+mineActor.yaw.toFixed(2),grounded:mineActor.grounded,nearby:world.nearbyInteract?.id,equipped:mine.equipped,carried:mine.carried,veins:mine.veins,bays:mine.bays,online:Object.fromEntries(Object.entries(online.factors).map(([k,v])=>[k,{status:v.status,points:v.result?.factor.curve.length}])),assetsReady:mineVisualSockets.assetsReady,action:mine.action?{kind:mine.action.kind,t:mine.action.elapsed}:null,contact:mineContactEvidence},null,1)}</output>}
  </aside>;
}
