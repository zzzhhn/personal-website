import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, TubeGeometry, Vector3 } from 'three';
import { AlphaBuilder } from './alpha-art';
import type { Ball, World } from '@dimforge/rapier3d-compat';
import { ALPHA_MAIN_PATH, ALPHA_ORIGIN } from './alpha-layout';
import { alphaGroundHeight } from './alpha-terrain';

const path = new CatmullRomCurve3(
  ALPHA_MAIN_PATH.map(([x, y, z]) => new Vector3(-64 + x / 95, 5.415 + y / 180, -39.9 + z / 100)),
);
const segments = 90,
  railRadius = 0.012;
export const SAND_BALL_RADIUS = 0.075;
// TubeGeometry emits a ring at each equally spaced distance on the authored path.
const rings = path.getSpacedPoints(segments);
const down = { x: 0, y: -1, z: 0 };
const upright = { x: 0, y: 0, z: 0, w: 1 };
export const SAND_MODEL_ID = 'alpha-sand-model';

/** The copper guide determines the horizontal path. Either its five-sided tube
 * or the sculpted relief can be the highest contact under the moving marble. */
export function placeSandRouteBall(world: World, shape: Ball, elapsedFraction: number, position: Vector3) {
  const t = Math.max(0, Math.min(1, elapsedFraction)) * segments;
  const i = Math.min(segments - 1, Math.floor(t));
  position.lerpVectors(rings[i], rings[i + 1], t - i);
  const startY = 7;
  const origin = {
    x: position.x + ALPHA_ORIGIN[0],
    y: startY + ALPHA_ORIGIN[1],
    z: position.z + ALPHA_ORIGIN[2],
  };
  const hit = world.castShape(
    origin,
    upright,
    down,
    shape,
    0,
    3,
    true,
    undefined,
    undefined,
    undefined,
    undefined,
    (c) => (c.parent()?.userData as { assetId?: string })?.assetId === SAND_MODEL_ID,
  );
  if (!hit) return false;
  position.y = startY - hit.time_of_impact;
  return true;
}

export function createSandRouteModel() {
  const builder = new AlphaBuilder(),
    positions: number[] = [],
    triangles: number[] = [],
    n = 24;
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const x = (i / n - 0.5) * 1.95,
        z = (j / n - 0.5) * 1.4;
      positions.push(-64 + x, 5.4 + Math.max(0, alphaGroundHeight(x * 95, z * 100)) / 180, -39.9 + z);
    }
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      triangles.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
    }
  const terrain = new BufferGeometry();
  terrain.setAttribute('position', new Float32BufferAttribute(positions, 3));
  terrain.setIndex(triangles);
  terrain.computeVertexNormals();
  builder.add(terrain, 'stone');
  builder.add(new TubeGeometry(path, segments, railRadius, 5, false), 'metal');
  return builder.finish();
}
