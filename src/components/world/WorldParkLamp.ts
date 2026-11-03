import { BufferAttribute } from 'three';
import { FACILITY_SURFACE, FACILITY_WOOD_TILE, facilityCraftEnabled } from './WorldFacilitySurface';
import { lampGeometry } from './WorldStreetAssets.ts';
import { S, type Builder } from './WorldStreetGeometry.ts';

/** G10 / G11 / P04 share this actual generator. Park only adapts its vertex attributes/material. */
export const PARK_LAMP_OPTIONS = { height: 2.6, arm: 0, pole: S.woodMid, base: S.woodDark, cyanRing: false };
const high = lampGeometry({ ...PARK_LAMP_OPTIONS, lod: 0 });
const low = lampGeometry({ ...PARK_LAMP_OPTIONS, lod: 1 });
const lampCraft = facilityCraftEnabled() && (typeof window === 'undefined'
  || new URLSearchParams(window.location.search).get('parkLampCraft') !== 'baseline');

function parkAttributes(builder: Builder) {
  const source = builder.build();
  const g = source.toNonIndexed();
  source.dispose();
  const aMat = g.getAttribute('aMat'), emit = new Float32Array(aMat.count * 3);
  for (let i = 0; i < aMat.count; i++) if (Math.round(aMat.getZ(i)) === 1) {
    emit[i * 3] = .35; emit[i * 3 + 1] = 2.4; emit[i * 3 + 2] = 1;
  }
  g.setAttribute('aEmit', new BufferAttribute(emit, 3));
  if (!lampCraft) {
    g.deleteAttribute('aMat');
    g.deleteAttribute('aSuv');
    return g;
  }

  const position = g.getAttribute('position');
  const uv = g.getAttribute('aSuv');
  // Constant arc scale keeps the grain parallel as the shaft tapers.
  const wrap = 2 * Math.PI;
  const arcScale = Math.max(1, Math.round(wrap * .07 / FACILITY_WOOD_TILE[1])) / wrap;
  for (let i = 0; i < position.count; i += 3) {
    const vertex = builder.idx[i];
    const part = builder.parts.find(p => vertex >= p.start && (p.end < 0 || vertex < p.end))?.name;
    const roughness = aMat.getX(i);
    const pole = Math.abs(roughness - S.woodMid.rough) < .001;
    const dark = Math.abs(roughness - S.woodDark.rough) < .001;
    const lens = emit[i * 3 + 1] !== 0;
    // The far generator includes the post-top cap in its shaft range.
    const heights = [position.getY(i), position.getY(i + 1), position.getY(i + 2)];
    const shaft = part === 'shaft' && pole
      && Math.min(...heights) < PARK_LAMP_OPTIONS.height - 1e-5
      && Math.max(...heights) <= PARK_LAMP_OPTIONS.height + 1e-5;
    const coated = !lens && (part === 'head' || part === 'cap' || part === 'hatch' || dark || (pole && !shaft));
    const slot = shaft ? FACILITY_SURFACE.wood : coated ? FACILITY_SURFACE.paint : 0;

    const angles = shaft ? [i, i + 1, i + 2].map(j => Math.atan2(position.getZ(j), position.getX(j))) : [];
    const crossesSeam = shaft && Math.max(...angles) - Math.min(...angles) > Math.PI;
    for (let corner = 0; corner < 3; corner++) {
      const j = i + corner;
      aMat.setW(j, -slot);
      if (shaft) {
        const angle = angles[corner];
        uv.setXY(j, position.getY(j) / FACILITY_WOOD_TILE[0],
          (angle + (crossesSeam && angle < 0 ? wrap : 0)) * arcScale);
      }
    }
  }
  return g;
}
export const PARK_LAMP = {
  geometry: parkAttributes(high), far: parkAttributes(low),
  triangles: high.triangles, farTriangles: low.triangles,
  hulls: high.hulls(), parts: high.parts.map(p => ({ ...p })),
  spec: { mass: 45 },
};
