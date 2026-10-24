import { Matrix4 } from 'three';
import { BOARDWALK_POINTS, BOARDWALK_WIDTH, BOOTHS } from './layout';
import { yawMatrix } from './WorldParkKit';
import type { Vec3 } from './types';

/** Park placement derived only from layout.ts (BOOTHS, BOARDWALK_POINTS, BOARDWALK_WIDTH). The
 * protected coordinates are not changed: each hut's centre sits on its BOOTHS point, facing the
 * nearest boardwalk centreline point; a spur joins the hut's opening to the boardwalk edge. */
export const DECK_Y = BOARDWALK_POINTS[0][1];
/** Hut GLB frame: floor top origin, opening line at local z = +0.6, back outer face at z = -3.25. */
export const HUT_FRONT_Z = 0.6, HUT_BACK_Z = -3.25, HUT_CENTRE_Z = (HUT_FRONT_Z + HUT_BACK_Z) / 2;
/** Booth id -> project slug (src/content/projects). */
export const BOOTH_SLUG: Record<string, string> = {
  'alpha-agent': 'alpha-agent', evalforge: 'evalforge', djc: 'djc', hepai: 'hepai', accompany: 'kindred',
  'interactive-learning': 'interactive-learning-platforms',
};
const VARIANT: Record<string, 'A' | 'B'> = { 'alpha-agent': 'A', evalforge: 'A', accompany: 'A', djc: 'B', hepai: 'B', 'interactive-learning': 'B' };
export const HUT_WIDTH = { A: 5.2, B: 6.0 } as const;

export function nearestOnWalk(x: number, z: number) {
  let best = Infinity, out = { x, z, seg: 0, t: 0 };
  for (let i = 0; i < BOARDWALK_POINTS.length - 1; i++) {
    const a = BOARDWALK_POINTS[i], b = BOARDWALK_POINTS[i + 1], dx = b[0] - a[0], dz = b[2] - a[2];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / (dx * dx + dz * dz)));
    const px = a[0] + dx * t, pz = a[2] + dz * t, d = Math.hypot(px - x, pz - z);
    if (d < best) { best = d; out = { x: px, z: pz, seg: i, t }; }
  }
  return { ...out, distance: best };
}

export interface HutPlacement {
  id: string; slug: string; variant: 'A' | 'B'; width: number;
  /** GLB origin (floor top) in world space and yaw (local +Z = toward the boardwalk). */
  origin: Vec3; yaw: number; matrix: Matrix4;
  /** Unit vector toward the boardwalk and its right-hand perpendicular. */
  front: [number, number]; right: [number, number];
  /** Spur from the opening line to the boardwalk edge (null when the hut already abuts it). */
  spur: { from: Vec3; to: Vec3; width: number } | null;
  /** Local (glTF) point -> world. */
  local: (x: number, y: number, z: number) => Vec3;
}

export const HUTS: HutPlacement[] = BOOTHS.map(({ id, position: p }) => {
  const n = nearestOnWalk(p[0], p[2]);
  const f: [number, number] = [(n.x - p[0]) / n.distance, (n.z - p[2]) / n.distance];
  const r: [number, number] = [-f[1], f[0]];
  const yaw = Math.atan2(f[0], f[1]);
  const origin: Vec3 = [p[0] - f[0] * HUT_CENTRE_Z, DECK_Y, p[2] - f[1] * HUT_CENTRE_Z];
  const variant = VARIANT[id] ?? 'A';
  // glTF local: +X right of the viewer facing the hut? local +X maps to world (cos yaw, -sin yaw).
  const local = (x: number, y: number, z: number): Vec3 => [origin[0] + Math.cos(yaw) * x + Math.sin(yaw) * z, origin[1] + y, origin[2] - Math.sin(yaw) * x + Math.cos(yaw) * z];
  const open = local(0, 0, HUT_FRONT_Z);
  const gap = n.distance - (HUT_FRONT_Z - HUT_CENTRE_Z) - BOARDWALK_WIDTH / 2;
  const spur = gap > 0.05 ? { from: open, to: [open[0] + f[0] * (gap + 0.35), DECK_Y, open[2] + f[1] * (gap + 0.35)] as Vec3, width: 3.0 } : null;
  return { id, slug: BOOTH_SLUG[id] ?? id, variant, width: HUT_WIDTH[variant], origin, yaw, matrix: yawMatrix(origin, yaw), front: f, right: r, spur, local };
});
