/** G24 slope stance check (spec 10.1 口径): camp road ramp (~15 deg, [-18,4.84,34] -> [-5,1.14,29]).
 * Logged fixture teleport to the ramp top, then real keys: run down, stop on the ramp, run up, sprint down,
 * walk-speed tap up, stop. Per-frame recorder; stance = clip contact >= 0.5 per foot while grounded.
 * float = lowest sole above its probed ground > 20 mm; sink = below -15 mm. */
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { summarizeSlope } from './slope-metrics.mjs';
import { Bot, loadPlaywright, CHROME, comboFor } from '../playtest/lib.mjs';
const out = process.env.WORLD_PLAYTEST_DIR || '/tmp/g24-slope'; await mkdir(out, { recursive: true });
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4336', tag = process.env.G24_TAG || 'slope';
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const report = { tag, errors: [], fixture: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1,
    ...(process.env.G24_VIDEO === '1' ? { recordVideo: { dir: `${out}/video`, size: { width: 1920, height: 1080 } } } : {}) });
  page.on('pageerror', e => report.errors.push(e.message));
  if (process.env.G24_NORMAL_MEDIA_ONLY === '1') {
    report.scope = 'ordinary-entry real-key canvas MediaRecorder; no QA API or fixture';
    await page.goto(base + '/world/', { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas'); await page.waitForTimeout(3500);
    await page.mouse.move(960, 540); await page.mouse.wheel(0, -400); await page.waitForTimeout(800);
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const chunks = []; const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm', videoBitsPerSecond: 6000000 });
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      window.__slopeMedia = { recorder, chunks, stream }; recorder.start(1000);
    });
    const bot = new Bot(page), down = comboFor(13, -5).keys, up = comboFor(-13, 5).keys;
    report.normalPhases = [];
    for (const [label, keys, ms] of [['approach-east-from-spawn', comboFor(1,0).keys, 6300], ['approach-north', comboFor(0,-1).keys, 1100], ['run-down', down, 1700], ['sprint-down', [...down, 'ShiftLeft'], 1500], ['stop', [], 900], ['run-up', up, 2200], ['stop2', [], 900]]) {
      await bot.hold(keys); report.normalPhases.push({ label, keys, ms }); await page.waitForTimeout(ms);
    }
    await bot.release();
    const bytes = await page.evaluate(() => new Promise(resolve => {
      const m = window.__slopeMedia;
      m.recorder.onstop = async () => { const b = new Blob(m.chunks, {type:m.recorder.mimeType}); m.stream.getTracks().forEach(t=>t.stop()); resolve(Array.from(new Uint8Array(await b.arrayBuffer()))); };
      m.recorder.stop();
    }));
    await writeFile(`${out}/ordinary-ramp-${tag}.webm`, Buffer.from(bytes));
    await page.screenshot({path:`${out}/ordinary-ramp-end-${tag}.jpg`,type:'jpeg',quality:85});
  } else {
  if (process.env.G24_SHOTS === '1') {
    await page.goto(base + '/world/', { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas'); await page.waitForTimeout(3500);
    await page.screenshot({ path: `${out}/normal-dusk-default.jpg`, type: 'jpeg', quality: 85 });
    await page.mouse.move(960, 540); await page.mouse.wheel(0, -600); await page.waitForTimeout(1000);
    await page.screenshot({ path: `${out}/normal-dusk-near.jpg`, type: 'jpeg', quality: 85 });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^(Night|夜晚|夜间)$/ }).click();
    await page.keyboard.press('Escape'); await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/normal-night-near.jpg`, type: 'jpeg', quality: 85 });
  }
  await page.goto(base + '/world/?qa=1' + (process.env.G24_SUPPORT === '1' ? '&qaPhysicsSupport=1' : ''), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__worldDebug?.actor().loaded, undefined, { timeout: 90000 });
  const bot = new Bot(page);
  await page.evaluate(() => __worldDebug.set({ zoom: 0 }));
  const down = comboFor(13, -5).keys, up = comboFor(-13, 5).keys;
  const runs = [['run-down', down, [], 1700], ['stop-on-ramp', [], [], 900], ['run-up', up, [], 1700], ['stop2', [], [], 900],
    ['sprint-down', down, ['ShiftLeft'], 1500], ['stop3', [], [], 900], ['run-up2', up, [], 2200], ['stop4', [], [], 900]];
  await bot.fixtureTeleport([-19.5, 4.84 + 0.9, 34.3], 'camp road ramp top (15 deg) for slope stance metrics');
  report.fixture = bot.fixtureCalls;
  await page.waitForTimeout(1200);
  const captureSkin = process.env.G24_SKIN === '1';
  const skinTopology = captureSkin ? await page.evaluate(() => __worldDebug.actor('skin:topology')) : null;
  const asset = await page.request.get(base + '/assets/world/guide/G24.glb');
  report.glbSha256 = createHash('sha256').update(await asset.body()).digest('hex');
  await page.evaluate(skin => __worldDebug.actor(skin ? 'record:skin' : 'record:start', 20000), captureSkin);
  report.phases = [];
  for (const [label, keys, extra, ms] of runs) { await bot.hold([...keys, ...extra]); report.phases.push({ label, t: bot.now() }); await page.waitForTimeout(ms); }
  await bot.release();
  const frames = JSON.parse(await page.evaluate(() => { __worldDebug.actor('record:stop'); return JSON.stringify(__worldDebug.actor('record:take')); }));
  await writeFile(`${out}/frames-${tag}.json`, JSON.stringify(frames));
  if (captureSkin) await writeFile(`${out}/runtime-skin-${tag}.json`, JSON.stringify({ views: [{ label: 'complete-original-ramp-route', assetSha256: report.glbSha256, skinTopology, samples: frames }] }));
  Object.assign(report, summarizeSlope(frames));
  report.limits = {
    maxSharedPelvisDrop: Math.max(...frames.map(f => f.slope?.sharedPelvisDrop ?? 0)),
    maxShift: Math.max(...frames.flatMap(f => ['left', 'right'].map(s => Math.abs(f.slope?.[s]?.shift ?? 0)))),
    maxPitchDeg: Math.max(...frames.flatMap(f => ['left', 'right'].map(s => Math.abs(f.slope?.[s]?.pitchDeg ?? 0)))),
    maxRollDeg: Math.max(...frames.flatMap(f => ['left', 'right'].map(s => Math.abs(f.slope?.[s]?.rollDeg ?? 0)))),
  };
  report.probeFallback = frames.flatMap(f => ['left', 'right'].filter(s => f.slope?.[s]?.probeKind === 'sole').map(side => ({ t: f.t, side, contact: f.slope[side].contact, plane: f.slope[side].plane })));
  report.probeMisses = frames.flatMap(f => ['left', 'right'].filter(s => !f.slope?.[s]?.hit).map(side => ({ t: f.t, side, grounded: f.grounded, anim: f.anim, contact: f.slope?.[side]?.contact })));
  }
} catch (e) { report.errors.push(String(e?.stack || e)); }
finally { await browser.close(); await writeFile(`${out}/report-${tag}.json`, JSON.stringify(report, null, 1)); console.log(JSON.stringify({ a: report.byClipCurve, b: report.excludingStopStepSwing, f: report.floatsByAnim, w: report.stance?.worst }), report.errors); }
