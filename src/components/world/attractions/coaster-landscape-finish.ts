import { Color, MathUtils } from 'three';
import type { Vec3 } from '../types';

type Sampler = (x: number, z: number) => number;
type GroundFinish = { ground?: Sampler; pathDistance?: Sampler };
const limestone = new Color('#b5a58c');
const shale = new Color('#818984');
const dampStone = new Color('#646f68');
const turf = new Color('#667d4b');
const dryGrass = new Color('#87905a');
const soil = new Color('#a48d68');
const apronSoil = new Color('#898f6c');
const apronTurf = new Color('#718254');
const pathShoulder = new Color('#b9a68b');
const smooth = MathUtils.smoothstep;

/** A continuous material field in coaster-local metres. Upward area normals
 * control vegetation cover without changing the faceted render normals. */
export function coasterGroundColours(
  points: readonly Vec3[], faces: readonly [number, number, number][], finish: GroundFinish = {},
): Color[] {
  const areaNormals = new Float64Array(points.length * 3);
  for (const [ia, ib, ic] of faces) {
    const [a, b, c] = [points[ia], points[ib], points[ic]];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (ny < -1e-6) continue; // Buried closures do not determine above-ground cover.
    for (const i of [ia, ib, ic]) {
      areaNormals[i * 3] += nx;
      areaNormals[i * 3 + 1] += ny;
      areaNormals[i * 3 + 2] += nz;
    }
  }

  return points.map(([x, y, z], i) => {
    const slope = Math.hypot(areaNormals[i * 3], areaNormals[i * 3 + 2]) / Math.max(.001, areaNormals[i * 3 + 1]);
    const rootedSlope = 1 - smooth(slope, .28, .95);
    // A few broad tilted beds cross the landform. This does not follow individual triangles.
    const bedding = y - x * .12 + z * .065;
    const bed = smooth(Math.sin(bedding * .74), -.55, .72);
    const seam = 1 - smooth(Math.abs(Math.sin(bedding * .74 + .46)), .06, .28);
    const stone = shale.clone().lerp(limestone, .28 + bed * .65).lerp(dampStone, seam * .18);

    // Vegetation occupies linked pockets. The long spatial waves only control
    // the extent of those pockets, keeping the underlying pigment quiet.
    const pocket = .55 + .27 * Math.sin(x * .146 + z * .083) + .17 * Math.cos(z * .188 - x * .062);
    const cover = smooth(pocket, .2, .8);
    const ground = soil.clone().lerp(dryGrass.clone().lerp(turf, cover), .29 + cover * .62);
    if (finish.ground) {
      const contact = 1 - smooth(y - finish.ground(x, z), .12, 1.05);
      return stone.lerp(dampStone, contact * .3).lerp(ground, Math.max(rootedSlope * (.36 + cover * .36), contact * .67));
    }

    const toe = 1 - smooth(y, .13, 1.65);
    const pigment = stone.lerp(ground, Math.max(rootedSlope * (.77 + cover * .18), toe * .91));
    // Keep the low support aprons in the established olive soil family.
    // Their edges grade into exposed rock as the surface rises.
    pigment.lerp(apronSoil.clone().lerp(apronTurf, cover * .8), 1 - smooth(y, .22, .82));
    if (finish.pathDistance) {
      const shoulder = 1 - smooth(finish.pathDistance(x, z), 2.05, 4.25);
      pigment.lerp(pathShoulder, shoulder * .68 * (.35 + rootedSlope * .65));
    }
    return pigment;
  });
}
