import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Builder, cbox } from '../../../src/components/world/WorldStreetGeometry.ts';
import { IBD_MATERIALS } from '../../../src/components/world/attractions/ibd-yard-palette.ts';
import { addIbdStockRack } from '../../../src/components/world/attractions/ibd-stock-craft.ts';
import { buildIbdStatic } from '../../../src/components/world/attractions/ibd-yard-geometry.ts';

const dir = resolve(process.argv[2]);
const expanded = process.argv[3] === 'expansion';
const rack = process.argv[3] === 'rack-v2';
const geometry = () => {
  if (rack) {
    const builder = new Builder();
    addIbdStockRack(builder, (at, size, surface, _solid, bevel) => cbox(builder, at, size, surface, bevel), 13, true);
    return builder.build();
  }
  return buildIbdStatic(expanded
    ? { shedExpansion: true, separateCraftShells: true }
    : { coilBaySample: true, separateCraftShells: true }).geometry;
};
const g = geometry();
const role = g.getAttribute('aIbdCladding');
const finishes = [
  ['pressed-wall', .66, .22], ['painted-roof', .59, .23], ['zinc-eave-and-flashing', .46, .68],
  ['painted-front-portals', .53, .24], ['roof-liner', .59, .32],
];
const rackMaterials = [
  ['rack-folded-zinc-shelves', .58, .29],
  ['rack-painted-beams-and-posts', .56, .13],
  ...[['rack-original-steel', IBD_MATERIALS.steel], ['rack-fasteners', IBD_MATERIALS.cutSteel],
    ['rack-amber-front-guards', IBD_MATERIALS.amber]].map(([name, material]) => [name, material.rough, material.metal]),
];
const groups = rack ? rackMaterials.map((finish, i) => [...finish, i + 1]) : expanded ? [
  ...['coil', 'parts', 'dispatch'].flatMap((shed, shedIndex) =>
    [...finishes, ['pressed-rear-wall', .66, .22]].flatMap(([name, roughness, metalness], i) =>
      shed === 'dispatch' && i === 5 ? [] : [[`${shed}-${name}`, roughness, metalness, i + 1 + 16 * shedIndex]])),
] : finishes.map((finish, i) => [...finish, i + 1]);
const parts = groups.map(([part, roughness, metalness, surfaceRole]) => {
  const sourceIndices = new Map(), index = [], position = [], normal = [], color = [];
  const matches = rack
      ? v => Math.abs(g.attributes.aMat.getX(v) - roughness) < 1e-5
        && Math.abs(g.attributes.aMat.getY(v) - metalness) < 1e-5
      : v => role.getX(v) === surfaceRole;
  for (let j = 0; j < g.index.count; j += 3) {
    const tri = [g.index.getX(j), g.index.getX(j + 1), g.index.getX(j + 2)];
    if (!tri.every(matches)) continue;
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
  if (!index.length) throw new Error(`Empty archive part ${part}`);
  return { part, roughness, metalness, role: surfaceRole, index, position, normal, color };
});
if (rack && parts.reduce((n, part) => n + part.index.length, 0) !== g.index.count) throw new Error('Incomplete rack archive');
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, rack ? 'ibd-rack-v2.source.json' : expanded ? 'ibd-expansion.source.json' : 'coil-bay.source.json'), JSON.stringify({ units: 'metres', up: 'Y', parts }) + '\n');
