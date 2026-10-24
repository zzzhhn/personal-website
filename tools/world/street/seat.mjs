/** Bench sit / stand with real keys (E to sit, E to stand; then sit again and stand with W).
 * QA entry; the start is a logged fixture teleport next to each bench. Records store.seat, the player
 * position while seated (vs. seat point) and the stand-up spot (no overlap with the bench collider).
 * Usage: tools/bot-run.sh street 4334 tools/world/street/seat.mjs <outdir> */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { Bot, CHROME, loadPlaywright, openWorld, ensureDir } from '../playtest/lib.mjs';
const out = await ensureDir(process.env.WORLD_PLAYTEST_DIR || '/tmp/street-seat');
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4334';
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const report = { cases: [], errors: [] };
const { page, errors, context } = await openWorld(browser, base + '/world/?qa=1', { width: 1920, height: 1080, preserve: true });
const bot = new Bot(page);
try {
  await page.waitForTimeout(2000);
  const seats = await page.evaluate(() => window.__worldInteract.list().filter(i => i.kind === 'seat' && i.id.startsWith('street-')));
  report.seatCount = seats.length;
  const pick = (process.env.STREET_SEATS || 'street-bench-25,street-bench-30,street-bench-33,street-bench-34,street-shelter-seat').split(',');
  for (const id of pick) {
    const s = seats.find(x => x.id === id); if (!s) { report.errors.push('missing ' + id); continue; }
    const row = { id, anchor: s.position };
    // Stand 1.1 m in front of the anchor (away from the bench), then walk to it with real keys.
    await bot.fixtureTeleport([s.position[0], s.position[1] + 1, s.position[2]], `in front of ${id}`);
    await page.waitForTimeout(500);
    row.prompt = await page.evaluate(() => window.__worldDebug.state().nearbyInteract);
    await bot.press('KeyE'); await page.waitForTimeout(900);
    const sat = await page.evaluate(() => ({ seat: window.__worldDebug.state().seat, player: window.__worldDebug.snapshot().player, yaw: window.__worldDebug.snapshot().playerYaw }));
    row.seated = sat;
    row.seatedOffset = sat.seat ? Math.hypot(sat.player[0] - sat.seat.position[0], sat.player[2] - sat.seat.position[2]) : null;
    await page.screenshot({ path: path.join(out, `${id}-seated.png`) });
    await bot.press('KeyE'); await page.waitForTimeout(700);
    const stood = await page.evaluate(() => ({ seat: window.__worldDebug.state().seat, player: window.__worldDebug.snapshot().player, grounded: window.__worldDebug.snapshot().grounded, contacts: window.__worldDebug.contacts().map(c => c.other.kind + ':' + (c.other.name ?? '')) }));
    row.stoodE = stood;
    // Re-approach this seat if E currently belongs to a nearby exhibition board.
    row.afterStandPrompt = await page.evaluate(() => window.__worldDebug.state().nearbyInteract);
    if (row.afterStandPrompt?.id !== id) row.reapproach = await bot.walk([[s.position[0], s.position[2]]], { arrive: .35, timeout: 7, maxRecoveries: 1 });
    // Sit again, stand by walking (W).
    await bot.press('KeyE'); await page.waitForTimeout(700);
    const again = await page.evaluate(() => !!window.__worldDebug.state().seat);
    await bot.hold(['KeyW']); await page.waitForTimeout(700); await bot.release(); await page.waitForTimeout(300);
    const walked = await page.evaluate(() => ({ seat: window.__worldDebug.state().seat, player: window.__worldDebug.snapshot().player, grounded: window.__worldDebug.snapshot().grounded }));
    row.satAgain = again; row.stoodW = walked;
    row.passed = !!sat.seat && sat.seat.id === id && row.seatedOffset < .05 && !stood.seat && stood.grounded && again && !walked.seat;
    report.cases.push(row);
    console.log(JSON.stringify({ id, prompt: row.prompt?.id ?? row.prompt, seated: !!sat.seat, off: row.seatedOffset?.toFixed(3), stoodGrounded: stood.grounded, stoodAt: stood.player.map(v => +v.toFixed(2)), again, walkedOff: !walked.seat, passed: row.passed }));
  }
} catch (e) { report.errors.push(e.stack || String(e)); console.error(e); }
report.errors.push(...errors); report.fixtures = bot.fixtureCalls;
await writeFile(path.join(out, 'seat.json'), JSON.stringify(report, null, 1));
console.log('seats', report.seatCount, 'errors', JSON.stringify(report.errors.slice(0, 5)));
await context.close(); await browser.close();
