import type { Vec3 } from '../types';

export const rackPosition: Vec3 = [-8,83,42];
export const rackShelf = {centerY:.24, thickness:.16};
export const lanternBase = {centerY:.005, thickness:.035, radius:.2};
export const lanternHandleHeight = .89;
export function shelfLanternPosition(index:0|1):Vec3 {
  const top = rackPosition[1]+rackShelf.centerY+rackShelf.thickness/2;
  return [rackPosition[0]+(index ? .65 : -.65),top-lanternBase.centerY+lanternBase.thickness/2,rackPosition[2]-.3];
}
export function shelfLanternGrip():Vec3 {
  const [x,y,z]=shelfLanternPosition(0);
  return [x,y+lanternHandleHeight,z];
}
