import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const out = resolve(root, 'docs/world/phase-2-playground/ibd-crate-craft-20261101');
const source = ['src/components/world/WorldStreetGeometry.ts', ...['ibd-pack-geometry.ts',
  'ibd-yard-geometry.ts', 'ibd-stock-craft.ts', 'ibd-pack-layout.ts', 'ibd-yard-palette.ts',
  'WorldIbdMechanisms.tsx'].map(f => `src/components/world/attractions/${f}`)];
const hash = s => createHash('sha256').update(s).digest('hex');
mkdirSync(out, { recursive: true });
const hashes = {};
for (const f of source) {
  const frozen = resolve(here, `baseline-${basename(f)}`);
  if (!existsSync(frozen)) writeFileSync(frozen, execFileSync('git', ['show', `34754d2:${f}`], { cwd: root }));
  hashes[f] = hash(readFileSync(frozen));
}
const shell = readFileSync(resolve(here, 'baseline-ibd-pack-geometry.ts'), 'utf8');
const yard = readFileSync(resolve(here, 'baseline-ibd-yard-geometry.ts'), 'utf8');
const lid = yard.match(/export function buildIbdLid\(\) \{[\s\S]*?\n\}/)?.[0];
if (!lid) throw new Error('Actual lid function not found');
const tmp = resolve(here, '.baseline-capture.mjs');
await build({ stdin: { contents: `${shell}\n${lid}`, resolveDir: here, loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', outfile: tmp, packages: 'external', logLevel: 'silent',
  plugins: [{ name: 'frozen', setup(b) {
    b.onResolve({ filter: /WorldStreetGeometry\.ts$|ibd-yard-palette\.ts$|ibd-pack-layout\.ts$|ibd-stock-craft\.ts$/ }, args =>
      ({ path: resolve(here, `baseline-${basename(args.path)}`) }));
  } }] });
try {
  const mod = await import(tmp);
  const geometries = { Shell: mod.buildIbdPackShell(), Lid: mod.buildIbdLid() };
  const meshes = {};
  for (const [name, g] of Object.entries(geometries)) {
    g.computeBoundingBox();
    meshes[name] = { positions: Array.from(g.attributes.position.array), normals: Array.from(g.attributes.normal.array),
      colorsLinear: Array.from(g.attributes.color.array), aMat: Array.from(g.attributes.aMat.array),
      indices: Array.from(g.index.array), bounds: { min: g.boundingBox.min.toArray(), max: g.boundingBox.max.toArray() },
      triangles: g.index.count / 3 };
    g.dispose();
  }
  const metadata = { commit: '34754d2', sourceHashes: hashes,
    note: 'Actual unmodified production builder output, captured offline. Not a browser screenshot.',
    axes: 'Three Y-up metres; front +Z; both exported roots identity. Lid parent pivot belongs to runtime.',
    lidRuntimePivot: [0, 1.08, -1.25], lidRuntimeRotationXClosedOpen: [0, -2], meshes };
  writeFileSync(resolve(out, 'baseline-captured.json'), JSON.stringify(metadata));
  writeFileSync(resolve(here, 'baseline-source-hashes.json'), JSON.stringify({ commit: '34754d2', sha256: hashes }, null, 2));
  console.log(JSON.stringify(Object.fromEntries(Object.entries(meshes).map(([n, m]) => [n, { bounds: m.bounds, triangles: m.triangles }]))));
} finally { unlinkSync(tmp); }
