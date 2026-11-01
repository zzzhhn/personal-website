/** Offline paving checks (terrain session). Bundle with esbuild, run with node. */
import { pavingField, pavingMesh, paveSample, markingsV4, crosswalksV4, sampleField, PAVE_STRIDE } from '../../../src/components/world/WorldTerrainPaving';
const F = pavingField();
const M = pavingMesh();
const tri = M.chunks.reduce((s, c) => s + c.v.length / PAVE_STRIDE / 3 + c.fv.length / PAVE_STRIDE / 3, 0);
const probe = (x: number, z: number) => ({ at: [x, z], D: +sampleField(F.D, x, z).toFixed(2), K: +sampleField(F.K, x, z).toFixed(2), s: paveSample(x, z) });
console.log(JSON.stringify({
  field: { nx: F.nx, nz: F.nz, ms: F.buildMs }, mesh: M.stats, triangles: Math.round(tri), chunks: M.chunks.map(c => [c.key, c.v.length / PAVE_STRIDE / 3, c.top.length / 3, c.walls.length / 3]),
  markings: markingsV4().length / 9, crosswalks: crosswalksV4().map(c => [c.junction, c.road, c.centre.map(v => +v.toFixed(1))]),
  probes: [probe(21, 0), probe(16.5, 6), probe(15.5, 6), probe(26, 2), probe(-4, 4.5), probe(14.5, 24), probe(-3, 33.5), probe(24, -43.5), probe(-30, -60), probe(-88, 0), probe(-82.5, 0)],
}, null, 0));
