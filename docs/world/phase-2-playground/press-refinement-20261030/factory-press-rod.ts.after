import type { Object3D } from 'three';

export const FACTORY_PRESS_ROD_BASE_LENGTH = 1.4;
export const FACTORY_PRESS_ROD_TOP = 4.98;
const RAM_OVERLAP_BOTTOM = .1;

/** The visible rod emerges from the fixed receiver; it does not translate
 * away with the ram. Top stays inside the 3.95..5.095 m sleeve. Bottom enters
 * the .32 m platen by .06 m. Only local Y changes, with no allocations,
 * new geometry or changes to the physical stroke/guard/interlock clock. */
export function syncFactoryPressRod(rod: Pick<Object3D, 'position' | 'scale'>, ramCentreY: number) {
  const length = FACTORY_PRESS_ROD_TOP - ramCentreY - RAM_OVERLAP_BOTTOM;
  rod.position.y = RAM_OVERLAP_BOTTOM + length / 2;
  rod.scale.y = length / FACTORY_PRESS_ROD_BASE_LENGTH;
}
