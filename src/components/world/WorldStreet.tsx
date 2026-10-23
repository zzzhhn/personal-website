import { memo } from 'react';

/**
 * Street and global props mount point (owner: street session): lamps, year-agnostic street
 * furniture, rails, roadblocks, bins, benches, billboards, the windmill, foundations and signs,
 * plus trees outside the camp. Claim greybox keys at module top level for every part rendered here.
 */
export default memo(function WorldStreet() {
  return <group name="world-street" />;
});
