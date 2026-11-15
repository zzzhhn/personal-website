import { CylinderGeometry, ShapeUtils, Vector2 } from 'three';
import { CLUB_POOL } from './djc-club-layout';
import type { ExchangePlatform } from './alpha-exchange-layout';
import type { Vec3 } from './types';

type HeightAt = (x: number, z: number) => number;

/** Only exposed main-floor stone edges descend to earth. The returned triangles
 * are consumed unchanged by both the visible and solid geometry paths. */
export function exchangeGroundSkirt(slab: ExchangePlatform, origin: Vec3, heightAt: HeightAt): number[] {
  if (!['south-walk', 'archive-wing', 'clearing-wing', 'rear-walk'].includes(slab.id)) return [];
  const positions: number[] = [];
  slab.outline.forEach((a, i) => {
    const b = slab.outline[(i + 1) % slab.outline.length];
    const exterior = Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(Math.abs(a[0]) - 18) < 1e-7
      || Math.abs(a[1] + 40.8) < 1e-7 && Math.abs(b[1] + 40.8) < 1e-7;
    if (!exterior || !slab.walls[i]) return;
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
    const upper = slab.y - slab.depth;
    const at = (t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, upper, a[1] + (b[1] - a[1]) * t];
    const foot = (p: Vec3): Vec3 => [p[0], Math.min(upper, heightAt(p[0] + origin[0], p[2] + origin[2]) - origin[1] - .025), p[2]];
    for (let j = 0; j < steps; j++) {
      const p = at(j / steps), q = at((j + 1) / steps), r = foot(q), s = foot(p);
      positions.push(...p, ...q, ...r, ...p, ...r, ...s);
    }
  });
  return positions;
}

/** Shared original walking outline; no support repair changes its heights. */
export const djcWalkwayOutline = (polygon: [number, number][]): Vec3[] => polygon.map(([x, z]) =>
  [x, 1.4 + Math.max(0, Math.min(1, (46 - x) / 6)) * .2, z]);

/** Four short vertical piles, with height measured against the exact triangulated
 * deck above them. This small builder never constructs the rest of the club. */
export function djcWalkwaySupports(outline: Vec3[], heightAt: HeightAt) {
  const positions: number[] = [], posts: { x: number; z: number; bottom: number; top: number }[] = [];
  const triangles = ShapeUtils.triangulateShape(outline.map(p => new Vector2(p[0], p[2])), []);
  const deckHeight = (x: number, z: number) => {
    for (const triangle of triangles) {
      const [a, b, c] = triangle.map(i => outline[i]);
      const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
      if (Math.abs(d) < 1e-9) continue;
      const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d;
      const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d;
      if (Math.min(u, v, 1 - u - v) >= -1e-6) return u * a[1] + v * b[1] + (1 - u - v) * c[1];
    }
    return heightAt(x, z);
  };
  const start = [(outline[0][0] + outline[5][0]) / 2, (outline[0][2] + outline[5][2]) / 2];
  const end = [(outline[2][0] + outline[3][0]) / 2, (outline[2][2] + outline[3][2]) / 2];
  const dx = end[0] - start[0], dz = end[1] - start[1], length = Math.hypot(dx, dz);
  for (const t of [.42, .78]) for (const side of [-1, 1]) {
    const x = start[0] + dx * t - dz / length * 1.3 * side, z = start[1] + dz * t + dx / length * 1.3 * side;
    const bottom = heightAt(x, z) - .03, top = deckHeight(x, z) - .15;
    if (top <= bottom) continue;
    const cylinder = new CylinderGeometry(.1, .1, top - bottom, 8);
    cylinder.translate(x, (top + bottom) / 2, z);
    const triangles = cylinder.toNonIndexed();
    positions.push(...triangles.getAttribute('position').array);
    posts.push({ x, z, bottom, top });
    cylinder.dispose(); triangles.dispose();
  }
  return { positions, posts };
}

export const djcPoolRimAccess = (a: number, b: number) => {
  const mid = (a + b) / 2;
  return Math.abs(Math.cos(mid)) < .22 || Math.abs(Math.sin(mid)) < .28;
};

/** The actual default inner wall. Four shared access sectors deliberately emit
 * no return; material choice remains with the existing club builder. */
export function djcPoolInnerReturn(a: number, b: number) {
  if (djcPoolRimAccess(a, b)) return null;
  const upper = (angle: number): Vec3 => { const [x, z] = CLUB_POOL.boundary(angle); return [x, 1.29, z]; };
  const bottom = ([x, , z]: Vec3): Vec3 => [x, CLUB_POOL.floorHeight(x, z) - .006, z];
  const upperA = upper(a), upperB = upper(b), lowerA = bottom(upperA), lowerB = bottom(upperB);
  return { positions: [...upperB, ...upperA, ...lowerA, ...upperB, ...lowerA, ...lowerB], lowerA, lowerB };
}
