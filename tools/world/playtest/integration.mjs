/** Integration smoke for merged district work (main thread). One page, real keys after logged fixtures.
 * Checks: no page errors / failed requests; claimed greybox keys; every registered interactable can be
 * reached on foot and opens something on E (card, seat, toast or an asset-side change it reports);
 * per-view render stats at a fixed set of district views. Writes report.json + screenshots.
 * Env: WORLD_BASE_URL, WORLD_PLAYTEST_DIR, WORLD_BROWSER_MODULES (see lib.mjs). */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Bot, CHROME, loadPlaywright, openWorld, canvasFacts } from './lib.mjs';
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4330';
const out = path.resolve(process.env.WORLD_PLAYTEST_DIR || '/tmp/world-integration');
await mkdir(out, { recursive: true });
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const selected = process.env.WORLD_INTERACT_IDS?.split(',');
const report = { base, revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), startedAt: new Date().toISOString(), errors: [], httpErrors: [], views: [], interactables: [], fixtures: [] };
try {
  const { page, errors, readyMs, assetsLoaded } = await openWorld(browser, `${base}/world/?qa=1`, { width: 1920, height: 1080 });
  page.on('response', r => { if (r.status() >= 400) report.httpErrors.push({ url: r.url(), status: r.status() }); });
  report.readyMs = readyMs; report.assetsLoaded = assetsLoaded; report.canvas = await canvasFacts(page);
  const bot = new Bot(page);
  await page.waitForTimeout(4000);
  report.layout = await page.evaluate(() => __worldDebug.layout()?.version ?? null);
  report.claimed = await page.evaluate(() => __worldDebug.claimedGreybox?.() ?? []);
  // Fixed district views from the layout's QA shots (overview excluded): stats at each.
  for (const view of process.env.WORLD_INTEGRATION_VIEWS?.split(',') ?? ['camp', 'town', 'bridge', 'park', 'ridge', 'camp-night', 'town-night', 'park-night']) {
    await page.evaluate(v => __worldDebug.set({ shot: v, light: v.endsWith('-night') ? 'night' : 'dusk' }), view);
    await page.waitForTimeout(1800);
    const stats = await page.evaluate(() => __worldDebug.stats());
    await page.screenshot({ path: path.join(out, `view-${view}.png`) });
    report.views.push({ view, stats });
  }
  await page.evaluate(() => __worldDebug.set({ shot: null, light: 'dusk' }));
  await page.waitForTimeout(800);
  // Interactables: walk to each (fixture start 2.5 m away, logged), press E, record the outcome.
  const items = await page.evaluate(() => window.__worldInteract?.list() ?? []);
  report.interactableCount = items.length;
  for (const item of items.filter(i => !selected || selected.includes(i.id))) {
    const [x, y, z] = item.position;
    const start = [x + 2.4, y + 1.2, z + 1.2];
    report.fixtures.push({ to: start, reason: `approach ${item.id}` });
    await bot.fixtureTeleport(start, `approach ${item.id}`);
    const walked = await bot.walk([[x, z]], { arrive: Math.min(1.4, (item.radius ?? 2.2) * .6), timeout: 8, maxRecoveries: 2 });
    const before = await page.evaluate(() => { const s = __worldDebug.state(); return { card: s.card, seat: s.seat, toast: s.toast, nearby: s.nearbyInteract }; });
    await bot.press('KeyE');
    await page.waitForTimeout(900);
    const after = await page.evaluate(() => { const s = __worldDebug.state(); return { card: s.card, seat: s.seat, toast: s.toast, nearby: s.nearbyInteract, active: s.activeVehicle }; });
    const row = { id: item.id, kind: item.kind, reached: walked.legs?.[0]?.reached ?? null, nearbyBefore: before.nearby?.id ?? null,
      opened: JSON.stringify(after.card) !== JSON.stringify(before.card) || JSON.stringify(after.seat) !== JSON.stringify(before.seat) || (after.toast?.at ?? 0) !== (before.toast?.at ?? 0),
      card: after.card, seat: after.seat, enteredVehicle: after.active };
    row.cardVisible = after.card ? await page.locator('.world-card').isVisible() : null;
    row.passed = row.reached === true && row.nearbyBefore === item.id && row.opened && !row.enteredVehicle && row.cardVisible !== false;
    report.interactables.push(row);
    await page.screenshot({ path: path.join(out, `interact-${item.id.replace(/[^a-z0-9_-]/gi, '_')}.png`) });
    // Verify the same E key closes a card / stands up; direct state cleanup is recovery only.
    if (after.card || after.seat) {
      await bot.press('KeyE');
      await page.waitForTimeout(900);
      row.closed = await page.evaluate(() => { const s = __worldDebug.state(); return !s.card && !s.seat && !s.activeVehicle; });
      row.passed &&= row.closed;
      if (!row.closed) await page.evaluate(() => __worldDebug.set({ card: null, seat: null }));
    }
  }
  report.errors.push(...errors);
} catch (e) { report.errors.push(String(e.stack || e)); }
report.summary = { views: report.views.length, maxCalls: Math.max(0, ...report.views.map(v => v.stats.calls)), maxTriangles: Math.max(0, ...report.views.map(v => v.stats.triangles)),
  interactables: report.interactables.length, interactPassed: report.interactables.filter(r => r.passed).length, interactOpened: report.interactables.filter(r => r.opened).length,
  errors: report.errors.length, httpErrors: report.httpErrors.length };
await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify(report.summary));
if (report.errors.length || report.httpErrors.length || report.interactables.some(r => !r.passed)) process.exitCode = 1;
