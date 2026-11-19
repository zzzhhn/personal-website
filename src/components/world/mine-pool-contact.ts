import type { Vec3 } from './types';

export type MinePoolFixture = { id: string; center: Vec3; size: Vec3; rotation?: Vec3 };
export const minePoolFixtureHalf = (fixture: MinePoolFixture): Vec3 =>
  [fixture.size[0]/2,fixture.size[1]/2,fixture.size[2]/2];

export const minePoolShelfAnchor = (center: Vec3, index: number): Vec3 =>
  [center[0]+(index-1)*.85,.77,center[2]+4.6];
export const minePoolShelfBox = (anchor: Vec3, index: number): MinePoolFixture => ({
  id:'alpha-mine-pool-shelf-'+index,center:[anchor[0],.3,anchor[2]],size:[.7,.6,.55],
});

export const minePoolBayOffset = (bay: 0 | 1) => bay===0 ? -1.15 : 1.15;
export const minePoolBayAnchor = (center: Vec3, bay: 0 | 1): Vec3 =>
  [center[0]+minePoolBayOffset(bay),.83,center[2]+3.35];
export const MINE_POOL_MARKER_TILT: Vec3 = [-.25,0,0];
export const minePoolBayFixtures = (bay: 0 | 1): [MinePoolFixture,MinePoolFixture] => ([
  {id:'alpha-mine-pool-post-'+bay,center:[0,-.46,0],size:[.08,.74,.08]},
  {id:'alpha-mine-pool-plaque-'+bay,center:[0,0,0],size:[.48,.36,.07],rotation:MINE_POOL_MARKER_TILT},
]);
