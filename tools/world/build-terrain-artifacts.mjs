import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { snapshotInputs } from './world-map-snapshot.mjs';

const script = fileURLToPath(import.meta.url), root = fileURLToPath(new URL('../../', import.meta.url));
const manifestFile = path.join(root, 'src/components/world/terrain-artifacts.generated.json');
const run = promisify(execFile);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function atomic(file, bytes) { await writeFile(`${file}.tmp`, bytes); await rename(`${file}.tmp`, file); }

export async function ensureTerrainArtifacts({ check = false } = {}) {
  const inputs = snapshotInputs(['alpha-island/batch2/cave-art.ts']);
  const sourceHash = sha(inputs.sourceHash + await readFile(script, 'utf8'));
  let previous;
  try { previous = JSON.parse(await readFile(manifestFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  let valid = previous?.sourceHash === sourceHash;
  if (valid) for (const variant of ['v4', 'v3', 'alpha', 'cave']) {
    const entry = previous[variant];
    try {
      const bytes = await readFile(path.join(root, 'public', entry.url));
      if (bytes.length !== entry.bytes || sha(bytes) !== entry.sha256 || gunzipSync(bytes).length !== entry.rawBytes) valid = false;
    } catch { valid = false; }
  }
  if (valid) return { sources: [...inputs.sources, script], changed: false };
  if (check) throw new Error('Stale or missing terrain artifacts: run node tools/world/build-terrain-artifacts.mjs');
  const manifest = { version: 1, sourceHash };
  await mkdir(path.join(root, 'public/assets/world/terrain'), { recursive: true });
  for (const variant of ['v4', 'v3', 'alpha', 'cave']) {
    const { stdout } = await run(process.execPath, [script, `--variant=${variant}`], { cwd: root, maxBuffer: 8192 });
    manifest[variant] = JSON.parse(stdout);
  }
  await atomic(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  return { sources: [...inputs.sources, script], changed: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === script) {
  const variant = process.argv.find(a => a.startsWith('--variant='))?.split('=')[1];
  if (variant) {
    if (!['v3', 'v4', 'alpha', 'cave'].includes(variant)) throw new Error('Unknown terrain variant');
    globalThis.window = { location: { search: `?layout=${variant}` } };
    const { register } = await import('node:module');
    register('./alpha-mine-tests/loader.mjs', import.meta.url);
    let raw;
    if (variant === 'cave') {
      const { createCaveArt } = await import('../../src/components/world/alpha-island/batch2/cave-art.ts');
      const { encodeCaveArtifact, decodeCaveArtifact, CAVE_PART_GROUPS } = await import('../../src/components/world/alpha-island/batch2/cave-artifact.ts');
      const art = createCaveArt(); raw = encodeCaveArtifact(art);
      const decoded = decodeCaveArtifact(raw);
      for (const a of [art, decoded]) for (const key of CAVE_PART_GROUPS) a[key].forEach(p => p.geometry.dispose());
    } else if (variant === 'alpha') {
      const { alphaTerrainData } = await import('../../src/components/world/alpha-island/alpha-terrain.ts');
      const { encodeAlphaTerrain, decodeAlphaTerrain } = await import('../../src/components/world/alpha-island/alpha-terrain-artifact.ts');
      raw = encodeAlphaTerrain(alphaTerrainData());
      decodeAlphaTerrain(raw);
    } else {
      const { buildTerrain, GRID, CELL } = await import('../../src/components/world/WorldLandform.ts');
      const { encodeTerrainArtifact, decodeTerrainArtifact } = await import('../../src/components/world/terrain-artifact.ts');
      raw = encodeTerrainArtifact({ terrain: buildTerrain(), grid: GRID, cell: CELL, variant });
      decodeTerrainArtifact(raw, variant);
    }
    const bytes = gzipSync(new Uint8Array(raw), { level: 9 });
    const url = `/assets/world/terrain/${['alpha', 'cave'].includes(variant) ? variant : 'mainland-' + variant}.bin.gz`;
    await atomic(path.join(root, 'public', url), bytes);
    process.stdout.write(JSON.stringify({ url, bytes: bytes.length, rawBytes: raw.byteLength, sha256: sha(bytes) }));
  } else {
    const { sources, changed } = await ensureTerrainArtifacts({ check: process.argv.includes('--check') });
    console.log(JSON.stringify({ sources: sources.length, changed }));
  }
}
