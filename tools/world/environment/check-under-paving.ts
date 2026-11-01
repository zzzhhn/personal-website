/** Terrain never pokes through any paved top (field paving, frozen ramp / bridge decks, forecourts,
 * windmill pad), sampled on a 0.25 m grid; and the grid border is open water (no truncated land). */
import { paveSample, pavingField } from '../../../src/components/world/WorldTerrainPaving';
import { meshHeight, GRID, CELL } from '../../../src/components/world/WorldLandform';
const F = pavingField(); const bad: number[][] = []; let n = 0;
for (let z = F.minZ; z < F.minZ + F.nz * F.cell; z += .25) for (let x = F.minX; x < F.minX + F.nx * F.cell; x += .25) {
  const p = paveSample(x, z); if (!p || p.kind === 'deck') continue;
  const h = meshHeight(x, z); if (h === null) continue; n++;
  if (h > p.y - .008) bad.push([+x.toFixed(2), +z.toFixed(2), +(h - p.y).toFixed(3), p.kind as unknown as number]);
}
let border = -Infinity, at: number[] = [];
const W = GRID.nx * CELL, H = GRID.nz * CELL;
for (let t = 0; t <= 1; t += .002) for (const [x, z] of [[GRID.minX + t * W, GRID.minZ + .3], [GRID.minX + t * W, GRID.minZ + H - .3], [GRID.minX + .3, GRID.minZ + t * H], [GRID.minX + W - .3, GRID.minZ + t * H]]) {
  const h = meshHeight(x, z); if (h !== null && h > border) { border = h; at = [x, z]; }
}
console.log(JSON.stringify({ samples: n, poke: bad.length, worst: bad.sort((a, b) => b[2] - a[2]).slice(0, 10), gridBorderMaxY: +border.toFixed(2), at }));
