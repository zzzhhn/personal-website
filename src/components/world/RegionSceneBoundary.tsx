import { Component, Suspense, useCallback, useSyncExternalStore, type ReactNode } from 'react';
import { useRapier } from '@react-three/rapier';
import { isRegionBodyHeld, isRegionColliderHeld } from './region-body-guard';
import { reportRegionLoadFailure } from './region-load-failure';
import type { Vec3 } from './types';

type Props = { id: string; children: ReactNode };
type BodyRecord = {
  handle: number;
  name?: string;
  regionHeld: boolean;
  enabled: boolean;
  position: Vec3;
  velocity: Vec3;
  colliders: number[];
  heldColliders: number[];
};
const regionFaultQuery = typeof location === 'undefined' ? null : new URLSearchParams(location.search);
const regionFaultEnabled = regionFaultQuery?.get('qa') === '1' && regionFaultQuery?.get('qaRegionFault') === '1';
const regionListeners = new Map<string, Set<() => void>>();
const removedRegions = new Set<string>();
const bodyReaders = new Map<string, () => BodyRecord[]>();

if (regionFaultEnabled) {
  const api = {
    registered: () => [...regionListeners.keys()],
    bodies: (id: string) => bodyReaders.get(id)?.() ?? [],
    remove(id: string, removed: boolean) {
      const listeners = regionListeners.get(id);
      if (!listeners) return false;
      if (removed === removedRegions.has(id)) return true;
      if (removed) removedRegions.add(id);
      else removedRegions.delete(id);
      listeners.forEach(notify => notify());
      return true;
    },
  };
  Object.assign(window, { __worldRegionFault: api });
}

/** Keep other districts running if an independently loaded scene fails. */
class SceneBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  private release?: () => void;
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) {
    console.error(`[world-${this.props.id}] scene could not load`, error);
    this.release ??= reportRegionLoadFailure(this.props.id);
  }
  componentWillUnmount() { this.release?.(); }
  render() { return this.state.failed ? null : <Suspense fallback={null}>{this.props.children}</Suspense>; }
}

function RegionWithFaultFixture({ id, children }: Props) {
  const { world, rigidBodyStates } = useRapier();
  const readBodies = useCallback(() => {
    const records: BodyRecord[] = [];
    world.forEachRigidBody(body => {
      if (!body.isDynamic()) return;
      const regionHeld = isRegionBodyHeld(body);
      const name = rigidBodyStates.get(body.handle)?.object.name;
      if (!regionHeld && !name) return;
      const { x, y, z } = body.translation();
      const { x: vx, y: vy, z: vz } = body.linvel();
      const colliders = Array.from({ length: body.numColliders() }, (_, index) => body.collider(index));
      records.push({ handle: body.handle, name, regionHeld, enabled: body.isEnabled(), position: [x, y, z], velocity: [vx, vy, vz],
        colliders: colliders.map(collider => collider.handle),
        heldColliders: colliders.filter(collider => isRegionColliderHeld(collider, body)).map(collider => collider.handle) });
    });
    return records;
  }, [world, rigidBodyStates]);
  const subscribe = useCallback((notify: () => void) => {
    const listeners = regionListeners.get(id) ?? new Set();
    regionListeners.set(id, listeners);
    bodyReaders.set(id, readBodies);
    listeners.add(notify);
    return () => {
      listeners.delete(notify);
      if (listeners.size) return;
      regionListeners.delete(id);
      bodyReaders.delete(id);
      removedRegions.delete(id);
    };
  }, [id, readBodies]);
  const snapshot = useCallback(() => removedRegions.has(id), [id]);
  const removed = useSyncExternalStore(subscribe, snapshot);
  // Omit the scene tree. The engine's real mount cleanup owns collider removal.
  return removed ? null : <SceneBoundary id={id}>{children}</SceneBoundary>;
}

export default function RegionSceneBoundary(props: Props) {
  return regionFaultEnabled ? <RegionWithFaultFixture {...props} /> : <SceneBoundary {...props} />;
}
