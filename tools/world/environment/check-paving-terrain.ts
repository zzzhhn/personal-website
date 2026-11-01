/** Paving vs terrain seams: chamfer foot vs terrain (floating / buried) and terrain poking through tops. */
import { pavingMesh, PAVE_STRIDE, PAVE_MODE } from '../../../src/components/world/WorldTerrainPaving';
import { meshHeight, buildTerrain } from '../../../src/components/world/WorldLandform';
const t0 = performance.now(); buildTerrain(); const t1 = performance.now();
const M = pavingMesh();
let float: number[][] = [], poke: number[][] = [];
for (const c of M.chunks) {
  const v = c.v;
  for (let i = 0; i < v.length; i += PAVE_STRIDE) {
    const x = v[i], y = v[i + 1], z = v[i + 2], mode = v[i + 6];
    if (mode >= PAVE_MODE.deckAsphalt) continue;
    const h = meshHeight(x, z); if (h === null) continue;
    const foot = mode === PAVE_MODE.edge && y < 1.12 && v[i + 4] > .5;
    if (!foot && mode !== PAVE_MODE.edge && h > y - .01) poke.push([+x.toFixed(1), +z.toFixed(1), +(h - y).toFixed(3), mode]);
    if (foot && h < y - .04) float.push([+x.toFixed(1), +z.toFixed(1), +(y - h).toFixed(3)]);
    if (foot && h > y + .06) poke.push([+x.toFixed(1), +z.toFixed(1), +(h - y).toFixed(3), 99]);
  }
}
const top = (a: number[][], k: number) => [...a].sort((p, q) => q[2] - p[2]).slice(0, k);
console.log(JSON.stringify({ terrainMs: Math.round(t1 - t0), poke: poke.length, pokeTop: top(poke, 12), float: float.length, floatTop: top(float, 12) }));
