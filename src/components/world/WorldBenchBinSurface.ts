/** Bench/bin material group. Geometry, placement, collision and L1 stay frozen. */
import type { Builder } from './WorldStreetGeometry';
import { FACILITY_WOOD_TILE, facilityCraftEnabled } from './WorldFacilitySurface';

export const benchBinSurfacesEnabled = () => facilityCraftEnabled() && (typeof window === 'undefined'
  || new URLSearchParams(window.location.search).get('benchBin') !== 'baseline');

export function tagBenchBinSurfaces(builder: Builder, family: 'bench' | 'bin') {
  if (!benchBinSurfacesEnabled()) return;
  for (const part of builder.parts) {
    // The bin's recessed baffle must keep its dark matte cavity response.
    if (family === 'bin' && part.name === 'mouth.inner-baffle') continue;
    const end = part.end < 0 ? builder.pos.length / 3 : part.end;
    for (let i = part.start; i < end; i++) {
      const m = i * 4, p = i * 3, uv = i * 2;
      const rough = builder.mat[m], metal = builder.mat[m + 1];
      if (builder.mat[m + 3] > .5 || builder.mat[m + 2] > 0) continue;
      const wood = family === 'bench' && Math.abs(rough - .74) < .001 && metal === 0;
      const bare = (Math.abs(rough - .58) < .001 && Math.abs(metal - .3) < .001)
        || (Math.abs(rough - .64) < .001 && Math.abs(metal - .32) < .001);
      const slot = wood ? 1 : bare ? 3 : metal > .1 ? 2 : 0;
      if (!slot) continue;
      builder.mat[m + 3] = -slot;
      // Bench slats are fabricated along X, unlike the shelter's Z-long seat.
      // Face-based cross axis prevents collapsing a side or end face to a line.
      const endFace = Math.abs(builder.nrm[p]) > .8;
      const cross = Math.abs(builder.nrm[p + 1]) > Math.abs(builder.nrm[p + 2]) ? 2 : 1;
      builder.suv[uv] = builder.pos[p + (endFace ? 2 : 0)] / FACILITY_WOOD_TILE[0] + part.start * .013;
      builder.suv[uv + 1] = builder.pos[p + (endFace ? 1 : cross)] / FACILITY_WOOD_TILE[1];
    }
  }
}
