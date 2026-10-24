/** Park visual capture (QA entry, fixture teleports logged). Usage via bot-run.sh: capture.mjs <label> [names...]
 * Writes PNG + stats JSON into WORLD_PLAYTEST_DIR. Shots: the two frozen park shots plus player views. */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { loadPlaywright, CHROME, openWorld, ensureDir } from '../playtest/lib.mjs';
const out = await ensureDir(process.env.WORLD_PLAYTEST_DIR || '/tmp/park-cap');
const base = process.env.WORLD_BASE_URL;
const label = process.argv[2] || 'cap';
const only = process.argv.slice(3);
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const report = { label, shots: [] };
const want = n => !only.length || only.includes(n);
try {
  for (const shot of ['park', 'park-night']) {
    if (!want(shot)) continue;
    const { page, errors, context } = await openWorld(browser, `${base}/world/?qa=1&shot=${shot}`, { width: 1920, height: 1080 });
    await page.addStyleTag({ content: 'astro-dev-toolbar{display:none!important}' });
    await page.waitForTimeout(3500);
    const file = path.join(out, `${label}-${shot}.png`);
    await page.screenshot({ path: file });
    report.shots.push({ shot, file, stats: await page.evaluate(() => window.__worldDebug.stats()), errors });
    await context.close();
  }
  // Player views: fixture teleport (logged), then the default orbit camera at a chosen zoom.
  const views = [
    { name: 'plaza', p: [47, 2.3, -44], zoom: 2 },
    { name: 'walk-mid', p: [66, 2.3, -33], zoom: 1 },
    { name: 'hut-near', p: [59, 2.3, -45], zoom: 0 },
    { name: 'hut-djc', p: [74, 2.3, -28], zoom: 0 },
    { name: 'hut-ilp', p: [52, 2.3, -9.5], zoom: 0 },
  ].filter(v => want(v.name) || want('views'));
  if (views.length) {
    const { page, errors, context } = await openWorld(browser, `${base}/world/?qa=1`, { width: 1920, height: 1080 });
    await page.addStyleTag({ content: 'astro-dev-toolbar{display:none!important}' });
    for (const light of ['dusk', 'night']) for (const v of views) {
      await page.evaluate(([p, zoom, light]) => { window.__worldDebug.set({ zoom, light }); return window.__worldDebug.teleportPlayer(p); }, [v.p, v.zoom, light]);
      await page.waitForTimeout(light === 'night' ? 2600 : 1600);
      const file = path.join(out, `${label}-${v.name}-${light}.png`);
      await page.screenshot({ path: file });
      report.shots.push({ view: v.name, light, fixtureTeleport: v.p, file, stats: await page.evaluate(() => window.__worldDebug.stats()), errors: [...errors] });
    }
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(path.join(out, `${label}-report.json`), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report.shots.map(s => ({ s: s.shot || s.view + '-' + s.light, calls: s.stats?.calls, tris: s.stats?.triangles, err: s.errors?.length }))));
}
