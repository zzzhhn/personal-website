import type { Vec3 } from '../types';
import { surfaceColliderBuffers, type StaticSurface } from '../static-surface-asset';
import { AlphaBuilder, type AlphaFinish } from './alpha-art';
import { ALPHA_MAIN_PATH, ALPHA_SOCKETS } from './alpha-layout';
import { batch2PathDistance } from './alpha-batch2-layout';
import { alphaGroundHeight } from './alpha-terrain';
import { alphaTrailFootprintLow } from './alpha-trail-placement';

function railSpans() {
  const spans: { a: Vec3; b: Vec3 }[] = [];
  for (let i = 2; i < ALPHA_MAIN_PATH.length; i++) {
    const a = ALPHA_MAIN_PATH[i - 1], b = ALPHA_MAIN_PATH[i];
    const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz);
    if (a[1] < 8 || length < 2) continue;
    const nx = -dz / length, nz = dx / length, count = Math.ceil(length / 3);
    for (const side of [-1, 1]) {
      const point = (t: number): Vec3 => {
        const x = a[0] + dx * t + nx * 2.15 * side, z = a[2] + dz * t + nz * 2.15 * side;
        return [x, alphaGroundHeight(x, z), z];
      };
      for (let j = 0; j < count; j++) {
        const t = (j + .5) / count, x = a[0] + dx * t, z = a[2] + dz * t;
        if (Object.values(ALPHA_SOCKETS).some(s => Math.hypot(x - s.ground[0], z - s.ground[2]) < 11)) continue;
        const drop = a[1] + (b[1] - a[1]) * t - alphaGroundHeight(x + nx * 5 * side, z + nz * 5 * side);
        if (drop < 2.1) continue;
        const start = point(j / count), end = point((j + 1) / count);
        if (batch2PathDistance((start[0] + end[0]) / 2, (start[2] + end[2]) / 2) >= 3)
          spans.push({ a: start, b: end });
      }
    }
  }
  return spans;
}

const reasons: Partial<Record<AlphaFinish, string>> = {
  wood: 'Load-bearing timber posts and handrails',
  metal: 'Raised collars around the timber posts',
  rope: 'Lower guard rope',
};

export function createAlphaPathFence() {
  const spans = railSpans(), builder = new AlphaBuilder();
  for (const { a, b } of spans) {
    for (const [x, y, z] of [a, b]) {
      const bottom = Math.min(y - .04, alphaTrailFootprintLow(x, z, .095) - .01);
      const top = y + 1.14;
      builder.cyl('wood', [x, (top + bottom) / 2, z], .095, top - bottom, .085);
      builder.cyl('metal', [x, y + .13, z], .105, .045);
    }
    builder.beam('wood', [a[0], a[1] + .94, a[2]], [b[0], b[1] + .94, b[2]], .1);
    builder.beam('rope', [a[0], a[1] + .48, a[2]], [b[0], b[1] + .48, b[2]], .035);
  }
  const parts = builder.finish().map(({ finish, geometry }) => {
    const reason = reasons[finish];
    if (!reason) throw new Error('Unclassified Alpha trail fence geometry: ' + finish);
    const surface: StaticSurface = { id: 'alpha-path-fence/' + finish, space: 'alpha-island', collision: 'solid', role: 'enclosure', reason, geometry };
    return { ...surface, finish, buffers: surfaceColliderBuffers(surface)! };
  });
  return { spans, parts };
}
