import { Component, memo, Suspense, type ReactNode } from 'react';
import WorldTownAssets from './WorldTownAssets';
import type { WorldContent } from './types';

/** A failed town GLB leaves the greybox (visual + collider) in place: nothing is claimed. */
class TownGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error('[world-town] assets failed; greybox kept.', error); }
  render() { return this.state.failed ? null : this.props.children; }
}

/**
 * Town district mount point (owner: town session): six internship buildings, forecourt year pillars and
 * exhibit boards, signage, the Hunyuan roof ring, back-street / west-shore low-rise, MoE palms and the
 * south-beach kiosks + lifeguard tower. WorldTownAssets claims its greybox keys only after every GLB has
 * loaded and its colliders mounted (WorldVisualClaims). Facts come only from `experiences`.
 */
export default memo(function WorldTown({ experiences }: { experiences: WorldContent['experiences'] }) {
  return <group name="world-town">
    <TownGuard><Suspense fallback={<group name="town-loading-assets" />}><WorldTownAssets experiences={experiences} /></Suspense></TownGuard>
  </group>;
});
