import type { Vec3 } from '../types';
import type { ActorZone } from '../actor-sites';
import type { RegionPassage } from '../region-passage';
import type { RideActorFrame, RidePose } from './ride-contract';

/** World assembly supplies this live port. Core physics does not inspect a venue's state machine. */
export interface ActorRide {
  readonly active: boolean;
  readonly revision: number;
  readonly lifecycle: string;
  readonly pose: RidePose;
  readonly actor: RideActorFrame | null;
  readonly seatOnly: boolean;
  readonly complete: boolean;
  readonly exit: Vec3;
  readonly boardingPath: Vec3[] | undefined;
  /** Present only while the scene requires an exit-route readiness check. */
  readonly egressPath: Vec3[] | undefined;
  setMovementGuard(guard: (from: Vec3, to: Vec3) => boolean): void;
  capture(root: Vec3, yaw: number, passage: RegionPassage): void;
  setExitBlocked(blocked: boolean): void;
  requestExit(): void;
  viewBlocked(): void;
  finish(): void;
  cancel(): void;
  zone(position: Vec3): ActorZone;
}
