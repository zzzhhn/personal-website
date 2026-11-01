/** quality-v4 evidence: grass bending (real-key walk and drive), recovery, sea clear spot,
 * frame timing in high and balanced. QA entry for observation (window.__worldEnv is read-only);
 * movement and driving use real keyboard events only, fixtures place the start.
 * Usage: WORLD_BASE_URL=http://127.0.0.1:4322 node tools/world/environment/grass-water.mjs outDir */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { loadPlaywright, CHROME, openWorld, ensureDir, frameTiming, startCanvasRecording, stopCanvasRecording } from '../playtest/lib.mjs';
const out = await ensureDir(process.argv[2] || 'docs/world/quality-v3/environment-v4/grass-water');
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4322';
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const report = { startedAt: new Date().toISOString(), base, fixtures: [], cases: [], timing: {}, errors: [] };
const { page, errors } = await openWorld(browser, `${base}/world/?qa=1${process.env.WORLD_QUERY || ''}`, { width: 1920, height: 1080 });
// Grass candidates build over idle frames after load; wait so the cases see grass.
await page.waitForFunction(() => window.__worldEnv?.groundDetail().grassBuildMs > 0, undefined, { timeout: 20000 }).catch(() => {});
report.groundPbr = await page.evaluate(() => window.__worldEnv?.groundPbr);
const wait = ms => page.waitForTimeout(ms);
const held = new Set();
async function hold(keys) {
  for (const k of [...held]) if (!keys.includes(k)) { await page.keyboard.up(k); held.delete(k); }
  for (const k of keys) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
}
const env = () => page.evaluate(() => ({ grass: __worldEnv.grass(), sea: __worldEnv.sea(), snap: __worldDebug.snapshot(), cam: __worldDebug.stats().camera }));
/** Camera-relative steering: pick W/A/S/D toward (tx, tz) from the camera->player ground vector. */
function keysToward(s, tx, tz, run = false) {
  const p = s.snap.player, c = s.cam;
  let fx = p[0] - c[0], fz = p[2] - c[2]; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
  const rx = -fz, rz = fx;
  const dx = tx - p[0], dz = tz - p[2], l = Math.hypot(dx, dz) || 1;
  const f = (dx * fx + dz * fz) / l, r = (dx * rx + dz * rz) / l, keys = [];
  if (f > .38) keys.push('KeyW'); else if (f < -.38) keys.push('KeyS');
  if (r > .38) keys.push('KeyD'); else if (r < -.38) keys.push('KeyA');
  if (run) keys.push('ShiftLeft');
  return keys;
}
async function walkTo(tx, tz, { run = false, timeout = 15000, samples, label } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await env(); samples?.push({ t: Date.now(), label, grass: s.grass, sea: s.sea, p: s.snap.player });
    if (Math.hypot(tx - s.snap.player[0], tz - s.snap.player[2]) < .8) break;
    await hold(keysToward(s, tx, tz, run)); await wait(70);
  }
  await hold([]);
}
async function observe(ms, samples, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const s = await env(); samples.push({ t: Date.now(), label, grass: s.grass, sea: s.sea, p: s.snap.player }); await wait(100); }
}
try {
  // ---- 1. Walk through grass (west meadow at y=1, densest candidates).
  {
    const c = { name: 'walk-grass', samples: [] };
    const start = [-46, 1.95, -24];
    await page.evaluate(p => { __worldDebug.teleportPlayer(p); __worldDebug.set({ zoom: 0 }); }, start); report.fixtures.push({ case: c.name, teleport: start });
    await wait(2500);
    await page.screenshot({ path: path.join(out, 'walk-0-before.png') });
    await startCanvasRecording(page, 30);
    await walkTo(-38, -24, { samples: c.samples, label: 'walk', timeout: 9000 });
    await page.screenshot({ path: path.join(out, 'walk-1-passing.png') });
    await walkTo(-34, -20, { samples: c.samples, label: 'walk2', timeout: 6000 });
    await page.screenshot({ path: path.join(out, 'walk-2-trail-bent.png') });
    {
      // Probes: path points the body left 0.4-3 s before the stop (>= 1.2 m behind it).
      const w = c.samples.filter(s => s.label.startsWith('walk')), endT = w.at(-1).t, endP = w.at(-1).p;
      const probes = w.filter(s => endT - s.t < 3000 && endT - s.t > 400 && Math.hypot(s.p[0] - endP[0], s.p[2] - endP[2]) > 1.2).map(s => [s.p[0], s.p[2]]);
      c.probeCount = probes.length;
      c.trailCurve = []; const t0 = Date.now();
      while (Date.now() - t0 < 5500) {
        const vals = await page.evaluate(ps => ps.map(([x, z]) => __worldEnv.trampleAt(x, z)), probes);
        c.trailCurve.push([+((Date.now() - t0) / 1000).toFixed(1), vals]);
        const s = await env(); c.samples.push({ t: Date.now(), label: 'recover', grass: s.grass, sea: s.sea, p: s.snap.player });
        await wait(250);
      }
    }
    await stopCanvasRecording(page, path.join(out, 'walk-grass.webm'));
    await page.screenshot({ path: path.join(out, 'walk-3-recovered.png') });
    const during = c.samples.filter(s => s.label.startsWith('walk'));
    c.travel = +Math.hypot(during.at(-1).p[0] - during[0].p[0], during.at(-1).p[2] - during[0].p[2]).toFixed(2);
    // Trail probes: the first 70 % of the walked path (the body has left these points).
    c.trail = during.slice(0, Math.floor(during.length * .7)).filter((_, i) => i % 6 === 0).map(s => [s.p[0], s.p[2]]);
    c.recoveryCurve = c.trailCurve; delete c.trailCurve;
    c.recoveredAt = c.recoveryCurve.find(([, v]) => Math.max(...v) < .02)?.[0] ?? null;
    c.passed = c.travel > 6 && Math.max(...c.recoveryCurve[0][1]) > .5 && c.recoveredAt !== null && c.recoveredAt <= 6;
    report.cases.push(c);
  }
  // ---- 2. Drive the offroad through grass (real keys: E, W, A/D).
  {
    const c = { name: 'drive-grass', samples: [] };
    const car = [-50, 1.9, -12];
    await page.evaluate(p => __worldDebug.teleportVehicle('offroad', p, 0), car);
    await page.evaluate(p => __worldDebug.teleportPlayer(p), [-50, 1.95, -9.6]);
    report.fixtures.push({ case: c.name, vehicle: car, player: [-50, 1.95, -9.6] });
    await wait(1500);
    await page.keyboard.press('KeyE'); await wait(600);
    const active = (await env()).snap.activeVehicle;
    await startCanvasRecording(page, 30);
    const t0 = Date.now();
    while (Date.now() - t0 < 3200) { const s = await env(); c.samples.push({ t: Date.now(), label: 'drive', grass: s.grass, v: s.snap.vehicles.find(v => v.id === 'offroad').position }); await hold(['KeyW']); await wait(80); }
    await page.screenshot({ path: path.join(out, 'drive-1-passing.png') });
    await hold(['Space']); await wait(700); await hold([]);
    // Step out (real E) so the follow camera frames the track behind the car.
    await page.keyboard.press('KeyE'); await wait(400);
    await page.screenshot({ path: path.join(out, 'drive-2-tracks-bent.png') });
    {
      // Probes: wheel-track centre the car left in its last 2 s of driving (>= 3 m behind the stop).
      const d = c.samples.filter(s => s.label === 'drive'), endT = d.at(-1).t, endV = d.at(-1).v;
      const probes = d.filter(s => endT - s.t < 2000 && Math.hypot(s.v[0] - endV[0], s.v[2] - endV[2]) > 3).map(s => [s.v[0], s.v[2]]);
      c.probeCount = probes.length;
      c.trailCurve = []; const t0 = Date.now();
      while (Date.now() - t0 < 6500) {
        const vals = await page.evaluate(ps => ps.map(([x, z]) => __worldEnv.trampleAt(x, z)), probes);
        c.trailCurve.push([+((Date.now() - t0) / 1000).toFixed(1), vals]);
        await wait(250);
      }
    }
    await stopCanvasRecording(page, path.join(out, 'drive-grass.webm'));
    await page.screenshot({ path: path.join(out, 'drive-3-recovered.png') });
    const d = c.samples.filter(s => s.label === 'drive');
    c.entered = active === 'offroad';
    c.travel = +Math.hypot(d.at(-1).v[0] - d[0].v[0], d.at(-1).v[2] - d[0].v[2]).toFixed(2);
    c.maxDisturbers = Math.max(...d.map(s => s.grass.disturbers));
    c.recoveryCurve = c.trailCurve; delete c.trailCurve;
    c.recoveredAt = c.recoveryCurve.find(([, v]) => Math.max(...v) < .02)?.[0] ?? null;
    c.passed = c.entered && c.travel > 6 && Math.max(...c.recoveryCurve[0][1]) > .5 && c.recoveredAt !== null && c.recoveredAt <= 6;
    report.cases.push(c);
  }
  // ---- 3. Walk into the sea (west beach): clear spot appears; body and seabed visible.
  {
    const c = { name: 'sea-clear-spot', samples: [] };
    const start = [-74, 1.2, -2];
    await page.evaluate(p => { __worldDebug.teleportPlayer(p); __worldDebug.set({ zoom: 0 }); }, start); report.fixtures.push({ case: c.name, teleport: start });
    await wait(2200);
    await startCanvasRecording(page, 30);
    await walkTo(-82, -2, { samples: c.samples, label: 'wade', timeout: 7000 });
    await page.screenshot({ path: path.join(out, 'sea-1-wading.png') });
    await walkTo(-86, -2, { samples: c.samples, label: 'deeper', timeout: 3000 });
    await wait(300);
    await page.screenshot({ path: path.join(out, 'sea-2-submerged.png') });
    await observe(800, c.samples, 'in');
    await stopCanvasRecording(page, path.join(out, 'sea-clear-spot.webm'));
    const inWater = c.samples.filter(s => s.sea.length && s.sea[0].strength > .9);
    c.firstSpot = c.samples.find(s => s.sea.length)?.p ?? null;
    c.maxStrength = Math.max(0, ...c.samples.map(s => s.sea[0]?.strength ?? 0));
    c.spotRadius = inWater[0]?.sea[0].radius ?? null;
    c.minPlayerY = Math.min(...c.samples.map(s => s.p[1]));
    c.passed = c.maxStrength > .9 && c.minPlayerY < -.2;
    report.cases.push(c);
    // Dry land: spot gone.
    await page.evaluate(() => __worldDebug.teleportPlayer([-60, 1.95, -10])); await wait(1500);
    const dry = await env(); c.spotsOnLand = dry.sea.length;
    c.passed = c.passed && c.spotsOnLand === 0;
  }
  // ---- 3b. Clean before/after pair: prefers-reduced-motion zeroes wind sway and waves (the
  // trample clock still runs), the body stops, the camera settles, then the same view 6 s later.
  {
    const c = { name: 'walk-trail-still-camera' };
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const start = [-46, 1.95, -30];
    await page.evaluate(p => { __worldDebug.teleportPlayer(p); __worldDebug.set({ zoom: 1 }); }, start); report.fixtures.push({ case: c.name, teleport: start });
    await wait(2500);
    await page.screenshot({ path: path.join(out, 'still-0-untouched.png') });
    const samples = [];
    await walkTo(-38, -30, { samples, label: 'walk', timeout: 9000 });
    await walkTo(-38, -27, { samples, label: 'walk', timeout: 3000 });
    await wait(800);
    await page.screenshot({ path: path.join(out, 'still-1-trail.png') });
    await wait(6000);
    await page.screenshot({ path: path.join(out, 'still-2-recovered.png') });
    c.cameraBefore = (await env()).cam;
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    report.cases.push(c);
  }
  // ---- 4. Frame timing (coast meadow, player camera) for high and balanced.
  for (const q of ['high', 'balanced']) {
    await page.evaluate(q => { __worldDebug.set({ quality: q }); __worldDebug.teleportPlayer([-50, 1.95, -24]); __worldDebug.set({ zoom: 1 }); }, q);
    await wait(2500);
    report.timing[q] = { meadow: await frameTiming(page, 5), grass: (await env()).grass, groundDetail: await page.evaluate(() => __worldEnv.groundDetail()), stats: await page.evaluate(() => __worldDebug.stats()), render: await page.evaluate(() => __worldDebug.renderInfo()) };
    await page.evaluate(() => { __worldDebug.teleportPlayer([-42, 5.85, 35]); }); await wait(2000);
    report.timing[q].camp = await frameTiming(page, 5);
  }
  await page.evaluate(() => __worldDebug.set({ quality: 'high' }));
} catch (e) { report.errors.push(e.stack || String(e)); }
report.pageErrors = errors.slice(0, 20);
await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify({ groundPbr: report.groundPbr, cases: report.cases.map(c => { const { samples, trail, recoveryCurve, ...rest } = c; return { ...rest, curve: recoveryCurve?.filter((_, i) => i % 4 === 0).map(([t, v]) => [t, Math.max(...v), +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(3)]) }; }), timing: Object.fromEntries(Object.entries(report.timing).map(([k, v]) => [k, { meadow: v.meadow, camp: v.camp, groundDetail: v.groundDetail, tris: v.stats?.triangles, calls: v.stats?.calls, dpr: v.render?.pixelRatio, buffer: v.render?.drawingBuffer }])), errors: report.errors.slice(0, 3) }, null, 1));
