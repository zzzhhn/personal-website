/** ui session: normal entry (no QA params), night HUD + entering the offroad with real keys (WASD steered by the
 * HUD radar anchor, as the normal-entry bots do), then the vehicle prompt / speed readout. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadPlaywright, CHROME, comboFor } from '../playtest/lib.mjs';
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4337';
const out = process.env.WORLD_PLAYTEST_DIR || '/tmp/ui-night';
await mkdir(out, { recursive: true });
const R = { steps: [], errors: [] };
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', e => R.errors.push(e.message));
const held = new Set();
const hold = async keys => { const n = new Set(keys); for (const k of [...held]) if (!n.has(k)) { await page.keyboard.up(k); held.delete(k); } for (const k of n) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); } };
const hud = () => page.evaluate(() => { const c = document.querySelector('.world-radar circle[r="2.6"]'); return { p: c ? [+c.getAttribute('cx'), +c.getAttribute('cy')] : null, prompt: document.querySelector('.world-prompt li.is-active')?.textContent ?? null, speed: document.querySelector('.world-speed strong')?.textContent ?? null }; });
await page.goto(base + '/world/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => !document.querySelector('.world-loading') && document.querySelector('.world-radar svg'), undefined, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.keyboard.press('Escape'); await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Night' }).click(); await page.keyboard.press('Escape'); await page.waitForTimeout(3000);
await page.screenshot({ path: path.join(out, '01-night-hud.png') });
// Offroad parks at (-26, 34) in v4; walk toward its driver side until the vehicle prompt appears.
const t0 = Date.now(); let s = await hud();
while (Date.now() - t0 < 20000) { s = await hud(); if (s.prompt && /4×4|越野/.test(s.prompt)) break; const dx = -28.6 - s.p[0], dz = 34 - s.p[1]; if (Math.hypot(dx, dz) < .5) break; await hold([...comboFor(dx, dz).keys, 'ShiftLeft']); await page.waitForTimeout(60); }
await hold([]); await page.waitForTimeout(400); s = await hud(); R.steps.push({ reachedCar: s });
await page.screenshot({ path: path.join(out, '02-vehicle-prompt.png') });
await page.keyboard.press('KeyE'); await page.waitForTimeout(1200);
await hold(['KeyW']); await page.waitForTimeout(2200); await hold([]); await page.waitForTimeout(150);
s = await hud(); R.steps.push({ driving: s });
await page.screenshot({ path: path.join(out, '03-driving-speed.png') });
await browser.close();
await writeFile(path.join(out, 'night-drive.json'), JSON.stringify(R, null, 2));
console.log(JSON.stringify(R));
