// Spec §4 sweep: texel size per place/zoom/quality, incl. driving at speed; screenshots for truncation/readability.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/Users/bobby/CodeBuddy/Claw/');
const { chromium } = require('playwright');
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const rows = [], errors = [];
for (const vp of [{ name: '1080p', w: 1920, h: 1080, dpr: 1 }, { name: '1440p', w: 2560, h: 1440, dpr: 1 }]) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr });
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:4322/world/?qa=1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__worldDebug?.state().ready, null, { timeout: 60000 });
  await page.addStyleTag({ content: 'astro-dev-toolbar{display:none!important}' });
  const read = () => page.evaluate(() => { const s = window.__worldDebug.shadowInfo(); return { band: s.receiverBand_m, tall: s.tallReceiversOnScreen, half: s.halfExtent_m, light: s.lightTexel_m, ground: s.groundTexel_m, nb: s.normalBias_m, map: s.mapSize, buf: window.__worldDebug.renderInfo().drawingBuffer }; });
  for (const quality of ['high', 'balanced']) {
    await page.evaluate(q => window.__worldDebug.set({ quality: q }), quality); await page.waitForTimeout(600);
    for (const [place, p] of [['camp-desk', [-50.4, 5.9, 40.9]], ['town-hunyuan', [24, 2.2, -36]], ['town-worldquant', [18, 2.2, 6]], ['park-booth', [61, 2.4, -20]]]) {
      await page.evaluate(p => window.__worldDebug.teleportPlayer(p), p); await page.waitForTimeout(1500);
      for (const z of [0, 1, 2]) {
        await page.evaluate(z => window.__worldDebug.set({ zoom: z }), z); await page.waitForTimeout(800);
        const r = { vp: vp.name, quality, place, zoom: z, ...(await read()) };
        if (quality === 'high' && (vp.name === '1080p' || place === 'camp-desk')) { r.file = `${out}/${vp.name}-${quality}-${place}-z${z}.png`; await page.screenshot({ path: r.file }); }
        rows.push(r);
      }
    }
    // Driving: enter offroad, full throttle straight; farthest zoom adds the speed term.
    await page.evaluate(() => { const d = window.__worldDebug; d.teleportVehicle('offroad', [16, 2.4, 9], 1.265); d.teleportPlayer([14, 2.4, 9]); });
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__worldDebug.enter('offroad'));
    for (const z of [2, 0]) {
      await page.evaluate(z => window.__worldDebug.set({ zoom: z }), z);
      await page.evaluate(() => window.__worldDebug.drive({ throttle: 1, steer: 0 }, 2.2));
      await page.waitForTimeout(2000);
      const r = { vp: vp.name, quality, place: 'driving', zoom: z, speed: await page.evaluate(() => window.__worldDebug.state().speed), ...(await read()) };
      if (quality === 'high') { r.file = `${out}/${vp.name}-${quality}-driving-z${z}.png`; await page.screenshot({ path: r.file }); }
      rows.push(r);
      await page.waitForTimeout(1500);
    }
    await page.evaluate(() => window.__worldDebug.exit()); await page.waitForTimeout(400);
    await page.evaluate(() => window.__worldDebug.set({ zoom: 1 }));
  }
  await page.close();
}
fs.writeFileSync(`${out}/spec-sweep.json`, JSON.stringify({ errors, rows }, null, 1));
console.log(JSON.stringify({ errors }));
for (const r of rows) console.log([r.vp, r.quality, r.place, r.zoom, r.speed ? Math.round(r.speed) + 'kmh' : '', 'band', r.band.map(x => +x.toFixed(1)).join('..'), 'tall', r.tall, 'win', r.half.map(x => 2 * x).join('x'), 'light', (Math.max(...r.light) * 100).toFixed(2), 'groundAlong', (r.ground.alongSun * 100).toFixed(2), 'buf', r.buf.join('x')].join(' '));
await browser.close();
