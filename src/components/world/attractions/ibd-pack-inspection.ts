import type { IbdItem } from './ibd-model.ts';

export type IbdPackSlotIndex = 0 | 1 | 2 | 3;
export interface IbdPackInspectionSlot {
  readonly index: IbdPackSlotIndex; readonly present: boolean; readonly specId: string | null;
  readonly complete: boolean; readonly reading: string | null;
}
export type IbdPackInspectionNotice = 'ready' | 'held' | 'measured' | 'returned' | 'empty-checked' | 'cancelled'
  | 'unknown-item' | 'unknown-slot' | 'contact-missing' | 'clamp-misaligned' | 'return-first' | 'empty-slot'
  | 'take-first' | 'measure-first' | 'wrong-slot' | 'sample-present' | 'view-missing';
export interface IbdPackInspection {
  readonly itemId: string; readonly slots: readonly IbdPackInspectionSlot[];
  readonly held: IbdPackSlotIndex | null; readonly measurement: string | null; readonly notice: IbdPackInspectionNotice;
}
export type IbdPackInspectionEvent =
  | { readonly type: 'take' | 'return'; readonly itemId: string; readonly slot: IbdPackSlotIndex; readonly contact: boolean }
  | { readonly type: 'measure'; readonly itemId: string; readonly slot: IbdPackSlotIndex; readonly contact: boolean; readonly aligned: boolean }
  | { readonly type: 'view-empty'; readonly itemId: string; readonly slot: IbdPackSlotIndex; readonly visible: boolean }
  | { readonly type: 'cancel'; readonly itemId: string };

/** Four physical pockets in this teaching fixture. Display dimensions are not millimetre readings. */
export function createIbdPackInspection(item: IbdItem): IbdPackInspection {
  if (!item || item.kind !== 'hardware-pack' || !item.package || !item.id || !item.specId
    || !Number.isInteger(item.quantity) || item.quantity < 0 || item.quantity > 4)
    throw new TypeError('A known four-slot hardware-pack fixture is required.');
  return { itemId: item.id, held: null, measurement: null, notice: 'ready',
    slots: Array.from({ length: 4 }, (_, index) => ({ index: index as IbdPackSlotIndex, present: index < item.quantity,
      specId: index < item.quantity ? item.specId : null, complete: false, reading: null })) };
}

export const ibdPackInspectionComplete = (state: IbdPackInspection): boolean =>
  state.held === null && state.slots.length === 4 && state.slots.every(slot => slot.complete);

/** A reading is available only after all four pockets have been physically accounted for. */
export function ibdPackInspectionReading(state: IbdPackInspection): { quantity: number; specIds: readonly string[] } | null {
  if (!ibdPackInspectionComplete(state)) return null;
  return { quantity: state.slots.filter(slot => slot.present).length,
    specIds: [...new Set(state.slots.flatMap(slot => slot.reading === null ? [] : [slot.reading]))] };
}

/** Events represent confirmed contacts/viewpoints. There is deliberately no elapsed or timer event. */
export function reduceIbdPackInspection(state: IbdPackInspection, event: IbdPackInspectionEvent): IbdPackInspection {
  const fail = (notice: IbdPackInspectionNotice) => state.notice === notice ? state : { ...state, notice };
  if (event.itemId !== state.itemId) return fail('unknown-item');
  if (event.type === 'cancel') return state.held === null ? state : { ...state, held: null, measurement: null, notice: 'cancelled' };
  if (!Number.isInteger(event.slot) || event.slot < 0 || event.slot > 3) return fail('unknown-slot');
  const slot = state.slots[event.slot];
  if (event.type === 'take') {
    if (state.held !== null) return fail('return-first');
    if (slot.complete) return state;
    if (!slot.present) return fail('empty-slot');
    if (event.contact !== true) return fail('contact-missing');
    return { ...state, held: event.slot, measurement: null, notice: 'held' };
  }
  if (event.type === 'measure') {
    if (state.held !== event.slot) return fail('take-first');
    if (event.contact !== true) return fail('contact-missing');
    if (event.aligned !== true) return fail('clamp-misaligned');
    return state.measurement === slot.specId ? state : { ...state, measurement: slot.specId, notice: 'measured' };
  }
  if (event.type === 'return') {
    if (state.held === null) return slot.complete ? state : fail('take-first');
    if (state.held !== event.slot) return fail('wrong-slot');
    if (event.contact !== true) return fail('contact-missing');
    if (state.measurement === null) return fail('measure-first');
    return { ...state, held: null, measurement: null, notice: 'returned', slots: state.slots.map(current => current.index === event.slot
      ? { ...current, complete: true, reading: state.measurement } : current) };
  }
  if (event.type === 'view-empty') {
    if (state.held !== null) return fail('return-first');
    if (slot.complete) return state;
    if (slot.present) return fail('sample-present');
    if (event.visible !== true) return fail('view-missing');
    return { ...state, notice: 'empty-checked', slots: state.slots.map(current => current.index === event.slot ? { ...current, complete: true } : current) };
  }
  return state;
}
