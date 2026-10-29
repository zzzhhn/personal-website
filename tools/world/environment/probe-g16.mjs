import { CHROME, loadPlaywright, openWorld } from '../playtest/lib.mjs';
const base = process.env.WORLD_BASE_URL;
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const { page } = await openWorld(browser, base + '/world/?qa=1');
const r = await page.evaluate(() => {
  const recs = __worldDebug.campColliders(), g = recs.find(r => r.id === 'G16' && r.instance === 0 && r.part === 'trunk');
  const mid = [(g.aabb.min[0] + g.aabb.max[0]) / 2, 0, (g.aabb.min[2] + g.aabb.max[2]) / 2];
  const out = [];
  for (const y of [4.9, 5.2, 5.5, 6]) for (const [dx, dz] of [[0, -1], [0, 1], [1, 0], [-1, 0]]) {
    const from = [mid[0] - dx * 2.5, y, mid[2] - dz * 2.5];
    const h = __worldDebug.probeAsset('G16', from, [dx, 0, dz], .03);
    out.push([y, dx, dz, h ? +h.toi.toFixed(2) : null]);
  }
  return { aabb: g.aabb, kind: g.kind, out };
});
console.log(JSON.stringify(r));
await browser.close();
