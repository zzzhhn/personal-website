// Shadow evidence capture (QA only). Usage: node cap.mjs BASE OUTDIR TAG
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/Users/bobby/CodeBuddy/Claw/');
const { chromium } = require('playwright');
const [base, out, tag] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const errors = [];
const result = { base, tag, views: [] };
for (const vp of [{ name: 'retina', width: 1840, height: 1117, dpr: 2 }, { name: '1080p', width: 1920, height: 1080, dpr: 1 }]) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr });
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base + '/world/?qa=1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__worldDebug?.state().ready, null, { timeout: 60000 });
  await page.addStyleTag({ content: 'astro-dev-toolbar{display:none!important}' });
  const view = { ...vp, shots: [] };
  view.render = await page.evaluate(() => window.__worldDebug.renderInfo());
  async function shot(name, extra = {}) {
    const file = `${out}/${tag}-${vp.name}-${name}.png`;
    await page.screenshot({ path: file });
    const s = await page.evaluate(() => ({ player: window.__worldDebug.snapshot().player, cam: window.__worldDebug.stats().camera,
      shadow: window.__worldDebug.shadowInfo ? window.__worldDebug.shadowInfo() : null }));
    view.shots.push({ name, file, ...s, ...extra });
  }
  // Desk/stool pad (pad index 3): the stair-step region in Bobby's capture.
  await page.evaluate(() => window.__worldDebug.teleportPlayer([-50.4, 5.9, 40.9]));
  await page.waitForTimeout(2500);
  await shot('desk');
  if (vp.name === 'retina') {
    for (const light of ['night']) { await page.evaluate(l => window.__worldDebug.set({ light: l }), light); await page.waitForTimeout(2600); await shot('desk-' + light); }
    await page.evaluate(() => window.__worldDebug.set({ light: 'dusk' })); await page.waitForTimeout(2600);
    // Walking burst: real keys, frames every ~80 ms; shadow should move with the body and legs change.
    await page.evaluate(() => window.__worldDebug.teleportPlayer([-44, 5.9, 36]));
    await page.waitForTimeout(1500);
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(500);
    for (let i = 0; i < 6; i++) { await shot('walk-' + i, { i }); await page.waitForTimeout(60); }
    await page.keyboard.up('KeyD');
    await page.waitForTimeout(1200);
    await shot('walk-stopped');
    // Out-of-camp coverage: town road and wide QA shot.
    await page.evaluate(() => window.__worldDebug.teleportPlayer([18, 2.2, 0]));
    await page.waitForTimeout(2500); await shot('town');
    for (const z of [0, 2]) { await page.evaluate(z => window.__worldDebug.set({ zoom: z }), z); await page.waitForTimeout(900); await shot('town-zoom' + z); }
    await page.evaluate(() => window.__worldDebug.set({ zoom: 1 }));
  }
  result.views.push(view);
  await page.close();
}
result.errors = errors;
fs.writeFileSync(`${out}/${tag}-capture.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ errors, views: result.views.map(v => ({ name: v.name, render: v.render, shots: v.shots.length })) }, null, 1));
await browser.close();
