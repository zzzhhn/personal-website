/** Bounded character integration check. QA fixtures position actors only; transitions use real keys. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { Bot, loadPlaywright, CHROME, comboFor } from '../playtest/lib.mjs';
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4342';
const out = process.env.WORLD_PLAYTEST_DIR || '/tmp/bobby-phase2-character';
await mkdir(out, { recursive: true });
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const report = { errors: [], checks: [], fixtures: [] };
let page;
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(base + '/world/?qa=1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__worldDebug?.actor().loaded, undefined, { timeout: 90000 });
  await page.evaluate(() => __worldDebug.set({ zoom: 0, quality: 'balanced' }));
  const bot = new Bot(page), wait = ms => page.waitForTimeout(ms);
  const sample = () => page.evaluate(() => ({ actor: __worldDebug.actor(), state: __worldDebug.state(), snapshot: __worldDebug.snapshot() }));
  const shot = label => page.screenshot({ path: `${out}/${label}.png` });
  if (process.env.PHASE2_INTERACTIONS_ONLY !== '1' && process.env.PHASE2_VAULT_ONLY !== '1') {
  await bot.fixtureTeleport([-88.6, 2.02, 24], 'clear flat west road for braking / reversals');
  await wait(1100);
  const north = comboFor(0, -1).keys, south = comboFor(0, 1).keys;
  await bot.hold([...north, 'ShiftLeft']); await wait(1400);
  const sprint = await sample(); assert.equal(sprint.actor.animation, 'Sprint'); await shot('sprint');
  const before = await sample(); await bot.release(); await wait(850); const after = await sample();
  const brakeDistance = Math.hypot(after.snapshot.player[0] - before.snapshot.player[0], after.snapshot.player[2] - before.snapshot.player[2]);
  // Distance is observational: CDP/key delivery and render hitches do not define an exact input edge.
  // The headless physics regression verifies the actual acceleration/braking bounds.
  const stoppedSpeed = Math.hypot(after.snapshot.playerVelocity[0], after.snapshot.playerVelocity[2]);
  assert.ok(stoppedSpeed < .2 && brakeDistance < 2.3, `stopped speed ${stoppedSpeed}, distance ${brakeDistance}`);
  report.checks.push({ name: 'sprint-brake', brakeDistance, stoppedSpeed }); await shot('stop');
  await bot.hold(north); await wait(700); await bot.hold(south); await wait(500); await shot('reversal');
  await bot.release(); await wait(1000); await bot.press('Space'); await wait(340); await shot('jump'); await wait(1000);
  assert.equal((await sample()).snapshot.grounded, true); report.checks.push({ name: 'jump-land', grounded: true });
  }
  if (process.env.PHASE2_VAULT_ONLY === '1') {
    await page.waitForFunction(() => window.__worldCampContent, undefined, { timeout: 60000 });
    const crossing = comboFor(1, 0), [dx, dz] = crossing.dir;
    await page.evaluate(() => __worldDebug.wheelFixture(true, 41.1, 3));
    await bot.fixtureTeleport([-42 - dx * .98, 5.68, 41.1 - dz * .98], 'existing 60 cm QA post on camp ground, crossing direction logged');
    await page.waitForFunction(() => __worldDebug.snapshot().grounded, undefined, { timeout: 15000 });
    await page.evaluate(() => {
      window.__vaultTrace = []; const until = performance.now() + 1800;
      const tick = () => { const a = __worldDebug.actor(), s = __worldDebug.snapshot();
        window.__vaultTrace.push({ vault: a.vault, kind: a.jumpKind, p: s.player, grounded: s.grounded });
        if (performance.now() < until) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    });
    await bot.hold(crossing.keys); await bot.press('Space'); await wait(150); await shot('low-vault');
    await bot.release(); await wait(1800);
    const rows = await page.evaluate(() => window.__vaultTrace);
    await writeFile(`${out}/vault-trace.json`, JSON.stringify(rows));
    assert.ok(rows.some(row => row.vault && row.kind === 'RunJump'), 'contextual crossing uses running-jump mocap');
    assert.ok(rows.some(row => (row.p[0] + 42) * dx + (row.p[2] - 41.1) * dz > .65), 'crossed to the far side');
    await page.evaluate(() => __worldDebug.wheelFixture(false));
    report.checks.push({ name: 'runtime-low-vault', activeFrames: rows.filter(row => row.vault).length });
    await writeFile(`${out}/vault-trace.json`, JSON.stringify(rows));
  } else {
  // Real registered seat, real E. Position-only fixture avoids spending a minute crossing the island.
  await page.waitForFunction(() => window.__worldInteract?.list().some(row => row.kind === 'seat' && /camp/i.test(row.id)), undefined, { timeout: 60000 });
  const seat = await page.evaluate(() => __worldInteract.list().find(row => row.kind === 'seat' && /camp/i.test(row.id)));
  assert.ok(seat, 'registered seat');
  const seatYaw = await page.evaluate(id => __worldCampContent.seats().find(row => row.id === id).yaw, seat.id);
  await bot.fixtureTeleport([seat.position[0] + Math.cos(seatYaw) * .4, 5.7, seat.position[2] - Math.sin(seatYaw) * .4], `approach real seat ${seat.id} from its front`);
  await page.waitForFunction(() => { const s=__worldDebug.snapshot();return s.grounded&&s.player[1]<5.7&&Math.abs(s.playerVelocity[1])<.1; }, undefined, { timeout: 15000 });
  await wait(250); await bot.press('KeyE');
  await page.waitForFunction(() => __worldDebug.actor().animation === 'SitIdle', undefined, { timeout: 15000 });
  await shot('sit');
  await page.evaluate(() => {
    window.__standTrace = []; const until = performance.now() + 1500;
    const tick = () => { const a = __worldDebug.actor(), s = __worldDebug.snapshot();
      window.__standTrace.push({ animation: a.animation, at: a.animationTime, p: s.player, v: s.playerVelocity }); if (performance.now() < until) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await bot.hold(['KeyW']); await wait(120);
  const rising = await sample(); assert.equal(rising.actor.animation, 'StandUp'); await shot('stand-up');
  await wait(900); await bot.release(); await wait(1000);
  const standing = await page.evaluate(() => window.__standTrace.filter(row => row.animation === 'StandUp').slice(2));
  await writeFile(`${out}/stand-trace.json`, JSON.stringify(standing));
  assert.ok(standing.length > 2, 'captured weight transfer frames');
  const drift = Math.max(...standing.map(row => Math.hypot(row.p[0] - standing[0].p[0], row.p[2] - standing[0].p[2])));
  assert.ok(drift < .05, `no running during weight transfer: ${drift}`);
  report.checks.push({ name: 'seat-stand-input', seat: seat.id, standingFrames: standing.length, drift });
  // Door progression, pause continuity and queued E cancellation.
  await page.evaluate(() => __worldDebug.teleportVehicle('offroad', [-88, 2.5, 12], 0));
  await bot.fixtureTeleport([-88, 2.02, 14.3], 'door approach fixture'); await wait(1000);
  assert.equal(await page.evaluate(() => __worldDebug.enter('offroad')), true);
  await wait(350); await page.evaluate(() => __worldDebug.set({ paused: true }));
  const frozen = await sample(); await wait(400); const paused = await sample();
  assert.equal(paused.actor.animationTime, frozen.actor.animationTime);
  await page.evaluate(() => __worldDebug.set({ paused: false })); await wait(150);
  assert.equal((await sample()).actor.vehicle?.phase, 'enter');
  await bot.press('KeyE'); await shot('enter-cabin'); await wait(450); await shot('exit-cabin'); await wait(1500);
  assert.equal((await sample()).state.activeVehicle, null);
  report.checks.push({ name: 'door-pause-queued-exit', pausedAnimation: paused.actor.animation });
  // No valid floor at any door: exit must leave the player in the car.
  await page.evaluate(() => __worldDebug.teleportVehicle('offroad', [400, 20, 400], 0));
  assert.equal(await page.evaluate(() => __worldDebug.enter('offroad')), true); await wait(1250);
  const denied = await page.evaluate(() => __worldDebug.exit()); assert.equal(denied, false);
  assert.equal((await sample()).state.activeVehicle, 'offroad');
  report.checks.push({ name: 'exit-no-space', denied: !denied });
  report.fixtures = bot.fixtureCalls;
  await page.goto(base + '/world/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('canvas') && !document.body.textContent.includes('Preparing the island'), undefined, { timeout: 90000 });
  await wait(1000);
  assert.equal(await page.evaluate(() => '__worldDebug' in window), false);
  await shot('normal-entry'); report.checks.push({ name: 'normal-entry', qaApi: false });
  }
} catch (error) {
  report.errors.push(String(error.stack || error));
  report.failure = await page?.evaluate(() => ({ actor: __worldDebug.actor(), state: __worldDebug.state() })).catch(() => null);
  await page?.screenshot({ path: `${out}/failure.png` }).catch(() => {});
}
finally {
  await browser.close(); await writeFile(`${out}/runtime-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report)); if (report.errors.length) process.exitCode = 1;
}
