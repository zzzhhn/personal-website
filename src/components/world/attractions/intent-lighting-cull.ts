import type { BufferGeometry } from 'three';
import type { Vec3 } from '../types';

/** Conservative broad phase only: preserve source order and the existing exact
 * lighting arithmetic. Most small beams can see only a few of the park's lamps. */
export function lightsTouchingPart<T extends { p: Vec3; radius: number }>(geometry: BufferGeometry, origin: Vec3, sources: readonly T[]): T[] {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const b = geometry.boundingBox!;
  return sources.filter(s => {
    const r = s.radius + 1e-6;
    return s.p[0] + r >= b.min.x + origin[0] && s.p[0] - r <= b.max.x + origin[0]
      && s.p[1] + r >= b.min.y + origin[1] && s.p[1] - r <= b.max.y + origin[1]
      && s.p[2] + r >= b.min.z + origin[2] && s.p[2] - r <= b.max.z + origin[2];
  });
}
