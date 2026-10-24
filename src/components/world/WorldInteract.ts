import { useEffect, useRef } from 'react';
import type { Vec3 } from './types';

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
  onInteract: () => void;
}

const registry = new Map<string, Interactable>();
export const interactables = () => registry.values();
export function registerInteractable(item: Interactable) { registry.set(item.id, item); return () => { if (registry.get(item.id) === item) registry.delete(item.id); }; }

/** QA-only listing (?qa=1): ids, kinds, positions and labels of every registered interactable. */
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('qa') === '1') {
  (window as unknown as { __worldInteract?: unknown }).__worldInteract = {
    list: () => [...registry.values()].map(i => ({ id: i.id, kind: i.kind, position: i.position, radius: i.radius ?? 2.2, label: i.label, enabled: i.enabled ? i.enabled() : true })),
  };
}

/** Nearest enabled interactable within reach of (x, y, z): horizontal distance, a 2.5 m height gate,
 * and an optional reachability test (WorldActors passes a line-of-sight ray). */
export function nearestInteractable(x: number, y: number, z: number, reachable?: (item: Interactable) => boolean): { item: Interactable; distance: number } | null {
  const inRange: { item: Interactable; distance: number }[] = [];
  for (const item of registry.values()) {
    if (item.enabled && !item.enabled()) continue;
    const [px, py, pz] = item.position;
    if (Math.abs(py - y) > 2.5) continue;
    const d = Math.hypot(px - x, pz - z);
    if (d <= (item.radius ?? 2.2)) inRange.push({ item, distance: d });
  }
  inRange.sort((a, b) => a.distance - b.distance);
  for (const c of inRange) if (!reachable || reachable(c.item)) return c;
  return null;
}

/** React registration; the latest onInteract / enabled closures are always used. */
export function useInteractable(item: Interactable | null) {
  const ref = useRef(item);
  ref.current = item;
  const id = item?.id, key = item ? `${item.position.join(',')}|${item.radius ?? ''}|${item.kind}` : '';
  useEffect(() => {
    if (!id || !ref.current) return;
    const proxy: Interactable = {
      get id() { return ref.current!.id; }, get position() { return ref.current!.position; }, get radius() { return ref.current!.radius; },
      get label() { return ref.current!.label; }, get kind() { return ref.current!.kind; },
      enabled: () => ref.current?.enabled?.() ?? true,
      onInteract: () => ref.current?.onInteract(),
    };
    return registerInteractable(proxy);
  }, [id, key]);
}
