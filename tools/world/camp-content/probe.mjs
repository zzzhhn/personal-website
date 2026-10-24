/** Camp-content probe (?qa=1 only for the API; stills come from normal-entry runs in stills.mjs).
 * Usage: tools/bot-run.sh camp 4339 tools/world/camp-content/probe.mjs <outdir> */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
const { loadPlaywright, CHROME, openWorld, saveBuffer, ensureDir } = await import('../playtest/lib.mjs');
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4339';
const out = await ensureDir(process.env.WORLD_PLAYTEST_DIR || '/Users/bobby/Desktop/3D-personal-world/evidence/camp/probe');
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const report = {};
try {
  const { page, errors } = await openWorld(browser, base + '/world/?qa=1', { width: 1920, height: 1080, preserve: true });
  await page.waitForFunction(() => !!window.__worldCampContent, undefined, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  report.errors = errors;
  report.claimed = await page.evaluate(() => window.__worldDebug.claimedGreybox());
  report.api = await page.evaluate(() => { const a = window.__worldCampContent; return a ? { placements: a.placements(), hard: a.hard(), pushables: a.pushables(), exhibits: a.exhibits(), seats: a.seats(), check: a.check() } : null; });
  report.greyboxLeft = await page.evaluate(() => window.__worldDebug.campColliders().filter(r => r.id === 'C11-C15').length);
  report.interactables = await page.evaluate(() => window.__worldInteract.list().filter(i => /camp-/.test(i.id)).map(i => ({ id: i.id, kind: i.kind, p: i.position.map(v => +v.toFixed(2)), r: i.radius })));
  report.stats = await page.evaluate(() => window.__worldDebug.stats());
  // hide our group to measure its own contribution in the same view
  const toggle = on => page.evaluate(on => { let g = null; window.__worldDebug.scene?.()?.traverse?.(o => { if (o.name === 'world-camp-content') g = o; }); if (g) g.visible = on; return !!g; }, on);
  report.toggleAvailable = await toggle(true);
  await saveBuffer(page, path.join(out, 'qa-spawn-dusk.png'));
  await page.evaluate(() => window.__worldDebug.set({ shot: 'camp' })); await page.waitForTimeout(1500);
  report.campShot = await page.evaluate(() => window.__worldDebug.stats());
  await saveBuffer(page, path.join(out, 'qa-camp-dusk.png'));
  await page.evaluate(() => window.__worldDebug.set({ light: 'night' })); await page.waitForTimeout(2600);
  await saveBuffer(page, path.join(out, 'qa-camp-night.png'));
  await page.evaluate(() => window.__worldDebug.set({ shot: null })); await page.waitForTimeout(600);
  const close = async (name, p, t) => { await page.evaluate(([p, t]) => window.__worldCampQA.close(p, t), [p, t]); await page.waitForTimeout(900); await saveBuffer(page, path.join(out, name)); };
  const pl = report.api?.placements;
  if (pl) {
    const at = (pos, dx, dy, dz) => [pos[0] + dx, pos[1] + dy, pos[2] + dz];
    for (const light of ['night', 'dusk']) {
      await page.evaluate(l => window.__worldDebug.set({ light: l }), light); await page.waitForTimeout(2300);
      await close(`close-C11-${light}.png`, at(pl.C11.position, -3.0, 1.8, 3.0), at(pl.C11.position, 0, 1.1, 0));
      await close(`close-C14-C15-${light}.png`, at(pl.C14.position, -2.6, 1.8, -3.4), at(pl.C14.position, 0.4, 0.4, 2));
      await close(`close-C12-${light}.png`, at(pl.C12.position, -1.2, 1.4, -2.6), at(pl.C12.position, 0, 0.6, 0));
      await close(`close-C13-door-${light}.png`, at(pl.C13[0].position, 0.5, 2.4, 4.8), at(pl.C13[0].position, -0.5, 0.4, -1.2));
      await close(`close-desk-${light}.png`, at(pl.C16, 2.2, 1.3, -1.6), at(pl.C16, 0, 0.1, 0.3));
      await close(`close-exit-${light}.png`, [-36, 7.2, 34], [-30, 5.8, 34]);
    }
    await page.evaluate(() => window.__worldCampQA.release());
  }
} catch (e) { report.fatal = String(e.stack || e); }
await writeFile(path.join(out, 'probe.json'), JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify({ errors: report.errors, fatal: report.fatal, claimed: report.claimed, greyboxLeft: report.greyboxLeft, check: report.api?.check, stats: report.stats, campShot: report.campShot, hard: report.api?.hard?.map(h => h.id), push: report.api?.pushables }, null, 1));
