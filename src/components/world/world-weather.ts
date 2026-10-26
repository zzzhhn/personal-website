/** One camera neighbourhood, static seeds, and a bounded amortized shelter scan. */
export const WEATHER_BUDGET = { high: { rain: 1200, snow: 720 }, balanced: { rain: 600, snow: 360 },
  coverSize: 33, coverStep: 2, coverRaysPerFrame: 32, moveThreshold: 8 } as const;
export function weatherSeeds(count: number) {
  const points = new Float32Array(count * 3);
  let state = 9173;
  for (let i = 0; i < points.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    points[i] = state / 4294967296;
  }
  return points;
}
export function coverOrigin(x: number, z: number): [number, number] {
  const half = (WEATHER_BUDGET.coverSize - 1) * WEATHER_BUDGET.coverStep / 2;
  return [Math.round(x / 8) * 8 - half, Math.round(z / 8) * 8 - half];
}
export function fillWeatherCover(data: Float32Array, start: number, origin: readonly number[],
  sample: (x: number, z: number) => number) {
  const end = Math.min(data.length, start + WEATHER_BUDGET.coverRaysPerFrame);
  for (let i = start; i < end; i++) data[i] = sample(origin[0] + i % WEATHER_BUDGET.coverSize * WEATHER_BUDGET.coverStep,
    origin[1] + Math.floor(i / WEATHER_BUDGET.coverSize) * WEATHER_BUDGET.coverStep);
  return end;
}
import { QueryFilterFlags, type World, type Ray } from '@dimforge/rapier3d-compat';

export function weatherSurfaceHeight(world: World, ray: Ray, x: number, z: number) {
  ray.origin.x=x;ray.origin.y=120;ray.origin.z=z;
  const hit=world.castRay(ray,180,true,QueryFilterFlags.EXCLUDE_DYNAMIC|QueryFilterFlags.EXCLUDE_KINEMATIC|QueryFilterFlags.EXCLUDE_SENSORS);
  return hit?120-hit.timeOfImpact:-60;
}
