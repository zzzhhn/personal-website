/**
 * Greybox hand-over. The greybox in WorldEnvironment / WorldDistricts renders every placeholder
 * (visual and collider). When a district module renders the formal asset for a placeholder key it
 * claims that key at module top level, and the greybox for that key is skipped entirely, visual
 * and collider, so the formal asset owns both and nothing is drawn twice.
 *
 * Claims are made when the owning module is first imported. Every district module is imported
 * statically by its mount point, so all claims exist before the greybox layout is first built.
 */
export type GreyboxKey =
  /** Six internship buildings (shells + colliders) and their roof ring. */
  | 'building'
  /** Per-building forecourt surface, year pillar, plaque and window glow. */
  | 'building-forecourt'
  /** Inland background massing (v3 four inland blocks, v4 back-street / west-shore / kiosks). */
  | 'massing'
  /** Six park huts, their landing spurs, hut interiors and cyan eave strips. */
  | 'booth'
  /** Park boardwalk deck, rails, posts, warm lamps and plank seams. */
  | 'boardwalk'
  /** The bridge-end park plaza block. */
  | 'park-plaza'
  /** Phase-two foundations and their orange signs. */
  | 'foundation'
  /** Greybox trees outside the camp. */
  | 'tree'
  /** v4 knockable street furniture (lamps, signals, signs, delineators, chevrons, bins). */
  | 'knockable'
  /** v4 benches and bollards. */
  | 'street-fixed'
  /** v4 windmill on the north ridge. */
  | 'windmill'
  /** Orange roadblocks (WorldObstacles). */
  | 'roadblock'
  /** Camp pads 4-8 stand-ins for C11-C15. */
  | 'camp-placeholder'
  /** The two camp exit lamp posts and their heads. */
  | 'camp-lamps'
  /** v4 rails, guardrails, hill rails, bridge rails, their posts and walls (layout-v4 solids). */
  | 'rail'
  /** v4 paved prisms (roads, aprons, walks, forecourts, car parks) and their markings. */
  | 'paved'
  /** v3 coastal rails, lamps and bridge rails (v4 has its own rails in layout-v4 solids). */
  | 'roadside';

const claimed = new Set<GreyboxKey>();

/** Call at module top level in the module that renders the formal replacement. */
export function claimGreybox(...keys: GreyboxKey[]) { for (const key of keys) claimed.add(key); }
/** True when a formal asset owns this placeholder (skip its greybox visual and collider). */
export const isClaimed = (key: GreyboxKey) => claimed.has(key);
/** QA listing. */
export const claimedKeys = () => [...claimed];
