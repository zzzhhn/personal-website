import { create } from 'zustand';
import { reachableInteractables } from '../WorldInteract';
import { useWorldStore } from '../store';
import { INTENT_TASKS, findIntentTask, type IntentClass } from './intent-tasks.ts';
import { commitIntentEvent, intentActorAvailable, useIntentStore } from './intent-state.ts';
import { workshopTarget, type WorkshopTarget } from './intent-workshop-layout.ts';
import { parkAudio } from '../WorldParkAudio';
import { transitionIntent } from './intent-progress.ts';

type WorkshopPhase = 'idle' | 'ready' | 'processing' | 'returning' | 'result';
export const WORKSHOP_PROCESS_SECONDS = 2.8;
export const WORKSHOP_RETURN_SECONDS = 1.4;
export const WORKSHOP_LEVER_SECONDS = .7;
export const workshopOutputComplete = (tool: IntentClass, passed: readonly string[]) =>
  passed.some(id => findIntentTask(id)?.intent === tool);
export const workshopCarrierProgress = (phase: WorkshopPhase, elapsed: number) =>
  phase === 'processing' ? Math.min(1, elapsed / WORKSHOP_PROCESS_SECONDS)
    : phase === 'returning' ? 1 - Math.min(1, elapsed / WORKSHOP_RETURN_SECONDS) : 0;
const noProcessingSound = () => {};
let cancelProcessingSound = noProcessingSound;
function stopProcessingSound() {
  const cancel = cancelProcessingSound; cancelProcessingSound = noProcessingSound; cancel();
}
export const useWorkshopStore = create<{
  phase: WorkshopPhase; taskId: string | null; tool: IntentClass | null;
  correct: boolean; revision: number;
  practice: boolean; practiceCursor: number; practiceClarified: boolean;
}>(() => ({ phase: 'idle', taskId: null, tool: null, correct: false, revision: 0,
  practice: false, practiceCursor: 0, practiceClarified: false }));
// The frame loop mutates only this clock. React receives phase changes, never frame ticks.
export const workshopClock = { elapsed: 0, revision: -1, intakeElapsed: WORKSHOP_LEVER_SECONDS };
export function workshopAvailable(id: WorkshopTarget) {
  if (!intentActorAvailable()) return false;
  const s = useWorkshopStore.getState(), p = useWorldStore.getState().position, at = workshopTarget(id);
  if (Math.hypot(p[0] - at[0], p[2] - at[2]) > 2.6 || Math.abs(p[1] - at[1]) > 2) return false;
  if (id === 'intake') return s.phase === 'idle' || s.phase === 'result';
  if (s.phase !== 'ready') return false;
  return id !== 'bell' || !!findIntentTask(s.taskId ?? '')?.clarification;
}
export const workshopContact = (id: WorkshopTarget) => workshopAvailable(id)
  && reachableInteractables().some(item => item.id === `intent-workshop-${id}`);
export function operateWorkshop(id: WorkshopTarget) {
  if (!workshopContact(id)) return;
  const s = useWorkshopStore.getState(), progress = useIntentStore.getState().progress;
  if (id === 'intake') {
    const remaining = INTENT_TASKS.find(item => !progress.passed.includes(item.id));
    const task = remaining ?? INTENT_TASKS[s.practiceCursor % INTENT_TASKS.length];
    workshopClock.elapsed = 0;
    workshopClock.intakeElapsed = 0;
    useWorkshopStore.setState({ phase: 'ready', taskId: task.id, tool: null, correct: false,
      practice: !remaining, practiceClarified: false,
      practiceCursor: remaining ? s.practiceCursor : (s.practiceCursor + 1) % INTENT_TASKS.length });
    useIntentStore.setState({ notice: null });
    parkAudio.workshopCue('intake', .45);
  } else if (id === 'bell') {
    if (s.practice) {
      useWorkshopStore.setState({ practiceClarified: true });
      useIntentStore.setState({ notice: findIntentTask(s.taskId!)?.clarification?.reply ?? null });
    } else commitIntentEvent({ type: 'ask', taskId: s.taskId!, questionId: 'desired-outcome' });
    parkAudio.workshopCue('bell', .35);
  } else {
    const revision = s.revision + 1;
    Object.assign(workshopClock, { elapsed: 0, revision });
    useWorkshopStore.setState({ phase: 'processing', tool: id, revision });
    useIntentStore.setState({ notice: null });
    stopProcessingSound();
    parkAudio.workshopCue('route', .4);
  }
}
export function advanceWorkshop(dt: number, paused: boolean, hidden: boolean) {
  const s = useWorkshopStore.getState();
  if (paused || hidden) {
    stopProcessingSound(); return;
  }
  if (!Number.isFinite(dt) || dt <= 0 || dt > .25) return;
  workshopClock.intakeElapsed = Math.min(WORKSHOP_LEVER_SECONDS, workshopClock.intakeElapsed + dt);
  if ((s.phase !== 'processing' && s.phase !== 'returning') || s.revision !== workshopClock.revision) {
    stopProcessingSound(); return;
  }
  if (s.phase === 'returning') {
    workshopClock.elapsed = Math.min(WORKSHOP_RETURN_SECONDS, workshopClock.elapsed + dt);
    if (workshopClock.elapsed >= WORKSHOP_RETURN_SECONDS) {
      // The same request becomes routable only once its carrier is back at intake.
      useWorkshopStore.setState({ phase: 'ready', tool: null });
    }
    return;
  }
  const previous = workshopClock.elapsed;
  workshopClock.elapsed = Math.min(WORKSHOP_PROCESS_SECONDS, workshopClock.elapsed + dt);
  // Cross once using the existing animation clock. Pausing never replays the elapsed section.
  if (previous < .35 && workshopClock.elapsed >= .35) cancelProcessingSound = parkAudio.workshopCue('process', .28);
  if (workshopClock.elapsed < WORKSHOP_PROCESS_SECONDS) return;
  stopProcessingSound();
  const event = { type: 'submit' as const, taskId: s.taskId!, answer: s.tool! };
  // Practice validates the new answer independently. Never erase the saved key,
  // credit a duplicate task, or accept a wrong answer merely because it passed once.
  const result = s.practice ? transitionIntent({ ...useIntentStore.getState().progress,
    passed: [], clarified: s.practiceClarified ? [s.taskId!] : [] }, event) : commitIntentEvent(event);
  const correct = result.code === 'passed' || result.code === 'already-passed';
  if (s.practice) useIntentStore.setState({ notice: correct
    ? { zh: '处理完成。大门保持开启，可以继续接件或去乘车。', en: 'Request completed. The gate stays open. Keep experimenting or take a ride.' }
    : result.message });
  if (!correct) workshopClock.elapsed = 0;
  useWorkshopStore.setState({ phase: correct ? 'result' : 'returning', correct });
  parkAudio.workshopCue(correct ? 'success' : 'error', correct ? .4 : .35);
}
export function resetWorkshop() {
  stopProcessingSound();
  Object.assign(workshopClock, { elapsed: 0, revision: -1, intakeElapsed: WORKSHOP_LEVER_SECONDS });
  useWorkshopStore.setState({ phase: 'idle', taskId: null, tool: null, correct: false,
    practice: false, practiceCursor: 0, practiceClarified: false });
}
