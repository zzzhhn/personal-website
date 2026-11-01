/** Final ordinary-entry evidence tour. Run ONCE, only after the main thread announces FINAL_READY.
 * FINAL_READY=1 WORLD_BASE_URL=http://127.0.0.1:4330 node tools/world/playtest/final-tour.mjs
 * FINAL_SOURCE_ROOT defaults to sibling wt/integ; layout is read from that exact server checkout.
 * No QA query, store imports, debug APIs, fixtures or teleport. Canvas video + full HUD screenshots.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CHROME, comboFor, loadPlaywright, startCanvasRecording, stopCanvasRecording } from './lib.mjs';

if (process.env.FINAL_READY !== '1') throw new Error('Await the main thread FINAL_READY announcement before running; use node --check to inspect syntax meanwhile.');
const localRoot = fileURLToPath(new URL('../../../', import.meta.url));
const sourceRoot = path.resolve(process.env.FINAL_SOURCE_ROOT || path.join(localRoot, '../integ'));
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4330';
const url = new URL('/world/', base).href;
const out = path.resolve(process.env.WORLD_PLAYTEST_DIR || '/Users/bobby/Desktop/3D-personal-world/evidence/integ/final-tour');
const smallDir = path.join(localRoot, 'docs/world/integration');
const minVideoMs = 180_000, maxTourMs = 330_000;
const started = Date.now(), held = new Set();
const report = { url, startedAt: new Date().toISOString(), sourceRoot, viewport: [1920, 1080], inputs: [], legs: [], frames: [], actions: [], errors: { page: [], console: [], http: [], network: [] }, limits: [
  'Ordinary /world/ only. All walking is real keyboard input, steered from the visible HUD map anchor, not runtime state.',
  'Canvas MediaRecorder excludes the HTML HUD. Full-page PNG/JPEG screenshots retain the HUD.',
  'HUD world x/z reports arrival and horizontal movement; it cannot prove vertical jump height, exact contacts, or collision penetration.',
  'Camera drags occur only while stationary and are reversed before walking. Wheel zoom is reversed without touching state.',
  'One final tour, not a repeat of the full interaction/collision suite or a performance acceptance run.',
] };
let browser, page, recordingStarted = null, routeOkay = true;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const xz = p => [p[0], p[2]];
const stamp = () => Date.now() - started;
async function sourceIdentity() {
  const dir = path.join(sourceRoot, 'src/components/world'), files = (await readdir(dir)).filter(n => /\.(tsx?|css)$/.test(n)).sort();
  const hash = createHash('sha256');
  for (const file of files) { hash.update(file); hash.update(await readFile(path.join(dir, file))); }
  return { head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot }).toString().trim(), dirtyWorldSources: execFileSync('git', ['status', '--porcelain', '--', 'src/components/world'], { cwd: sourceRoot }).toString().trim(), worldSourcesSha256: hash.digest('hex'), files: files.length };
}
async function readLayout() {
  // TypeScript stripping reads pure layout data in Node, not through the page or a QA runtime entry.
  const code = `const L=await import(process.argv[1]);const V=await import(process.argv[2]);console.log(JSON.stringify({camp:L.CAMP_CENTER,spawn:L.CAMP_SPAWN,vehicles:L.VEHICLES,buildings:L.BUILDINGS,walk:L.BOARDWALK_POINTS,bridgeStart:L.BRIDGE_START,bridgeEnd:L.BRIDGE_END,timeline:V.TIMELINE_ROUTE_V4,roads:V.ROADS_V4,bridgeRail:V.BRIDGE_RAIL,version:L.LAYOUT_V4?'v4':'v3'}));`;
  const result = JSON.parse(execFileSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', code, pathToFileURL(path.join(sourceRoot, 'src/components/world/layout.ts')).href, pathToFileURL(path.join(sourceRoot, 'src/components/world/layout-v4.ts')).href], { maxBuffer: 2_000_000 }).toString());
  const campSource = await readFile(path.join(sourceRoot, 'src/components/world/WorldCampContentLayout.ts'), 'utf8');
  result.padRadius = Number(campSource.match(/const RING\s*=\s*([\d.]+)/)?.[1]);
  result.deskPad = Number(campSource.match(/export const PAD\s*=\s*\{\s*desk:\s*(\d+)/)?.[1]);
  if (result.version !== 'v4' || !result.padRadius || !Number.isFinite(result.deskPad)) throw new Error('Current layout/camp source contract changed; do not substitute old coordinates.');
  return result;
}
function along(points) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths.at(-1) + distance(points[i - 1], points[i]));
  const at = s => { for (let i = 1; i < points.length; i++) if (s <= lengths[i] || i === points.length - 1) { const t = Math.max(0, Math.min(1, (s - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1))); return points[i - 1].map((v, j) => v + (points[i][j] - v) * t); } return points[0]; };
  const nearest = p => { let best = Infinity, arc = 0; for (let i = 1; i < points.length; i++) { const a = points[i - 1], b = points[i], dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1))), q = [a[0] + t * dx, a[1] + t * dz], d = distance(p, q); if (d < best) { best = d; arc = lengths[i - 1] + t * (lengths[i] - lengths[i - 1]); } } return arc; };
  return { at, nearest, total: lengths.at(-1), between: (from, to) => { const points = []; for (let s = from + 4; s < to; s += 4) points.push(at(s)); return [...points, at(to)]; } };
}
async function hud() {
  return page.evaluate(() => {
    const anchor = document.querySelector('aside.world-location svg circle.world-map-anchor');
    const position = anchor ? [Number(anchor.getAttribute('cx')), Number(anchor.getAttribute('cy'))] : null;
    return { position, at: performance.now(), zone: document.querySelector('.world-location-text > span')?.textContent, prompt: document.querySelector('.world-prompt li.is-active')?.textContent || document.querySelector('.world-prompt')?.textContent || '', cardOpen: !!document.querySelector('.world-card-layer'), menuOpen: !!document.querySelector('.world-dialog[open]'), driving: !!document.querySelector('.world-speed') };
  });
}
async function hold(keys) {
  const next = new Set(keys);
  for (const key of [...held]) if (!next.has(key)) { await page.keyboard.up(key); held.delete(key); }
  for (const key of next) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
}
async function press(key, note) { await hold([]); report.inputs.push({ atMs: stamp(), key, note }); await page.keyboard.press(key); }
async function walkTo(target, name, { sprint = false, timeoutMs = 12_000, arrive = .85 } = {}) {
  const start = Date.now(), samples = [], before = await hud();
  let recoveries = 0, reached = false, lastProgress = Date.now(), best = before.position ? distance(before.position, target) : Infinity;
  while (Date.now() - start < timeoutMs && Date.now() - recordingStarted < maxTourMs) {
    const state = await hud();
    if (!state.position || state.driving || state.cardOpen || state.menuOpen) break;
    const d = distance(state.position, target);
    samples.push({ atMs: stamp(), position: state.position, distance: d });
    if (d <= arrive) { reached = true; break; }
    if (d < best - .15) { best = d; lastProgress = Date.now(); }
    const dx = target[0] - state.position[0], dz = target[1] - state.position[1];
    if (Date.now() - lastProgress > 1800) {
      if (recoveries >= 2) break;
      // Short retreat / side-step only: never jump a rail or substitute an unreachable later waypoint.
      await hold(comboFor(-dx, -dz).keys); await page.waitForTimeout(180);
      const side = recoveries % 2 ? -1 : 1;
      await hold(comboFor(-dz * side, dx * side).keys); await page.waitForTimeout(140);
      recoveries++; lastProgress = Date.now();
    } else { await hold([...comboFor(dx, dz).keys, ...(sprint ? ['ShiftLeft'] : [])]); await page.waitForTimeout(90); }
  }
  await hold([]); const after = await hud();
  // Arrival is based on the final HUD position, never on an attempt, timeout, or camera label.
  reached = !!after.position && distance(after.position, target) <= arrive + .15;
  const leg = { name, target, before: before.position, after: after.position, reached, seconds: (Date.now() - start) / 1000, sprint, recoveries, samples };
  report.legs.push(leg); console.log(JSON.stringify({ leg: name, reached, at: after.position, target }));
  if (!reached) { routeOkay = false; report.actions.push({ atMs: stamp(), failed: 'walking leg blocked or timed out', name }); }
  return reached;
}
async function walkPoints(points, name, options = {}) {
  for (let i = 0; i < points.length; i++) if (!await walkTo(points[i], `${name}/${i + 1}`, options)) return false;
  return true;
}
async function drag(dx, dy = 0) {
  await hold([]);
  const box = await page.locator('main.world-app canvas').boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 25 }); await page.mouse.up();
}
async function zoom(delta) { await hold([]); await page.mouse.move(960, 540); await page.mouse.wheel(0, delta); await page.waitForTimeout(900); }
async function frame(name, { near = false, yawDrag = 0, reached = true } = {}) {
  await hold([]); const before = await hud();
  if (yawDrag) await drag(yawDrag);
  if (near) await zoom(-650);
  await page.waitForTimeout(1200);
  const png = path.join(out, `${name}.png`), jpeg = path.join(out, `${name}.jpg`);
  await page.screenshot({ path: png });
  let quality = 85;
  do { await page.screenshot({ path: jpeg, type: 'jpeg', quality }); if ((await stat(jpeg)).size < 400_000) break; quality -= 8; } while (quality >= 37);
  const bytes = (await stat(jpeg)).size;
  if (bytes >= 400_000) throw new Error(`JPEG exceeds repository evidence limit: ${name}`);
  await copyFile(jpeg, path.join(smallDir, `final-tour-${name}.jpg`));
  const after = await hud();
  report.frames.push({ name, reached, distanceMode: near ? 'near: wheel -650 from 12 m, reversed afterwards' : 'default 12 m distance', yawDragPixels: yawDrag, atMs: stamp(), before: before.position, after: after.position, png, jpeg, repositoryJpeg: `docs/world/integration/final-tour-${name}.jpg`, bytes, quality });
  if (near) await zoom(650);
  if (yawDrag) await drag(-yawDrag);
  await page.waitForTimeout(350);
}
async function night() {
  await press('Escape', 'open the real map/settings dialog');
  await page.getByRole('button', { name: /^(Night|夜晚)$/ }).click();
  const selected = await page.getByRole('button', { name: /^(Night|夜晚)$/ }).getAttribute('aria-pressed');
  await press('Escape', 'close settings and continue on foot'); await page.waitForTimeout(2500);
  report.actions.push({ atMs: stamp(), action: 'night selected through visible settings', selected: selected === 'true', after: await hud() });
}
async function card() {
  const before = await hud();
  if (!/Education|教育/.test(before.prompt)) { report.actions.push({ action: 'one camp education card', passed: false, reason: 'desired visible prompt was not in reach', before }); return; }
  await press('KeyE', 'open the visible Education card'); await page.waitForTimeout(750);
  const open = await hud();
  if (open.cardOpen) { await page.screenshot({ path: path.join(out, 'content-card.png') }); await page.waitForTimeout(2000); await press('KeyE', 'close the same content card'); await page.waitForTimeout(350); }
  const after = await hud(); report.actions.push({ atMs: stamp(), action: 'one real content card with E open/close', passed: open.cardOpen && !after.cardOpen, before, open, after });
}
async function runningJump(target) {
  const state = await hud(), dx = target[0] - state.position[0], dz = target[1] - state.position[1];
  const keys = [...comboFor(dx, dz).keys, 'ShiftLeft'];
  await hold(keys); await page.waitForTimeout(400); await page.keyboard.press('Space'); await page.waitForTimeout(550); await hold([]);
  report.actions.push({ atMs: stamp(), action: 'real sprint + Space run jump on avenue', before: state.position, after: (await hud()).position, keys, limitation: 'video visual evidence; no vertical/collision debug measurements' });
}
await mkdir(out, { recursive: true }); await mkdir(smallDir, { recursive: true });
try {
  report.sourceBefore = await sourceIdentity();
  const layout = report.layout = await readLayout(), C = xz(layout.camp), ramp = layout.roads.find(r => r.id === 'camp-ramp').pts.map(xz);
  const timeline = along(layout.timeline.map(xz)), boardwalk = along(layout.walk.map(xz));
  const avenue = layout.roads.find(r => r.id === 'avenue').pts.map(xz), avenueX = avenue[0][0];
  const townDefault = timeline.nearest([avenueX, layout.buildings[1].position[2]]), townNear = timeline.nearest([avenueX, layout.buildings[3].position[2]]);
  const bridgeMid = layout.bridgeStart.map((v, i) => (v + layout.bridgeEnd[i]) / 2), waterAt = timeline.nearest(xz(bridgeMid));
  const angle = layout.deskPad * Math.PI / 4, deskR = layout.padRadius - 2.45, desk = [C[0] + Math.cos(angle) * deskR, C[1] + Math.sin(angle) * deskR];
  const southZ = C[1] + layout.padRadius * .64, offroad = layout.vehicles.find(v => v.id === 'offroad'), car = xz(offroad.position), carClear = offroad.size[0] / 2 + 1.5, carSideZ = car[1] - offroad.size[2] / 2 - 1.4;
  const van = layout.vehicles.find(v => v.id === 'van'), vanP = xz(van.position), vanEast = vanP[0] + van.size[0] / 2 + 1.5, vanSouth = vanP[1] + van.size[2] / 2 + 1.7;
  report.planned = { camp: [[C[0], southZ], [desk[0], southZ], desk], exit: [[C[0], southZ], [ramp[0][0] - 3, southZ], [ramp[0][0] - 3, ramp[0][1]], ramp[0], [car[0] - carClear, car[1]], [car[0] - carClear, carSideZ], [car[0] + carClear, carSideZ], [car[0] + carClear, car[1]], ramp[1]], rationale: 'Use the gaps between camp benches/pads, exit-post gap, and north side of the parked 4x4. Follow current timeline/bridge centreline; detour south/east of the parked van within the plaza before the real boardwalk join.' };
  browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.on('pageerror', e => report.errors.page.push({ atMs: stamp(), message: e.message }));
  page.on('console', m => { if (m.type() === 'error') report.errors.console.push({ atMs: stamp(), text: m.text() }); });
  page.on('response', r => { if (r.status() >= 400) report.errors.http.push({ atMs: stamp(), status: r.status(), url: r.url() }); });
  page.on('requestfailed', r => report.errors.network.push({ atMs: stamp(), url: r.url(), failure: r.failure() }));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => !document.querySelector('.world-loading') && document.querySelector('aside.world-location svg circle.world-map-anchor'), undefined, { timeout: 120_000 });
  await page.waitForTimeout(2000); report.spawn = await hud(); report.actualUrl = page.url();
  recordingStarted = await startCanvasRecording(page, 30);
  await frame('01-camp-default');
  if (await walkPoints(report.planned.camp, 'camp-to-education')) await card();
  await drag(220, -35); await page.waitForTimeout(1700); await drag(-220, 35);
  report.actions.push({ atMs: stamp(), action: 'free orbit: real +220/-35 px drag, reversed before walking', position: (await hud()).position });
  await frame('02-camp-near', { near: true, reached: routeOkay });
  if (routeOkay) await walkPoints(report.planned.exit, 'camp-exit-around-parked-car');
  if (routeOkay) await walkPoints(timeline.between(timeline.nearest(ramp[1]), townDefault), 'ramp-avenue-town');
  await frame('03-town-default', { reached: routeOkay });
  if (routeOkay) { await runningJump(timeline.at(Math.min(townNear, townDefault + 10))); await walkPoints(timeline.between(timeline.nearest((await hud()).position), townNear), 'avenue-to-north-buildings', { sprint: true }); }
  await frame('04-town-near', { near: true, reached: routeOkay });
  if (routeOkay) await walkPoints(timeline.between(townNear, waterAt), 'bridge-centreline');
  await frame('05-water-default', { yawDrag: -240, reached: routeOkay });
  const bridgeDirection = [layout.bridgeEnd[0] - layout.bridgeStart[0], layout.bridgeEnd[2] - layout.bridgeStart[2]], bridgeLength = Math.hypot(...bridgeDirection);
  const waterSide = [bridgeMid[0] - bridgeDirection[1] / bridgeLength * (layout.bridgeRail.offset - 2), bridgeMid[2] + bridgeDirection[0] / bridgeLength * (layout.bridgeRail.offset - 2)];
  if (routeOkay) await walkTo(waterSide, 'water-view-within-bridge-rail');
  await frame('06-water-near', { near: true, yawDrag: -240, reached: routeOkay });
  if (routeOkay) await walkTo(xz(bridgeMid), 'return-to-bridge-centreline');
  await night();
  if (routeOkay) await walkPoints([xz(layout.bridgeEnd), [xz(layout.bridgeEnd)[0], vanSouth], [vanEast, vanSouth], boardwalk.at(6)], 'park-plaza-van-detour');
  await frame('07-park-default-night', { yawDrag: 475, reached: routeOkay });
  if (routeOkay) await walkPoints(boardwalk.between(6, Math.min(15, boardwalk.total)), 'boardwalk-to-first-huts');
  await frame('08-park-near-night', { near: true, yawDrag: 475, reached: routeOkay });
  // Continue genuine walking along the same unobstructed boardwalk, reversing at its ends, until >=3 min.
  let reverse = false;
  while (routeOkay && Date.now() - recordingStarted < minVideoMs) {
    const state = await hud(), from = boardwalk.nearest(state.position), end = reverse ? 7 : boardwalk.total - 2;
    const points = reverse ? boardwalk.between(end, from).reverse().concat([boardwalk.at(end)]) : boardwalk.between(from, end);
    await walkPoints(points, reverse ? 'night-boardwalk-return' : 'night-boardwalk-stroll');
    reverse = !reverse;
  }
} catch (error) { routeOkay = false; report.fatal = { atMs: stamp(), message: error.message, stack: error.stack }; if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
finally {
  await hold([]).catch(() => {});
  if (recordingStarted && page) {
    // A blocked route is retained, never relabelled as later destinations. Any duration fill is explicitly idle.
    const remaining = Math.max(0, minVideoMs - (Date.now() - recordingStarted)); report.idleFillMs = remaining;
    for (let left = remaining; left > 0; left -= 1000) await page.waitForTimeout(Math.min(1000, left)).catch(() => {});
    report.video = { file: path.join(out, 'final-tour.webm'), seconds: (Date.now() - recordingStarted) / 1000, capture: 'canvas MediaRecorder 30 fps; HTML HUD appears in screenshots only' };
    try { await stopCanvasRecording(page, report.video.file); report.video.bytes = (await stat(report.video.file)).size; } catch (e) { report.video.failure = String(e); }
    report.finalHud = await hud().catch(() => null);
  }
  report.sourceAfter = await sourceIdentity().catch(e => ({ failure: String(e) }));
  report.sourceUnchanged = typeof report.sourceBefore?.worldSourcesSha256 === 'string' && report.sourceBefore.worldSourcesSha256 === report.sourceAfter?.worldSourcesSha256 && report.sourceBefore.head === report.sourceAfter?.head;
  report.summary = { normalEntry: report.actualUrl === url && !new URL(url).search, routeReachedPark: report.frames.some(f => f.name === '08-park-near-night' && f.reached), allWalkingLegsReached: report.legs.length > 0 && report.legs.every(l => l.reached), cardOpenedAndClosed: report.actions.some(a => a.action === 'one real content card with E open/close' && a.passed), nightSelected: report.actions.some(a => a.action === 'night selected through visible settings' && a.selected), runJumpInputSent: report.actions.some(a => a.action === 'real sprint + Space run jump on avenue'), legsReached: report.legs.filter(l => l.reached).length, legsTotal: report.legs.length, eightFrames: report.frames.length === 8, allFrameDestinationsReached: report.frames.length === 8 && report.frames.every(f => f.reached), videoAtLeast3Minutes: !!report.video?.bytes && report.video.seconds >= 180, sourceUnchanged: report.sourceUnchanged, errorCounts: Object.fromEntries(Object.entries(report.errors).map(([k, v]) => [k, v.length])), fatal: report.fatal?.message ?? null };
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  const text = `# 最终普通入口巡游\n\n${JSON.stringify(report.summary, null, 2)}\n\n入口：${report.actualUrl || url}；源提交：${report.sourceBefore?.head || '未读取'}。\n\n录屏与原始 PNG/完整轨迹：${out}。录屏只包含 canvas，HUD 保留在八张全页图中。\n\n${report.frames.map(f => `- [${f.name}](final-tour-${f.name}.jpg)：到达=${f.reached}，${f.distanceMode}，HUD位置=${JSON.stringify(f.after)}。`).join('\n')}\n\n实测与失败以仓库外 report.json 为准。${report.idleFillMs ? `路线失败/提前结束后有 ${Math.round(report.idleFillMs / 1000)} 秒静止补足录屏时长；不能将其称为持续玩法。` : '三分钟时长由真实路线与机位操作组成。'}\n\n本地埋点404、Console/Page/HTTP错误均保留，没有静默过滤。未启QA/Debug/fixture/传送，不重跑全交互。看图判断与 Bobby 验收另行记录，脚本不自动授予美术通过。\n`;
  await writeFile(path.join(smallDir, 'final-tour.md'), text);
  console.log(JSON.stringify(report.summary, null, 2));
  await browser?.close();
  if (!report.summary.routeReachedPark || !report.summary.allWalkingLegsReached || !report.summary.cardOpenedAndClosed || !report.summary.nightSelected || !report.summary.eightFrames || !report.summary.videoAtLeast3Minutes || !report.summary.sourceUnchanged || Object.values(report.summary.errorCounts).some(Boolean)) process.exitCode = 1;
}
