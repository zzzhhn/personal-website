/** Baseline probe (before camp-content): camp layout records, budget, and a few stills. QA API (?qa=1). */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
const { loadPlaywright, CHROME, openWorld, saveBuffer } = await import('../playtest/lib.mjs');
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4339';
const out = process.argv[2] || '/Users/bobby/Desktop/3D-personal-world/evidence/camp/baseline';
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const report = {};
try {
  const { page, errors } = await openWorld(browser, base + '/world/?qa=1', { width: 1920, height: 1080, preserve: true });
  report.errors = errors;
  report.records = await page.evaluate(() => window.__worldDebug.campColliders().filter(r => /^(C0[3-9]|C10|C11|C12|C13|C14|C15|C16|C11-C15)/.test(r.id)).map(r => ({ id: r.id, label: r.label, part: r.part, kind: r.kind, instance: r.instance, aabb: r.aabb })));
  report.stats = await page.evaluate(() => window.__worldDebug.stats());
  report.claimed = await page.evaluate(() => window.__worldDebug.claimedGreybox());
  report.names = await page.evaluate(() => window.__worldDebug.sceneObjects().filter(n => /camp/.test(n)));
  await saveBuffer(page, path.join(out, 'spawn-dusk.png'));
  await page.evaluate(() => window.__worldDebug.set({ shot: 'camp' }));
  await page.waitForTimeout(1500);
  report.campShotStats = await page.evaluate(() => window.__worldDebug.stats());
  await saveBuffer(page, path.join(out, 'camp-dusk.png'));
  await page.evaluate(() => window.__worldDebug.set({ light: 'night' }));
  await page.waitForTimeout(2600);
  await saveBuffer(page, path.join(out, 'camp-night.png'));
  await page.evaluate(() => window.__worldDebug.set({ shot: null }));
  await page.waitForTimeout(1200);
  await saveBuffer(page, path.join(out, 'spawn-night.png'));
} catch (e) { report.fatal = String(e.stack || e); }
await writeFile(path.join(out, 'probe.json'), JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify({ errors: report.errors, fatal: report.fatal, stats: report.stats, campShotStats: report.campShotStats, claimed: report.claimed }, null, 1));
