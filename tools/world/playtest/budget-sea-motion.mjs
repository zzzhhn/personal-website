/** Sea motion check (spec v3 §2): two frames 0.5 s apart on the normal camera at the south beach; sea pixels
 * (blue-dominant, lower half of the horizon band) mean abs diff >= 3/255 and >= 10 % changing by > 8/255. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Bot, CHROME, loadPlaywright, openWorld } from './lib.mjs';
import { aim, look } from './budget-lib.mjs';
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4338', out = path.resolve(process.env.WORLD_PLAYTEST_DIR || '/tmp/sea-motion');
await mkdir(out, { recursive: true });
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const res = { views: [] };
try {
  const { page } = await openWorld(browser, `${base}/world/?qa=1`, { width: 1280, height: 720, preserve: true });
  const bot = new Bot(page);
  for (const v of [{ id: 'beach', p: [-26, 1.6, 84], cam: { yaw: look(.3, 1), pitch: .38, distance: 7 } }, { id: 'far', p: [-26, 1.6, 84], cam: { yaw: look(0, 1), pitch: .5, distance: 30 } }]) {
    await bot.fixtureTeleport(v.p, 'sea motion'); await page.waitForTimeout(600); await aim(page, v.cam, 1280, 720);
    const grab = () => page.evaluate(() => { const c = document.querySelector('canvas'), o = document.createElement('canvas'); o.width = 320; o.height = 180; const x = o.getContext('2d'); x.drawImage(c, 0, 0, 320, 180); return Array.from(x.getImageData(0, 0, 320, 180).data); });
    const a = await grab(); await page.waitForTimeout(500); const b = await grab();
    let n = 0, sum = 0, moving = 0;
    for (let i = 0; i < a.length; i += 4) {
      const isSea = a[i + 2] > a[i] + 8 && a[i + 1] > a[i] && a[i + 2] > 40; // teal/blue
      if (!isSea) continue;
      n++; const d = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3; sum += d; if (d > 8) moving++;
    }
    res.views.push({ id: v.id, seaPixels: n, meanDiff: +(sum / Math.max(1, n)).toFixed(2), movingShare: +(moving / Math.max(1, n)).toFixed(3), pass: n > 2000 && sum / n >= 3 && moving / n >= .1 });
  }
} catch (e) { res.error = String(e.stack || e); }
await browser.close();
await writeFile(path.join(out, 'sea-motion.json'), JSON.stringify(res, null, 1));
console.log(JSON.stringify(res));
