import { ALPHA_BATCH2_ARRIVALS } from './alpha-batch2-layout';
import { alphaWorld } from './alpha-layout';
import type { Vec3 } from '../types';

// The original cave arrival overlaps the finished mouth. The outdoor apron
// next to it has verified footing and an escape route with the cave installed.
const caveApron: Vec3 = [-16, 23.69, -34];

/** Named public Alpha arrivals wait for their independently lazy district. */
export function namedAlphaArrival(start: string | null): Vec3 | null {
  return start && Object.hasOwn(ALPHA_BATCH2_ARRIVALS, start) ? alphaWorld(start === 'alpha-cave' ? caveApron : ALPHA_BATCH2_ARRIVALS[start]) : null;
}
