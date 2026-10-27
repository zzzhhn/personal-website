import { memo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWorldStore } from '../store';
import { COASTER_DURATION, coasterPhase, type CoasterView } from './coaster-track';
import { INTENT_STATIONS, INTENT_TARGETS, INTENT_TOOL_ACTIONS, intentInReach, type IntentTarget } from './intent-stations';
import { INTENT_LABELS, INTENT_TASKS, type IntentText } from './intent-tasks';
import { activateIntentTarget, clarifyIntent, currentIntentTask, intentContact, nextIntentTask, resetIntentVisit, selectIntentTool, stopIntentRide, useIntentStore } from './intent-state';
import { INTENT_COASTER } from './attraction-layout';
import type { CoasterBoardingPhase } from './coaster-transition';
import { resetAttractionLook } from './attraction-camera';
import './intent-coaster.css';

const PHASE_TEXT: Record<ReturnType<typeof coasterPhase>, IntentText> = {
  station: { zh: '离站', en: 'Leaving the station' }, lift: { zh: '攀升，看见全岛', en: 'Climbing above the island' },
  crest: { zh: '高处停一瞬', en: 'A moment at the top' }, drop: { zh: '骤变', en: 'The sudden shift' },
  bank: { zh: '掠过反弯', en: 'Through the banked turns' }, tunnel: { zh: '穿过灯廊', en: 'Into the light corridor' },
  low: { zh: '贴地疾驰', en: 'The low run' }, airtime: { zh: '越过驼峰', en: 'Over the airtime hill' },
  inversion: { zh: '倒置回环', en: 'Through the inversion' }, helix: { zh: '环绕设备楼', en: 'Around the equipment house' },
  return: { zh: '减速回站', en: 'Braking into the station' },
};
const BOARDING_TEXT: Record<CoasterBoardingPhase, IntentText> = {
  approach: { zh: '走向登车踏步', en: 'Walking to the boarding steps' },
  'step-in': { zh: '沿踏步进入车厢', en: 'Climbing the boarding steps' },
  'turn-in': { zh: '转身对准座位', en: 'Turning toward the seat' },
  sit: { zh: '正在坐下', en: 'Sitting down' }, settle: { zh: '坐稳后发车', en: 'Settling before departure' },
  riding: { zh: '乘坐中', en: 'On the ride' }, stand: { zh: '列车已停稳，正在起身', en: 'Train stopped. Standing up' },
  'turn-out': { zh: '转向车厢出口', en: 'Turning toward the exit' },
  'step-out': { zh: '沿踏步下车', en: 'Walking down the steps' },
  'walk-out': { zh: '走回安全站台', en: 'Walking onto the platform' },
  complete: { zh: '正在确认站台出口畅通', en: 'Checking the platform exit is clear' },
};
const VIEWS: { id: CoasterView; label: IntentText }[] = [
  { id: 'chase', label: { zh: '追尾', en: 'Chase' } }, { id: 'first-person', label: { zh: '第一人称', en: 'First person' } },
  { id: 'comfort', label: { zh: '舒适观景', en: 'Comfort' } },
];
/** Mount beside the world's other DOM overlays, outside Canvas. */
function WorldIntentHud() {
  const w = useWorldStore(useShallow(state => {
    const [x, , z] = state.position;
    const inside = Math.abs(x - INTENT_COASTER.center[0]) < INTENT_COASTER.size[0] / 2 + 3 && Math.abs(z - INTENT_COASTER.center[2]) < INTENT_COASTER.size[1] / 2 + 6;
    let target: IntentTarget | undefined, distance = Infinity;
    if (inside) for (const id of Object.keys(INTENT_TARGETS) as IntentTarget[]) {
      if (!intentInReach(state.position, id)) continue;
      const p = INTENT_TARGETS[id], d = Math.hypot(x - p[0], z - p[2]);
      if (d < distance) { target = id; distance = d; }
    }
    return { lang: state.lang, light: state.light, inside, target,
      blocked: state.paused || state.poolInspect || !!state.card || !!state.shot || !!state.activeVehicle || !!state.clubMode,
      interactId: inside ? state.nearbyInteract?.id : undefined };
  }));
  const s = useIntentStore(), [details, setDetails] = useState(false);
  const lang = w.lang, t = (zh: string, en: string) => lang === 'zh' ? zh : en;
  if (!s.active || (!s.riding && !w.inside) || w.blocked) return null;
  const target = w.target === 'board' && !s.progress.gateOpen ? undefined : w.target;
  const station = INTENT_STATIONS.find(item => item.id === target), task = station ? currentIntentTask(station.id) : null;
  const contact = target ? intentContact(target) : false;
  const theme = ['night', 'evening'].includes(w.light) ? 'dark' : 'light';
  const viewControls = <div className="intent-views" role="group" aria-label={t('乘坐视角', 'Ride view')}>
    {VIEWS.map(view => <button key={view.id} type="button" aria-pressed={s.view === view.id} onClick={() => { resetAttractionLook(); useIntentStore.setState({ view: view.id }); }}>{view.label[lang]}</button>)}
  </div>;
  if (s.riding) return <aside className="intent-hud intent-riding" data-theme={theme} aria-label={t('过山车乘坐控制', 'Coaster ride controls')}>
    <div className="intent-ride-heading"><strong>{s.ridePhase && s.ridePhase !== 'riding' ? BOARDING_TEXT[s.ridePhase][lang] : PHASE_TEXT[coasterPhase(s.rideSecond)][lang]}</strong><span>{s.rideSecond} / {COASTER_DURATION} s</span></div>
    <progress value={s.rideSecond} max={COASTER_DURATION} aria-label={t('乘坐进度', 'Ride progress')} />
    {viewControls}<button type="button" onClick={resetAttractionLook}>{t('视角归位', 'Reset view')}</button>
    <p><small>{t('拖拽自由观察 · 滚轮缩放 · 手柄右摇杆转头', 'Drag to look · scroll to zoom · right stick to look')}</small></p>
    <button type="button" className="intent-primary" disabled={s.exitRequested || ['stand', 'turn-out', 'step-out', 'walk-out', 'complete'].includes(s.ridePhase ?? '')} onClick={stopIntentRide}>{s.exitRequested ? t('已登记，回站后下车', 'Exit requested. Leaving at the station') : s.ridePhase === 'riding' ? t('回站后下车', 'Leave at the station') : t('取消本次发车并下车', 'Cancel departure and step out')}</button>
    <small>{t('Esc／手柄 Start 暂停；手柄 B 申请下车。行驶中会完成当前回路，恢复后从原处继续。', 'Esc / Start pauses; B requests an exit. A moving train completes its loop. Resume from the same point.')}</small>
  </aside>;
  const primaryText = target === 'chest' ? s.progress.keyTaken ? t('钥匙已在身上', 'You have the key') : s.progress.chestOpen ? t('拿起钥匙', 'Take the key') : t('掀开宝箱', 'Open the chest')
    : target === 'gate' ? s.progress.gateOpen ? t('大门已打开', 'Gate open') : t('插入钥匙，打开大门', 'Insert key and unlock gate')
    : target === 'board' ? t(`沿踏步登车，坐稳后开始 ${COASTER_DURATION} 秒回路`, `Board the ${COASTER_DURATION}-second ride`)
    : station ? station.id === 'visitor' && !s.progress.clarified.includes('T7') ? t('摇铃问清目标', 'Ring to clarify the goal') : INTENT_TOOL_ACTIONS[s.tools[station.id]][lang] : '';
  const disabled = !contact || (target === 'chest' && s.progress.keyTaken) || (target === 'gate' && s.progress.gateOpen);
  return <aside className="intent-hud" data-theme={theme} lang={lang === 'zh' ? 'zh-CN' : 'en'} aria-label={t('意图过山车', 'Intent coaster')}>
    <div className="intent-heading"><div><small>{t('字节跳动 · AI PM 经历改编', 'BYTEDANCE · AN AI PM EXPERIENCE')}</small><h2>{t('骤变回路', 'Sudden Shift')}</h2></div><span className="intent-count">{s.progress.passed.length}<small>/ 7</small></span></div>
    <div className="intent-locks" aria-label={t(`已理解 ${s.progress.passed.length} 个不同任务，完成六个即可开箱`, `${s.progress.passed.length} unique tasks solved. Six open the chest.`)}>
      {INTENT_TASKS.map(item => <span key={item.id} className={s.progress.passed.includes(item.id) ? 'is-solved' : ''} title={`${item.id} · ${item.request[lang]}`}>{s.progress.passed.includes(item.id) ? '✓' : item.id.slice(1)}</span>)}
      {s.progress.keyTaken && <b className="intent-key">{s.progress.gateOpen ? t('门已开', 'OPEN') : t('持有钥匙', 'KEY')}</b>}
    </div>
    <p className="intent-guidance">{s.progress.gateOpen ? t('穿过大门，走到左侧站台。', 'Through the gate, then to the platform on the left.')
      : s.progress.keyTaken ? t('钥匙在手，走到大门前。', 'Take the key to the gate.') : s.progress.chestOpen ? t('宝箱打开了，钥匙还在里面。', 'The chest is open. The key is still inside.')
        : s.progress.passed.length >= 6 ? t('六道锁已解开，去掀开宝箱。', 'Six locks released. Open the chest.') : t('三个小景，七个请求。完成六个不同任务即可开箱。', 'Three scenes, seven requests. Solve any six to open the chest.')}</p>
    {station && task && <section className="intent-request" aria-label={station.title[lang]}>
      <div className="intent-request-top"><strong>{station.title[lang]}</strong><button type="button" disabled={!contact || station.tasks.length < 2} onClick={() => nextIntentTask(station.id)}>{t('换个请求', 'Next request')} →</button></div>
      <p className="intent-quote">{task.request[lang]}</p>
      <small>{station.id === 'visitor' ? t('右侧摇铃，先听清目标。Q 可切换附近操作。', 'Ring the bell on the right to clarify. Q selects nearby actions.') : t('沿台前走到把手旁按 E。左侧转筒换请求，Q 切换附近操作。', 'Walk to a handle and press E. The left drum changes requests; Q selects nearby actions.')}</small>
      {task.clarification && s.progress.clarified.includes(task.id) && <p className="intent-reply">{task.clarification.reply[lang]}</p>}
      <div className="intent-tools" role="group" aria-label={t('选择面前的工具', 'Choose the tool in front of you')}>
        {station.tools.map((tool, i) => <button type="button" key={tool} disabled={!contact} aria-pressed={s.tools[station.id] === tool} onClick={() => selectIntentTool(station.id, tool)}><span>{i + 1}</span>{INTENT_LABELS[tool][lang]}</button>)}
      </div>
      {station.id === 'visitor' && s.progress.clarified.includes('T7') && <button className="intent-text-button" type="button" disabled={!contact} onClick={clarifyIntent}>{t('再听一次澄清', 'Hear the clarification again')}</button>}
      {s.progress.passed.includes(task.id) && <small className="intent-solved">{t('已理解此请求，不会重复计数。', 'Already understood. Counted only once.')}</small>}
    </section>}
    {target === 'board' && viewControls}
    {target && <button type="button" className="intent-primary" disabled={disabled} onClick={() => activateIntentTarget(target)}>{!station && <kbd>E</kbd>}{primaryText}</button>}
    {target && !contact && <small>{target === 'board' ? t('走到车厢左侧踏步前，再按 E 登车。', 'Walk to the foot of the steps on the left, then press E.') : t('再靠近一点，面向装置。', 'Move closer and face the device.')}</small>}
    {s.notice && <p className="intent-notice" role="status" aria-live="polite">{s.notice[lang]}</p>}
    {s.saveIssue && <p className="intent-save-issue" role="status">{s.saveIssue[lang]}</p>}
    <button type="button" className="intent-text-button" aria-expanded={details} onClick={() => setDetails(!details)}>{t('玩法与本机进度', 'About this ride & local progress')}</button>
    {details && <div className="intent-details"><p>{t('七个请求和模拟席位均为原创，不是真实用户数据或订单。进度只保存在本机。', 'The seven requests and simulated seats are original fiction, not real user data or orders. Progress stays on this device.')}</p><button type="button" onClick={resetIntentVisit}>{t('重开本设施的任务与钥匙', 'Restart this attraction’s tasks and key')}</button></div>}
  </aside>;
}
export default memo(WorldIntentHud);
