import { memo } from 'react';

/**
 * Camp content mount point (owner: camp session): C11-C16 objects on the camp pads, camp exit
 * lamps, and the camp interactables (tent, desk, trophy shelf, flags, tool wall). Claim
 * 'camp-placeholder' / 'camp-lamps' at module top level once the replacements render here.
 */
export default memo(function WorldCampContent() {
  return <group name="world-camp-content" />;
});
