/** Exhibit bot: for each hut, fixture-teleport to the spur end (logged), walk in with real keys to the
 * exhibit anchor, read the HUD prompt, press E (real key), screenshot during and after the action.
 * Accompany: E sits (store.seat), bubbles appear, then E again stands up. DJ: press twice. Board: twice.
 * Usage via bot-run.sh: exhibit-bot.mjs [hut ids...] */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { loadPlaywright, CHROME, openWorld, Bot } from '../playtest/lib.mjs';
const out = process.env.WORLD_PLAYTEST_DIR, only = process.argv.slice(2);
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const report = { started: new Date().toISOString(), huts: [] };
try {
  const { page, errors } = await openWorld(browser, `${process.env.WORLD_BASE_URL}/world/?qa=1`, { width: 1920, height: 1080 });
  await page.addStyleTag({ content: 'astro-dev-toolbar{display:none!important}' });
  await page.waitForFunction(() => window.__parkWalk?.huts && window.__worldDebug.sceneObjects().includes('park-exhibits'), undefined, { timeout: 40000 });
  await page.waitForTimeout(1800);
  const park = await page.evaluate(() => window.__parkWalk);
  const bot = new Bot(page);
  const prompt = () => page.evaluate(() => ({ store: window.__worldDebug.state().nearbyInteract, seat: window.__worldDebug.state().seat, hud: document.querySelector('.world-interaction span')?.textContent ?? null }));
  const states = () => page.evaluate(() => window.__parkExhibits?.() ?? {});
  const shot = n => page.screenshot({ path: path.join(out, n + '.png') });
  /** Aim the orbit camera with real mouse drags so it looks from behind the player toward `p`. */
  const heading = async () => { const c = await page.evaluate(() => window.__worldDebug.camera()); return Math.atan2(c.forwardGround[1], c.forwardGround[0]); };
  const home = await heading();
  const aim = async (p, pitchDown = 0, absolute = null) => {
    const b = await page.locator('canvas').first().boundingBox(), cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    for (let i = 0; i < 8; i++) {
      const me = (await bot.feedback()).player;
      const want = absolute ?? Math.atan2(p[2] - me[2], p[0] - me[0]), have = await heading();
      const d = Math.atan2(Math.sin(want - have), Math.cos(want - have));
      if (Math.abs(d) < 0.06) break;
      await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + d * 90, cy + pitchDown, { steps: 6 }); await page.mouse.up();
      pitchDown = 0;
    }
  };
  for (const h of park.huts) {
    if (only.length && !only.includes(h.id)) continue;
    await page.evaluate(() => window.__worldDebug.set({ zoom: 0 }));
    await aim(null, 0, home);   // the bot's key mapping assumes the default camera heading
    await bot.fixtureTeleport([h.spurEnd[0], 2.3, h.spurEnd[2]], `spur end of ${h.id}`);
    const w = await bot.walk([[h.opening[0], h.opening[2]], [h.anchor[0], h.anchor[2]]], { timeout: 12, arrive: 0.45 });
    await page.waitForTimeout(600);
    const walkEnd = await bot.feedback();
    await page.evaluate(() => window.__worldDebug.set({ zoom: 1 }));
    await aim(h.inside.map((v, i) => i === 1 ? v : v + (v - h.opening[i]) * 0.6));
    await page.waitForTimeout(500);
    const row = { id: h.id, reached: w.legs.every(l => l.reached), before: await prompt(), initialState: await states(), walkEnd, walkLegs: w.legs, afterAim: await bot.feedback() };
    await bot.press('KeyE');
    await page.waitForTimeout(h.id === 'djc' ? 600 : 1600);
    row.during = await prompt(); row.duringState = await states(); await shot(`${h.id}-during`);
    if (h.id === 'accompany') {
      await page.waitForTimeout(4200); row.seated = await prompt(); row.seatedState = await states(); await shot(`${h.id}-bubbles`);
      await page.evaluate(() => window.__worldDebug.set({ light: 'night', lang: 'zh' })); await page.waitForTimeout(2300); await shot(`${h.id}-night-zh`);
      await bot.press('KeyE'); await page.waitForTimeout(800); row.afterStand = await prompt(); row.standState = await states();
      row.standPlayer = (await bot.feedback()).player;
    } else {
      await page.waitForTimeout(h.id === 'alpha-agent' ? 3500 : 2600); await shot(`${h.id}-result`);
      if (h.id === 'djc' || h.id === 'interactive-learning' || h.id === 'evalforge' || h.id === 'hepai') {
        await page.waitForTimeout(1500); await bot.press('KeyE'); await page.waitForTimeout(2600); await shot(`${h.id}-second`);
      }
    }
    row.finalState = await states(); report.huts.push(row); console.log(h.id, JSON.stringify({before:row.before.store?.id,position:row.walkEnd.player,state:row.finalState}));
  }
  report.fixtures = bot.fixtureCalls; report.events = bot.events;
  report.audio = await page.evaluate(() => ({ ctx: !!window.__parkAudio?.ctx, state: window.__parkAudio?.ctx?.state ?? null, x: window.__parkAudio?.crossfade ?? null }));
  report.errors = errors.filter(e => !e.includes('changed size between renders'));
} catch (e) { report.fatal = String(e.stack || e); }
finally {
  await browser.close();
  await writeFile(path.join(out, 'exhibit-bot.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ huts: report.huts.map(h => ({ id: h.id, reached: h.reached, prompt: h.before?.store?.label?.en ?? null, seat: h.seated?.seat?.id ?? null, stood: h.afterStand ? !h.afterStand.seat : undefined })), audio: report.audio, fatal: report.fatal, errors: report.errors?.slice(0, 4) }));
}
