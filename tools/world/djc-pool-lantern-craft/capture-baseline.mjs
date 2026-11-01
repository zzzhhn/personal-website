import { build } from 'esbuild';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const tools = dirname(fileURLToPath(import.meta.url));
const repo = resolve(tools, '../../..');
const output = resolve(repo, 'docs/world/phase-2-playground/djc-pool-lantern-craft-20261101');
const original = readFileSync(resolve(tools, 'baseline-WorldDjcClubGeometry.ts'), 'utf8');
const hashes = JSON.parse(readFileSync(resolve(tools, 'baseline-source-hashes.json'), 'utf8'));
for (const [name, hash] of Object.entries(hashes.sha256)) {
  if (createHash('sha256').update(readFileSync(resolve(tools, `baseline-${name}`))).digest('hex') !== hash) throw new Error(`Frozen hash mismatch ${name}`);
}
let injected = original.replace('export function buildDjcClubGeometry(', 'export const __lanternCapture: any[] = [];\nlet __captureLantern = false;\nexport function buildDjcClubGeometry(');
const add = /const add = \(kind: ClubBatch, g: BufferGeometry, color: string, wind = 0\) => (.*)\.add\(g, color, wind\);/;
if (!add.test(injected)) throw new Error('Frozen add function differs');
injected = injected.replace(add, (_, destination) => `const add = (kind: ClubBatch, g: BufferGeometry, color: string, wind = 0) => {
  if (__captureLantern) {
    const mesh = g.index ? g.toNonIndexed() : g;
    __lanternCapture.push({kind, color, positions: Array.from(mesh.getAttribute('position').array), normals: Array.from(mesh.getAttribute('normal').array)});
    if (mesh !== g) mesh.dispose();
  }
  ${destination}.add(g, color, wind);
};`);
const start = "const [x,z]=CLUB_POOL.boundary(a,2.25);";
const end = "box('wood',[x,2.14,z],[.31,.06,.31],C.edge);";
if (injected.split(start).length !== 2 || injected.split(end).length !== 2) throw new Error('Lantern markers ambiguous');
injected = injected.replace(start, `${start}\n    __captureLantern = i === 0;`);
injected = injected.replace(end, `${end}\n    __captureLantern = false;`);
const tmp = resolve(tools, '.captured-baseline.mjs');
await build({ stdin: { contents: injected, resolveDir: resolve(repo, 'src/components/world'), sourcefile: 'Frozen-WorldDjcClubGeometry.ts', loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', outfile: tmp, packages: 'external', logLevel: 'silent',
  plugins: [{ name: 'frozen-layout', setup(b) { b.onResolve({ filter: /^\.\/djc-club-layout$/ }, () => ({ path: resolve(tools, 'baseline-djc-club-layout.ts') })); } }] });
try {
  const mod = await import(tmp);
  const built = mod.buildDjcClubGeometry();
  const pieces = mod.__lanternCapture;
  if (pieces.length !== 7) throw new Error(`Expected 7 actual pieces, got ${pieces.length}`);
  const a = .15, s = 1 + .07 * Math.sin(3*a+.4) + .045*Math.cos(5*a-.5);
  const origin = [68+(17*s+2.25)*Math.cos(a), 1.4, 55+(23*s+2.25)*Math.sin(a)];
  const all = pieces.flatMap(p => p.positions);
  const bounds = [0,1,2].map(axis => { let lo=Infinity,hi=-Infinity; for(let i=axis;i<all.length;i+=3){lo=Math.min(lo,all[i]);hi=Math.max(hi,all[i]);} return [lo,hi]; });
  const dims = bounds.map(([lo,hi])=>hi-lo);
  if (dims.some((d,i)=>Math.abs(d-[.31,.77,.31][i])>1e-5)) throw new Error(`Unexpected actual bounds ${dims}`);
  const placements=[];
  for(let i=0;i<12;i++) { const a=i*Math.PI*2/12+.15; if(Math.abs(Math.cos(a))<.2)continue; const s=1+.07*Math.sin(3*a+.4)+.045*Math.cos(5*a-.5); placements.push({index:i,position:[68+(17*s+2.25)*Math.cos(a),1.4,55+(23*s+2.25)*Math.sin(a)],yaw:0}); }
  const result={ description:'Actual first pool lantern captured from frozen production source in memory, including its unmodified BoxGeometry and CylinderGeometry. Before render is a controlled offline render of actual source geometry, not a production screenshot.', source:hashes, originWorld:origin, blenderTransform:'(x-originX, originZ-z, y-1.4)', pieces, boundsWorldAxes:bounds, dimensionsYUp:dims, triangles:all.length/9, placements, collisionContract:{baseCenterLocalY:.2,baseSize:[.3,.4,.3],owner:'Existing world solid triangles, must remain unchanged during runtime visual replacement.'} };
  writeFileSync(resolve(output,'baseline-captured.json'),JSON.stringify(result));
  Object.values(built.batches).forEach(g=>g.dispose());
  console.log(JSON.stringify({pieces:pieces.length,triangles:result.triangles,dimensions:dims,instances:placements.length}));
} finally { unlinkSync(tmp); }
