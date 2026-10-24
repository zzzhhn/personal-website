/**
 * G24 v3 runtime jump/landing/locomotion check (QA entry ?qa=1, observation only) + normal-entry recording.
 * Usage: node tools/world/guide/runtime/jump-runtime.mjs [BASE] [OUTDIR]
 * QA pass: real keys only (WASD/Shift/Space), reads window.__worldDebug actor state every animation frame:
 *   five cases (stand jump, run jump, sprint jump, land into run, land standing), per frame animation,
 *   airPhase, playbackRate, grounded, vy, sole heights. Checks: no frozen air pose (airPhase changes every
 *   airborne frame), RunJump chosen at >= 2.5 m/s, moving landing never shows 'Land', playback 0.85-1.2 in steady
 *   gait, stop-step/slope pelvis drop <= 5 cm, slope fit neutral on flat ground.
 * Normal pass: same key sequence on /world/ without query (no debug API), canvas recording only.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { loadPlaywright, CHROME, startCanvasRecording, stopCanvasRecording } from '../../playtest/lib.mjs';
const base = process.argv[2] || 'http://127.0.0.1:4322';
const out = process.argv[3] || 'docs/world/quality-v3/guide/runtime';
await mkdir(out, { recursive: true });
const sha = execSync('shasum -a 256 public/assets/world/guide/G24.glb').toString().split(' ')[0];
const report = { base, glbSha256: sha, startedAt: new Date().toISOString(), cases: {}, errors: [], limits: [
  'Headless Chrome (Metal ANGLE) on M5 Pro, not M1.', 'Samples are taken from requestAnimationFrame in the page; the bot input itself is real keyboard events.',
  'Flat camp ground near spawn; slope cases are measured by the main-thread bot on the ramp route.'] };
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });

async function open(url) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.routeWebSocket('**/*', ws => ws.close());
  page.on('pageerror', e => report.errors.push(`${url}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('[vite]') && !m.text().startsWith('Failed to load resource')) report.errors.push(`${url}: ${m.text()}`); });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => !document.querySelector('.world-loading') && document.querySelector('canvas'), undefined, { timeout: 90000 });
  await page.waitForTimeout(2500);
  return page;
}
const held = new Set();
async function hold(page, keys) { const n = new Set(keys); for (const k of [...held]) if (!n.has(k)) { await page.keyboard.up(k); held.delete(k); } for (const k of n) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); } }
// The camera faces the camp; 'KeyS' moves toward the camera along open ground near spawn, alternate W/S to stay in the clearing.
const SEQ = [
  { name: 'stand-jump', steps: [[[], 600], ['jump'], [[], 1600]] },
  { name: 'run-jump-into-run', steps: [[['KeyW'], 1400], ['jump'], [['KeyW'], 1600], [[], 900]] },
  { name: 'sprint-jump-into-sprint', steps: [[['KeyS', 'ShiftLeft'], 1300], ['jump'], [['KeyS', 'ShiftLeft'], 1500], [[], 900]] },
  { name: 'run-jump-land-standing', steps: [[['KeyW'], 1200], ['jump'], [['KeyW'], 250], [[], 1800]] },
  { name: 'stand-jump-then-run', steps: [[[], 500], ['jump'], [[], 1000], [['KeyS'], 1200], [[], 900]] },
];
async function play(page, steps) {
  for (const st of steps) {
    if (st[0] === 'jump') { await page.keyboard.press('Space'); continue; }
    await hold(page, st[0]); await page.waitForTimeout(st[1]);
  }
  await hold(page, []);
}
// ---------------- QA pass
{
  const page = await open(base + '/world/?qa=1');
  for (const c of SEQ) {
    await page.evaluate(() => { window.__g24 = []; const tick = () => { const d = window.__worldDebug; if (!d) return; const a = d.actor(), n = d.snapshot();
      window.__g24.push({ t: performance.now(), anim: a.animation, at: a.animationTime, air: a.airPhase, rate: a.playbackRate, jk: a.jumpKind, land: a.lastLanding,
        grounded: n.grounded, v: n.playerVelocity, p: n.player, stop: a.stop ? a.stop.pelvisDrop : 0, stopState: a.stop ? a.stop.state : null,
        slope: a.slope ? { drop: a.slope.pelvisDrop, l: a.slope.left.shift, r: a.slope.right.shift, lw: a.slope.left.weight, rw: a.slope.right.weight, ld: a.slope.left.slopeDeg, rd: a.slope.right.slopeDeg } : null,
        sole: a.soles ? [a.soles.left?.minY ?? null, a.soles.right?.minY ?? null] : null, root: a.root }); if (window.__g24run) requestAnimationFrame(tick); };
      window.__g24run = true; requestAnimationFrame(tick); });
    await play(page, c.steps);
    const rows = await page.evaluate(() => { window.__g24run = false; return window.__g24; });
    const air = rows.filter(r => !r.grounded && r.jk);   // jump flight frames only
    const frozen = air.slice(1).filter((r, i) => r.anim && r.anim.endsWith('Air') && air[i].anim === r.anim && Math.abs(r.air - air[i].air) < 1e-6 && Math.abs((r.v?.[1] ?? 0) - (air[i].v?.[1] ?? 0)) > 0.05).length;
    const anims = [...new Set(rows.map(r => r.anim))];
    // the real take-off is the first frame with a jumpKind (jumpSeq edge); ground bumps at sprint speed
    // are short ungrounded frames without one and keep the gait (FALL_GRACE)
    const takeoff = rows.findIndex(r => !r.grounded && r.jk);
    report.cases[c.name] = { groundBumpFrames: rows.filter(r => !r.grounded && !r.jk).length };
    const hspd = takeoff > 0 ? Math.hypot(rows[takeoff].v[0], rows[takeoff].v[2]) : null;
    const kind = air.find(r => r.jk)?.jk ?? null;
    const land = rows.findIndex((r, i) => i > takeoff && takeoff > 0 && !rows[i - 1].grounded && r.grounded);
    const after = land > 0 ? rows.slice(land, land + 40) : [];
    // steady = body speed within 5 % of the commanded 3.6 / 6.2 m/s (accelerations excluded, spec 1.2)
    const steady = rows.filter(r => { if (!r.grounded || !['Run', 'Sprint', 'Walk'].includes(r.anim) || !r.v) return false; const h = Math.hypot(r.v[0], r.v[2]);
      return Math.abs(h - 3.6) < .18 || Math.abs(h - 6.2) < .31; });
    const rates = steady.map(r => r.rate).sort((a, b) => a - b);
    const q = p => rates.length ? +rates[Math.floor(p * (rates.length - 1))].toFixed(3) : null;
    const flight = takeoff > 0 && land > 0 ? (rows[land].t - rows[takeoff].t) / 1000 : null;
    const apex = air.length ? Math.max(...air.map(r => r.p[1])) - rows[Math.max(0, takeoff - 1)].p[1] : null;
    report.cases[c.name] = { ...report.cases[c.name], frames: rows.length, animations: anims, takeoffHorizontalSpeed: hspd && +hspd.toFixed(3), jumpKind: kind,
      flightSeconds: flight && +flight.toFixed(3), apexMetres: apex && +apex.toFixed(3), airFrames: air.length, frozenAirFrames: frozen,
      airPhaseRange: air.length ? [Math.min(...air.map(r => r.air ?? 0)), Math.max(...air.map(r => r.air ?? 0))] : null,
      landingAnimations: [...new Set(after.map(r => r.anim))], landingKind: after.find(r => r.land)?.land ?? null,
      steadyPlaybackRate: { p05: q(.05), p50: q(.5), p95: q(.95), n: rates.length },
      pelvisDropMax: +Math.max(0, ...rows.map(r => (r.stop || 0) + (r.slope?.drop || 0))).toFixed(4),
      slopeShiftMaxAbs: +Math.max(0, ...rows.map(r => Math.max(Math.abs(r.slope?.l || 0), Math.abs(r.slope?.r || 0)))).toFixed(4),
      // flat-ground neutrality (spec 10.1): frames whose probed ground under both feet is within 1 deg of level
      flatNeutral: (() => { const f = rows.filter(r => r.grounded && r.slope && r.slope.ld < 1 && r.slope.rd < 1); const v = f.flatMap(r => [Math.abs(r.slope.l), Math.abs(r.slope.r)]);
        return v.length ? { frames: f.length, mean: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(4), max: +Math.max(...v).toFixed(4) } : null; })(),
      groundSlopeDegMax: +Math.max(0, ...rows.filter(r => r.slope).map(r => Math.max(r.slope.ld, r.slope.rd))).toFixed(2),
      groundedSoleMinRange: (() => { const g = rows.filter(r => r.grounded && r.sole && r.root); const v = g.map(r => Math.min(r.sole[0] ?? 9, r.sole[1] ?? 9) - (r.root[1] - 0)); return v.length ? [+Math.min(...v).toFixed(4), +Math.max(...v).toFixed(4)] : null; })() };
    await writeFile(path.join(out, `qa-${c.name}.json`), JSON.stringify(rows));
    await page.waitForTimeout(600);
  }
  await page.close();
}
// ---------------- normal entry (no query, no debug API): same keys, canvas recording
{
  const page = await open(base + '/world/');
  report.normalEntry = { url: page.url(), debugApiPresent: await page.evaluate(() => '__worldDebug' in window), clips: [], zoom: 'nearest (one real wheel step up from the default)' };
  const box = await page.locator('canvas').first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -120); await page.waitForTimeout(1200);
  for (const c of SEQ) {
    const file = path.join(out, `normal-near-${c.name}.webm`);
    await startCanvasRecording(page, 30); const t0 = Date.now();
    await play(page, c.steps); await page.waitForTimeout(300);
    await stopCanvasRecording(page, file);
    report.normalEntry.clips.push({ name: c.name, file, seconds: (Date.now() - t0) / 1000 });
    await page.waitForTimeout(500);
  }
  await page.close();
}
await browser.close();
const C = report.cases;
report.checks = {
  noFrozenAirPose: Object.values(C).every(c => c.frozenAirFrames === 0),
  runJumpWhenFast: Object.values(C).every(c => c.takeoffHorizontalSpeed === null || (c.takeoffHorizontalSpeed >= 2.5) === (c.jumpKind === 'RunJump')),
  movingLandingSkipsLand: ['run-jump-into-run', 'sprint-jump-into-sprint'].every(n => C[n] && !C[n].landingAnimations.includes('Land')),
  standingLandingUsesLand: ['stand-jump', 'run-jump-land-standing'].every(n => C[n] && C[n].landingAnimations.includes('Land')),
  pelvisDropWithin5cm: Object.values(C).every(c => c.pelvisDropMax <= 0.05),
  slopeNeutralOnFlat: Object.values(C).every(c => !c.flatNeutral || (c.flatNeutral.mean <= 0.003 && c.flatNeutral.max <= 0.008)),
  steadyPlaybackIn085to12: Object.values(C).every(c => !c.steadyPlaybackRate.n || (c.steadyPlaybackRate.p05 >= .85 && c.steadyPlaybackRate.p95 <= 1.2)),
  noPageErrors: report.errors.length === 0,
};
await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ checks: report.checks, cases: Object.fromEntries(Object.entries(C).map(([k, v]) => [k, { kind: v.jumpKind, h: v.takeoffHorizontalSpeed, flight: v.flightSeconds, apex: v.apexMetres, frozen: v.frozenAirFrames, air: v.airPhaseRange, land: v.landingAnimations, rate: v.steadyPlaybackRate, drop: v.pelvisDropMax, slope: v.slopeShiftMaxAbs, flat: v.flatNeutral, gdeg: v.groundSlopeDegMax, anims: v.animations }])), errors: report.errors.slice(0, 5) }, null, 1));
