import { useEffect, useRef } from 'react';
import type { Vec3 } from './types';
import { useWorldStore, worldInputLayer, type InteractionChoice, type NearbyInteract } from './store';
import { actorActivities } from './actor-activities';
import type { PickupApproach } from './pickup-approach';

/**
 * World interactables (PRD §3.3: one E press, one action, one visible result, <= 10 s, no submenu).
 * Districts register objects with useInteractable(); WorldActors picks the nearest one in range every
 * physics step, publishes it as store.nearbyInteract, and calls it on E / gamepad Y. A vehicle wins
 * only when it is closer than the interactable, so walking up to a booth never enters a parked car.
 */
export type InteractKind = 'booth' | 'sign' | 'seat' | 'board' | 'exhibit' | 'door' | 'portal';
export interface Interactable {
  id: string;
  /** World position of the interaction point (where the prompt anchors and distance is measured). */
  position: Vec3;
  /** Reach in metres (horizontal); default 2.2. */
  radius?: number;
  label: { en: string; zh: string };
  kind: InteractKind;
  /** Optional facing requirement: player must be within this yaw window of the object front. */
  enabled?: () => boolean;
  /** Optional short, collision-checked walk before invoking the original physical action. */
  approach?: PickupApproach;
  onInteract: () => void;
}

const registry = new Map<string, Interactable>();
let reachableNow: { item: Interactable; distance: number }[] = [];
export const interactables = () => registry.values();
/** The same line-of-sight checked list used by the physics controller, also used by the prompt. */
export const reachableInteractables = () => reachableNow.filter(c => registry.get(c.item.id) === c.item && (!c.item.enabled || c.item.enabled())).map(c => c.item);
const registrations = new WeakMap<Interactable, number>();
let nextRegistration = 0;
const isRegisteredInteractable = (item: Interactable) => registry.get(item.id) === item;
export function registerInteractable(item: Interactable) {
  const generation = ++nextRegistration;
  registry.set(item.id, item);
  registrations.set(item, generation);
  return () => {
    if (isRegisteredInteractable(item) && registrations.get(item) === generation) registry.delete(item.id);
  };
}

/** QA-only listing (?qa=1): ids, kinds, positions and labels of every registered interactable. */
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('qa') === '1') {
  (window as unknown as { __worldInteract?: unknown }).__worldInteract = {
    list: () => [...registry.values()].map(i => ({ id: i.id, kind: i.kind, position: i.position, radius: i.radius ?? 2.2, label: i.label, enabled: i.enabled ? i.enabled() : true })),
    // QA fixtures must use this loaded registry: Vite HMR can give a dynamic import a second module URL.
    register: registerInteractable,
  };
}

/** Nearest enabled interactable within reach of (x, y, z): horizontal distance, a 2.5 m height gate,
 * and an optional reachability test (WorldActors passes a line-of-sight ray). */
export function nearestInteractable(x: number, y: number, z: number, reachable?: (item: Interactable) => boolean, preferred?: string | null): { item: Interactable; distance: number } | null {
  const inRange: { item: Interactable; distance: number }[] = [];
  for (const item of registry.values()) {
    const [px, py, pz] = item.position;
    if (Math.abs(py - y) > 2.5) continue;
    const d = Math.hypot(px - x, pz - z);
    if (d <= (item.radius ?? 2.2) && (item.enabled?.() ?? true)) inRange.push({ item, distance: d });
  }
  inRange.sort((a, b) => a.distance - b.distance);
  reachableNow = inRange.filter(c => !reachable || reachable(c.item));
  return reachableNow.find(c => c.item.id === preferred) ?? reachableNow[0] ?? null;
}

function sameChoice(row: InteractionChoice, item: Interactable) {
  const label = item.label;
  return row.registration === registrations.get(item) && row.kind === item.kind
    && row.label.en === label.en && row.label.zh === label.zh;
}

/** Publish the selected row and its alternatives together, at the HUD refresh cadence. */
export function publishInteractionPrompt(primary: Interactable | null, previous: NearbyInteract | null, preferred?: string | null): NearbyInteract | null {
  if (!primary) return null;
  const reachable = reachableInteractables();
  if (!reachable.includes(primary)) return null;
  primary = reachable.find(item => item.id === preferred) ?? primary;
  const items = reachable.slice(0, 4);
  if (!items.includes(primary)) items[items.length - 1] = primary;
  if (previous && previous.id === primary.id && previous.choices.length === items.length
    && items.every((item, i) => sameChoice(previous.choices[i], item))) return previous;
  const choices = items.map(item => ({id:item.id, kind:item.kind, label:{...item.label}, registration:registrations.get(item)!}));
  return {...choices[items.indexOf(primary)], choices};
}

/** A new physics ranking cannot redirect the command attached to the displayed row. */
export function resolvePromptTarget(row: InteractionChoice) {
  const item = registry.get(row.id);
  return item && sameChoice(row, item) ? item : null;
}

/** Panels submit the row they rendered. The actor consumes it through the same live checks as E. */
let panelInput: ((row: InteractionChoice) => void) | null = null;
export function bindInteractionPanelInput(handler: (row: InteractionChoice) => void) {
  panelInput = handler;
  return () => { if (panelInput === handler) panelInput = null; };
}
export function requestPanelInteraction(row: InteractionChoice) {
  panelInput?.(row);
}

export function cycleInteractPick(step = 1) {
  const s = useWorldStore.getState(), prompt = s.nearbyInteract;
  if (!prompt || worldInputLayer(s) || s.shot || s.card || s.seat || s.activeVehicle
    || actorActivities.inputOwner() || actorActivities.blocksOffers()) return;
  const {choices} = prompt;
  if (choices.length < 2) return;
  const at = choices.findIndex(row => row.id === prompt.id);
  const next = choices[(at + step + choices.length) % choices.length];
  useWorldStore.setState({ interactPick: next.id, nearbyInteract: {...next, choices} });
}

/** Stable identity survives the render-to-effect-cleanup gap when an item disappears. */
export function interactableProxy(initial: Interactable, read: () => Interactable | null): Interactable {
  const id=initial.id, current=()=>{const item=read();return item?.id===id?item:null;};
  return {
    id, get position(){return current()?.position??initial.position;}, get radius(){return current()?.radius??initial.radius;},
    get label(){return current()?.label??initial.label;}, get kind(){return current()?.kind??initial.kind;},
    get approach(){return current()?.approach;},
    enabled:()=>{const item=current();return !!item&&(item.enabled?.()??true);},
    onInteract:()=>current()?.onInteract(),
  };
}

/** React registration; the latest onInteract / enabled closures are always used. */
export function useInteractable(item: Interactable | null) {
  const ref = useRef(item);
  ref.current = item;
  const id = item?.id;
  useEffect(() => {
    if (!id || !ref.current) return;
    return registerInteractable(interactableProxy(ref.current,()=>ref.current));
  }, [id]);
}
