import { useLayoutEffect } from 'react';
import { create } from 'zustand';

/**
 * Greybox hand-over (spec §15.2). The greybox in WorldEnvironment / WorldDistricts / WorldCamp /
 * WorldObstacles renders every placeholder, visual and collider. A district that renders the formal
 * replacement claims the matching key only once its replacement (visual AND collider) has actually
 * mounted, by calling useGreyboxClaim(...) inside the component that renders it. While its GLBs
 * load, or if they fail (the component never mounts or its error boundary renders a fallback), the
 * key stays unclaimed and the greybox keeps its visual and collider, so the island never shows empty
 * ground or loses collision. Unmounting the replacement releases the claim.
 *
 * Claims must match the replacement's real scope: claim a key only when every placeholder under
 * that key is replaced, and keep the original semantics (door openings, soft bushes, sleeping
 * dynamic furniture) in the replacement.
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
  /** Greybox trees outside the camp (and the v4 pocket-park trunk / canopy). */
  | 'tree'
  /** v4 knockable street furniture (lamps, signals, signs, delineators, chevrons, bins). */
  | 'knockable'
  /** v4 benches, bollards and the bus shelter. */
  | 'street-fixed'
  /** v4 windmill on the north ridge (tower collider, nacelle, rotor). */
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

interface ClaimState { claims: Record<string, number> }
/** Reference-counted claims; greybox components subscribe and re-render when a key flips. */
export const useClaimStore = create<ClaimState>(() => ({ claims: {} }));
const bump = (keys: readonly GreyboxKey[], d: 1 | -1) => useClaimStore.setState(s => {
  const claims = { ...s.claims };
  for (const k of keys) { const n = (claims[k] ?? 0) + d; if (n > 0) claims[k] = n; else delete claims[k]; }
  return { claims };
});

/** Call in the component that renders the formal replacement (after its GLBs resolved, i.e. inside the
 * Suspense boundary); it claims on mount and releases on unmount. Layout effect: the claim lands before
 * the next paint, so the greybox and the replacement are never drawn together for a visible frame. */
export function useGreyboxClaim(...keys: GreyboxKey[]) {
  const id = keys.join('|');
  useLayoutEffect(() => { const list = id.split('|') as GreyboxKey[]; bump(list, 1); return () => bump(list, -1); }, [id]);
}
/** Reactive check for greybox components (re-renders when the claim flips). */
export const useIsClaimed = (key: GreyboxKey) => useClaimStore(s => (s.claims[key] ?? 0) > 0);
/** Non-reactive check (inside callbacks / frame loops). */
export const isClaimed = (key: GreyboxKey) => (useClaimStore.getState().claims[key] ?? 0) > 0;
/** QA listing. */
export const claimedKeys = () => Object.keys(useClaimStore.getState().claims);
