import { useState } from 'react';
import { useWorldStore } from './store';
import { ALPHA_FACTORS } from './alpha-mine-data';
import { ALPHA_MINE_ORIGIN, mineLocalToWorld } from './alpha-mine-layout';
import { mineActor, mineContactEvidence, mineVisualSockets, useAlphaMineStore } from './alpha-mine-state';
import { useMineManifest } from './alpha-mine-assets';
import { loadMineReplay, useMineReplay } from './alpha-mine-replay';
import './alpha-mine.css';

const pct = (n: number) => `${n > 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;
const ACTION = {
  equip: ['取下工具', 'Taking the tools'], scan: ['辨认矿线', 'Reading the seam'],
  strike: ['挥镐开采', 'Chipping the rock'], pickup: ['拾起矿石', 'Picking up ore'], deposit: ['投入回测池', 'Casting into the pool'],
};
/** Uses the actor's existing position publication; no new timer or animation loop. */
export default function WorldAlphaMineHud() {
  const world = useWorldStore(), mine = useAlphaMineStore(), replay = useMineReplay();
  const manifest = useMineManifest(s=>s.manifest);
  const [details, setDetails] = useState(false);
  const zh = world.lang === 'zh', t = (cn: string, en: string) => zh ? cn : en;
  const [x,,z] = world.position;
  if (world.paused || world.card || world.shot || world.activeVehicle || (x < ALPHA_MINE_ORIGIN[0]-20 || x > ALPHA_MINE_ORIGIN[0]+20 || z < ALPHA_MINE_ORIGIN[2]-40 || z > ALPHA_MINE_ORIGIN[2]+6)) return null;
  const carried = ALPHA_FACTORS.find(f => f.id === mine.carried);
  const pool = mineLocalToWorld([1.8,0,-6.5]), atPool = Math.hypot(x-pool[0],z-pool[2]) < 9;
  const seen = Object.values(mine.veins).filter(v => v.collected).length;
  const detectorTargets = (manifest?.veins ?? []).map((v,i) => ({ p:mineLocalToWorld(v.socket), id:ALPHA_FACTORS[i].id }));
  const nearest = detectorTargets.filter(v => !mine.veins[v.id].collected).sort((a,b) => Math.hypot(a.p[0]-x,a.p[1]-world.position[1],a.p[2]-z)-Math.hypot(b.p[0]-x,b.p[1]-world.position[1],b.p[2]-z))[0];
  const distance = nearest ? Math.hypot(nearest.p[0]-x, (nearest.p[1]-world.position[1])*1.5, nearest.p[2]-z) : Infinity;
  const strength = Math.max(0,1-distance/24);
  const angle = nearest ? Math.atan2(-(nearest.p[2]-z),nearest.p[0]-x)-mineActor.yaw : 0;
  return <aside className="alpha-mine-hud" aria-label={t('因子矿场','Factor mine')}>
    {import.meta.env.DEV && new URLSearchParams(window.location.search).get('qa')==='1' && <output data-alpha-mine-qa style={{position:'fixed',left:18,bottom:18,maxWidth:480,whiteSpace:'pre-wrap',font:'10px monospace',background:'#142525e8',padding:8,pointerEvents:'none'}}>{JSON.stringify({position:world.position.map(v=>+v.toFixed(2)),yaw:+mineActor.yaw.toFixed(2),grounded:mineActor.grounded,nearby:world.nearbyInteract?.id,equipped:mine.equipped,carried:mine.carried,veins:mine.veins,bays:mine.bays,recovered:mine.recovered,assetsReady:mineVisualSockets.assetsReady,contact:mineContactEvidence},null,1)}</output>}
    <div className="alpha-mine-heading"><span>ALPHA / 01</span><strong>{t('因子矿场','The factor mine')}</strong><small>{seen} / 3 {t('已采集','collected')}</small></div>
    <p className="alpha-mine-intent">{mine.action ? mine.action.kind==='deposit'&&mine.action.bay===undefined?t('放到暂存台','Setting down on the shelf'):ACTION[mine.action.kind][zh ? 0 : 1] : carried ? t(`带${carried.label}回到池边，选择一个投放位。`,`Bring ${carried.labelEn} to a casting spot by the pool.`) : !mine.equipped ? t('从入口左侧取工具，沿矿纹往上探索。','Collect the tools on your left, then follow the seams uphill.') : t('跟随信号找矿。靠近岩面辨认，再挥镐。','Follow the signal. Read a seam up close, then chip it free.')}</p>
    {mine.equipped && !carried && <div className="alpha-mine-detector" aria-label={t('探测信号，仅提示距离与方向','Detector: proximity and direction only')}>
      <span className="alpha-mine-needle" style={{ transform:`rotate(${-angle}rad)` }} aria-hidden="true">↑</span>
      <span className="alpha-mine-signal"><i style={{ width:`${strength*100}%` }} /></span>
      <small>{!nearest ? t('本轮矿线已采完','All seams collected') : distance < 3 ? t('就在附近','Very close') : distance < 12 ? t('信号清晰','Clear signal') : t('远处的回声','A distant echo')}</small>
    </div>}
    {carried && <p className="alpha-mine-key"><kbd>F</kbd> {t('放到附近的暂存台','Set down on a nearby shelf')}</p>}
    {mine.notice && <p className="alpha-mine-notice" role="status">{zh ? mine.notice.zh : mine.notice.en}</p>}
    {atPool && <section className="alpha-mine-results" aria-label={t('回测池','Backtest pool')}>
      <div className="alpha-mine-pool-head"><span>{t('回测池','Backtest pool')}</span><small>{t('历史回测重放','Historical replay')}</small></div>
      {mine.bays.some(Boolean) ? replay.status === 'ready' && replay.pack ? <>
        <div className="alpha-mine-result-grid">{mine.bays.map((id, i) => {
          if (!id) return <div key={i} className="alpha-mine-result"><span>{i ? 'B' : 'A'}</span><p>{t('空投放位','Empty casting spot')}</p></div>;
          const factor = ALPHA_FACTORS.find(f => f.id === id)!, result = replay.pack!.factors[id];
          return <article key={i} className="alpha-mine-result" style={{ borderTopColor: factor.color }}>
            <span>{i ? 'B' : 'A'} · {zh ? factor.label : factor.labelEn}</span>
            <strong>{pct(result.metrics.totalReturn)}</strong><small>{t('测试段净收益','Test-period net return')}</small>
            <dl><div><dt>{t('最大回撤','Drawdown')}</dt><dd>{pct(result.metrics.maxDrawdown)}</dd></div><div><dt>IC</dt><dd>{result.metrics.ic.toFixed(3)}</dd></div></dl>
            <p>{result.metrics.totalReturn <= 0 ? t('这次没有留下净收益。换一条矿线试试。','No net gain in this test. Try another seam.') : t('这份样本有净收益，仍可能经历回撤。','This sample gained, with drawdowns along the way.')}</p>
          </article>;
        })}</div>
        <p className="alpha-mine-provenance">{replay.pack.factors.REVERSAL_5.testRange.start} → {replay.pack.factors.REVERSAL_5.testRange.end}<br />{t('测试段指标；池中曲线展示完整历史。','Test metrics; the pool shows the full history.')}</p>
        <button className="alpha-mine-text-button" aria-expanded={details} onClick={() => setDetails(!details)}>{t('查看假设与来源','Hypotheses & provenance')} {details ? '−' : '+'}</button>
        {details && <div className="alpha-mine-detail">
          {mine.bays.filter(Boolean).map((id,i) => { const f=ALPHA_FACTORS.find(v=>v.id===id)!; return <p key={i}><b>{zh?f.label:f.labelEn}。</b>{zh?f.hypothesis:f.hypothesisEn}</p>; })}
          <p>{replay.pack.dataset.source} · {replay.pack.dataset.assetCount} {t('个标的','assets')}<br />{replay.pack.dataset.dateRange.start} → {replay.pack.dataset.asOf}</p>
          <p>{t('每日多空组合，约 2 倍总敞口；交易成本假设 10 bps。未计滑点、借券或融资，未使用历史成分掩码。','Daily long/short portfolio, about 2× gross exposure; assumed 10 bps costs. No slippage, borrowing, financing or historical membership mask.')}</p>
          <p>{t('这是预先计算的研究样本，并非投资建议或收益承诺。结果仅供本机试玩，公开展示权尚未确认。','A precomputed research sample, not investment advice or a return promise. Local playtest only; public display rights are unconfirmed.')}</p>
        </div>}
      </> : <div className="alpha-mine-unavailable"><p>{replay.status==='loading' ? t('正在读取本机历史结果。','Reading the local historical results.') : t('本机回测结果暂不可用。矿石保留在托盘上，可以取回继续探索。','Local results are unavailable. The ore remains on the tray; retrieve it and keep exploring.')}</p><button onClick={() => void loadMineReplay(true)}>{t('重新读取','Retry reading')}</button></div> : <p className="alpha-mine-pool-empty">{t('把一块矿石投入 A 或 B 位，看看它在历史数据中留下什么。','Cast an ore into A or B and see what it left in the historical data.')}</p>}
      {mine.bays.some(Boolean) && !mine.carried && !mine.action && <p className="alpha-mine-retrieve">{t('走近池边托盘，按 E 取回矿石。','Approach a pool tray and press E to retrieve the ore.')}</p>}
    </section>}
  </aside>;
}
