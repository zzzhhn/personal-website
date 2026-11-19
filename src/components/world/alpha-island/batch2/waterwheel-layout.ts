import type { Vec3 } from '../../types';

export const WATERWHEEL_CENTER: Vec3 = [-5.3, 3.17, -1.5];
export const SLUICE_X = [-1.9, 1.1, 4.1] as const;
export const WATERWHEEL_ROOT = 'alpha-station5-three-sluices-waterwheel';
export const WATERWHEEL_FRAME_BODY = 'alpha-wheel-footings-axle-headrace-and-stone-arch';
export const WATERWHEEL_FLOOR_BODY = 'alpha-waterfall-passage-wet-rock-floor';
export const WATERWHEEL_FLOOR_POSITION:Vec3 = [3.2,.005,-4.1];
export const WATERWHEEL_FLOOR_SCALE:Vec3 = [12,.05,2.6];
export const WATERWHEEL_ROTOR_SURFACE = 'alpha-waterwheel-rotor-surface';
export const waterwheelSluiceSurface = (index: number) => `alpha-waterwheel-sluice-${index}-leaf-surface`;
export const waterwheelSluiceHeight = (opening: number) => .69 + opening * .38;
export const WATERWHEEL_SLUICE_Z = 2.3;
