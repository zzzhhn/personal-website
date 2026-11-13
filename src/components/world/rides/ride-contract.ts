import type { Vec3 } from '../types';
import type { AttractionRidePose } from '../attractions/attraction-ride';

export interface RideActorFrame {
  stairs?: boolean;
  /** Ground sampler belongs to the current boarding route, never to another ride. */
  groundId?: string;
  root: Vec3; yaw: number; speed: number;
  clip: 'Idle' | 'Walk' | 'Run' | 'TurnL' | 'TurnR' | 'SitDown' | 'SitIdle' | 'StandUp';
  clipPhase?: number; seatWeight: number; seat: Vec3;
  orientation?: [number, number, number, number];
}
export interface RideDriver {
  readonly id: string;
  readonly phase: string;
  readonly frame: RideActorFrame;
  capture(root: Vec3, yaw: number): void;
  requestExit(): void;
  dispose(reason: 'complete' | 'recovery'): void;
}
export interface TransportTransform { origin: Vec3; yaw: number }
/** All coordinates local to transform; metres, Y up. Vehicle local +X forward. */
export interface TransportTerminal {
  id: string;
  /** Vehicle floor datum at the terminal. */
  vehicle: Vec3;
  yaw: number;
  /** Foot route from interaction apron to standing inside vehicle; actual support required. */
  boarding: Vec3[];
  safeExit: Vec3;
  /** Passenger seat patch relative to vehicle root. */
  seat: Vec3;
  clearance: Vec3;
}
export interface TransportRoute {
  id: string;
  kind: 'cable' | 'sled' | 'ferry';
  transform: TransportTransform;
  /** Vehicle root path, including both terminal datums. */
  path: Vec3[];
  terminals: [TransportTerminal, TransportTerminal];
  duration: number;
  /** Sled support changes below this local elevation. */
  snowLine?: number;
}
export interface TransportSample {
  vehicle: Vec3; yaw: number; orientation: [number, number, number, number];
  pose: AttractionRidePose;
}

const supportSamplers=new Map<string,(x:number,z:number)=>number|null>();
export function registerRideGround(id:string,sample:(x:number,z:number)=>number|null){supportSamplers.set(id,sample);}
export const rideGround=(id?:string)=>id?supportSamplers.get(id):undefined;
