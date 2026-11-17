import type { ReactNode } from 'react';
import type { Object3D } from 'three';

/** Visual-only extension of the guide. Never grants an interaction or advances its clock. */
export interface GuidePresentationFrame {
  shown: boolean;
  frozen: boolean;
  contactAllowed: boolean;
  facing: number;
  speedMps: number;
}

export interface GuidePresentation {
  readonly assets?: ReactNode;
  readonly blocksIdle: boolean;
  prepare(frame: GuidePresentationFrame): void;
  hide(): void;
  /** Restore the last contact pose before vehicle and locomotion restoration. */
  restoreContactPose(): void;
  /** Restore activity crouches after vehicle/vault restoration, before the mixer. */
  restoreActivityPose(): void;
  /** After locomotion and vehicle settlement, before vault and ride foot settlement. */
  applyActivityPose(handsAvailable: boolean, sitting: boolean): void;
  /** Final contact adjustment and publication of measured sockets. */
  applyContactPose(dt: number): void;
  debug(): Record<string, unknown>;
  dispose(): void;
}

export type GuidePresentationFactory = (scene: Object3D) => GuidePresentation;
