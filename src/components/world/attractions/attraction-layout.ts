import type { Vec3 } from '../types';

/** Shared site survey. Ground points are foot positions, never capsule centres. */
export const IBD_YARD = {
  center: [-88, 1, -177] as Vec3,
  size: [55, 45] as const,
  entrance: [-88, 1.08, -150] as Vec3,
  title: { zh: '国投证券 · 物资清点场', en: 'SDIC · The Inventory Yard' },
};
export const INTENT_COASTER = {
  center: [50, 1, -175] as Vec3,
  size: [70, 84] as const,
  entrance: [50, 1.08, -128] as Vec3,
  title: { zh: '字节跳动 · 意图过山车', en: 'ByteDance · Intent Coaster' },
};

/** Connected northern headland; overlaps the old north shore by at least 15 m. */
export const ATTRACTIONS_CAPE: [number, number][] = [
  [-133,-114],[-140,-153],[-135,-203],[-118,-225],[-85,-234],[-47,-228],
  [-18,-218],[9,-234],[48,-242],[87,-232],[106,-207],[110,-167],
  [97,-132],[75,-111],[42,-104],[10,-105],[-20,-119],[-65,-121],[-103,-109],
];

export const ATTRACTION_ROADS: [number, number][][] = [
  [[-15,-103],[-15,-123],[-35,-143],[-62,-146],[-88,-146]],
  [[-15,-123],[10,-122],[32,-123],[50,-128]],
];
