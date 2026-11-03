// Use the same triangles, normals and linear color attributes consumed in the game.
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { buildDjcClubGeometry } from '../../../src/components/world/WorldDjcClubGeometry.ts';

const out = resolve(process.argv[2]);
const families = {
  pavilion: { origin: [38, 0, 55], meshes: [] },
  basin: { origin: [68, 0, 55], meshes: [] },
};
const roughness = { fabric: .94, wood: .85, stone: .95 };
const ranges = [];
globalThis.window = { location: { search: '?djcBasin=candidate' } };
const club = buildDjcClubGeometry({ recordAssembly: (family, part, range) => ranges.push({ family, part, range }) });
delete globalThis.window;
for (const { family, part, range } of ranges) {
  const asset = families[family];
  for (const [batch, [start, end]] of Object.entries(range)) {
    const g = club.batches[batch];
    const slice = key => Array.from(g.getAttribute(key).array.slice(start * 3, end * 3));
    const position = slice('position').map((v, i) => v - asset.origin[i % 3]);
    asset.meshes.push({ part, batch, roughness: roughness[batch], position, normal: slice('normal'), color: slice('color'), finish: slice('aDjcFinish') });
  }
}
mkdirSync(out, { recursive: true });
for (const [name, asset] of Object.entries(families)) {
  if (!asset.meshes.length) throw new Error('No runtime assembly for ' + name);
  writeFileSync(resolve(out, name + '.source.json.gz'), gzipSync(JSON.stringify(asset)));
}
