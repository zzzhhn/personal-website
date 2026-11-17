import type { Vec3 } from './types';
import type { PortalOpening } from './portal-crossing';
export { portalCrossing, portalLocalPoint } from './portal-crossing';

export interface WorldPortalSite extends PortalOpening {
  id: 'camp' | 'mine' | 'park' | 'yard' | 'coaster';
  /** Ground-level candidates only. Runtime must find ground and test the whole capsule. */
  arrivalCandidates: readonly Vec3[];
  /** Start outside each ramp for a genuine walking QA approach. */
  entryApproachCandidates: readonly Vec3[];
}

/** Existing G28 placement: EXIT_POSTS x minus 3.5 m, midpoint of z=31 / 37. */
export const ENTRY_POSITION: Vec3 = [-33.5, 4.8, 34];
export const PORTAL_THRESHOLD = { top: .55, width: 1.9, halfLanding: .5, rampRun: 2, halfLength: 2.5, toe: .012 } as const;
const shape = { innerRadius: 1.25, centerHeight: 1.65 };

/** Candidates selected from current camp, mine approach and park-plaza layout.
 * Geometry / terrain checks are not a substitute for live Rapier occupancy checks. */
export const WORLD_PORTALS: readonly WorldPortalSite[] = [
  { id: 'camp', position: ENTRY_POSITION, yaw: 0, ...shape,
    arrivalCandidates: [[-33.5, 4.8, 36.5], [-33.5, 4.8, 31.5]],
    entryApproachCandidates: [[-33.5, 4.8, 37.2], [-33.5, 4.8, 30.8]] },
  { id: 'mine', position: [-78, 1, -47], yaw: 0, ...shape,
    arrivalCandidates: [[-78, 1, -44.5], [-78, 1, -49.5]],
    entryApproachCandidates: [[-78, 1, -43.8], [-78, 1, -50.2]] },
  { id: 'park', position: [49.5, 1.15, -39.5], yaw: Math.PI / 2, ...shape,
    arrivalCandidates: [[52, 1.15, -39.5], [47, 1.15, -39.5]],
    entryApproachCandidates: [[52.7, 1.15, -39.5], [46.3, 1.15, -39.5]] },
  { id:'yard',position:[-101,1,-140],yaw:0,...shape,
    arrivalCandidates:[[-101,1,-137.5],[-101,1,-142.5]],entryApproachCandidates:[[-101,1,-136.8],[-101,1,-143.2]] },
  { id:'coaster',position:[60,1,-122],yaw:0,...shape,
    arrivalCandidates:[[60,1,-119.5],[60,1,-124.5]],entryApproachCandidates:[[60,1,-118.8],[60,1,-125.2]] },
];
