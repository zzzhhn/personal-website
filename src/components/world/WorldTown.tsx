import { memo } from 'react';
import type { WorldContent } from './types';

/**
 * Town district mount point (owner: town session). Renders the six internship buildings, their
 * forecourts, year pillars, plaques, signage, inland background buildings and town trees. When a
 * part is rendered here, claim its greybox key at module top level (WorldVisualClaims) so the
 * greybox visual and collider are skipped. Facts come only from `experiences` (src/lib/i18n.ts).
 */
export default memo(function WorldTown(_props: { experiences: WorldContent['experiences'] }) {
  return <group name="world-town" />;
});
