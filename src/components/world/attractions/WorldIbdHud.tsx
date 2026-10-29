import { memo, useState } from 'react';
import { useWorldStore } from '../store';
import { sampleTimeLight } from '../world-climate';
import { IBD_YARD } from './attraction-layout';
import { assessIbd } from './ibd-model';
import { IBD_SLOTS, IBD_STATIONS, ibdLocal, ibdReach, ibdStation, isIbdStockKey, isIbdPackStation, type IbdStationId } from './ibd-yard-layout';
import { canCancelIbdObservation, yardActions, yardCase, yardPackItem, yardItemJudged, yardItemDifferent, yardItemId } from './ibd-yard-game';
import { IBD_VERDICT_LABEL, ibdVerdictEvidence, ibdVerdictOptions } from './ibd-yard-verdict';
import { IBD_ACTION_LABEL, IBD_MOTION_WAIT_LABEL, ibdNotice } from './ibd-yard-copy';
import { cancelIbdAction, dispatchIbdAction, setIbdGuide, useIbdYardStore } from './ibd-yard-store';
import { ibdGuideStep, ibdGuideResult, ibdGuidePhaseDone, IBD_GUIDE_PHASES } from './ibd-yard-guide';
import './ibd-yard.css';
import WorldIbdPackControls from './WorldIbdPackControls';
import WorldIbdCraneControls from './WorldIbdCraneControls';
import { useIbdPackPlay, openIbdPack, ibdPackWorkBusy } from './ibd-pack-play';

/** The manifest is a readout. Every cargo action is still gated by the same physical station as E. */
export default memo(function WorldIbdHud({ active = true }: { active?: boolean }) {
  const packView=useIbdPackPlay();
  const game = useIbdYardStore(s => s.game), mounted = useIbdYardStore(s => s.active);
  const motionWait = useIbdYardStore(s => s.motionWait);
  const guided = useIbdYardStore(s => s.guideEnabled), guide = ibdGuideStep(game), target = ibdStation(guide.action.station, game.core.moved);
  const lang = useWorldStore(s => s.lang);
  const theme = useWorldStore(s => sampleTimeLight(s.worldMinutes).night < .5 ? 'light' : 'dark');
  // A primitive visibility selector remains equal for every position publication outside the yard.
  const inYard = useWorldStore(s => active && Math.abs(s.position[0] - IBD_YARD.center[0]) <= IBD_YARD.size[0] / 2 + 4
    && s.position[2] >= IBD_YARD.center[2] - IBD_YARD.size[1] / 2 - 4 && s.position[2] <= IBD_YARD.center[2] + IBD_YARD.size[1] / 2 + 6);
  const distance = useWorldStore(s => inYard && guided ? Math.ceil(Math.hypot(s.position[0] - IBD_YARD.center[0] - target.at[0], s.position[2] - IBD_YARD.center[2] - target.at[2])) : 0);
  const suppressed = useWorldStore(s => s.paused || !!s.card || s.poolInspect || !!s.shot || !!s.activeVehicle || !!s.seat);
  const nearby = useWorldStore(s => inYard && s.nearbyInteract?.id.startsWith('ibd-') ? s.nearbyInteract.id : null), [details, setDetails] = useState(false);
  if (!active || !mounted || suppressed || !inYard) return null;
  const local = ibdLocal(useWorldStore.getState().position);
  const zh = lang === 'zh', t = (cn: string, en: string) => zh ? cn : en;
  const id = nearby?.startsWith('ibd-') ? nearby.slice(4) as IbdStationId : null;
  const station = id && IBD_STATIONS.some(s => s.id === id) ? ibdStation(id, game.core.moved) : null;
  const workingStation = packView.pack ? ibdStation(packView.pack,game.core.moved) : game.pending ? ibdStation(game.pending.action.station, game.core.moved) : station;
  const atTarget = nearby === `ibd-${target.id}` && ibdReach(local, target);
  const atStock=game.stock.requested&&station&&isIbdStockKey(station.id)&&ibdReach(local,station);
  const actions = atStock ? yardActions(game,station.id) : guided ? atTarget ? [guide.action] : [] : station && ibdReach(local, station) ? yardActions(game, station.id) : [];
  const reserve=atStock&&station&&isIbdStockKey(station.id)?yardPackItem(game,station.id):undefined;
  const samples=reserve?game.packInspections[reserve.id]?.slots.filter(p=>p.reading):undefined;
  const judgement = actions.find(a => a.kind === 'judge');
  const scenario = yardCase(game), assessment = assessIbd(scenario, game.core);
  const count = (prefix: string) => IBD_SLOTS.filter(slot => slot.startsWith(prefix) && yardItemJudged(game, slot)).length;
  const findings = [...assessment.inventory.findings, ...assessment.shipment.findings].filter(() => IBD_SLOTS.every(slot => yardItemJudged(game, slot)));
  const result = ibdGuideResult(game)[lang];
  const phasesDone = ibdGuidePhaseDone(game);
  const notice = result || (game.notice === 'welcome' || game.pending ? '' : ibdNotice(game)[lang]);
  return <aside className="ibd-yard-hud" data-ibd-theme={theme} aria-label={t('物资清点场随身货单', 'Inventory yard field manifest')} data-ibd-hud>
    <div className="ibd-ticket-head"><span>SDIC · {t('物资清点场', 'INVENTORY YARD')}</span><b>{String(game.round).padStart(2, '0')}</b></div>
    <div className="ibd-guide-mode"><span>{t('模拟作业', 'Fictional cargo')}</span><button onClick={() => setIbdGuide(!guided)}
      aria-pressed={guided}>{guided ? t('关闭带路', 'Hide guidance') : t('继续带路', 'Resume guidance')}</button></div>
    {guided ? <>
      <ol className="ibd-guide-phases" aria-label={t('作业顺序', 'Work sequence')}>{IBD_GUIDE_PHASES.map((phase, i) =>
        <li key={i} aria-current={!game.released && i === guide.phase ? 'step' : undefined} data-done={phasesDone[i]}>{phase[lang]}</li>)}</ol>
      <p className="ibd-guide-location">{target.title[lang]}{!atTarget && !game.released ? ` · ${distance} m` : ''}</p>
      <h2>{guide.title[lang]}</h2>
      <p className="ibd-next">{guide.hint[lang]}</p>
      {!atTarget && !atStock && !game.pending && !game.released && <p className="ibd-walk-hint">{game.stock.requested?t('进入后库，两侧验样台都可操作。','Enter the reserve area. Both sampling benches are available.'):t('沿地面箭头走到黄圈，靠近后按 E。', 'Follow the floor arrows to the ring. Press E when close.')}</p>}
    </> : <><h2>{workingStation ? workingStation.title[lang] : t('自由检查', 'Explore the yard')}</h2>
      <p className="ibd-next">{packView.pack?t('取出样件，合拢夹爪贴住杆身，夹量后放回原槽。','Present a sample, fit the jaws to its shaft, gauge it, then return it.'):t('靠近装置按 E 操作；需要时可恢复带路。', 'Approach a device and press E. Resume guidance at any time.')}</p></>}
    {packView.pack ? <WorldIbdPackControls zh={zh}/> : game.pending ? <>{game.pending.action.kind==='crane'&&<WorldIbdCraneControls zh={zh}/>}
      {(game.pending.action.kind!=='crane'||motionWait)&&<div className="ibd-working" role="status" aria-live="polite"><i aria-hidden="true" />{motionWait ? IBD_MOTION_WAIT_LABEL[motionWait][lang] : game.pending.action.kind==='replace'&&game.pending.action.slot==='parts-b'?t('正将原箱送往隔离位','Moving the original carton to quarantine'):IBD_ACTION_LABEL[game.pending.action.kind][lang]}</div>}
      {canCancelIbdObservation(game) && <div className="ibd-actions"><button className="ibd-secondary" onClick={() => {
        if (canCancelIbdObservation(useIbdYardStore.getState().game)) cancelIbdAction();
      }}>{t('取消本次操作', 'Cancel this operation')}</button></div>}</>
      : judgement?.slot ? <div className="ibd-verdict" aria-label={t('现场判断', 'Inspection verdict')}>
        <div className="ibd-verdict-evidence">{ibdVerdictEvidence(game, judgement.slot).map((row, i) => <p key={i}>{row[lang]}</p>)}</div>
        <div className="ibd-actions">{ibdVerdictOptions(judgement.slot).map(verdict => <button key={verdict} className="ibd-secondary"
          onClick={() => dispatchIbdAction({ ...judgement, verdict })}>{IBD_VERDICT_LABEL[verdict][lang]}</button>)}</div>
      </div> : actions.length > 0 && <div className="ibd-actions">{actions.map((a, i) => <button key={a.kind} className={i === 0 ? 'ibd-primary' : 'ibd-secondary'}
        onClick={() => {if(ibdPackWorkBusy())return;if(a.kind==='contents'&&isIbdPackStation(a.station))openIbdPack(a.station);else dispatchIbdAction(a);}}><kbd>{i === 0 ? 'E / Y' : '↻'}</kbd>{guided && !game.released && !atStock ? guide.title[lang] : IBD_ACTION_LABEL[a.kind][lang]}</button>)}</div>}
    {notice && !packView.pack && <p className="ibd-feedback" role="status" aria-live="polite">{notice}</p>}
    {!!samples?.length&&!packView.pack&&<p className="ibd-feedback">{t('这箱的已验样记录：','Recorded samples from this carton: ')}{samples.map(p=>`${p.index+1} · ${p.reading}`).join(' / ')}</p>}
    <button className="ibd-details-toggle" aria-expanded={details} onClick={() => setDetails(v => !v)}>{t('货单、已见证据与退换记录', 'Manifest, observed evidence and exchanges')} {details ? '−' : '+'}</button>
    {details && <div className="ibd-details">
      <div className="ibd-milestones"><span>{t('钢卷', 'Coils')}<b>{count('coil')}/2</b></span><span>{t('五金', 'Packs')}<b>{count('parts')}/2</b></span><span>{t('装车', 'Loaded')}<b>{game.core.loaded.length}/2</b></span></div>
      {station?.id === 'manifest' && game.started && !game.pending && <div className="ibd-actions">{yardActions(game, 'manifest').filter(a => a.kind === 'reset' || a.kind === 'next').map(a =>
        <button key={a.kind} className="ibd-secondary" onClick={() => dispatchIbdAction(a)}>{IBD_ACTION_LABEL[a.kind][lang]}</button>)}</div>}
      <p><strong>{t('库存', 'Stock')}</strong>：{t('钢卷 2 卷；M8 五金 8 件。', '2 coils; 8 M8 pieces.')}<br />
        <strong>{t('发货', 'Ship')}</strong>：{t('只发 M8 五金 8 件。2 箱不等于 2 件。', 'Only 8 M8 pieces. Two cartons are not two pieces.')}</p>
      <ul>{IBD_SLOTS.map(slot => {
        if(slot==='parts-b'&&game.stock.requested)return <li key={slot}><strong>{t('B 台空置','Bench B empty')}</strong><span>{t('原箱已隔离，等待你从后库选箱。','Original quarantined. Choose a carton from reserve.')}</span></li>;
        const item = scenario.items.find(i => i.id === yardItemId(game, slot))!, proof = game.core.proofs[item.id] ?? [];
        const label = slot === 'coil-front' ? t('前卷', 'Front coil') : slot === 'coil-rear' ? t('后卷', 'Rear coil') : slot === 'parts-a' ? t('A 箱', 'Pack A') : t('B 箱', 'Pack B');
        return <li key={slot}><strong>{label}{game.exchanges.some(e => e.slot === slot)||(slot==='parts-b'&&game.stock.assigned) ? t('（替换件）', ' (replacement)') : ''}</strong>
          <span>{proof.includes('quantity') ? `${item.quantity} ${item.unit === 'coil' ? t('卷', 'coil') : t('件', 'pieces')}` : t('数量待核', 'Count unchecked')}
            {' · '}{proof.includes('specification') ? item.specId : t('规格待核', 'Spec unchecked')}</span>
          <span>{yardItemDifferent(game, slot) ? t('异常已签认', 'Discrepancy confirmed') : yardItemJudged(game, slot) ? t('已签认验收', 'Accepted by verdict') : t('检查或现场判断待完成', 'Inspection or verdict pending')}
            {game.core.loaded.includes(item.id) ? t(' · 已装车', ' · Loaded') : ''}</span></li>;
      })}</ul>
      {findings.length > 0 && <p className="ibd-finding">{findings.map((f, i) => <span key={i}>{f.code === 'quantity-difference'
        ? `${f.specId}：${t('应有', 'expected')} ${f.expected} / ${t('实际', 'actual')} ${f.actual} ${f.unit === 'piece' ? t('件', 'pieces') : t('卷', 'coils')}`
        : f.code === 'condition-difference' ? t('钢卷背面有游戏可见凹痕', 'Visible fictional dent on the coil rear') : `${t('规格不符', 'Unexpected specification')}：${f.specId}`}</span>)}</p>}
      {game.exchanges.length > 0 && <p>{t('隔离记录保留', 'Quarantine record retained')}：{game.exchanges.map(e => `${e.original.id} (${e.original.specId}, ${e.original.quantity})`).join('；')}</p>}
      {game.stock.originalReturned&&<p>{t('原 B 箱及已核实证据保留在隔离位。后库候选不计入本批发货数量。','The original B carton and its findings remain in quarantine. Reserve cartons do not count toward this shipment.')}</p>}
      <small>{t('个人经历的原创玩法改编。工具读数仅用于游戏，不代表真实工业鉴定。离开再回来保留本次访问进度，刷新重新开始。', 'An original playable interpretation of a personal experience. Tool readings are game rules, not industrial certification. Progress lasts for this visit; refresh starts again.')}</small>
    </div>}
  </aside>;
});
