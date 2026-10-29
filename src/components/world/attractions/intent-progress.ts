import { findIntentTask, INTENT_BANK_REVISION, INTENT_REQUIRED, INTENT_TASKS, normalizeIntent } from './intent-tasks.ts';
import type { IntentText } from './intent-tasks.ts';

export const INTENT_SAVE_VERSION = 1;
export const INTENT_STORAGE_KEY = 'bobby-world.intent-coaster.progress.v1';
export interface IntentProgress {
  readonly version: number;
  readonly bankRevision: string;
  readonly passed: readonly string[];
  readonly clarified: readonly string[];
  readonly chestOpen: boolean;
  readonly keyTaken: boolean;
  readonly gateOpen: boolean;
}
export type IntentEvent =
  | { readonly type: 'submit'; readonly taskId: string; readonly answer: string }
  | { readonly type: 'ask'; readonly taskId: string; readonly questionId: string }
  | { readonly type: 'open-chest' | 'take-key' | 'unlock-gate' | 'reset' };
export interface IntentTransition {
  readonly state: IntentProgress;
  readonly code: string;
  readonly message: IntentText;
  readonly reply?: IntentText;
}
export function createIntentProgress(): IntentProgress {
  return { version: INTENT_SAVE_VERSION, bankRevision: INTENT_BANK_REVISION, passed: [], clarified: [], chestOpen: false, keyTaken: false, gateOpen: false };
}
export function intentProgressView(state: IntentProgress) {
  const passed = new Set(state.passed.filter(id => {
    const task = findIntentTask(id);
    return task && (!task.clarification || state.clarified.includes(id));
  }));
  return { correct: passed.size, total: INTENT_TASKS.length, required: INTENT_REQUIRED,
    chestReady: passed.size >= INTENT_REQUIRED, canRide: state.gateOpen,
    keyLocation: state.gateOpen ? 'gate' : state.keyTaken ? 'hand' : 'chest' } as const;
}
export function transitionIntent(state: IntentProgress, event: IntentEvent): IntentTransition {
  const reply = (code: string, zh: string, en: string, next = state): IntentTransition => ({ state: next, code, message: { zh, en } });
  if (event.type === 'reset') return reply('reset', '本设施进度已重开。', 'This attraction has been restarted.', createIntentProgress());
  if (event.type === 'submit' || event.type === 'ask') {
    const task = findIntentTask(event.taskId);
    if (!task) return reply('unknown-task', '此任务不存在。', 'This task does not exist.');
    if (state.passed.includes(task.id)) return reply('already-passed', '已解过此题，不重复计数。', 'Already solved; counted once.');
    if (event.type === 'ask') {
      if (!task.clarification || task.clarification.id !== event.questionId)
        return reply('irrelevant-question', '这个追问不能确认当前目标。', 'That question does not establish the current goal.');
      return { ...reply('clarified', '目标已确认，可以重新判断。', 'The goal is clear. Try your classification.',
        state.clarified.includes(task.id) ? state : { ...state, clarified: [...state.clarified, task.id] }), reply: task.clarification.reply };
    }
    if (task.clarification && !state.clarified.includes(task.id))
      return reply('needs-clarification', '先问清对方想做什么。', 'Clarify what they want first.');
    const intent = normalizeIntent(event.answer);
    if (!intent) return reply('unknown-intent', '请选择一个明确的主意图。', 'Choose one clear primary intent.');
    if (intent !== task.intent) return { state, code: 'incorrect', message: task.retry };
    return reply('passed', '理解正确，一道锁已计入。', 'Understood. One lock credit earned.', { ...state, passed: [...state.passed, task.id] });
  }
  const ready = intentProgressView(state).chestReady;
  if (event.type === 'open-chest') {
    if (!ready) return reply('more-tasks-required', '完成六个不同任务后才能开箱。', 'Solve six different tasks before opening the chest.');
    return reply('chest-open', '箱盖打开了，钥匙还在里面。', 'The lid is open. The key is still inside.', { ...state, chestOpen: true });
  }
  if (event.type === 'take-key') {
    if (!ready || !state.chestOpen) return reply('open-chest-first', '先打开箱盖。', 'Open the chest first.');
    if (state.keyTaken) return reply('key-already-taken', '钥匙已经取过。', 'The key has already been taken.');
    return reply('key-taken', '拿到钥匙了。', 'Key collected.', { ...state, keyTaken: true });
  }
  if (event.type === 'unlock-gate') {
    if (!ready || !state.chestOpen || !state.keyTaken) return reply('key-required', '需要先拿到钥匙。', 'Collect the key first.');
    return reply('gate-open', '大门已打开，可以乘坐。', 'Gate unlocked. The ride is ready.', { ...state, gateOpen: true });
  }
  return reply('unknown-action', '此动作不可用。', 'That action is unavailable.');
}

export interface IntentRestore {
  readonly status: 'empty' | 'restored' | 'invalid' | 'incompatible';
  readonly state: IntentProgress;
}
// Pure codec: the caller owns localStorage, warnings and retention of rejected records.
export function restoreIntentProgress(raw: string | null): IntentRestore {
  const fail = (status: IntentRestore['status']): IntentRestore => ({ status, state: createIntentProgress() });
  if (raw === null) return fail('empty');
  if (raw.length > 8192) return fail('invalid');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return fail('invalid'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('invalid');
  const record = value as Record<string, unknown>;
  if (typeof record.version !== 'number' || typeof record.bankRevision !== 'string') return fail('invalid');
  if (record.version !== INTENT_SAVE_VERSION || record.bankRevision !== INTENT_BANK_REVISION) return fail('incompatible');
  const ids = (value: unknown): value is string[] => Array.isArray(value) && value.length <= INTENT_TASKS.length &&
    value.every(id => typeof id === 'string' && !!findIntentTask(id)) && new Set(value).size === value.length;
  if (!ids(record.passed) || !ids(record.clarified) ||
      ['chestOpen', 'keyTaken', 'gateOpen'].some(key => typeof record[key] !== 'boolean')) return fail('invalid');
  const passed = record.passed, clarified = record.clarified;
  if (clarified.some(id => !findIntentTask(id)?.clarification) ||
      passed.some(id => findIntentTask(id)?.clarification && !clarified.includes(id))) return fail('invalid');
  const state: IntentProgress = { version: INTENT_SAVE_VERSION, bankRevision: INTENT_BANK_REVISION,
    passed: [...record.passed], clarified: [...record.clarified], chestOpen: record.chestOpen as boolean,
    keyTaken: record.keyTaken as boolean, gateOpen: record.gateOpen as boolean };
  if ((state.chestOpen && !intentProgressView(state).chestReady) || (state.keyTaken && !state.chestOpen) ||
      (state.gateOpen && !state.keyTaken)) return fail('invalid');
  return { status: 'restored', state };
}
export function serializeIntentProgress(state: IntentProgress): string {
  const raw = JSON.stringify(state);
  if (restoreIntentProgress(raw).status !== 'restored') throw new TypeError('Invalid intent progress');
  return raw;
}
