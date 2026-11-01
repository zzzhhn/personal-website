/**
 * Baseline (run once) against the immutable c507506 deployment. Only the reported defects +
 * real drawing-buffer facts:  rocks/shrubs passable, tent air wall, fire-pit passable,
 * character has no action, buffer/DPR/viewport at 1440x900, 1920x1080, 2560x1440 (+1440x900@2),
 * pause/shot animation freeze, rAF frame timing.
 * Usage: node tools/world/playtest/baseline.mjs [baseUrl] [outDir]
 * Walking routes start at a fresh spawn and use real keys only (no teleport). Positions of
 * colliderless nature instances are recomputed from WorldCamp.createNature (c507506).
 */
import { writeFile, rename, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, CHROME, Bot, canvasFacts, frameTiming, saveBuffer, openWorld, ensureDir, startCanvasRecording, stopCanvasRecording } from './lib.mjs';
import { readFile } from 'node:fs/promises';
const ONLY = new Set((process.env.PT_ONLY || '').split(',').filter(Boolean));

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const BASE = process.argv[2] || 'https://48c59fd5.personal-website-aew.pages.dev/world/?qa=1';
const OUT = await ensureDir(path.resolve(repo, process.argv[3] || 'docs/world/quality-v2/playtest/baseline-c507506'));
const FR = await ensureDir(path.join(OUT, 'frames'));
const VID = await ensureDir(path.join(OUT, 'video'));
const { chromium } = loadPlaywright();
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const report = { base: BASE, commit: 'c507506 (immutable Cloudflare deployment 48c59fd5)', startedAt: new Date().toISOString(),
  browser: { chrome: browser.version(), headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] },
  machine: 'Apple M5 Pro, 48 GB (this machine, NOT M1 certification)', cases: {}, toolFailures: [] };
if (ONLY.size) { try { const old = JSON.parse(await readFile(path.join(OUT, 'baseline-report.json'), 'utf8')); report.cases = old.cases; report.toolFailuresEarlier = old.toolFailures; report.startedAtEarlier = old.startedAt; } catch {} }
const save = () => writeFile(path.join(OUT, 'baseline-report.json'), JSON.stringify(report, null, 1));
const xz = (p, q) => Math.hypot(p[0] - q[0], p[2] - q[1]);

// ---- c507506 geometry facts (from source) ----
const CC = [-42, 30];
const ringPt = (deg, r) => [CC[0] + Math.cos(deg * Math.PI / 180) * r, CC[1] + Math.sin(deg * Math.PI / 180) * r];
const T_ROCK1 = ringPt(150, 21), T_ROCK2 = ringPt(175, 21.8), T_SHRUB = ringPt(197, 21.5);   // G21, G21(scale .9), G20
const chord = (T, deg) => { const t = [-Math.sin(deg * Math.PI / 180), Math.cos(deg * Math.PI / 180)]; return [[T[0] - 2.5 * t[0], T[1] - 2.5 * t[1]], [T[0] + 2.5 * t[0], T[1] + 2.5 * t[1]]]; };

async function route(name, fn, opts = {}) {
  if (ONLY.size && !ONLY.has(name)) return;
  const started = Date.now();
  let ctx;
  try {
    ctx = await openWorld(browser, BASE, opts);
    const bot = new Bot(ctx.page);
    if (opts.video) await startCanvasRecording(ctx.page);
    const result = await fn(ctx.page, bot, ctx);
    if (opts.video) { await stopCanvasRecording(ctx.page, path.join(VID, `${name}.webm`)); result.video = `video/${name}.webm (canvas MediaRecorder, real runtime pixels)`; }
    report.cases[name] = { ...result, readyMs: ctx.readyMs, assetsLoaded: ctx.assetsLoaded, pageErrors: ctx.errors, fixtureTeleports: bot.fixtureCalls, keyEvents: bot.events.length, seconds: (Date.now() - started) / 1000 };
  } catch (e) {
    report.toolFailures.push({ case: name, error: String(e.stack || e).slice(0, 1500) });
    if (ctx) await ctx.page.screenshot({ path: path.join(FR, `${name}-toolfailure.png`) }).catch(() => {});
  } finally {
    if (ctx) {
      await ctx.context.close();
    }
    await save();
  }
}

// 1. Rocks / shrub: real walk from spawn, then straight chords through three colliderless instances.
await route('nature-passable', async (page, bot) => {
  const spawn = (await bot.feedback()).player;
  const approach = await bot.walk([[-42, 38.5], [-50, 36.5]], { timeout: 25 });
  const passes = [];
  for (const [label, T, deg] of [['G21-rock@150deg', T_ROCK1, 150], ['G21-rock@175deg(s0.9)', T_ROCK2, 175], ['G20-shrub@197deg', T_SHRUB, 197]]) {
    const [a, b] = chord(T, deg);
    let closest = { d: Infinity }, shot = null;
    const w = await bot.walk([a, b], { timeout: 20, maxRecoveries: 0, stopOnBlocked: true, onTick: async (fb) => {
      const d = xz(fb.player, T);
      if (d < closest.d) closest = { d: +d.toFixed(3), p: fb.player, grounded: fb.grounded };
      if (!shot && d < 0.35) { shot = path.join(FR, `nature-${label.replace(/[^\w]+/g, '_')}-inside.png`); await page.screenshot({ path: shot }); }
    } });
    passes.push({ target: label, centreXZ: T.map(v => +v.toFixed(2)), chord: [a, b].map(q => q.map(v => +v.toFixed(2))), legs: w.legs,
      closestApproachToCentre_m: closest.d, yAtClosest: closest.p?.[1], groundedAtClosest: closest.grounded,
      passedThrough: w.legs.length === 2 && w.legs.every(l => l.reached) && closest.d < 0.35,
      screenshotInside: shot && path.relative(OUT, shot), trace: w.trace });
  }
  await page.screenshot({ path: path.join(FR, 'nature-end.png') });
  return { spawn, approachReached: approach.legs.map(l => l.reached), passes,
    rule: 'Pass = capsule centre came within 0.35 m of the instance centre after walking a straight chord with real keys and no block. Player radius 0.34; G21 footprint ~2.2 x 2.8 m, G20 ~1.4 x 2.0 m. Collider absence is also stated in source (WorldCamp.createNature: "No colliders").' };
}, { video: true });

// 2. Fire pit + tent air wall (front of C03, east side of C04).
await route('tent-airwall-and-firepit', async (page, bot) => {
  let fire = { d: Infinity };
  const toFire = await bot.walk([[-42, 30.0], [-42, 21]], { timeout: 25, maxRecoveries: 0, stopOnBlocked: true, onTick: async fb => {
    const d = xz(fb.player, CC); if (d < fire.d) fire = { d: +d.toFixed(3), y: +fb.player[1].toFixed(3) };
    if (d < 0.3 && !fire.shot) { fire.shot = 'frames/firepit-inside.png'; await page.screenshot({ path: path.join(OUT, fire.shot) }); } } });
  // Front approach to the large tent, centre line x=-42, heading north (-Z). Collider face z=14.6.
  const front = await bot.walk([[-42, 11.0]], { timeout: 15, maxRecoveries: 0, stopOnBlocked: true });
  const frontBlock = front.legs[0].end;
  await page.screenshot({ path: path.join(FR, 'tent-C03-front-blocked.png') });
  // East side of the east small tent (x=-33): collider face x=-30.25.
  const around = await bot.walk([[-38, 16.2], [-28.6, 16.0], [-28.6, 12.5]], { timeout: 25 });
  const side = await bot.walk([[-36, 12.5]], { timeout: 15, maxRecoveries: 0, stopOnBlocked: true });
  const sideBlock = side.legs[0].end;
  await page.screenshot({ path: path.join(FR, 'tent-C04-east-blocked.png') });
  return {
    firePit: { closestToFireCentre_m: fire.d, yNearCentre: fire.y, screenshot: fire.shot ?? null, walkedThrough: toFire.legs[0]?.reached === true && fire.d < 0.3,
      note: 'C05 stone ring is 3.2 m wide x 0.6 m high (visual). No camp collider list entry exists for it in c507506.' },
    tentFront: { blockedAt: frontBlock, reachedTarget: front.legs[0].reached, colliderFaceZ: 14.6, expectedBlockZ: 14.6 + 0.34,
      canvasGapAtBlock_m: 'audit/asset-vs-collider.json tent1_C03 south(+Z): door centre 0.67 m at 0.3 m height, 0.45-0.67 m across the doorway' },
    tentSide: { approachReached: around.legs.map(l => l.reached), blockedAt: sideBlock, reachedTarget: side.legs[0].reached, colliderFaceX: -30.25, expectedBlockX: -30.25 + 0.34,
      canvasGapAtBlock_m: 'audit tent2_C04 east(+X): 1.47 m at 0.3 m, 1.82 m at 1.0 m, 2.25 m at 1.6 m height' },
    traces: { toFire: toFire.trace, front: front.trace, side: side.trace },
    inference: 'Block positions are inferred from position stalling while real keys are held, compared with the source collider face. There is no contact API in c507506, so the touched collider identity is not proven.' };
}, { video: true });

// 3. Buffers + character action strip + pause/shot freeze at 1920x1080 and 2560x1440 (preserve buffer).
for (const [w, h, dpr] of [[1920, 1080, 1], [2560, 1440, 1], [1440, 900, 1], [1440, 900, 2]]) {
  const tag = `${w}x${h}@${dpr}`;
  await route(`buffer-${tag}`, async (page, bot) => {
    const facts = await canvasFacts(page);
    const spawnBuf = await saveBuffer(page, path.join(FR, `buffer-${tag}-spawn.png`));
    const out = { facts, spawnBuffer: path.relative(OUT, spawnBuf.file), bufferPixels: [spawnBuf.width, spawnBuf.height] };
    if (w === 1920) {
      // Character action: 6 frames walking, 6 running, 5 across a jump. Compared by eye + pixel diff later.
      const strip = [];
      await bot.hold(['KeyD']); await page.waitForTimeout(400);
      for (let i = 0; i < 6; i++) { strip.push({ phase: 'walk', ...(await saveBuffer(page, path.join(FR, `action-walk-${i}.png`))), fb: (await bot.feedback()).player }); await page.waitForTimeout(110); }
      await bot.hold(['KeyD', 'ShiftLeft']); await page.waitForTimeout(300);
      for (let i = 0; i < 6; i++) { strip.push({ phase: 'run', ...(await saveBuffer(page, path.join(FR, `action-run-${i}.png`))), fb: (await bot.feedback()).player }); await page.waitForTimeout(110); }
      await bot.release(); await page.waitForTimeout(400);
      await bot.press('Space');
      for (let i = 0; i < 5; i++) { strip.push({ phase: 'jump', ...(await saveBuffer(page, path.join(FR, `action-jump-${i}.png`))), fb: (await bot.feedback()).player }); await page.waitForTimeout(90); }
      out.actionStrip = strip.map(s => ({ phase: s.phase, file: path.relative(OUT, s.file), player: s.fb }));
      // Pause freeze: Esc, then two buffers 1 s apart. Shot freeze: set({shot}) via QA state.
      await page.waitForTimeout(800);
      await bot.press('Escape'); await page.waitForTimeout(600);
      const p1 = await saveBuffer(page, path.join(FR, 'pause-a.png')); const ps1 = (await bot.feedback()).player;
      await page.waitForTimeout(1000);
      const p2 = await saveBuffer(page, path.join(FR, 'pause-b.png')); const ps2 = (await bot.feedback()).player;
      await bot.press('Escape'); await page.waitForTimeout(400);
      await page.evaluate(() => window.__worldDebug.set({ shot: 'camp' })); await page.waitForTimeout(1500);
      const s1 = await saveBuffer(page, path.join(FR, 'shot-a.png')); await page.waitForTimeout(1000);
      const s2 = await saveBuffer(page, path.join(FR, 'shot-b.png'));
      await page.evaluate(() => window.__worldDebug.set({ shot: null }));
      out.freeze = { pause: [p1.file, p2.file].map(f => path.relative(OUT, f)), pausePlayerMoved_m: +xz(ps1, [ps2[0], ps2[2]]).toFixed(4),
        shot: [s1.file, s2.file].map(f => path.relative(OUT, f)), note: 'Pixel diffs computed by analyze_baseline.py' };
    }
    return out;
  }, { width: w, height: h, dpr, preserve: true });
}

// 4. Frame timing (no preserveDrawingBuffer), idle at spawn then walking.
for (const [w, h] of [[1440, 900], [1920, 1080], [2560, 1440]]) {
  await route(`timing-${w}x${h}`, async (page, bot) => {
    await page.waitForTimeout(1500);
    const idle = await frameTiming(page, 5);
    await bot.hold(['KeyD', 'KeyW']);
    const moving = await frameTiming(page, 5);
    await bot.release();
    return { idle, walking: moving, stats: (await bot.feedback()).stats, facts: await canvasFacts(page) };
  }, { width: w, height: h, dpr: 1 });
}

report.finishedAt = new Date().toISOString();
await save();
await browser.close();
console.log(JSON.stringify({ out: OUT, cases: Object.keys(report.cases), toolFailures: report.toolFailures.map(f => f.case) }));
