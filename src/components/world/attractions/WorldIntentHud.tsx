import { memo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWorldStore } from '../store';
import { COASTER_DURATION, COASTER_DISPLAY_SECONDS, coasterPhase, type CoasterView } from './coaster-track';
import { INTENT_TARGETS, intentInReach, type IntentTarget } from './intent-stations';
import { findIntentTask, type IntentText } from './intent-tasks';
import { activateIntentTarget, intentContact, resetIntentVisit, stopIntentRide, useIntentStore } from './intent-state';
import { INTENT_COASTER } from './attraction-layout';
import type { CoasterBoardingPhase } from './coaster-transition';
import { resetAttractionLook } from './attraction-camera';
import { useWorkshopStore, resetWorkshop } from './intent-workshop-runtime';
import './intent-coaster.css';

const PHASE_TEXT: Record<ReturnType<typeof coasterPhase>, IntentText> = {
  station: { zh: '离站', en: 'Leaving the station' }, lift: { zh: '攀升，看见全岛', en: 'Climbing above the island' },
  crest: { zh: '高处停一瞬', en: 'A moment at the top' }, drop: { zh: '骤变', en: 'The sudden shift' },
  bank: { zh: '掠过反弯', en: 'Through the banked turns' }, tunnel: { zh: '穿过灯廊', en: 'Into the light corridor' },
  low: { zh: '贴地疾驰', en: 'The low run' }, stall: { zh: '高空倒挂', en: 'The inverted stall' },
  inversion: { zh: '倒置回环', en: 'Through the inversion' }, corkscrew: { zh: '连续双螺旋', en: 'The double corkscrew' },
  'water-roll': { zh: '贴水翻滚', en: 'The water roll' },
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
    const b = INTENT_COASTER.bounds;
    const inside = x > b.minX - 6 && x < b.maxX + 6 && z > b.minZ - 6 && z < b.maxZ + 6;
    let target: IntentTarget | undefined, distance = Infinity;
    if (inside) for (const id of Object.keys(INTENT_TARGETS) as IntentTarget[]) {
      if (['route', 'press', 'visitor'].includes(id) || !intentInReach(state.position, id)) continue;
      const p = INTENT_TARGETS[id], d = Math.hypot(x - p[0], z - p[2]);
      if (d < distance) { target = id; distance = d; }
    }
    return { lang: state.lang, light: state.light, inside, target,
      blocked: state.paused || state.poolInspect || !!state.card || !!state.shot || !!state.activeVehicle || !!state.clubMode,
      interactId: inside ? state.nearbyInteract?.id : undefined };
  }));
  const s = useIntentStore(), workshop = useWorkshopStore(), [details, setDetails] = useState(false);
  const lang = w.lang, t = (zh: string, en: string) => lang === 'zh' ? zh : en;
  if (!s.active || (!s.riding && !w.inside) || w.blocked) return null;
  const target = w.target === 'board' && !s.progress.gateOpen ? undefined : w.target;
  const task = findIntentTask(workshop.taskId ?? '');
  const contact = target ? intentContact(target) : false;
  const theme = ['night', 'evening'].includes(w.light) ? 'dark' : 'light';
  const viewControls = <div className="intent-views" role="group" aria-label={t('乘坐视角', 'Ride view')}>
    {VIEWS.map(view => <button key={view.id} type="button" aria-pressed={s.view === view.id} onClick={() => { resetAttractionLook(); useIntentStore.setState({ view: view.id }); }}>{view.label[lang]}</button>)}
  </div>;
  if (s.riding) return <aside className="intent-hud intent-riding" data-theme={theme} aria-label={t('过山车乘坐控制', 'Coaster ride controls')}>
    <div className="intent-ride-heading"><strong>{s.ridePhase && s.ridePhase !== 'riding' ? BOARDING_TEXT[s.ridePhase][lang] : PHASE_TEXT[coasterPhase(s.rideSecond)][lang]}</strong><span>{Math.ceil(s.rideSecond)} / {COASTER_DISPLAY_SECONDS} s</span></div>
    <progress value={s.rideSecond} max={COASTER_DURATION} aria-label={t('乘坐进度', 'Ride progress')} />
    {viewControls}<button type="button" onClick={resetAttractionLook}>{t('视角归位', 'Reset view')}</button>
    <p><small>{t('拖拽自由观察 · 滚轮缩放 · 手柄右摇杆转头', 'Drag to look · scroll to zoom · right stick to look')}</small></p>
    <button type="button" className="intent-primary" disabled={s.exitRequested || ['stand', 'turn-out', 'step-out', 'walk-out', 'complete'].includes(s.ridePhase ?? '')} onClick={stopIntentRide}>{s.exitRequested ? t('已登记，回站后下车', 'Exit requested. Leaving at the station') : s.ridePhase === 'riding' ? t('回站后下车', 'Leave at the station') : t('取消本次发车并下车', 'Cancel departure and step out')}</button>
    <small>{t('Esc／手柄 Start 暂停；手柄 B 申请下车。行驶中会完成当前回路，恢复后从原处继续。', 'Esc / Start pauses; B requests an exit. A moving train completes its loop. Resume from the same point.')}</small>
  </aside>;
  const primaryText = target === 'chest' ? s.progress.keyTaken ? t('钥匙已在身上', 'You have the key') : s.progress.chestOpen ? t('拿起钥匙', 'Take the key') : t('掀开宝箱', 'Open the chest')
    : target === 'gate' ? t('用钥匙开门', 'Unlock the gate') : t('沿踏步登车', 'Board using the steps');
  const request = task?.clarification && s.progress.clarified.includes(task.id) ? task.clarification.reply[lang] : task?.request[lang];
  const guidance = s.progress.gateOpen ? t('大门已开，左侧踏步登车。', 'Gate open. Board via the steps on the left.')
    : s.progress.keyTaken ? t('把钥匙插入大门。', 'Take the key to the gate.') : s.progress.passed.length >= 6 ? t('六道锁已解开，掀箱拿钥匙。', 'Six locks open. Take the key from the chest.')
    : workshop.phase === 'idle' ? t('接件台在入口左侧，绕到文字牌正面，拉杆接收请求。', 'Find the intake on the left. Walk to the front of its sign and pull the lever.')
    : workshop.phase === 'processing' ? t('看请求沿轨道进入机器。', 'Watch the request reach the machine.')
    : workshop.phase === 'returning' ? t('原件正在退回，机器未执行。稍后可直接换一台机器。', 'The original is returning without making changes. Then try another machine.')
    : workshop.phase === 'result' ? t('回到接件台，继续接件。', 'Return to the intake lever for the next request.') : t('读清目标，走到对应机器旁拉杆。', 'Read the goal. Walk to a machine and pull its lever.');
  return <aside className="intent-hud intent-workshop-summary" data-theme={theme} lang={lang === 'zh' ? 'zh-CN' : 'en'} aria-label={t('意图分流工坊', 'Intent routing workshop')}>
    <div className="intent-ride-heading"><strong>{t('意图分流工坊', 'Intent routing workshop')}</strong><span>{Math.min(6, s.progress.passed.length)} / 6</span></div>
    <p>{guidance}</p>
    {request && ['ready', 'processing', 'returning'].includes(workshop.phase) && <blockquote>{request}</blockquote>}
    {s.notice && <p role="status">{s.notice[lang]}</p>}
    {target && <button type="button" className="intent-primary" disabled={!contact || (target === 'chest' && s.progress.keyTaken) || (target === 'gate' && s.progress.gateOpen)} onClick={() => activateIntentTarget(target)}><kbd>E</kbd>{primaryText}</button>}
    {s.saveIssue && <p role="status">{s.saveIssue[lang]}</p>}
    <button type="button" className="intent-text-button" aria-expanded={details} onClick={() => setDetails(!details)}>{t('玩法与本机进度', 'About & local progress')}</button>
    {details && <div className="intent-details"><p>{t('请求和席位是原创虚构场景，不是真实用户数据或订单。成功处理六件即可开箱；选错退回，不扣进度。', 'These requests and seats are fictional. Complete six to open the chest. Mistakes return the original without losing progress.')}</p><button type="button" onClick={() => { resetIntentVisit(); if (!useIntentStore.getState().progress.gateOpen) resetWorkshop(); }}>{t('重开本设施的任务与钥匙', 'Restart this attraction’s tasks and key')}</button></div>}
  </aside>;
}
export default memo(WorldIntentHud);
