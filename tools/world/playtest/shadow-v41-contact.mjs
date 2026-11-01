/** Contact gap: hide guide colour (shadow stays), mask = lum(noGuideShadow) - lum(guideShadow) > T, then for each
 * deformed boot-sole contact vertex (QA actor().contactVertices) find the nearest shadowed ground point. */
import { loadPlaywright, CHROME, openWorld } from './lib.mjs';
import { writeFile } from 'node:fs/promises';
const out = process.argv[2] || '/tmp/sh/contact.json';
const b = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const { page } = await openWorld(b, 'http://127.0.0.1:4322/world/?qa=1', { width: 1920, height: 1080, preserve: true });
await page.routeWebSocket('**/*', ws => ws.close());
const box = await page.locator('canvas').first().boundingBox(); const CX = box.x + box.width / 2, CY = box.y + box.height / 2;
await page.mouse.move(CX, CY);
const cam = () => page.evaluate(() => window.__worldDebug.camera());
async function zoomTo(t) { for (let i = 0; i < 60; i++) { const d = (await cam()).distance; if (Math.abs(d - t) / t < .04) break; await page.mouse.wheel(0, d > t ? -100 : 100); await page.waitForTimeout(25); } await page.waitForTimeout(900); }
async function orbit(dx, dy) { await page.mouse.move(CX, CY); await page.mouse.down(); for (let i = 1; i <= 10; i++) await page.mouse.move(CX + dx * i / 10, CY + dy * i / 10); await page.mouse.up(); await page.waitForTimeout(700); }
await page.evaluate(() => { window.__grab = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => { const c = document.querySelector('canvas'); const o = new OffscreenCanvas(c.width, c.height); const x = o.getContext('2d'); x.drawImage(c, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; const l = new Float32Array(c.width * c.height); for (let i = 0; i < l.length; i++) l[i] = .2126 * d[i * 4] + .7152 * d[i * 4 + 1] + .0722 * d[i * 4 + 2]; res({ l, w: c.width, h: c.height }); })))); });
const results = [];
async function measure(label) {
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const r = await page.evaluate(async () => {
    const d = window.__worldDebug, q = d.shadowQa, a = d.actor();
    q.fireShadowIntensity(0); q.guideColor(false);
    const A = await window.__grab(); q.guideCastShadow(false); const B = await window.__grab(); q.guideCastShadow(true); q.guideColor(true); q.fireShadowIntensity(1);
    const verts = [...(a.contactVertices.left || []), ...(a.contactVertices.right || [])].map(v => v.position);
    const soles = a.soles;
    if (!verts.length) return { verts: 0, soles };
    const gy = Math.min(...verts.map(v => v[1]));
    const { w, h } = A; const T = 4; const pts = [];
    // restrict to a screen window around the feet
    const feet = q.project(verts, w, h);
    const minX = Math.max(0, Math.min(...feet.map(p => p[0])) - 160) | 0, maxX = Math.min(w - 1, Math.max(...feet.map(p => p[0])) + 160) | 0;
    const minY = Math.max(0, Math.min(...feet.map(p => p[1])) - 160) | 0, maxY = Math.min(h - 1, Math.max(...feet.map(p => p[1])) + 160) | 0;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) { const i = y * w + x; if (B.l[i] - A.l[i] > T) { const p = q.groundHit(x + .5, y + .5, w, h, gy); if (p) pts.push(p); } }
    // gap: for each contact vertex, the distance to the nearest shadowed ground point
    const gaps = verts.map(v => { let m = Infinity; for (const p of pts) m = Math.min(m, Math.hypot(p[0] - v[0], p[2] - v[2])); return m; });
    // pixel footprint on the ground at the feet
    const p0 = q.groundHit(feet[0][0], feet[0][1], w, h, gy), p1 = q.groundHit(feet[0][0] + 1, feet[0][1], w, h, gy), p2 = q.groundHit(feet[0][0], feet[0][1] + 1, w, h, gy);
    const px = p0 && p1 && p2 ? [Math.hypot(p1[0] - p0[0], p1[2] - p0[2]), Math.hypot(p2[0] - p0[0], p2[2] - p0[2])] : null;
    const s = d.shadowInfo();
    return { verts: verts.length, groundY: gy, shadowPixels: pts.length, gapMax_m: Math.max(...gaps), gapMedian_m: gaps.sort((a, b) => a - b)[gaps.length >> 1], gapMin_m: Math.min(...gaps), pixelOnGround_m: px, animation: a.animation, grounded: !a.airborne, soles, mode: s.mode, c0: s.cascades[0].groundTexel_m, normalBias_m: s.cascades[0].normalBias_m, bias_m: s.bias_m ?? null, camera: d.camera().distance };
  });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  results.push({ label, ...r });
  console.log(label, JSON.stringify({ gapMax: r.gapMax_m, gapMed: r.gapMedian_m, px: r.pixelOnGround_m, verts: r.verts, sp: r.shadowPixels, anim: r.animation }));
}
await zoomTo(2.6);
const variants = JSON.parse(process.env.VARIANTS || '[["default",null,null]]');
for (const [label, keys] of [['idle-a', ['KeyW']], ['idle-b', ['KeyD']], ['idle-c', ['KeyS']]]) {
  for (const k of keys) { await page.keyboard.down(k); await page.waitForTimeout(150); await page.keyboard.up(k); } await page.waitForTimeout(1300);
  for (const [name, bias, normal] of variants) { await page.evaluate(([b, n]) => window.__worldDebug.shadowQa.sunBias(b, n), [bias, normal]); await page.waitForTimeout(200); await measure(label + ':' + name); }
  await page.evaluate(() => window.__worldDebug.shadowQa.sunBias(null, null));
}
await writeFile(out, JSON.stringify(results, null, 1));
await b.close();
