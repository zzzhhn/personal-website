import * as React from 'react';
import { loadWorldModule } from '../../street/runtime.mjs';

export function fixture(search = '') {
  const [A,R,C,G,L,Batch,rails] = loadWorldModule(['WorldStreetAssets.ts', 'WorldRailCraft.ts',
    'WorldStreetFacilityCraft.ts', 'WorldStreetGeometry.ts', 'layout-v4.ts', 'WorldStreetBatch.ts',
    'WorldStreetRails.tsx'], search, false, {react: {...React, useMemo: create => create()}});
  const [fixed, moving] = rails.default().props.children;
  const {kinds, placements} = fixed.props;
  const {beams} = moving.props;
  const timber = beams.filter(item => item.kind === 'beam').map(item => ({
    item, L0: R.craftTimberBeam(A.timberBeam(0,item.len),item.len,0),
    L1: R.craftTimberBeam(A.timberBeam(1,item.len),item.len,1),
  }));
  return {A,R,C,G,L,Batch,railLayout:rails.railLayout,actual:{kinds,placements,beams},timber};
}
