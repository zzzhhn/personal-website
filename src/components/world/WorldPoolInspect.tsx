import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useWorldStore } from './store';
import { useAlphaMineStore } from './alpha-mine-state';
import { useMineOnline, type MineOnlineResult } from './alpha-mine-online';
import { ALPHA_FACTORS, type AlphaFactorId } from './alpha-mine-data';
import { FACTOR_FAMILIES } from './alpha-mine-labels';
import { POOL_INK, poolDomain, poolDateIndex, poolPercent } from './mine-pool-chart';
import './alpha-mine.css';

const closePool = () => useWorldStore.setState({ poolInspect: false });
type ReadyBay = { id: AlphaFactorId; bay: number; result: MineOnlineResult };

function PoolInspection({ entries, zh }: { entries: ReadyBay[]; zh: boolean }) {
  const [bay, setBay] = useState<number>(() => useAlphaMineStore.getState().selectedBay), [compare, setCompare] = useState(false);
  const selected = entries.find(e => e.bay === bay) ?? entries[0];
  const [cursor, setCursor] = useState<string | null>(null);
  const shown = compare ? entries : [selected];
  const t = (cn: string, en: string) => zh ? cn : en;
  const curve = selected.result.factor.curve, activeIndex = cursor ? poolDateIndex(curve,cursor) : curve.length-1;
  const current = curve[activeIndex], family = FACTOR_FAMILIES[selected.id], seed = ALPHA_FACTORS.find(f=>f.id===selected.id)!;
  const bounds = useMemo(()=>poolDomain(entries.map(e=>e.result.factor.curve)),[entries]);
  const first = shown.reduce((d,e)=>e.result.factor.curve[0].date<d?e.result.factor.curve[0].date:d,curve[0].date);
  const last = shown.reduce((d,e)=>e.result.factor.curve.at(-1)!.date>d?e.result.factor.curve.at(-1)!.date:d,curve.at(-1)!.date);
  const left=66,top=34,width=810,height=260;
  const timeX=(date:string)=>left+width*(Date.parse(date)-Date.parse(first))/Math.max(1,Date.parse(last)-Date.parse(first));
  const valueY=(n:number)=>top+height*(1-(n-bounds[0])/(bounds[1]-bounds[0]));
  const paths=useMemo(()=>new Map(entries.map(entry=>{
    const path=(key:'nav'|'benchmark')=>entry.result.factor.curve.map((p,i)=>`${i?'L':'M'}${timeX(p.date).toFixed(2)},${valueY(p[key]).toFixed(2)}`).join(' ');
    return [entry.bay,{nav:path('nav'),benchmark:path('benchmark')}];
  })),[entries,first,last,bounds]);
  const moveCursor=(clientX:number,element:SVGSVGElement)=>{
    const box=element.getBoundingClientRect(),ratio=Math.max(0,Math.min(1,((clientX-box.left)*920/box.width-left)/width));
    const date=new Date(Date.parse(first)+ratio*(Date.parse(last)-Date.parse(first))).toISOString().slice(0,10);
    setCursor(curve[poolDateIndex(curve,date)].date);
  };
  const metrics = selected.result.factor.metrics;
  return <>
    <div className="pool-inspect-controls">
      <div role="group" aria-label={t('选择池位','Select pool bay')}>
        {entries.map(e=><button key={e.bay} aria-pressed={selected.bay===e.bay} onClick={()=>setBay(e.bay)} style={{'--pool-ink':POOL_INK[e.id]} as CSSProperties}>
          <span>{e.bay?'B':'A'}</span>{zh?FACTOR_FAMILIES[e.id].zh:FACTOR_FAMILIES[e.id].en}
        </button>)}
      </div>
      {entries.length>1&&<button className="pool-compare" aria-pressed={compare} onClick={()=>setCompare(!compare)}>{t('叠加比较','Compare curves')}</button>}
    </div>
    <div className="pool-inspect-body">
      <section className="pool-chart-section" aria-label={t('完整历史净值曲线','Full-history NAV chart')}>
        <div className="pool-chart-heading"><h3>{t('市场的回声','Market echoes')}</h3><span>{first} → {last}</span></div>
        <div className="pool-chart-legend">
          {shown.map(e=><span key={e.bay}><i style={{background:POOL_INK[e.id]}}/>{e.bay?'B':'A'} · {zh?FACTOR_FAMILIES[e.id].zh:FACTOR_FAMILIES[e.id].en}</span>)}
          <span><i className="is-benchmark"/>SPY · {selected.bay?'B':'A'}</span>
        </div>
        <svg className="pool-inspect-chart" viewBox="0 0 920 350" role="img" aria-label={t('因子和SPY的历史净值，使用下方日期滑块逐日查看','Historical factor and SPY NAV. Use the date slider below to inspect observations.')}
          onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);moveCursor(e.clientX,e.currentTarget);}}
          onPointerMove={e=>{if(e.buttons===1)moveCursor(e.clientX,e.currentTarget);}}>
          <rect x={timeX(selected.result.factor.testRange.start)} y={top} width={Math.max(0,left+width-timeX(selected.result.factor.testRange.start))} height={height} className="pool-test-region"/>
          {[0,1,2,3,4].map(i=>{const y=top+height*i/4;return <g key={i}><line x1={left} x2={left+width} y1={y} y2={y} className="pool-grid"/><text x={left-12} y={y+5} textAnchor="end">{(bounds[1]-(bounds[1]-bounds[0])*i/4).toFixed(2)}</text></g>;})}
          <path d={paths.get(selected.bay)!.benchmark} className="pool-benchmark"/>
          {shown.map(e=><path key={e.bay} d={paths.get(e.bay)!.nav} className="pool-factor-line" stroke={POOL_INK[e.id]}/>)}
          <line x1={timeX(current.date)} x2={timeX(current.date)} y1={top} y2={top+height} className="pool-cursor"/>
          {shown.map(e=>{const p=e.result.factor.curve[poolDateIndex(e.result.factor.curve,current.date)];return <circle key={e.bay} cx={timeX(p.date)} cy={valueY(p.nav)} r="5" fill={POOL_INK[e.id]}/>;})}
          <text x={left} y="329">{first}</text><text x={left+width} y="329" textAnchor="end">{last}</text>
        </svg>
        <div className="pool-cursor-values"><time>{current.date}</time>{shown.map(e=>{const p=e.result.factor.curve[poolDateIndex(e.result.factor.curve,current.date)];return <span key={e.bay} style={{color:POOL_INK[e.id]}}>{e.bay?'B':'A'} <b>{p.nav.toFixed(3)}</b>{p.date!==current.date&&<small> ({p.date})</small>}</span>;})}<span>SPY <b>{current.benchmark.toFixed(3)}</b></span></div>
        <label className="pool-date-slider">{t('拖动时间，或用方向键逐日检视','Scrub time, or use arrow keys to inspect each day')}
          <input type="range" min="0" max={curve.length-1} step="1" value={activeIndex} aria-label={t('检视交易日','Inspect trading day')} aria-valuetext={`${current.date}, ${current.nav.toFixed(3)}`} onChange={e=>setCursor(curve[Number(e.target.value)].date)}/>
        </label>
        <p className="pool-chart-note">{t('净值以首日 1.00 起算。阴影标记当前池位的测试段；右侧指标只属于该测试段。','NAV starts at 1.00. Shading marks the selected bay’s test segment; its metrics cover only that segment.')}</p>
      </section>
      <aside className="pool-metrics" aria-label={t('测试段指标','Test-segment metrics')} style={{'--pool-ink':POOL_INK[selected.id]} as CSSProperties}>
        <span className="pool-family-mark" aria-hidden="true">{family.mark}</span><h3>{zh?family.zh:family.en}</h3>
        <p>{t('测试段','Test segment')}<br/>{selected.result.factor.testRange.start} → {selected.result.factor.testRange.end}</p>
        <dl>
          <div className="pool-main-metric"><dt>{t('净收益','Net return')}</dt><dd>{poolPercent(metrics.totalReturn)}</dd></div>
          <div><dt>{t('最大回撤','Max drawdown')}</dt><dd>{poolPercent(metrics.maxDrawdown)}</dd></div>
          <div><dt>{t('排序相关 IC','Rank IC')}</dt><dd>{metrics.ic.toFixed(3)}</dd></div>
          <div><dt>{t('换手率','Turnover')}</dt><dd>{poolPercent(metrics.turnover)}</dd></div>
        </dl>
        <p className="pool-hypothesis">{zh?seed.hypothesis:seed.hypothesisEn}</p>
      </aside>
    </div>
    <details className="pool-inspect-source"><summary>{t('计算口径与数据来源','Method and data source')}</summary>
      <p>{t('Alpha Agent 线上计算，非 WorldQuant BRAIN 官方回测。S&P 500 因子，固定多空组合，前后 30%，80% 训练段，10 bps 成本。未重新拟合参数。','Computed online by Alpha Agent, not an official WorldQuant BRAIN backtest. S&P 500 factors; fixed long/short, top/bottom 30%, 80% training and 10 bps costs. Parameters are not refitted.')}</p>
      <p>{selected.result.metadata.survivorshipCorrected?t('已启用历史成分修正。','Historical membership correction is enabled.'):t('本次返回未启用历史成分修正。','Historical membership correction is not enabled in this response.')}{t(' 本次访问缓存，客户端收到于 ',' Visit cache, received by this client at ')}{new Date(selected.result.metadata.computedAt).toLocaleString(zh?'zh-CN':'en-GB')}。</p>
      <a href="https://alpha.bobbyzhong.com/data" target="_blank" rel="noreferrer">{t('查看 Alpha Agent 数据源','View Alpha Agent data sources')} ↗</a>
    </details>
  </>;
}

/** A native modal traps focus. Physics/input pause independently of the map menu. */
export default function WorldPoolInspect() {
  const open=useWorldStore(s=>s.poolInspect),paused=useWorldStore(s=>s.paused),zh=useWorldStore(s=>s.lang)==='zh';
  const bays=useAlphaMineStore(s=>s.bays),results=useMineOnline(s=>s.factors),dialog=useRef<HTMLDialogElement>(null);
  const entries=useMemo(()=>bays.flatMap((id,bay)=>id&&results[id].status==='ready'&&results[id].result?[{id,bay,result:results[id].result!}]:[]),[bays,results]);
  useEffect(()=>{
    const el=dialog.current;if(!el)return;
    if(open&&!paused&&entries.length){if(!el.open)el.showModal();}
    else if(el.open){el.close();document.getElementById('mine-pool-inspect')?.focus({preventScroll:true});}
    if(open&&(paused||!entries.length))closePool();
  },[open,paused,entries.length]);
  return <dialog ref={dialog} className="pool-inspect" aria-labelledby="pool-inspect-title" onCancel={e=>{e.preventDefault();closePool();}} onPointerDown={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closePool();}}}>
    {open&&entries.length>0&&<>
      <header className="pool-inspect-header"><div><span>{zh?'回测池 · 聚焦检视':'BACKTEST POOL · INSPECT'}</span><h2 id="pool-inspect-title">{zh?'让因子自己说话':'Let the factor speak'}</h2></div><button autoFocus onClick={closePool}>{zh?'返回池边':'Back to the pool'} <kbd>Esc</kbd></button></header>
      <PoolInspection entries={entries} zh={zh}/>
    </>}
  </dialog>;
}
