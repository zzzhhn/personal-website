import { ibdStation, type IbdStationId } from './ibd-yard-layout.ts';
import type { Vec3 } from '../types';

const ground = (x: number, z: number): Vec3 => [x, .14, z];
const deck = (x: number, z: number): Vec3 => [x, 4.14, z];

/** A small, authored walking network. Recomputed only when an operation changes,
 * never per frame. Edges follow the actual aisles and the open end of the guards. */
export function ibdRouteBetween(from: IbdStationId | undefined, to: IbdStationId, moved: readonly string[]): Vec3[] {
  const points: Vec3[] = [], edges: Map<number, number>[] = [];
  const node = (p: Vec3) => {
    const existing = points.findIndex(q => p.every((v, i) => v === q[i]));
    if (existing >= 0) return existing;
    points.push(p); edges.push(new Map()); return points.length - 1;
  };
  const lane = (...path: Vec3[]) => {
    for (let i = 1; i < path.length; i++) {
      const a = node(path[i - 1]), b = node(path[i]);
      const length = Math.hypot(...path[i].map((v, axis) => v - path[i - 1][axis]));
      edges[a].set(b, length); edges[b].set(a, length);
    }
  };
  const station = (id: IbdStationId): Vec3 => {
    const { at } = ibdStation(id, moved);
    return id.startsWith('gallery') ? deck(at[0], at[2]) : ground(at[0], at[2]);
  };
  lane(...[31, 27, 23, 20, 16.8, 16.5, 8.5, 3, 2].map(z => ground(0, z)));
  for (const id of ['manifest', 'kit', 'truck-a', 'truck-b', 'dispatch'] as const) {
    const p = station(id); lane(ground(0, p[2]), p);
  }
  lane(ground(0, 3), ground(-7, 3), ground(-7, 1), ground(-12, 1), ground(-20, 1), ground(-20, 4), ground(-24, 4));
  lane(ground(-7, 1), station('crane'));
  lane(ground(-7, 1), ground(-7, -3), ground(-7, -8));
  for (const id of ['turn-front', 'turn-rear'] as const) lane(ground(-7, station(id)[2]), station(id));
  lane(ground(station('coil-front')[0], 1), station('coil-front'));
  // The front coil must be lifted before the inner lane to the rear coil opens.
  if (moved.some(id => id.startsWith('coil-front'))) lane(ground(-12, 1), station('coil-rear'));

  lane(ground(0, 2), ground(6, 2), ground(14, 2), ground(23, 2));
  for (const x of [6, 14, 23]) lane(...[2, -5.8, -9.5, -10.8].map(z => ground(x, z)));
  // The standing gap between the inspection benches and roller beds connects A/B.
  lane(ground(6, -9.5), station('parts-a'), ground(14, -9.5), station('parts-b'), ground(23, -9.5));
  for (const [id, x] of [['scale-a', 6], ['load-a', 6], ['scale-b', 23], ['load-b', 23]] as const)
    lane(ground(x, station(id)[2]), station(id));

  // Free exploration may finish a scope check upstairs. Return via the ramp,
  // never paint a ground-level shortcut through the coil or the gallery rail.
  lane(ground(-24, 4), ground(-24, 3.5), deck(-24, -12.2), deck(-24, -13.5),
    station('gallery-rear'), deck(-6, -13.5), station('gallery-front'));

  const start = node(from ? station(from) : ground(0, 31)), target = node(station(to));
  const distances = points.map(() => Infinity), previous = points.map(() => -1), pending = new Set(points.map((_, i) => i));
  distances[start] = 0;
  while (pending.size) {
    let nearest = -1;
    for (const id of pending) if (nearest < 0 || distances[id] < distances[nearest]) nearest = id;
    if (!Number.isFinite(distances[nearest]) || nearest === target) break;
    pending.delete(nearest);
    for (const [next, length] of edges[nearest]) if (distances[nearest] + length < distances[next]) {
      distances[next] = distances[nearest] + length; previous[next] = nearest;
    }
  }
  if (!Number.isFinite(distances[target])) return [];
  const route: Vec3[] = [];
  for (let id = target; id >= 0; id = previous[id]) route.unshift(points[id]);
  return route;
}
