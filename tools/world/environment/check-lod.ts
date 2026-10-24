/** Terrain render LOD: triangle count per camera focus and crack test (boundary edges of the LOD mesh
 * must equal the boundary edges of the full mesh: any extra open edge is a T-junction crack). */
import { buildTerrain } from '../../../src/components/world/WorldLandform';
import { buildLodTiles, lodIndices } from '../../../src/components/world/WorldTerrainLod';
import { chunkKey } from '../../../src/components/world/WorldTerrainPaving';
const t = buildTerrain(), t0 = performance.now(), tiles = buildLodTiles(chunkKey), t1 = performance.now();
const open = (arrs: Uint32Array[]) => {
  const m = new Map<string, number>();
  for (const a of arrs) for (let i = 0; i < a.length; i += 3) for (const [p, q] of [[a[i], a[i + 1]], [a[i + 1], a[i + 2]], [a[i + 2], a[i]]]) {
    const k = p < q ? p + ',' + q : q + ',' + p; m.set(k, (m.get(k) ?? 0) + 1);
  }
  const s = new Set<string>(); for (const [k, n] of m) if (n === 1) s.add(k); return s;
};
const base = open([t.indices]);
const views: Record<string, [number, number]> = { camp: [-42, 30], campExit: [-8, 30], avenue: [17, 8], j3: [15, -36], hill: [-40, -62], south: [-30, 84], west: [-96, 4], centre: [-30, -10] };
const out: Record<string, unknown> = { fullTriangles: t.indices.length / 3, tiles: tiles.length, buildMs: Math.round(t1 - t0) };
for (const [name, [x, z]] of Object.entries(views)) {
  const L = lodIndices(tiles, x, z), e = open([...L.chunks.values()]);
  let extra = 0; for (const k of e) if (!base.has(k)) extra++;
  out[name] = { tri: L.triangles, fineTiles: L.fineTiles, chunks: L.chunks.size, crackEdges: extra };
}
console.log(JSON.stringify(out));
