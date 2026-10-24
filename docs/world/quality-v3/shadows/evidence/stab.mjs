// Stability: walk with real keys; every ~frame read shadow texel coords of fixed world points and the player.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/Users/bobby/CodeBuddy/Claw/');
const { chromium } = require('playwright');
const [base, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1840, height: 1117 }, deviceScaleFactor: 2 });
const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base + '/world/?qa=1', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__worldDebug?.state().ready, null, { timeout: 60000 });
await page.evaluate(() => window.__worldDebug.teleportPlayer([-46, 5.9, 38]));
await page.waitForTimeout(1500);
const fixed = [[-52.6, 4.9, 40.6], [-42, 4.8, 30], [-36, 4.8, 24]];
const rows = [];
async function sample(label) { rows.push({ label, ...(await page.evaluate(f => ({ t: performance.now(), p: window.__worldDebug.snapshot().player, s: window.__worldDebug.shadowInfo(), tex: window.__worldDebug.shadowTexelsOf(f) }), fixed)) }); }
for (const [keys, ms, label] of [[['KeyD'], 1600, 'walk'], [['KeyD', 'ShiftLeft'], 1200, 'run'], [[], 800, 'stop']]) {
  for (const k of keys) await page.keyboard.down(k);
  const t0 = Date.now(); while (Date.now() - t0 < ms) { await sample(label); await page.waitForTimeout(16); }
  for (const k of keys) await page.keyboard.up(k);
}
// zoom changes
for (const z of [0, 2, 1]) { await page.evaluate(z => window.__worldDebug.set({ zoom: z }), z); await page.waitForTimeout(700); await sample('zoom' + z); }
fs.writeFileSync(out, JSON.stringify({ errors, rows }, null, 1));
const frac = v => v - Math.floor(v);
let maxFracDev = 0, extents = new Set(), centreSteps = 0;
const base0 = rows[0].tex;
for (const r of rows) {
  extents.add(r.s.halfExtent_m.join('x'));
  r.tex.forEach((t, i) => { if (r.s.halfExtent_m.join() !== rows[0].s.halfExtent_m.join()) return; for (const k of [0, 1]) { const d = Math.abs(frac(t[k]) - frac(base0[i][k])); maxFracDev = Math.max(maxFracDev, Math.min(d, 1 - d)); } });
}
console.log(JSON.stringify({ errors, samples: rows.length, extentsSeen: [...extents], maxSubTexelDeviationOfFixedPoints: maxFracDev, firstLast: [rows[0].p, rows.at(-1).p] }));
await browser.close();
