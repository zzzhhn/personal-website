import type { Vec3 } from './types';

export interface WorldPortalSite {
  id: 'camp' | 'mine' | 'park' | 'yard' | 'coaster';
  /** Stone base, in world metres; yaw rotates the local +Z crossing normal. */
  position: Vec3;
  yaw: number;
  innerRadius: number;
  centerHeight: number;
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
  { id:'yard',position:[-101,1,-146],yaw:0,...shape,
    arrivalCandidates:[[-101,1,-143.5],[-101,1,-148.5]],entryApproachCandidates:[[-101,1,-142.8],[-101,1,-149.2]] },
  { id:'coaster',position:[60,1,-122],yaw:0,...shape,
    arrivalCandidates:[[60,1,-119.5],[60,1,-124.5]],entryApproachCandidates:[[60,1,-118.8],[60,1,-125.2]] },
];

/** World point to the unscaled G28 frame, with y measured from the stone base. */
export function portalLocalPoint(site: WorldPortalSite, point: Vec3): Vec3 {
  const x = point[0] - site.position[0], z = point[2] - site.position[2];
  const c = Math.cos(site.yaw), s = Math.sin(site.yaw);
  return [c * x - s * z, point[1] - site.position[1], s * x + c * z];
}

/** Swept centre crossing in both directions. Both cap-centres, inflated by the
 * capsule radius plus 3 cm margin, must fit the true circular opening.
 * halfHeight is Rapier's cylinder half-height, excluding the round cap radius.
 * Runtime owns eligibility, cooldown, continuous collision and safe arrival. */
export function portalCrossing(site: WorldPortalSite, from: Vec3, to: Vec3, radius = .34, halfHeight = .48): boolean {
  const a = portalLocalPoint(site, from), b = portalLocalPoint(site, to);
  if (!a.every(Number.isFinite) || !b.every(Number.isFinite) || !Number.isFinite(radius) || radius < 0 || !Number.isFinite(halfHeight) || halfHeight < 0) return false;
  if ((a[2] < 0) === (b[2] < 0) || Math.abs(b[2] - a[2]) < 1e-6) return false;
  const t = -a[2] / (b[2] - a[2]);
  const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
  const clearance = site.innerRadius - radius - .03;
  return clearance > 0 && Math.hypot(x, y - halfHeight - site.centerHeight) <= clearance
    && Math.hypot(x, y + halfHeight - site.centerHeight) <= clearance;
}
