/** Street props runtime-geometry QA: rebuilds every procedural asset exactly as the runtime does and
 * reports triangles (L0 / L1), LOD ratio, bounds, degenerate triangles and open edges.
 * Run: node --experimental-strip-types tools/world/street/qa-runtime.mjs [out.json] */
import { writeFileSync } from 'node:fs';
import * as A from '../../../src/components/world/WorldStreetAssets.ts';
import { shellStats } from '../../../src/components/world/WorldStreetGeometry.ts';
const cell = [0, 0, .1, .1];
const assets = {
  lamp: A.lamp(), signal: A.signal(), bin: A.bin(), delineator: A.delineator(),
  stop: { L0: A.stopGeometry(0, cell), L1: A.stopGeometry(1, cell) },
  direction: { L0: A.directionGeometry(0, cell), L1: A.directionGeometry(1, cell) },
  chevron: { L0: A.chevronGeometry(0, cell), L1: A.chevronGeometry(1, cell) },
  ...(A.extraAssets2 ? A.extraAssets2() : A.extraAssets ? A.extraAssets() : {}),
};
const rows = {};
for (const [id, { L0, L1 }] of Object.entries(assets)) {
  const s0 = shellStats(L0.build()), s1 = shellStats(L1.build()), budget = A.BUDGET[id] ?? null;
  rows[id] = { L0: s0.triangles, L1: s1.triangles, ratio: +(s1.triangles / s0.triangles).toFixed(3), budget, overBudget: budget ? s0.triangles > budget[0] || s1.triangles > budget[1] : null,
    degenerate: s0.degenerate, openEdges: s0.openEdges, nonManifold: s0.nonManifoldEdges, hulls: L0.hulls().length,
    bounds: s0.bounds.map(v => v.map(x => +x.toFixed(3))), minY: +s0.bounds[0][1].toFixed(4) };
}
console.table(Object.fromEntries(Object.entries(rows).map(([k, r]) => [k, { L0: r.L0, L1: r.L1, ratio: r.ratio, budget: r.budget?.join('/'), over: r.overBudget, degen: r.degenerate, open: r.openEdges, hulls: r.hulls, minY: r.minY, size: r.bounds[1].map((v, i) => +(v - r.bounds[0][i]).toFixed(2)).join('x') }])));
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(rows, null, 2));
