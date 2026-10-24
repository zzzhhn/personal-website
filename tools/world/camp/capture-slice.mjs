/** Focused visual evidence, not a replacement for user acceptance. */
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [process.env.WORLD_BROWSER_MODULES || process.cwd()] }));
const output = process.env.WORLD_CAMP_EVIDENCE || '/Users/bobby/Desktop/3D-personal-world/camp-slice-evidence/current';
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4321';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.WORLD_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [], missing = [], report = [];
const sourceHashes = Object.fromEntries(await Promise.all([
  'src/components/world/WorldCamp.tsx', 'src/components/world/WorldEnvironment.tsx',
  'src/components/world/WorldActors.tsx', 'src/components/world/layout.ts',
].map(async file => [file, createHash('sha256').update(await readFile(file)).digest('hex')])));
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && message.text().includes('[world-camp]')) errors.push(message.text()); });
page.on('response', response => { if (response.url().includes('/assets/world/camp/') && !response.ok()) missing.push({ url: response.url(), status: response.status() }); });
page.on('requestfailed', request => { if (request.url().includes('/assets/world/')) missing.push({ url: request.url(), failure: request.failure()?.errorText }); });
async function ready(shot = '') {
  await page.goto(`${base}/world/?qa=1${shot ? `&shot=${shot}` : ''}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__worldDebug?.state().ready, undefined, { timeout: 30000 });
  await page.waitForFunction(() => new Set(window.__worldDebug.sceneObjects().filter(n => n.startsWith('camp-asset-')).map(n => n.split('-')[2])).size === 16, undefined, { timeout: 30000 });
  await page.waitForTimeout(2600);
  await page.addStyleTag({ content: 'astro-dev-toolbar { display: none !important; }' });
}
async function capture(name) {
  await page.screenshot({ path: path.join(output, `${name}.png`) });
  report.push({ name, ...(await page.evaluate(() => ({ stats: window.__worldDebug.stats(), state: window.__worldDebug.state(), snapshot: window.__worldDebug.snapshot(), assets: window.__worldDebug.sceneObjects().filter(n => n.startsWith('camp-asset-')) }))) });
}
try {
  if (!process.argv.includes('--video-only')) {
  await ready();
  await capture('spawn-dusk');
  for (const zoom of [0, 2]) {
    await page.evaluate(zoom => window.__worldDebug.set({ zoom }), zoom);
    await page.waitForTimeout(700);
    await capture(`spawn-zoom-${zoom}`);
  }
  await page.evaluate(() => window.__worldDebug.set({ zoom: 1, light: 'night' }));
  await page.waitForTimeout(2400);
  await capture('spawn-night');
  for (const shot of ['camp', 'camp-night']) { await ready(shot); await capture(shot); }
  }
  if (!process.argv.includes('--stills-only')) {
    // Fresh default start, then real WASD movement. No QA teleport in this clip.
    await ready();
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5000000 });
      const chunks = [];
      window.__campVideo = new Promise(resolve => {
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onstop = () => { stream.getTracks().forEach(track => track.stop()); const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(new Blob(chunks, { type: mimeType })); };
      });
      window.__campRecorder = recorder;
      recorder.start(250);
    });
    const began = Date.now(), trace = [], held = new Set();
    const directions = [
      { keys: ['KeyD'], x: .8, z: -.6 }, { keys: ['KeyA'], x: -.8, z: .6 },
      { keys: ['KeyW'], x: -.6, z: -.8 }, { keys: ['KeyS'], x: .6, z: .8 },
      { keys: ['KeyD', 'KeyW'], x: .2 / Math.SQRT2, z: -1.4 / Math.SQRT2 },
      { keys: ['KeyD', 'KeyS'], x: 1.4 / Math.SQRT2, z: .2 / Math.SQRT2 },
      { keys: ['KeyA', 'KeyW'], x: -1.4 / Math.SQRT2, z: -.2 / Math.SQRT2 },
      { keys: ['KeyA', 'KeyS'], x: -.2 / Math.SQRT2, z: 1.4 / Math.SQRT2 },
    ];
    // Follow the clear ring outside the benches, then pass south of the parked car.
    const waypoints = [[-42, 39], [-34, 39], [-32, 30], [-35, 23], [-32, 30], [-32, 39], [-23, 39], [-23, 34]];
    let waypoint = 0;
    while (Date.now() - began < 20000) {
      const s = await page.evaluate(() => window.__worldDebug.snapshot());
      const p = s.player;
      if (waypoint < waypoints.length && Math.hypot(p[0] - waypoints[waypoint][0], p[2] - waypoints[waypoint][1]) < .5) waypoint++;
      const target = waypoints[waypoint];
      const direction = target && directions.reduce((best, d) => d.x * (target[0] - p[0]) + d.z * (target[1] - p[2]) > best.x * (target[0] - p[0]) + best.z * (target[1] - p[2]) ? d : best);
      const next = new Set(direction ? direction.keys : []);
      for (const key of held) if (!next.has(key)) { await page.keyboard.up(key); held.delete(key); }
      for (const key of next) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
      trace.push({ elapsedMs: Date.now() - began, position: p, grounded: s.grounded, waypoint });
      await page.waitForTimeout(140);
    }
    for (const key of held) await page.keyboard.up(key);
    await page.evaluate(() => window.__campRecorder.stop());
    const video = await page.evaluate(() => window.__campVideo);
    await writeFile(path.join(output, 'walk-to-exit.webm'), Buffer.from(video, 'base64'));
    await capture('exit-dusk');
    report.push({ name: 'walk-to-exit', elapsedMs: Date.now() - began, waypointReached: waypoint, waypoints, realKeyboardOnly: true, trace });
  }
  await writeFile(path.join(output, 'runtime-evidence.json'), JSON.stringify({ capturedAt: new Date().toISOString(), base, sourceHashes, viewport: { width: 1440, height: 900 }, report, errors, missing, videoScope: 'Canvas-only actual runtime; default camera and real WASD, no teleport.' }, null, 2));
  console.log(JSON.stringify({ output, shots: report.map(r => r.name), errors, missing }));
  if (errors.length || missing.length) process.exitCode = 1;
} finally { await browser.close(); }
