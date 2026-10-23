import { memo } from 'react';
import type { WorldContent } from './types';

/**
 * Park district mount point (owner: park session): bridge-end plaza, boardwalk, six huts, the six
 * one-press exhibits (PRD §3.3), project signs and the park sign. Facts come only from `projects`
 * (src/content/projects). Claim greybox keys at module top level for every part rendered here.
 */
export default memo(function WorldPark(_props: { projects: WorldContent['projects'] }) {
  return <group name="world-park" />;
});
