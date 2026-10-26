import type { Vec3 } from './types';

/** Shared world-space contract. Natural earth stays at y=1; raised timber floors belong to the club. */
export const CLUB = {
  center: [45, 1, 55] as Vec3,
  dance: [41, 1.6, 55] as Vec3,
  danceRadii: [8, 10] as [number, number],
  stage: [32, 2.0, 55] as Vec3,
  stageSize: [8, 14] as [number, number],
  stageFacing: [1, 0] as [number, number],
  console: [32.7, 3.0, 55] as Vec3,
  pool: [57, 1.35, 55] as Vec3,
  poolRadii: [7, 10] as [number, number],
  terrace: [61, 1.16, 56] as Vec3,
  entrance: [24, 1, 40] as Vec3,
  spawn: [30, 1.1, 39] as Vec3,
};

export const CLUB_CAPE = { center: [42, 55] as [number, number], radii: [30, 27] as [number, number], beachWidth: 8.5, shelfLength: 15 };
export const CLUB_APPROACH: Vec3[] = [CLUB.entrance, CLUB.spawn, [35, 1, 46]];
/** Approximate signed radial distance in metres; exact ellipse zero set, negative inland. */
export function clubCapeDistance(x: number, z: number) {
  const dx = x - CLUB_CAPE.center[0], dz = z - CLUB_CAPE.center[1];
  const q = Math.hypot(dx / CLUB_CAPE.radii[0], dz / CLUB_CAPE.radii[1]);
  return q < 1e-9 ? -Math.min(...CLUB_CAPE.radii) : Math.hypot(dx, dz) * (1 - 1 / q);
}

/** Hard surfaces and circulation only; cape shoulders retain living grass. */
export const CLUB_SCATTER_BLOCKERS = [
  { minX: 32.4, maxX: 65, minZ: 43.4, maxZ: 66.6 }, // dance floor, pool and circulation
  { minX: 27.4, maxX: 36.6, minZ: 47.4, maxZ: 62.6 }, // raised stage
  { minX: 57, maxX: 67, minZ: 48, maxZ: 65 }, // sea terrace
  { minX: 22.8, maxX: 30.5, minZ: 38.7, maxZ: 44.6 }, // shore entrance
  { minX: 28, maxX: 36.5, minZ: 41.6, maxZ: 47.3 }, // approach to timber floors
  { minX: 35, maxX: 46.5, minZ: 37.5, maxZ: 42.7 }, // bar and stools
];

/** Exact intersections with the final terrain triangles, stitched by mesh-edge identity.
 * Unlike a radial silhouette, these closed loops retain bays and separate land masses. */
export function meshWaterlineLoops(positions: ArrayLike<number>, indices: ArrayLike<number>, waterY: number): [number, number][][] {
  const points = new Map<string, [number, number]>(), adjacent = new Map<string, string[]>();
  const crossing = (a: number, b: number) => {
    const ya = positions[a * 3 + 1], yb = positions[b * 3 + 1];
    if ((ya > waterY) === (yb > waterY)) return null;
    const key = Math.abs(ya - waterY) < 1e-10 ? `v${a}` : Math.abs(yb - waterY) < 1e-10 ? `v${b}` : `${Math.min(a, b)}:${Math.max(a, b)}`;
    if (!points.has(key)) {
      const t = (waterY - ya) / (yb - ya);
      points.set(key, [positions[a * 3] + (positions[b * 3] - positions[a * 3]) * t, positions[a * 3 + 2] + (positions[b * 3 + 2] - positions[a * 3 + 2]) * t]);
    }
    return key;
  };
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    const keys = [...new Set([crossing(a, b), crossing(b, c), crossing(c, a)].filter((p): p is string => p !== null))];
    if (keys.length !== 2) continue;
    for (const [from, to] of [[keys[0], keys[1]], [keys[1], keys[0]]]) {
      const list = adjacent.get(from) ?? []; if (!list.includes(to)) list.push(to); adjacent.set(from, list);
    }
  }
  const used = new Set<string>(), loops: [number, number][][] = [];
  const edgeKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;
  for (const [start, neighbours] of adjacent) for (const first of neighbours) {
    if (used.has(edgeKey(start, first))) continue;
    const loop: [number, number][] = [points.get(start)!];
    let previous = start, current = first;
    used.add(edgeKey(previous, current));
    while (current !== start) {
      loop.push(points.get(current)!);
      const next = adjacent.get(current)?.find(k => k !== previous && !used.has(edgeKey(current, k)));
      if (!next) break;
      previous = current; current = next; used.add(edgeKey(previous, current));
    }
    if (current === start && loop.length > 2) loops.push(loop);
  }
  const area = (p: [number, number][]) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0));
  return loops.sort((a, b) => area(b) - area(a));
}
