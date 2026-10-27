import { create } from 'zustand';
import { createIntentProgress, INTENT_STORAGE_KEY, restoreIntentProgress, serializeIntentProgress, transitionIntent } from './intent-progress.ts';
import type { IntentEvent, IntentProgress } from './intent-progress.ts';
import { findIntentTask, type IntentClass, type IntentText } from './intent-tasks.ts';
import { INTENT_STATIONS, intentInReach, type IntentStationId, type IntentTarget } from './intent-stations.ts';
import { useWorldStore } from '../store';
import { reachableInteractables } from '../WorldInteract';
import { mineActor, useAlphaMineStore } from '../alpha-mine-state';
import { parkAudio } from '../WorldParkAudio';
import { attractionRide, beginAttractionRide, endAttractionRide, requestAttractionExit } from './attraction-ride.ts';
import { PLAYER_RADIUS, PLAYER_HALF_HEIGHT } from '../actor-physics.ts';
import { COASTER_BOARDING, coasterAtBoardingEntrance, type CoasterBoardingPhase } from './coaster-transition.ts';
import { coasterRidePose, coasterWorld, COASTER_GATE_Z, type CoasterView, type CoasterClock } from './coaster-track.ts';

interface IntentState {
  progress: IntentProgress; loaded: boolean; saveIssue: IntentText | null;
  tasks: Record<IntentStationId, number>; tools: Record<IntentStationId, IntentClass>;
  notice: IntentText | null; effect: { station: IntentStationId; tool: IntentClass | 'bell'; correct: boolean; sequence: number } | null;
  ridePhase: CoasterBoardingPhase | null; exitRequested: boolean; riding: boolean; view: CoasterView; rideSecond: number; active: boolean;
}
export const useIntentStore = create<IntentState>(() => ({
  progress: createIntentProgress(), loaded: false, saveIssue: null,
  tasks: { route: 0, press: 0, visitor: 0 }, tools: { route: 'lookup', press: 'rewrite', visitor: 'rewrite' },
  notice: null, effect: null, ridePhase: null, exitRequested: false, riding: false, view: 'chase', rideSecond: 0, active: false,
}));
export const intentRideClock: CoasterClock = { elapsed: 0, riding: false, revision: -1 };
let writable = true, sequence = 0;
export function loadIntentProgress() {
  if (useIntentStore.getState().loaded) return;
  try {
    const result = restoreIntentProgress(localStorage.getItem(INTENT_STORAGE_KEY));
    writable = result.status === 'empty' || result.status === 'restored';
    useIntentStore.setState({ loaded: true, progress: result.state, saveIssue: writable ? null : {
      zh: '旧记录无法读取，已原样保留。本次可继续游玩，但不会覆盖它。',
      en: 'The old save could not be read and is preserved. You can play this visit without overwriting it.',
    } });
  } catch {
    writable = false;
    useIntentStore.setState({ loaded: true, saveIssue: { zh: '本机存储不可用，本次进度仍可继续。', en: 'Local storage is unavailable. Progress works for this visit.' } });
  }
}
export function commitIntentEvent(event: IntentEvent) {
  const result = transitionIntent(useIntentStore.getState().progress, event);
  useIntentStore.setState({ progress: result.state, notice: result.reply ?? result.message });
  if (writable) try { localStorage.setItem(INTENT_STORAGE_KEY, serializeIntentProgress(result.state)); }
  catch { writable = false; useIntentStore.setState({ saveIssue: { zh: '无法保存，当前进度保留到本次离开。', en: 'Saving failed. Progress remains for this visit.' } }); }
  return result;
}
const commit = commitIntentEvent;
export function intentActorAvailable() {
  const w = useWorldStore.getState(), s = useIntentStore.getState(), mine = useAlphaMineStore.getState();
  return s.active && w.ready && !s.riding && !attractionRide.active && !w.paused && !w.activeVehicle && !w.card && !w.shot
    && !w.seat && !w.clubMode && !w.poolInspect && !mine.action && !mine.carried && (typeof document === 'undefined' || !document.hidden)
    ;
}
export function intentAvailable(target: IntentTarget) {
  const w = useWorldStore.getState(), s = useIntentStore.getState();
  return intentActorAvailable() && intentInReach(w.position, target) && (target !== 'board' || (s.progress.gateOpen && mineActor.available && mineActor.grounded && coasterAtBoardingEntrance([w.position[0], w.position[1] - (PLAYER_RADIUS + PLAYER_HALF_HEIGHT), w.position[2]])));
}
// DOM buttons and pointer picks share the actor's line-of-sight result, not just screen visibility.
export const intentContact = (target: IntentTarget) => intentAvailable(target)
  && reachableInteractables().some(i => i.id === `intent-${target}`);
export const currentIntentTask = (station: IntentStationId) => {
  const spec = INTENT_STATIONS.find(s => s.id === station)!;
  return findIntentTask(spec.tasks[useIntentStore.getState().tasks[station]])!;
};
export function selectIntentTool(station: IntentStationId, tool: IntentClass) {
  if (!intentContact(station) || !INTENT_STATIONS.find(s => s.id === station)!.tools.includes(tool)) return;
  useIntentStore.setState(s => ({ tools: { ...s.tools, [station]: tool } }));
}
export function nextIntentTask(station: IntentStationId) {
  if (!intentContact(station)) return;
  const spec = INTENT_STATIONS.find(s => s.id === station)!;
  useIntentStore.setState(s => ({ tasks: { ...s.tasks, [station]: (s.tasks[station] + 1) % spec.tasks.length }, notice: null, effect: null }));
}
export function operateIntent(station: IntentStationId, tool = useIntentStore.getState().tools[station]) {
  if (!intentContact(station)) return;
  const result = commit({ type: 'submit', taskId: currentIntentTask(station).id, answer: tool });
  parkAudio.cue(result.code === 'passed' ? 'scan' : 'strike', .15);
  useIntentStore.setState({ effect: { station, tool, correct: result.code === 'passed' || result.code === 'already-passed', sequence: ++sequence } });
}
export function clarifyIntent() {
  if (!intentContact('visitor')) return;
  commit({ type: 'ask', taskId: 'T7', questionId: 'desired-outcome' });
  parkAudio.cue('scan', .25);
  useIntentStore.setState({ effect: { station: 'visitor', tool: 'bell', correct: true, sequence: ++sequence } });
}
export function activateIntentTarget(target: IntentTarget) {
  if (!intentContact(target)) return;
  if (target === 'route' || target === 'press' || target === 'visitor') {
    if (target === 'visitor' && !useIntentStore.getState().progress.clarified.includes('T7')) clarifyIntent();
    else operateIntent(target);
  } else if (target === 'chest') commit({ type: useIntentStore.getState().progress.chestOpen ? 'take-key' : 'open-chest' });
  else if (target === 'gate') {
    const wasOpen = useIntentStore.getState().progress.gateOpen;
    const result = commit({ type: 'unlock-gate' });
    if (!wasOpen && result.state.gateOpen) parkAudio.workshopCue('unlock');
  }
  else if (beginAttractionRide(coasterRidePose(0, useIntentStore.getState().view), COASTER_BOARDING.exit, [useWorldStore.getState().position[0], useWorldStore.getState().position[1] - (PLAYER_RADIUS + PLAYER_HALF_HEIGHT), useWorldStore.getState().position[2]], mineActor.yaw)) {
    parkAudio.cue('scan', .3);
    Object.assign(intentRideClock, { elapsed: 0, riding: false, revision: attractionRide.revision });
    useIntentStore.setState({ riding: true, ridePhase: 'approach', exitRequested: false, rideSecond: 0, notice: null });
  }
}
export function stopIntentRide() {
  if (intentRideClock.revision !== attractionRide.revision || !attractionRide.active) return;
  requestAttractionExit();
  useIntentStore.setState({ exitRequested: true });
}
/** Lifecycle/recovery cleanup is distinct from the normal station-only exit request. */
export function clearIntentRide(abort = false) {
  // Never end another attraction's ride after external recovery has changed bridge ownership.
  if (abort && intentRideClock.revision === attractionRide.revision) endAttractionRide();
  Object.assign(intentRideClock, { riding: false, elapsed: 0 });
  useIntentStore.setState({ riding: false, ridePhase: null, exitRequested: false, rideSecond: 0 });
}
export function resetIntentVisit() {
  if (useIntentStore.getState().riding) return;
  if (useWorldStore.getState().position[2] < coasterWorld([0, 0, COASTER_GATE_Z + 1.5])[2]) {
    useIntentStore.setState({ notice: { zh: '先走回大门外，再重开任务。', en: 'Walk outside the gate before restarting the tasks.' } }); return;
  }
  commit({ type: 'reset' });
  useIntentStore.setState({ effect: null, tasks: { route: 0, press: 0, visitor: 0 } });
}
