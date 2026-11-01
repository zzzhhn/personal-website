import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const tools = dirname(fileURLToPath(import.meta.url));
const repo = resolve(tools, '../../..');
const output = resolve(repo, 'docs/world/phase-2-playground/djc-daybed-craft-20261101');
mkdirSync(output, { recursive: true });
const original = readFileSync(resolve(tools, 'baseline-WorldDjcClubGeometry.ts'), 'utf8');
let injected = original.replace('export function buildDjcClubGeometry(', 'export const __daybedCapture: any[] = [];\nlet __captureDaybed = false;\nexport function buildDjcClubGeometry(');
const add = 'const add = (kind: ClubBatch, g: BufferGeometry, color: string, wind = 0) => batches[kind].add(g, color, wind);';
if (!injected.includes(add)) throw new Error('Frozen add function differs from expected capture site');
injected = injected.replace(add, `const add = (kind: ClubBatch, g: BufferGeometry, color: string, wind = 0) => {
  if (__captureDaybed) {
    const mesh = g.index ? g.toNonIndexed() : g;
    __daybedCapture.push({kind, color, positions: Array.from(mesh.getAttribute('position').array), normals: Array.from(mesh.getAttribute('normal').array)});
    if (mesh !== g) mesh.dispose();
  }
  batches[kind].add(g, color, wind);
};`);
const start = '// The timber rim occupies the old stone envelope, leaving access and leg lanes unchanged.';
const end = "box('wood',[tx,2.17,tz],[.24,.045,.24],C.edge);";
if (!injected.includes(start) || !injected.includes(end)) throw new Error('Frozen daybed markers absent');
injected = injected.replace(start, `__captureDaybed = x === 62 && z === 42;\n    ${start}`);
injected = injected.replace(end, `${end}\n    __captureDaybed = false;`);
const tmp = resolve(tools, '.captured-baseline.mjs');
await build({ stdin: { contents: injected, resolveDir: resolve(repo, 'src/components/world'), sourcefile: 'Frozen-WorldDjcClubGeometry.ts', loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', outfile: tmp, packages: 'external', logLevel: 'silent',
  plugins: [{ name: 'frozen-layout', setup(b) { b.onResolve({ filter: /^\.\/djc-club-layout$/ }, () => ({ path: resolve(tools, 'baseline-djc-club-layout.ts') })); } }] });
const mod = await import(tmp);
const built = mod.buildDjcClubGeometry();
const pieces = mod.__daybedCapture;
if (pieces.length !== 24) throw new Error('Frozen first daybed should contain 24 captured source pieces');
const all = pieces.flatMap(p => p.positions);
const bounds = [0, 1, 2].map(axis => { let min = Infinity, max = -Infinity; for (let i = axis; i < all.length; i += 3) { min = Math.min(min, all[i]); max = Math.max(max, all[i]); } return [min, max]; });
if (bounds[0][0] < 60.349 || bounds[0][1] > 63.651 || bounds[2][0] < 40.349 || bounds[2][1] > 43.651) throw new Error('Capture includes geometry beyond first daybed');
const hashes = JSON.parse(readFileSync(resolve(tools, 'baseline-source-hashes.json'), 'utf8'));
if (createHash('sha256').update(original).digest('hex') !== hashes['WorldDjcClubGeometry.ts']) throw new Error('Frozen source hash differs');
const result = { description: 'Actual first daybed geometry, captured from frozen current release source in memory; no hand reconstruction, no ramp or other world geometry.',
  originWorld: [62, 1.5, 42], blenderTransform: '(x-62,42-z,y-1.5)', sourceHashes: hashes,
  pieces, boundsWorldAxes: bounds, triangles: all.length / 9 };
writeFileSync(resolve(output, 'baseline-captured.json'), JSON.stringify(result));
Object.values(built.batches).forEach(g => g.dispose());
unlinkSync(tmp);
console.log(JSON.stringify({ pieces: pieces.length, triangles: result.triangles, bounds }));
