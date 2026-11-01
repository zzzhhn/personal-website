import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/Users/bobby/CodeBuddy/Claw/');
const { chromium } = require('playwright');
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1840, height: 1117 }, deviceScaleFactor: 2 });
const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://127.0.0.1:4322/world/?qa=1', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__worldDebug?.state().ready, null, { timeout: 60000 });
await page.addStyleTag({ content: 'astro-dev-toolbar{display:none!important}' });
const rec = [];
for (const [place, p] of [['town-hunyuan', [24, 2.2, -36]], ['town-worldquant', [18, 2.2, 6]], ['camp-desk', [-50.4, 5.9, 40.9]]]) {
  await page.evaluate(p => window.__worldDebug.teleportPlayer(p), p); await page.waitForTimeout(2200);
  for (const z of [1, 2]) {
    await page.evaluate(z => window.__worldDebug.set({ zoom: z }), z); await page.waitForTimeout(900);
    for (const mode of ['old', 'new']) {
      await page.evaluate(m => { const d = window.__worldDebug, y = d.snapshot().player[1]; d.setShadowBand(m === 'old' ? [y - 4, y + 7] : null); }, mode);
      await page.waitForTimeout(250);
      const file = `${out}/${place}-zoom${z}-${mode}.png`; await page.screenshot({ path: file });
      rec.push({ place, zoom: z, mode, file, shadow: await page.evaluate(() => window.__worldDebug.shadowInfo()) });
    }
  }
  await page.evaluate(() => window.__worldDebug.set({ zoom: 1 }));
}
await page.evaluate(() => window.__worldDebug.setShadowBand(null));
fs.writeFileSync(`${out}/band.json`, JSON.stringify({ errors, rec }, null, 1));
console.log(JSON.stringify({ errors, rec: rec.map(r => [r.place, r.zoom, r.mode, r.shadow.receiverBand_m.map(x => +x.toFixed(2)), r.shadow.halfExtent_m, +(r.shadow.groundTexel_m.acrossSun * 100).toFixed(2), +(r.shadow.groundTexel_m.alongSun * 100).toFixed(2)]) }));
await browser.close();
