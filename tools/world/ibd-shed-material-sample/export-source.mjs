import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildIbdStatic } from '../../../src/components/world/attractions/ibd-yard-geometry.ts';

const dir = resolve(process.argv[2]);
const { geometry: g } = buildIbdStatic({ coilBaySample: true, separateCraftShells: true });
const role = g.getAttribute('aIbdCladding');
const parts = [
  ['pressed-wall', .66, .22], ['painted-roof', .59, .23], ['zinc-eave-and-flashing', .46, .68],
  ['painted-front-portals', .53, .24], ['roof-liner', .59, .32],
].map(([part, roughness, metalness], i) => {
  const sourceIndices = new Map(), index = [], position = [], normal = [], color = [];
  for (let j = 0; j < g.index.count; j += 3) {
    const tri = [g.index.getX(j), g.index.getX(j + 1), g.index.getX(j + 2)];
    if (!tri.every(v => role.getX(v) === i + 1)) continue;
    for (const v of tri) {
      if (!sourceIndices.has(v)) {
        sourceIndices.set(v, sourceIndices.size);
        for (const [attribute, out] of [['position', position], ['normal', normal], ['color', color]]) {
          const a = g.getAttribute(attribute);
          out.push(a.getX(v), a.getY(v), a.getZ(v));
        }
      }
      index.push(sourceIndices.get(v));
    }
  }
  return { part, roughness, metalness, role: i + 1, index, position, normal, color };
});
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, 'coil-bay.source.json'), JSON.stringify({ units: 'metres', up: 'Y', parts }) + '\n');
