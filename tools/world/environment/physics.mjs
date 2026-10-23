/** Runtime physics checks on the QA entry (observation): terrain raycasts vs meshHeight,
 * surface/solid split from physicsInventory, water recovery to land, slope walking with real keys.
 * Usage: WORLD_BASE_URL=http://127.0.0.1:4322 node tools/world/environment/physics.mjs outDir */
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { Bot, comboFor, loadPlaywright, CHROME, openWorld, ensureDir } from '../playtest/lib.mjs';
const out = await ensureDir(process.argv[2] || 'docs/world/quality-v3/environment/physics');
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4322';
const probes = JSON.parse(await readFile(new URL('./probes.json', import.meta.url), 'utf8'));
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const report = { startedAt: new Date().toISOString(), base, checks: [], fixtures: [], errors: [] };
const check = (name, pass, value, limit) => report.checks.push({ name, pass, value, limit });
try {
  const { page, errors } = await openWorld(browser, base + '/world?qa=1', { width: 1280, height: 800 });
  const bot = new Bot(page);
  // 1. Collider inventory: terrain surface/solid trimeshes exist; no camp cylinder / island slab.
  const inv = await page.evaluate(() => __worldDebug.physicsInventory());
  const names = inv.map(c => c.visualRef || c.name || '');
  const terrain = inv.filter(c => /island-terrain/.test(JSON.stringify(c)));
  check('terrain colliders present (surface + solid trimesh)', terrain.length >= 2 && terrain.every(c => c.shape === 'trimesh'), terrain.map(c => ({ kind: c.kind, shape: c.shape, aabb: c.aabb })), '2 trimesh');
  check('old camp cylinder / island slab removed', !inv.some(c => c.shape === 'cylinder') && !names.some(n => /island-ground-surface/.test(n)), inv.filter(c => c.shape === 'cylinder').length, '0');
  const park = inv.filter(c => /park-plaza/.test(JSON.stringify(c)));
  check('park plaza: surface top + solid sides', park.some(c => c.kind === 'surface') && park.some(c => c.kind === 'solid') && park.every(c => c.shape === 'trimesh'), park.map(c => ({ kind: c.kind, shape: c.shape })), 'surface top, solid sides');
  // 2. Physics ground vs rendered mesh height (capsule cast straight down from 8 m above).
  const diffs = [];
  for (const [x, z, h] of probes.points) {
    const r = await page.evaluate(([x, z]) => __worldDebug.castPlayer([x, 14, z], [x, -12, z]), [x, z]);
    if (!r.hit) { diffs.push({ x, z, mesh: h, physics: null }); continue; }
    const centre = 14 + (-26) * r.toi, ground = centre - 0.82; // capsule bottom = centre - (0.48 + 0.34)
    diffs.push({ x, z, mesh: h, physics: +ground.toFixed(3), d: +(ground - h).toFixed(3), other: r.other?.name, kind: r.other?.kind });
  }
  const hits = diffs.filter(d => d.physics !== null), worst = Math.max(...hits.map(d => Math.abs(d.d)));
  check('capsule ground vs rendered mesh (flat probes, |d| <= 3 cm; capsule radius rounds slopes)', hits.length === diffs.length && worst <= .03, { probes: diffs.length, worst, samples: diffs }, '<= 0.03 m');
  // 3. Water recovery: fixture drop into the sea near the west beach -> recovered onto land.
  for (const [name, p] of [['west', [-92, 2, 6]], ['north', [-20, 2, 78]]]) {
    await page.evaluate(q => __worldDebug.teleportPlayer(q), p); report.fixtures.push({ name: 'water-' + name, teleport: p });
    const samples = []; const t0 = Date.now();
    while (Date.now() - t0 < 5000) { samples.push(await page.evaluate(() => ({ p: __worldDebug.snapshot().player, g: __worldDebug.snapshot().grounded }))); await page.waitForTimeout(100); }
    const last = samples.at(-1);
    const minY = Math.min(...samples.map(s => s.p[1]));
    check(`water recovery (${name}) ends on land above WATER_Y`, minY < -0.7 && last.p[1] > 0 && last.g, { minY: +minY.toFixed(2), final: last.p.map(v => +v.toFixed(2)), grounded: last.g }, 'sinks below -0.7, ends grounded above water');
  }
  // 4. Slope walk with real keys from the west beach up the camp flank (19 deg grass slope).
  await page.evaluate(q => __worldDebug.teleportPlayer(q), probes.slopeStart); report.fixtures.push({ name: 'slope-start', teleport: probes.slopeStart });
  await page.waitForTimeout(1200);
  const before = await page.evaluate(() => __worldDebug.snapshot().player);
  const combo = comboFor(probes.slopeDir[0], probes.slopeDir[1]);
  const track = [];
  await bot.hold(combo.keys);
  const t1 = Date.now();
  while (Date.now() - t1 < 11000) { track.push(await page.evaluate(() => ({ p: __worldDebug.snapshot().player, g: __worldDebug.snapshot().grounded }))); await page.waitForTimeout(100); }
  await bot.release();
  await page.screenshot({ path: path.join(out, 'slope-walk-end.png') });
  const rise = track.at(-1).p[1] - before[1];
  check('walk up 19 deg camp flank onto the plateau with keys', track.at(-1).p[1] > 5.5 && track.at(-1).g, { start: before.map(v => +v.toFixed(2)), end: track.at(-1).p.map(v => +v.toFixed(2)), rise: +rise.toFixed(2), groundedShare: +(track.filter(s => s.g).length / track.length).toFixed(2), keys: combo.keys }, 'reaches plateau (capsule centre > 5.5) within 11 s, grounded');
  // 5. Rock terrace (58 deg) blocks walking: hold keys into the SE terrace from its foot.
  await page.evaluate(q => __worldDebug.teleportPlayer(q), probes.terraceStart); report.fixtures.push({ name: 'terrace-foot', teleport: probes.terraceStart });
  await page.waitForTimeout(1200);
  const tb = await page.evaluate(() => __worldDebug.snapshot().player);
  const tc = comboFor(probes.terraceDir[0], probes.terraceDir[1]);
  await bot.hold(tc.keys); const tt = Date.now(); let maxY = tb[1];
  while (Date.now() - tt < 4000) { const s = await page.evaluate(() => __worldDebug.snapshot().player); maxY = Math.max(maxY, s[1]); await page.waitForTimeout(100); }
  await bot.release();
  await page.screenshot({ path: path.join(out, 'terrace-block.png') });
  check('58 deg rock terrace not walkable', maxY - tb[1] < 1.0, { start: tb.map(v => +v.toFixed(2)), maxRise: +(maxY - tb[1]).toFixed(2), keys: tc.keys }, 'rise < 1.0 m (ledge is 1.6-2 m up)');
  report.stats = await page.evaluate(() => __worldDebug.stats());
  report.errors.push(...errors);
} catch (e) { report.errors.push(e.stack || String(e)); }
await writeFile(path.join(out, 'physics-report.json'), JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify({ checks: report.checks.map(c => [c.name, c.pass, JSON.stringify(c.value).slice(0, 200)]), errors: report.errors.slice(0, 3) }, null, 1));
