import { Vector3 } from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';

export type ShadowHullInput = { positions: Float64Array; wind?: Float64Array };
export type ShadowHullOutput = { positions: Float32Array; normals: Float32Array; wind?: Float32Array; workerMs: number };

/** Same point order, four-decimal duplicate rule, QuickHull and normals as
 * WorldShadows.farHull. Float64 input preserves even Float64 source attributes. */
export function computeShadowHull(input: ShadowHullInput): ShadowHullOutput {
  const start = performance.now(), points: Vector3[] = [], keys = new Map<string, number>();
  for (let i = 0; i < input.positions.length; i += 3) {
    const x = input.positions[i], y = input.positions[i + 1], z = input.positions[i + 2];
    const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    if (keys.has(key)) continue;
    keys.set(key, i / 3); points.push(new Vector3(x, y, z));
  }
  const hull = new ConvexGeometry(points);
  try {
    const position = hull.getAttribute('position');
    let wind: Float32Array | undefined;
    if (input.wind) {
      wind = new Float32Array(position.count * 4);
      for (let i = 0; i < position.count; i++) {
        const src = keys.get(`${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`) ?? 0;
        wind.set(input.wind.subarray(src * 4, src * 4 + 4), i * 4);
      }
    }
    hull.deleteAttribute('normal'); hull.computeVertexNormals();
    return { positions: position.array as Float32Array, normals: hull.getAttribute('normal').array as Float32Array, wind, workerMs: performance.now() - start };
  } finally { hull.dispose(); }
}
