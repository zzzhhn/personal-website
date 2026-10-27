import type { Surf } from '../WorldStreetGeometry.ts';

const surf = (color: string, metal = .1): Surf => ({ color, rough: .78, metal });
export const IBD_MATERIALS = {
  steel: surf('#879ba5', .3), dark: surf('#30444d', .24), roof: surf('#536d72', .2), timber: surf('#a77a49'),
  endgrain: surf('#d0a771'), concrete: surf('#a2a298'), pale: surf('#e8e5d8'), amber: surf('#e9ac39'),
  rubber: surf('#293133'), rust: surf('#c17551'), blue: surf('#608a9e'), green: surf('#557d68'),
  wall: surf('#b8b7aa'), slab: surf('#939b9c'), leaf: surf('#66794e'), leafDark: surf('#465e48'),
  lens: { color: '#ffe1a1', rough: .4, metal: 0, glow: 1 } satisfies Surf,
  glass: { color: '#9fb7bd', rough: .5, metal: .16 } satisfies Surf,
};
