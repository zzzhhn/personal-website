import { create } from 'zustand';
import { reachableInteractables } from '../WorldInteract';
import { useWorldStore } from '../store';
import { INTENT_TASKS, findIntentTask, type IntentClass } from './intent-tasks.ts';
import { commitIntentEvent, intentActorAvailable, useIntentStore } from './intent-state.ts';
import { workshopTarget, type WorkshopTarget } from './intent-workshop-layout.ts';
import { parkAudio } from '../WorldParkAudio';

type WorkshopPhase = 'idle' | 'ready' | 'processing' | 'result';
export const WORKSHOP_PROCESS_SECONDS = 2.8;
const noProcessingSound = () => {};
let cancelProcessingSound = noProcessingSound;
function stopProcessingSound() {
  const cancel = cancelProcessingSound; cancelProcessingSound = noProcessingSound; cancel();
}
export const useWorkshopStore = create<{
  phase: WorkshopPhase; taskId: string | null; tool: IntentClass | null;
  correct: boolean; revision: number; outputs: Partial<Record<IntentClass, number>>;
}>(() => ({ phase: 'idle', taskId: null, tool: null, correct: false, revision: 0, outputs: {} }));
// The frame loop mutates only this clock. React receives phase changes, never frame ticks.
export const workshopClock = { elapsed: 0, revision: -1 };
export function workshopAvailable(id: WorkshopTarget) {
  if (!intentActorAvailable()) return false;
  const s = useWorkshopStore.getState(), p = useWorldStore.getState().position, at = workshopTarget(id);
  if (Math.hypot(p[0] - at[0], p[2] - at[2]) > 2.6 || Math.abs(p[1] - at[1]) > 2) return false;
  if (id === 'intake') return (s.phase === 'idle' || s.phase === 'result')
    && INTENT_TASKS.some(task => !useIntentStore.getState().progress.passed.includes(task.id));
  if (s.phase !== 'ready') return false;
  return id !== 'bell' || !!findIntentTask(s.taskId ?? '')?.clarification;
}
export const workshopContact = (id: WorkshopTarget) => workshopAvailable(id)
  && reachableInteractables().some(item => item.id === `intent-workshop-${id}`);
export function operateWorkshop(id: WorkshopTarget) {
  if (!workshopContact(id)) return;
  const s = useWorkshopStore.getState(), progress = useIntentStore.getState().progress;
  if (id === 'intake') {
    const task = INTENT_TASKS.find(item => !progress.passed.includes(item.id));
    if (!task) return;
    workshopClock.elapsed = 0;
    useWorkshopStore.setState({ phase: 'ready', taskId: task.id, tool: null, correct: false, outputs: {} });
    useIntentStore.setState({ notice: null });
    parkAudio.workshopCue('intake', .45);
  } else if (id === 'bell') {
    commitIntentEvent({ type: 'ask', taskId: s.taskId!, questionId: 'desired-outcome' });
    parkAudio.workshopCue('bell', .35);
  } else {
    const revision = s.revision + 1;
    Object.assign(workshopClock, { elapsed: 0, revision });
    useWorkshopStore.setState({ phase: 'processing', tool: id, revision });
    stopProcessingSound();
    parkAudio.workshopCue('route', .4);
  }
}
export function advanceWorkshop(dt: number, paused: boolean, hidden: boolean) {
  const s = useWorkshopStore.getState();
  if (s.phase !== 'processing' || s.revision !== workshopClock.revision || paused || hidden) {
    stopProcessingSound(); return;
  }
  if (!Number.isFinite(dt) || dt <= 0 || dt > .25) return;
  const previous = workshopClock.elapsed;
  workshopClock.elapsed = Math.min(WORKSHOP_PROCESS_SECONDS, workshopClock.elapsed + dt);
  // Cross once using the existing animation clock. Pausing never replays the elapsed section.
  if (previous < .35 && workshopClock.elapsed >= .35) cancelProcessingSound = parkAudio.workshopCue('process', .28);
  if (workshopClock.elapsed < WORKSHOP_PROCESS_SECONDS) return;
  stopProcessingSound();
  const result = commitIntentEvent({ type: 'submit', taskId: s.taskId!, answer: s.tool! });
  const correct = result.code === 'passed' || result.code === 'already-passed';
  useWorkshopStore.setState({ phase: 'result', correct, outputs: { ...s.outputs, [s.tool!]: (s.outputs[s.tool!] ?? 0) + 1 } });
  parkAudio.workshopCue(correct ? 'success' : 'error', correct ? .4 : .35);
}
export function resetWorkshop() {
  stopProcessingSound();
  workshopClock.elapsed = 0; workshopClock.revision = -1;
  useWorkshopStore.setState({ phase: 'idle', taskId: null, tool: null, correct: false, outputs: {} });
}
