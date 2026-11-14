/** Five-module directed browser evidence. Run from repository root; does not edit runtime.
 * node tools/world/factory-integration/modules-browser.mjs
 * Optional: MODULE_BASE_URL, MODULE_OUT, MODULE_INTENT_FIXTURE, MODULE_UNIT_LOG.
 * QA links/buttons only choose initial arrival for each independent module case.
 * The historical save fixture is explicitly isolated; it is NOT an earned unlock.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const { chromium } = createRequire('/tmp/alpha-scene-browser/package.json')('playwright');
const root = process.cwd();
const base = process.env.MODULE_BASE_URL ?? 'http://127.0.0.1:4361';
const out = path.resolve(process.env.MODULE_OUT ?? 'docs/world/factory-integration-20261114/evidence/modules-browser');
const fixturePath = path.resolve(process.env.MODULE_INTENT_FIXTURE ?? 'docs/world/phase-2-playground/coaster-car-astra-pilot-20261104/ride-complete.json');
const started = Date.now(), deadline = started + 540000;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hashes = () => Object.fromEntries(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src', 'public'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).map(p => [p, sha(fs.readFileSync(p))]));
fs.mkdirSync(out, { recursive: true });
const result = {
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
  base, viewport: [1920, 1080], started: new Date().toISOString(), hashes: hashes(),
  scope: 'Five independent module cases; QA initial arrivals, then real keyboard/mouse/buttons. No claim of ordinary-entry complete production or earned old coaster unlock.',
  visualAcceptance: 'screenshots-await-human-review', cases: [], errors: [], console: [], requestsFailed: [],
};
if (process.env.MODULE_UNIT_LOG) {
  const file = path.resolve(process.env.MODULE_UNIT_LOG);
  result.unitEvidence = { path: file, sha256: sha(fs.readFileSync(file)), claim: 'External unit-test evidence; browser script does not rerun or infer its outcome.' };
}
let browser, context, page, current, held = new Set();
function persist() { fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); }
function budget() { if (Date.now() > deadline) throw Error('Nine-minute browser evidence budget exhausted'); }
async function delay(ms) { budget(); await page.waitForTimeout(ms); }
async function keys(want = []) {
  const next = new Set(want);
  for (const k of held) if (!next.has(k)) { await page.keyboard.up(k); held.delete(k); }
  for (const k of next) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
}
async function read() {
  return page.evaluate(() => {
    const b = window.__moduleEvidence, w = b.world.getState(), i = b.intent.useIntentStore.getState();
    const ride = b.ride.attractionRide;
    return {
      player: b.actor.snapshot(), camera: b.actor.camera(), ready: w.ready, paused: w.paused,
      position: w.position, light: w.light, minutes: w.worldMinutes, loading: w.loading,
      near: w.nearbyInteract?.id, claims: b.claims.claimedKeys(), audio: b.audio.parkAudio.snapshot(),
      workshop: { ...b.workshop.useWorkshopStore.getState(), elapsed: b.workshop.workshopClock.elapsed },
      intent: { progress: i.progress, view: i.view, riding: i.riding, ridePhase: i.ridePhase, second: i.rideSecond, notice: i.notice },
      ride: { active: ride.active, revision: ride.revision, pose: ride.pose, phase: ride.transition?.phase },
    };
  });
}
async function capture(name) {
  await keys(); const snapshot = await read();
  const file = `${current.id}-${name}.png`;
  await page.screenshot({ path: path.join(out, file) });
  current.observations.push({ name, file, at: new Date().toISOString(), snapshot }); persist();
  console.log(current.id, name, JSON.stringify({ p: snapshot.player.player, phase: snapshot.workshop.phase, second: snapshot.intent.second }));
  return snapshot;
}
async function open(start, save = null) {
  if (context) { await keys(); await context.close(); }
  held = new Set(); context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await context.addInitScript(({ save }) => {
    localStorage.setItem('lang', 'zh');
    if (save) localStorage.setItem('bobby-world.intent-coaster.progress.v1', JSON.stringify(save));
  }, { save });
  page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', e => result.errors.push({ case: current.id, type: 'pageerror', message: e.message }));
  page.on('console', m => {
    if (['warning', 'error'].includes(m.type())) {
      const entry = { case: current.id, type: m.type(), message: m.text() };
      result.console.push(entry);
      if (/cabin clearance failed|WebGL.*(?:error|INVALID)|THREE.*error/i.test(m.text())) result.errors.push(entry);
    }
  });
  page.on('requestfailed', r => result.requestsFailed.push({ case: current.id, url: r.url(), error: r.failure()?.errorText }));
  const url = new URL('/world/', base); url.search = new URLSearchParams({ qa: '1', start, quality: 'balanced' }).toString();
  current.arrivals.push({ url: url.href, scope: 'Explicit QA initial arrival fixture; not evidence of travel from camp.' });
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(async () => {
    const [actor, world, intent, workshop, ride, claims, audio] = await Promise.all([
      import('/src/components/world/WorldActors.tsx'), import('/src/components/world/store.ts'),
      import('/src/components/world/attractions/intent-state.ts'), import('/src/components/world/attractions/intent-workshop-runtime.ts'),
      import('/src/components/world/attractions/attraction-ride.ts'), import('/src/components/world/WorldVisualClaims.ts'),
      import('/src/components/world/WorldParkAudio.ts'),
    ]);
    // Published modules are read-only observations. No setters/actions are called here.
    window.__moduleEvidence = { actor: actor.worldActorDebug, world: world.useWorldStore, intent, workshop, ride, claims, audio };
  });
  await page.waitForFunction(() => window.__moduleEvidence.world.getState().ready && window.__moduleEvidence.actor.snapshot().player, null, { timeout: 60000 });
  await delay(1800);
  if ((await read()).paused) await page.keyboard.press('Escape');
}
async function time(label) {
  await keys(); if (!(await read()).paused) await page.keyboard.press('Escape');
  await page.locator('.world-time-presets').getByRole('button', { name: new RegExp(label) }).click();
  const flow = page.locator('.world-time-flow input'); if (await flow.isChecked()) await flow.uncheck();
  await page.getByRole('button', { name: '继续探索', exact: true }).click(); await delay(1600);
  current.actions.push({ input: 'visible menu buttons', time: label, clockStoppedViaCheckbox: true });
}
async function drag(dx, dy = 0) {
  await keys(); await page.mouse.move(1000, 450); await page.mouse.down();
  await page.mouse.move(1000 + dx, 450 + dy, { steps: 5 }); await page.mouse.up(); await delay(180);
  current.actions.push({ input: 'mouse drag', dx, dy });
}
async function moveTo(target, tolerance = .33) {
  const begin = Date.now(); let best = Infinity, progress = Date.now();
  while (Date.now() - begin < 18000) {
    budget(); const s = await read(), p = s.player.player;
    const dx = target[0] - p[0], dz = target[1] - p[2], dist = Math.hypot(dx, dz);
    if (dist < tolerance) { await keys(); await delay(150); current.actions.push({ input: 'W + mouse steering', target, reached: p }); return; }
    if (dist < best - .1) { best = dist; progress = Date.now(); }
    if (Date.now() - progress > 4000) throw Error(`Actual walk stalled: ${JSON.stringify({ p, target, near: s.near })}`);
    const yaw = Math.atan2(-dz, -dx), delta = Math.atan2(Math.sin(yaw - s.camera.yaw), Math.cos(yaw - s.camera.yaw));
    if (Math.abs(delta) > .04) {
      await keys(); await page.mouse.move(960, 430); await page.mouse.down();
      await page.mouse.move(960 + delta / .0055, 430, { steps: 2 }); await page.mouse.up();
    }
    await keys(['w']); await delay(dist < 1 ? 45 : 100);
  }
  await keys(); throw Error('Actual walk timed out');
}
async function route(points) { for (const p of points) await moveTo(p); }
async function interact(id) {
  await keys();
  for (let n = 0; n < 12; n++) {
    const s = await read();
    if (s.near === id) { await page.keyboard.press('e'); current.actions.push({ input: 'E', expected: id, observed: s.near }); await delay(120); return; }
    await page.keyboard.press('q'); await delay(120);
  }
  throw Error(`No real contact for ${id}; nearest=${(await read()).near}`);
}
async function qaArrival(label) {
  const summary = page.getByText('QA · 设施操作点', { exact: true });
  const details = summary.locator('..');
  if ((await details.getAttribute('open')) === null) await summary.click();
  await page.getByRole('button', { name: label, exact: true }).click(); await delay(900);
  current.arrivals.push({ button: label, scope: 'Named initial module fixture only; no progress or score granted.' });
}
async function phase(value, timeout = 10000) {
  await page.waitForFunction(value => window.__moduleEvidence.workshop.useWorkshopStore.getState().phase === value, value, { timeout });
}
async function section(id, fn) {
  current = { id, status: 'running', observations: [], actions: [], arrivals: [], assertions: [] }; result.cases.push(current);
  try { budget(); await fn(); current.status = 'operations-observed'; }
  catch (e) { current.status = 'failed'; current.error = String(e); try { await capture('failure'); } catch {} }
  finally { await keys().catch(() => {}); persist(); }
}
function assert(value, explanation) { current.assertions.push({ pass: !!value, explanation }); if (!value) throw Error(explanation); }
function historicSave() {
  const raw = fs.readFileSync(fixturePath), record = JSON.parse(raw), save = record.progress ?? record;
  if (save.version !== 1 || save.bankRevision !== 'original-20261027-v1' || !Array.isArray(save.passed) || !save.gateOpen) throw Error('Historical module fixture is absent/incompatible/unlocked=false');
  current.fixture = { path: fixturePath, sha256: sha(raw), exactSavedProgress: save, scope: 'Historical unlocked save restored only for independent repeat/cabin module fixtures. Credits are NOT earned in this browser run.' };
  return save;
}
const toAct = [[37.5, -118], [41, -118], [41, -120.3]];
const toLookup = [[37.5, -118], [37.5, -125.2], [34, -125.2], [26, -125.2], [26, -128.3]];
const toIntake = [[26, -125.2], [34, -125.2], [37.5, -125.2], [37.5, -118], [34, -118], [34, -120.3]];
async function wrongThenCorrect(prefix) {
  await route(toAct); await interact('intent-workshop-act'); await phase('processing'); await capture(`${prefix}-wrong-processing`);
  await phase('returning'); await capture(`${prefix}-wrong-return`); await phase('ready');
  await route(toLookup); await interact('intent-workshop-lookup'); await phase('result');
  const s = await capture(`${prefix}-lookup-result`); assert(s.workshop.correct, 'Real lookup lever completes T1');
}
try {
  browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  await section('club-basin', async () => {
    await open('club-water'); await time('正午');
    assert((await read()).claims.includes('club-basin'), 'Actual mounted Club basin publishes claim');
    await drag(0, -85); await capture('day-floor'); await keys(['w']); await delay(900); await keys(); await capture('day-walk');
    await time('深夜'); await capture('night-floor'); await drag(130, 20); await capture('night-bay');
  });
  await section('exchange-glass', async () => {
    await open('exchange'); await time('正午'); await capture('day-front');
    await route([[60, -56], [60, -64], [64, -64]]); await drag(200, -25); await capture('day-opposing-windows');
    await time('深夜'); await capture('night-windows'); await drag(-340, 0); await capture('night-reverse-windows');
    current.assertions.push({ pass: null, explanation: 'Transparency sorting is screenshot evidence for human review; not an automatic visual pass.' });
  });
  await section('mine-floor', async () => {
    await open('brain'); await time('正午');
    await page.waitForFunction(() => window.__moduleEvidence.claims.isClaimed('alpha-mine-floor'), null, { timeout: 30000 });
    await capture('day-mounted-apron'); await route([[-84, -58], [-88, -58]]); await drag(190, -45); await capture('day-low-angle');
    await page.keyboard.press('Space'); await delay(800); await capture('day-jump-ground');
    await time('深夜'); await capture('night-floor');
    current.assertions.push({ pass: null, explanation: 'Coverage extraction/lifecycle/fallback correctness is covered separately by mine-floor-coverage unit evidence; no asset-failure simulation here.' });
  });
  await section('workshop-fresh-T1', async () => {
    await open('coaster'); await qaArrival('QA · 到分流工坊 intake'); await time('正午');
    assert((await read()).intent.progress.passed.length === 0, 'Fresh context starts with zero earned task credits');
    await interact('intent-workshop-intake'); await phase('ready'); await capture('request-T1');
    await wrongThenCorrect('fresh');
    assert(JSON.stringify((await read()).intent.progress.passed) === '["T1"]', 'Only T1 was earned through actual wrong/correct E interactions');
    await time('深夜'); await capture('night-arcade');
  });
  await section('workshop-repeat-save-fixture', async () => {
    const save = historicSave(); await open('coaster', save); await qaArrival('QA · 到分流工坊 intake'); await time('正午');
    const restored = await read();
    assert(JSON.stringify(restored.intent.progress) === JSON.stringify(save), 'App restored the exact historical save without direct game state writes');
    await interact('intent-workshop-intake'); await phase('ready');
    let s = await read();
    if (s.workshop.taskId === 'T7' && !s.workshop.practice) {
      // Historical default save contains six credits. Earn the missing T7 using real bell and rewrite levers.
      await route([[31.5, -120.3]]); await interact('intent-workshop-bell');
      await route([[37.5, -118], [37.5, -125.2], [40, -125.2], [40, -131.3]]);
      await interact('intent-workshop-rewrite'); await phase('result'); await capture('real-T7-from-historical-six');
      await route([[40, -125.2], [37.5, -125.2], [37.5, -118], [34, -118], [34, -120.3]]);
      await interact('intent-workshop-intake'); await phase('ready');
    }
    s = await read(); assert(s.workshop.practice && s.workshop.taskId === 'T1', 'After all tasks, real intake starts T1 repeat practice');
    const unlocked = JSON.stringify(s.intent.progress); await capture('practice-request'); await wrongThenCorrect('practice');
    assert(JSON.stringify((await read()).intent.progress) === unlocked, 'Wrong and correct practice preserve exact saved unlocks and scores');
    await route(toIntake); await interact('intent-workshop-intake'); await phase('ready');
    assert((await read()).workshop.taskId === 'T2', 'Actual next intake advances repeat cursor to T2'); await capture('practice-next-T2');
  });
  await section('cabin-save-fixture', async () => {
    const save = historicSave(); await open('coaster', save); await qaArrival('QA · 到意图 board'); await time('正午');
    await page.evaluate(async () => {
      const { COASTER_BOARDING } = await import('/src/components/world/attractions/coaster-transition.ts');
      window.__moduleBoardApproach = [...COASTER_BOARDING.approach];
    });
    const p = await page.evaluate(() => window.__moduleBoardApproach); await moveTo([p[0], p[2]], .12);
    await interact('intent-board');
    await page.waitForFunction(() => window.__moduleEvidence.intent.useIntentStore.getState().ridePhase === 'riding', null, { timeout: 30000 });
    assert((await read()).intent.view === 'first-person', 'Actual boarding uses the cabin default'); await capture('day-default-eye');
    await drag(110, 35); await page.mouse.wheel(0, -650); await delay(300); await capture('head-look-optical-zoom');
    await page.getByRole('button', { name: '外部追随', exact: true }).click(); await delay(500); await capture('exterior');
    await page.getByRole('button', { name: '座舱观景', exact: true }).click(); await delay(400); await capture('cabin-return');
    await page.getByRole('button', { name: '视角归位', exact: true }).click();
    await page.keyboard.press('Escape'); await delay(350); const before = (await read()).intent.second; await delay(500);
    assert(Math.abs((await read()).intent.second - before) < .05, 'Real Escape pause stops the ride clock');
    await page.getByRole('button', { name: '继续探索', exact: true }).click();
    await time('深夜'); await capture('night-cabin');
    const rideStart = Date.now(); let lastSecond = -10;
    while ((await read()).intent.riding && Date.now() - rideStart < 155000) {
      const s = await read(); assert(!s.paused, 'Cabin guard did not fault-pause this actual ride');
      if (s.ride.phase === 'riding' && s.intent.second - lastSecond > 18) {
        await capture(`loop-${Math.floor(s.intent.second)}`); lastSecond = s.intent.second;
      }
      await delay(900);
    }
    assert(!(await read()).intent.riding, 'Actual unaccelerated cabin loop completes and dismounts'); await capture('normal-dismount');
  });
} catch (e) { result.fatal = String(e); }
finally {
  await keys().catch(() => {}); if (browser) await browser.close();
  result.finished = new Date().toISOString(); result.elapsedMs = Date.now() - started;
  result.runtimeUnchanged = JSON.stringify(result.hashes) === JSON.stringify(hashes());
  result.operationsComplete = !result.fatal && result.cases.length === 6 && result.cases.every(c => c.status === 'operations-observed') && !result.errors.length && result.runtimeUnchanged;
  persist(); console.log(JSON.stringify({ output: out, operationsComplete: result.operationsComplete, visualAcceptance: result.visualAcceptance, errors: result.errors.length, cases: result.cases.map(c => ({ id: c.id, status: c.status, error: c.error })) }, null, 2));
  if (!result.operationsComplete) process.exitCode = 1;
}
