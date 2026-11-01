import { BufferAttribute, type BufferGeometry } from 'three';
import { lampGeometry } from './WorldStreetAssets.ts';
import { S } from './WorldStreetGeometry.ts';

/** G10 / G11 / P04 share this actual generator. Park only adapts its vertex attributes/material. */
export const PARK_LAMP_OPTIONS = { height: 2.6, arm: 0, pole: S.woodMid, base: S.woodDark, cyanRing: false };
const high = lampGeometry({ ...PARK_LAMP_OPTIONS, lod: 0 });
const low = lampGeometry({ ...PARK_LAMP_OPTIONS, lod: 1 });
function parkAttributes(source: BufferGeometry) {
  const g = source.index ? source.toNonIndexed() : source.clone(); source.dispose();
  const aMat = g.getAttribute('aMat'), emit = new Float32Array(aMat.count * 3);
  for (let i = 0; i < aMat.count; i++) if (Math.round(aMat.getZ(i)) === 1) {
    emit[i * 3] = .35; emit[i * 3 + 1] = 2.4; emit[i * 3 + 2] = 1;
  }
  g.setAttribute('aEmit', new BufferAttribute(emit, 3)); g.deleteAttribute('aMat'); g.deleteAttribute('aSuv');
  return g;
}
export const PARK_LAMP = {
  geometry: parkAttributes(high.build()), far: parkAttributes(low.build()),
  triangles: high.triangles, farTriangles: low.triangles,
  hulls: high.hulls(), parts: high.parts.map(p => ({ ...p })),
  spec: { mass: 45 },
};
