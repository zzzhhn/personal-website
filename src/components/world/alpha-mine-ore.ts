import type { Object3D } from 'three';
import type { AlphaFactorId } from './alpha-mine-data';
const ROOTS: Record<AlphaFactorId,string> = {REVERSAL_5:'ore_reversal',ROC20_RANK:'ore_momentum',LOW_STD_20:'ore_lowvol'};
/** The same sculpted variant is used on the ledge, in both hands and in flight. */
export function factorOreSource(source:Object3D,id:AlphaFactorId) {
  return source.parent?.getObjectByName(ROOTS[id]) ?? source;
}
