import type { Vec3 } from '../../types';

export const WATERWHEEL_CENTER: Vec3 = [-5.3, 3.17, -1.5];
export const SLUICE_X = [-1.9, 1.1, 4.1] as const;
export const WATERWHEEL_FRAME_BODY = 'alpha-wheel-footings-axle-headrace-and-stone-arch';
export const WATERWHEEL_FLOOR_BODY = 'alpha-waterfall-passage-wet-rock-floor';
export const WATERWHEEL_FLOOR_POSITION:Vec3 = [3.2,.005,-4.1];
export const WATERWHEEL_FLOOR_SCALE:Vec3 = [12,.05,2.6];
/** Existing exclusion zones for articulated parts. These remain separate from
 * mesh-derived fixed architecture until moving-asset collision is migrated. */
export const WATERWHEEL_MOVING_GUARDS: {id:string;position:Vec3;half:Vec3}[] = [
  {id:'rotor',position:[-5.3,3.25,-1.5],half:[3.15,3.25,1.85]},
  ...SLUICE_X.map((x,i)=>({id:`sluice-${i}`,position:[x,1.15,2.3] as Vec3,half:[.82,1.15,.6] as Vec3})),
];
