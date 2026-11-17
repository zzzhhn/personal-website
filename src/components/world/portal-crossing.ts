import type { Vec3 } from './types';

export interface PortalOpening {
  position: Vec3;
  yaw: number;
  innerRadius: number;
  centerHeight: number;
}

/** World point to an opening's local frame, with y measured from its base. */
export function portalLocalPoint(site: PortalOpening, point: Vec3): Vec3 {
  const x = point[0] - site.position[0], z = point[2] - site.position[2];
  const c = Math.cos(site.yaw), s = Math.sin(site.yaw);
  return [c * x - s * z, point[1] - site.position[1], s * x + c * z];
}

/** Swept centre crossing in both directions. Both cap-centres, inflated by the
 * capsule radius plus 3 cm margin, must fit the true circular opening.
 * halfHeight is Rapier's cylinder half-height, excluding the round cap radius.
 * Runtime owns eligibility, cooldown, continuous collision and safe arrival. */
export function portalCrossing(site: PortalOpening, from: Vec3, to: Vec3, radius = .34, halfHeight = .48): boolean {
  const a = portalLocalPoint(site, from), b = portalLocalPoint(site, to);
  if (!a.every(Number.isFinite) || !b.every(Number.isFinite) || !Number.isFinite(radius) || radius < 0 || !Number.isFinite(halfHeight) || halfHeight < 0) return false;
  if ((a[2] < 0) === (b[2] < 0) || Math.abs(b[2] - a[2]) < 1e-6) return false;
  const t = -a[2] / (b[2] - a[2]);
  const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
  const clearance = site.innerRadius - radius - .03;
  return clearance > 0 && Math.hypot(x, y - halfHeight - site.centerHeight) <= clearance
    && Math.hypot(x, y + halfHeight - site.centerHeight) <= clearance;
}
