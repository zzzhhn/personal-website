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

/** Nearest enabled interactable within reach of (x, y, z); horizontal distance with a 2.5 m height gate. */
export function nearestInteractable(x: number, y: number, z: number): { item: Interactable; distance: number } | null {
  let best: { item: Interactable; distance: number } | null = null;
  for (const item of registry.values()) {
    if (item.enabled && !item.enabled()) continue;
    const [px, py, pz] = item.position;
    if (Math.abs(py - y) > 2.5) continue;
    const d = Math.hypot(px - x, pz - z);
    if (d <= (item.radius ?? 2.2) && (!best || d < best.distance)) best = { item, distance: d };
  }
  return best;
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
