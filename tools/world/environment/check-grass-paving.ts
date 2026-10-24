/** No grass tuft or pebble candidate on (or within 0.15 m of) any paving. */
import { grassCandidates, scatterCandidates } from '../../../src/components/world/WorldLandform';
import { paveClearance } from '../../../src/components/world/WorldTerrainPaving';
const g = grassCandidates([]), s = scatterCandidates([]);
let gb = 0, pb = 0; const ex: number[][] = [];
for (let i = 0; i < g.length; i += 6) if (paveClearance(g[i], g[i + 2]) < .15) { gb++; if (ex.length < 5) ex.push([+g[i].toFixed(1), +g[i + 2].toFixed(1)]); }
for (let i = 0; i < s.pebbles.length; i += 5) if (paveClearance(s.pebbles[i], s.pebbles[i + 2]) < .15) pb++;
console.log(JSON.stringify({ grass: g.length / 6, grassOnPaving: gb, pebbles: s.pebbles.length / 5, pebblesOnPaving: pb, ex }));
