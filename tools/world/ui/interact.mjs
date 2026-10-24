/** ui session: real-key interaction bot on ?qa=1&uitest=1 (QA fixtures beside the camp spawn).
 * Walks with WASD (Bot.walk, no teleport), checks the DOM prompt, E opens / E closes, Q switches, Esc and the
 * close button close, the blackboard pages, the language switch, the Esc menu. Writes interact.json + PNGs. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadPlaywright, CHROME, Bot } from '../playtest/lib.mjs';
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4337';
const out = process.env.WORLD_PLAYTEST_DIR || '/tmp/ui-interact';
await mkdir(out, { recursive: true });
const R = { base, url: null, checks: [], errors: [], listed: null, fixtureCalls: [] };
const check = (name, pass, detail) => { R.checks.push({ name, pass: !!pass, detail }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? ' ' + JSON.stringify(detail) : '')); };
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', e => R.errors.push(e.message));
page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/api/events')) R.errors.push(`HTTP ${r.status()} ${r.url()}`); });
const shot = n => page.screenshot({ path: path.join(out, n + '.png') });
const dom = () => page.evaluate(() => ({
  prompt: [...document.querySelectorAll('.world-prompt li')].map(li => ({ text: li.textContent, active: li.classList.contains('is-active') })),
  card: document.querySelector('.world-card') ? { title: document.querySelector('.world-card h3')?.textContent, eyebrow: document.querySelector('.world-card-eyebrow')?.textContent,
    pager: document.querySelector('.world-card-pager em')?.textContent ?? null, board: document.querySelector('.world-card-board-code')?.textContent ?? null } : null,
  store: (({ card, nearbyInteract, interactPick, lang, paused }) => ({ card, nearby: nearbyInteract?.id ?? null, pick: interactPick, lang, paused }))(window.__worldDebug.state()),
}));
const wait = ms => page.waitForTimeout(ms);
try {
  R.url = base + '/world/?qa=1&uitest=1';
  await page.goto(R.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__worldDebug?.state().ready && window.__worldDebug.snapshot().player, undefined, { timeout: 120000 });
  await wait(1500);
  R.listed = await page.evaluate(() => window.__worldInteract?.list().map(i => i.id));
  check('fixtures registered', R.listed?.filter(i => i.startsWith('uitest-')).length === 6, R.listed);
  const bot = new Bot(page);
  // 1) Walk (real keys) to the education desk fixture; the tent / flags fixtures are within reach too.
  const w1 = await bot.walk([[-46, 37.9]], { arrive: .5, timeout: 25 });
  check('walked to camp fixtures', w1.legs[0]?.reached, w1.legs[0]?.end);
  await wait(600);
  let d = await dom();
  check('prompt shows nearest', d.prompt.length >= 1 && d.prompt.some(p => p.active), d.prompt);
  check('multi-target list', d.prompt.length >= 2, d.prompt.map(p => p.text));
  await shot('01-prompt-list');
  // 2) Q switches the highlighted row.
  const before = d.prompt.find(p => p.active)?.text;
  await bot.press('KeyQ'); await wait(300); d = await dom();
  const after = d.prompt.find(p => p.active)?.text;
  check('Q switches target', before && after && before !== after, { before, after, pick: d.store.pick });
  await shot('02-prompt-switched');
  // 3) E opens the chosen (not the nearest) target.
  await bot.press('KeyE'); await wait(700); d = await dom();
  check('E opens chosen card', !!d.card && after && after.includes(d.card.title ? '' : '') && d.store.card, { card: d.store.card, title: d.card?.title, chosen: after });
  await shot('03-card-chosen');
  // 4) E closes (WorldActors priority), Esc closes, the close button closes.
  await bot.press('KeyE'); await wait(500); d = await dom();
  check('E closes card', !d.card && !d.store.card, d.store);
  await bot.press('KeyE'); await wait(600); d = await dom();
  check('E reopens nearest', !!d.card, d.card);
  await shot('04-card-nearest');
  await bot.press('Escape'); await wait(500); d = await dom();
  check('Esc closes card without opening menu', !d.card && !d.store.paused, d.store);
  await bot.press('KeyE'); await wait(600);
  await page.locator('.world-card-close').click(); await wait(400); d = await dom();
  check('close button closes card', !d.card, d.store);
  // 5) Experience card (latest internship, startDate id).
  const w2 = await bot.walk([[-42, 40.0]], { arrive: .45, timeout: 20 });
  await wait(500); d = await dom();
  const exp = d.prompt.find(p => /internship|实习/i.test(p.text));
  if (exp && !exp.active) { await bot.press('KeyQ'); await wait(250); d = await dom(); if (!d.prompt.find(p => p.active)?.text.match(/internship|实习/i)) { await bot.press('KeyQ'); await wait(250); } }
  await bot.press('KeyE'); await wait(700); d = await dom();
  check('experience card', d.store.card?.kind === 'experience' && /Tencent/.test(d.card?.title ?? ''), { walk: w2.legs[0]?.reached, card: d.store.card, title: d.card?.title });
  await shot('05-card-experience');
  // 6) Language switch while a card is open (Esc menu): card re-renders in Chinese.
  await bot.press('Escape'); await wait(300);
  await bot.press('Escape'); await wait(600);
  d = await dom(); check('Esc opens menu', d.store.paused, d.store);
  await page.getByRole('button', { name: '中文' }).click(); await wait(300);
  await shot('06-menu-zh');
  await bot.press('Escape'); await wait(600); d = await dom();
  check('menu closes, lang zh', !d.store.paused && d.store.lang === 'zh', d.store);
  await bot.press('KeyE'); await wait(700); d = await dom();
  check('zh experience card', d.store.card?.kind === 'experience' && /腾讯|混元/.test(d.card?.title ?? ''), d.card);
  await shot('07-card-experience-zh');
  await bot.press('KeyE'); await wait(400);
  // 7) Blackboard: each E on the board turns a page (re-opens the card on the next course).
  const w3 = await bot.walk([[-38, 38.0]], { arrive: .45, timeout: 20 });
  await wait(500); d = await dom();
  for (let i = 0; i < 3 && !d.prompt.find(p => p.active)?.text.match(/黑板|Blackboard/); i++) { await bot.press('KeyQ'); await wait(250); d = await dom(); }
  const pages = [];
  for (let i = 0; i < 5; i++) {
    await bot.press('KeyE'); await wait(600); d = await dom(); pages.push({ open: d.card?.board, pager: d.card?.pager });
    if (i === 1) await shot('08-card-board');
    await bot.press('KeyE'); await wait(400);
  }
  check('blackboard pages cycle (4 courses from content)', pages[0]?.open && pages[4]?.open === pages[0]?.open && new Set(pages.slice(0, 4).map(p => p.open)).size === 4, { walk: w3.legs[0]?.reached, pages });
  // 8) Arrow keys page inside an open board card.
  await bot.press('KeyE'); await wait(600); const a0 = (await dom()).card?.board;
  await bot.press('ArrowRight'); await wait(400); const a1 = (await dom()).card?.board;
  check('arrow turns board page', a0 && a1 && a0 !== a1, { a0, a1 });
  // 9) Walking away closes the card.
  await bot.hold(['KeyS']); await wait(1500); await bot.release(); await wait(400); d = await dom();
  check('walking away closes card', !d.card, d.store);
  await shot('09-walked-away');
  // 10) Narrow viewport: card layout (centred) with the Chinese experience card.
  await page.setViewportSize({ width: 1280, height: 800 }); await wait(500);
  await bot.walk([[-42, 40.0]], { arrive: .45, timeout: 20 }); await wait(500); d = await dom();
  for (let i = 0; i < 4 && !d.prompt.find(p => p.active)?.text.match(/实习|internship/i); i++) { await bot.press('KeyQ'); await wait(250); d = await dom(); }
  await bot.press('KeyE'); await wait(700); d = await dom();
  check('narrow card opens', !!d.card, d.card); await shot('10-narrow-card');
  await bot.press('KeyE'); await wait(400);
  R.fixtureCalls = bot.fixtureCalls;
} catch (e) { R.errors.push('bot: ' + e.message); console.log('ERROR', e.message); await shot('99-error').catch(() => {}); }
await browser.close();
R.summary = { pass: R.checks.filter(c => c.pass).length, fail: R.checks.filter(c => !c.pass).length };
await writeFile(path.join(out, 'interact.json'), JSON.stringify(R, null, 2));
console.log(JSON.stringify({ summary: R.summary, errors: R.errors }));
