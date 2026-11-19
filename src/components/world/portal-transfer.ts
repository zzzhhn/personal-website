import type { ActorPortal } from './actor-sites';
import { portalLocalPoint } from './portal-crossing';
import type { Vec3 } from './types';

const PORTAL_WAIT_SECONDS = 8;

export interface PortalAttempt {
  source: ActorPortal;
  enteredFrom: number;
  destinations: ActorPortal[];
  cursor: number;
  elapsed: number;
}

type AvailableExit = { status: 'ready'; landing: Vec3 } | { status: 'loading'; regions: readonly string[] } | { status: 'blocked' };

export function beginPortalAttempt(source: ActorPortal, previous: Vec3, portals: readonly ActorPortal[], random = Math.random()): PortalAttempt {
  const eligible = portals.filter(portal => portal.id !== source.id);
  const start = Math.floor(random * eligible.length);
  return { source, enteredFrom: portalLocalPoint(source, previous)[2] < 0 ? -1 : 1,
    destinations: [...eligible.slice(start), ...eligible.slice(0, start)], cursor: 0, elapsed: 0 };
}

export function retreatingFromPortal(attempt: PortalAttempt, worldX: number, worldZ: number) {
  const { yaw } = attempt.source;
  return attempt.enteredFrom * (Math.sin(yaw) * worldX + Math.cos(yaw) * worldZ) > .35;
}

export function advancePortalAttempt(attempt: PortalAttempt, dt: number, inspect: (destination: ActorPortal) => AvailableExit) {
  attempt.elapsed += dt;
  for (; attempt.cursor < attempt.destinations.length; attempt.cursor++) {
    const destination = attempt.destinations[attempt.cursor];
    const exit = inspect(destination);
    if (exit.status === 'ready') return { status: 'arrived' as const, destination, landing: exit.landing, fallback: attempt.cursor > 0 };
    if (exit.status === 'loading' && attempt.elapsed < PORTAL_WAIT_SECONDS) return exit;
  }
  return { status: 'blocked' as const };
}
