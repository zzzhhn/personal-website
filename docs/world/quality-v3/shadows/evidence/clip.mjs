// Normal-speed walking clip (canvas captureStream) at default zoom, dusk; shadow must move with the guide, static edges still.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/Users/bobby/CodeBuddy/Claw/');
const { chromium } = require('playwright');
const [base, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1840, height: 1117 }, deviceScaleFactor: 2 });
await page.goto(base + '/world/?qa=1', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__worldDebug?.state().ready, null, { timeout: 60000 });
await page.evaluate(() => window.__worldDebug.teleportPlayer([-49, 5.9, 39.5]));
await page.waitForTimeout(1500);
await page.evaluate(() => { const c = document.querySelector('canvas'); const st = c.captureStream(60); const r = new MediaRecorder(st, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 12e6 }); const ch = []; r.ondataavailable = e => e.data.size && ch.push(e.data); window.__clip = new Promise(res => { r.onstop = () => { const fr = new FileReader(); fr.onload = () => res(fr.result.split(',')[1]); fr.readAsDataURL(new Blob(ch, { type: 'video/webm' })); }; }); window.__rec = r; r.start(250); });
for (const [keys, ms] of [[['KeyD'], 2200], [['KeyW'], 1200], [['KeyA'], 1500], [[], 900]]) { for (const k of keys) await page.keyboard.down(k); await page.waitForTimeout(ms); for (const k of keys) await page.keyboard.up(k); }
await page.evaluate(() => window.__rec.stop());
fs.writeFileSync(out, Buffer.from(await page.evaluate(() => window.__clip), 'base64'));
console.log('clip', out, fs.statSync(out).size);
await browser.close();
