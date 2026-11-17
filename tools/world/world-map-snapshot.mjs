import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const run = promisify(execFile);
const script = fileURLToPath(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));
const world = path.join(root, 'src/components/world');
const roots = ['WorldLandform.ts', 'layout.ts', 'layout-v4.ts', 'alpha-mine-layout.ts', 'alpha-exchange-layout.ts', 'djc-club-layout.ts', 'factory/factory-layout.ts', 'attractions/attraction-layout.ts', 'attractions/coaster-track.ts', 'alpha-island/alpha-terrain.ts', 'alpha-island/alpha-visitor-path.ts', 'alpha-island/alpha-batch2-layout.ts', 'world-destinations.ts'];

/** Fingerprint the complete local source graph, so a terrain helper edit cannot leave an old map. */
export function snapshotInputs(extraRoots = []) {
  const files = new Set([script]);
  function visit(file) {
    if (files.has(file)) return;
    files.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\b(?:from|import)\s*(?:\(\s*)?['"](\.[^'"]+)['"]/g)) {
      const base = path.resolve(path.dirname(file), match[1]);
      const dependency = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find(candidate => existsSync(candidate));
      if (!dependency) throw new Error(`Cannot resolve map source ${match[1]} from ${file}`);
      visit(dependency);
    }
  }
  [...roots, ...extraRoots].forEach(file => visit(path.join(world, file)));
  const sources = [...files].sort();
  const hash = createHash('sha256');
  for (const file of sources) hash.update(path.relative(root, file)).update('\0').update(readFileSync(file)).update('\0');
  return { sources, sourceHash: hash.digest('hex') };
}

async function variantGeometry(variant) {
  // Query-dependent layout modules must be evaluated in separate processes, exactly as in the app.
  globalThis.window = { location: { search: `?layout=${variant}` } };
  const { register } = await import('node:module');
  register('./alpha-mine-tests/loader.mjs', import.meta.url);
  const load = name => import(new URL(`../../src/components/world/${name}.ts`, import.meta.url));
  const [terrain, layout, v4, mine, exchange, club, factory, attractions, track, alpha, alphaLayout, visitor, batch2, destinations] = await Promise.all([
    load('WorldLandform'), load('layout'), load('layout-v4'), load('alpha-mine-layout'), load('alpha-exchange-layout'), load('djc-club-layout'), load('factory/factory-layout'), load('attractions/attraction-layout'), load('attractions/coaster-track'), load('alpha-island/alpha-terrain'), load('alpha-island/alpha-layout'), load('alpha-island/alpha-visitor-path'), load('alpha-island/alpha-batch2-layout'), load('world-destinations'),
  ]);
  const shores = [...terrain.islandShorelines(), alpha.alphaShoreline()];
  const camp = Array.from({ length: 72 }, (_, i) => {
    const a = i / 72 * Math.PI * 2, r = terrain.campRadius(a) * .7;
    return [layout.CAMP_CENTER[0] + Math.cos(a) * r, layout.CAMP_CENTER[2] + Math.sin(a) * r];
  });
  const roads = layout.LAYOUT_V4 ? [...v4.ROADS_V4, ...v4.CONNECTORS_V4].map(r => ({
    pts: r.pts, width: r.cls === 'foot' ? 2 : r.cls === 'dirt' ? 3 : v4.paveHalf(r.cls) * .9,
    color: r.cls === 'dirt' ? '#B08A5E' : r.cls === 'foot' ? '#C9A978' : r.cls === 'avenue' ? '#F3EBDD' : '#D9D2C2',
    ...(r.cls === 'dirt' ? { dash: '3 2' } : {}),
  })).sort((a, b) => b.width - a.width) : undefined;
  const landmarks = layout.LAYOUT_V4 ? v4.LANDMARKS_V4.map(l => ({ id: l.id, p: [l.p[0], l.p[1]], label: l.label })) : [];
  const coaster = track.coasterCurve.getSpacedPoints(140).map(p => [p.x, p.z]);
  const points = [
    ...shores.flat(), ...camp, ...coaster, ...(roads?.flatMap(r => r.pts) ?? []),
    ...layout.ROAD_POINTS, ...layout.BOARDWALK_POINTS, ...mine.ALPHA_MINE_FOOTPRINT_POINTS, ...mine.ALPHA_MINE_CONNECTOR,
    ...factory.FACTORY_FOOTPRINT, ...exchange.ALPHA_EXCHANGE_APPROACH, ...club.CLUB_APPROACH, ...club.CLUB_WALKWAYS.flat(), ...club.CLUB_POOL.outline,
    ...attractions.ATTRACTIONS_CAPE, ...attractions.INTENT_COASTER_FOOTPRINT, ...attractions.IBD_FOOTPRINT,
    ...alphaLayout.ALPHA_MAINLAND_PIER_POLYGON, ...alphaLayout.ALPHA_MAINLAND_APPROACH, ...visitor.ALPHA_VISITOR_PATH, ...visitor.ALPHA_VISITOR_SPURS.flatMap(s => s.path),
    ...batch2.ALPHA_BATCH2_PATHS.flatMap(p => p.map(alphaLayout.alphaWorld)),
    ...layout.BUILDINGS.map(b => b.position), ...layout.BOOTHS.map(b => b.position), ...landmarks.map(l => l.p), destinations.FERRY_MAP_MARK,
    [mine.ALPHA_MINE_ORIGIN[0], mine.ALPHA_MINE_ORIGIN[2] - 26],
  ].map(p => [p[0], p.length === 3 ? p[2] : p[1]]);
  const xs = points.map(p => p[0]), zs = points.map(p => p[1]);
  const x = Math.min(...xs) - 12, z = Math.min(...zs) - 12;
  // Millimetre precision preserves terrain holes/waterlines without shipping full float strings.
  return JSON.parse(JSON.stringify({ shores, camp, roads, landmarks, coaster, viewBox: [x, z, Math.max(...xs) - x + 12, Math.max(...zs) - z + 12] }, (_, value) => typeof value === 'number' ? Math.round(value * 1000) / 1000 : value));
}

export async function ensureMapSnapshots({ check = false } = {}) {
  const inputs = snapshotInputs();
  let changed = false;
  for (const variant of ['v4', 'v3']) {
    const file = path.join(world, `world-map-${variant}.generated.json`);
    let previous;
    try { previous = JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (previous?.sourceHash === inputs.sourceHash) continue;
    if (check) throw new Error(`Stale map snapshot: run node tools/world/world-map-snapshot.mjs (${variant})`);
    const { stdout } = await run(process.execPath, [script, `--variant=${variant}`], { cwd: root, maxBuffer: 4 * 1024 * 1024 });
    await writeFile(`${file}.tmp`, JSON.stringify({ sourceHash: inputs.sourceHash, ...JSON.parse(stdout) }) + '\n');
    await rename(`${file}.tmp`, file);
    changed = true;
  }
  return { ...inputs, changed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === script) {
  const variant = process.argv.find(arg => arg.startsWith('--variant='))?.split('=')[1];
  if (variant) process.stdout.write(JSON.stringify(await variantGeometry(variant)));
  else {
    const { sources, changed, sourceHash } = await ensureMapSnapshots({ check: process.argv.includes('--check') });
    console.log(JSON.stringify({ sources: sources.length, changed, sourceHash }));
  }
}
