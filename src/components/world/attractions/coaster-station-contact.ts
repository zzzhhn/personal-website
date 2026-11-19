import type { Vector3 } from 'three';
import { coasterWorld } from './coaster-track';
import { COASTER_BOARDING, COASTER_TREAD_COLLIDER } from './coaster-transition';

export const COASTER_STATION_WALLS = 'coaster-station-building';
const origin = coasterWorld([0, 0, 0]);
const entry = COASTER_BOARDING.inside;
const x = entry[0] - origin[0], z = entry[2] - origin[2];
const sin = Math.sin(COASTER_BOARDING.yaw), cos = Math.cos(COASTER_BOARDING.yaw);
const lateral = (px: number, pz: number) => (px - x) * sin + (pz - z) * cos;
const { threshold, stairs, platformY, floorY } = COASTER_BOARDING;
const margin = .001;
const inner = lateral(threshold.position[0] - origin[0], threshold.position[2] - origin[2]) - threshold.size[2] / 2 - margin;
// The authored vertical lip projects two centimetres beyond the front of each tread.
const outer = lateral(stairs[0].position[0] - origin[0], stairs[0].position[2] - origin[2]) + stairs[0].size[2] / 2 + .02 + margin;
const width = threshold.size[0] / 2 + margin;
const bottom = platformY - origin[1] - margin, top = floorY - origin[1] + margin;

function onTread(p: Vector3) {
  if (p.y < bottom || p.y > top || Math.abs((p.x - x) * cos - (p.z - z) * sin) > width) return false;
  const reach = lateral(p.x, p.z);
  return reach >= inner && reach <= outer;
}

/** Both visual LODs use the same authored boarding envelope. Keep its seven
 * supports separate from the building so the stair animation only ignores treads. */
export function coasterStationContact(a: Vector3, b: Vector3, c: Vector3) {
  return onTread(a) && onTread(b) && onTread(c) ? COASTER_TREAD_COLLIDER : COASTER_STATION_WALLS;
}
