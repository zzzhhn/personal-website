/** Cold normal-entry load probe; never enables QA, imports the store, or teleports.
 * LOAD_DIST=<built outDir> serves that build uncompressed on LOAD_PORT (default 4398; 0 = ephemeral).
 * Otherwise WORLD_BASE_URL points to a dev server: those timings are local diagnostics only.
 * LOAD_THROTTLE=100mbps|fast3g|none (default 100mbps). Cache and service workers are disabled.
 * Wire bytes are CDP encodedDataLength; optional local-file gzip BODY estimates are reported separately.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { CHROME, loadPlaywright } from './lib.mjs';

const dist = process.env.LOAD_DIST ? path.resolve(process.env.LOAD_DIST) : null;
const out = path.resolve(process.env.WORLD_PLAYTEST_DIR || '/tmp/world-load');
const throttleName = process.env.LOAD_THROTTLE || '100mbps';
const throttles = {
  '100mbps': { offline: false, latency: 0, downloadThroughput: 12_500_000, uploadThroughput: 12_500_000, connectionType: 'ethernet' },
  fast3g: { offline: false, latency: 150, downloadThroughput: 1_600_000 / 8, uploadThroughput: 750_000 / 8, connectionType: 'cellular3g' },
  none: { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
};
if (!Object.hasOwn(throttles, throttleName)) throw new Error('LOAD_THROTTLE must be 100mbps, fast3g, or none');
const timeout = Number(process.env.LOAD_TIMEOUT_MS || 120_000);
const budget = { playableMs: 8_000, initialWireBytes: 15_000_000, byteUnit: 'decimal MB (1 MB = 1,000,000 bytes)' };
const report = {
  environment: dist ? 'production build on an uncompressed temporary static server' : 'local dev; not production acceptance',
  dist, throttle: { name: throttleName, ...throttles[throttleName] }, cacheDisabled: true, serviceWorkersBypassed: true,
  budget, errors: { page: [], console: [], http: [], network: [] },
  wireAccounting: 'CDP encodedDataLength includes transfer encoding. Finished requests use loadingFinished totals. In-flight requests use received response bytes plus encoded data chunks observed before each cutoff; no future bytes are counted.',
  api: dist ? 'No API is emulated: missing /api/events is a real 404 and remains in errors.' : 'Uses the configured server API; failures remain in errors.',
};
const kind = url => {
  const p = new URL(url).pathname;
  return /draco|\.wasm$/i.test(p) ? 'draco' : /\.glb$/i.test(p) ? 'glb' : /\.(png|jpe?g|webp|ktx2|avif)$/i.test(p) ? 'texture'
    : /\.(m?js|tsx?)$|@vite|node_modules/i.test(p) ? 'js' : /\.css$/i.test(p) ? 'css' : 'other';
};
// Resolve static files within this build only. Query strings never become filesystem paths.
async function staticFile(url) {
  if (!dist) return null;
  const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  let file = path.resolve(dist, '.' + pathname);
  if (file !== dist && !file.startsWith(dist + path.sep)) return null;
  if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
  return file;
}
let server, browser;
await mkdir(out, { recursive: true });
try {
  let base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4338';
  if (dist) {
    const port = Number(process.env.LOAD_PORT || 4398);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('LOAD_PORT must be 0..65535');
    const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
    server = createServer(async (q, r) => {
      try {
        const file = await staticFile(q.url || '/');
        if (!file) throw new Error('outside build');
        const body = await readFile(file);
        if (q.method !== 'GET' && q.method !== 'HEAD') { r.writeHead(405); r.end(); return; }
        r.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'content-length': body.length, 'cache-control': 'no-store' });
        r.end(q.method === 'HEAD' ? undefined : body);
      } catch { r.writeHead(404, { 'cache-control': 'no-store' }); r.end(); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  }
  report.base = base;
  report.url = new URL('/world/', base).href; // Always the ordinary entry, with no query string.
  browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', e => report.errors.page.push({ at: Date.now() - started, message: e.message }));
  page.on('console', m => { if (m.type() === 'error') report.errors.console.push({ at: Date.now() - started, text: m.text() }); });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.setBypassServiceWorker', { bypass: true });
  await cdp.send('Network.emulateNetworkConditions', throttles[throttleName]);
  const requests = new Map();
  let clockOffset = null, lastActivity = Date.now(), started = Date.now();
  const at = timestamp => clockOffset === null ? Date.now() - started : (timestamp + clockOffset) * 1000 - started;
  const get = id => { if (!requests.has(id)) requests.set(id, { id, points: [], bodyBytes: 0, responseBytes: 0 }); return requests.get(id); };
  const point = (r, timestamp, bytes) => { r.points.push({ at: at(timestamp), bytes }); lastActivity = Date.now(); };
  cdp.on('Network.requestWillBeSent', e => {
    clockOffset ??= e.wallTime - e.timestamp;
    // Redirect hops share a CDP id; retain their observed bytes separately.
    if (e.redirectResponse) {
      const old = get(e.requestId);
      Object.assign(old, { status: e.redirectResponse.status, finishedAt: at(e.timestamp), redirected: true });
      point(old, e.timestamp, e.redirectResponse.encodedDataLength);
      requests.set(`${e.requestId}:redirect:${old.startedAt}`, old);
      requests.delete(e.requestId);
    }
    Object.assign(get(e.requestId), { url: e.request.url, method: e.request.method, startedAt: at(e.timestamp), type: e.type });
    lastActivity = Date.now();
  });
  cdp.on('Network.responseReceived', e => {
    const r = get(e.requestId), response = e.response;
    Object.assign(r, { url: response.url, mime: response.mimeType, status: response.status, responseBytes: response.encodedDataLength, fromDiskCache: !!response.fromDiskCache, fromServiceWorker: !!response.fromServiceWorker, contentEncoding: response.headers['content-encoding'] || response.headers['Content-Encoding'] || null });
    point(r, e.timestamp, r.responseBytes + r.bodyBytes);
    if (response.status >= 400) report.errors.http.push({ at: at(e.timestamp), status: response.status, url: response.url });
  });
  cdp.on('Network.dataReceived', e => { const r = get(e.requestId); r.bodyBytes += e.encodedDataLength; point(r, e.timestamp, r.responseBytes + r.bodyBytes); });
  cdp.on('Network.loadingFinished', e => { const r = get(e.requestId); r.finishedAt = at(e.timestamp); point(r, e.timestamp, e.encodedDataLength); });
  cdp.on('Network.loadingFailed', e => {
    const r = get(e.requestId); r.failedAt = at(e.timestamp); lastActivity = Date.now();
    report.errors.network.push({ at: r.failedAt, url: r.url, error: e.errorText, canceled: !!e.canceled });
  });
  const rowsAt = cutoff => [...requests.values()].filter(r => r.url?.startsWith('http') && r.startedAt <= cutoff).map(r => ({
    ...r, path: r.url.startsWith(base) ? r.url.slice(base.length) : r.url, kind: kind(r.url),
    bytes: r.points.filter(p => p.at <= cutoff).at(-1)?.bytes || 0,
    complete: r.finishedAt != null && r.finishedAt <= cutoff,
    failed: r.failedAt != null && r.failedAt <= cutoff,
  }));
  const snapshot = cutoff => {
    const rows = rowsAt(cutoff), byKind = {};
    for (const r of rows) byKind[r.kind] = (byKind[r.kind] || 0) + r.bytes;
    const inFlight = rows.filter(r => !r.complete && !r.failed);
    return { atMs: cutoff, wireBytes: rows.reduce((sum, r) => sum + r.bytes, 0), byKind, requestCount: rows.length,
      completedRequests: rows.filter(r => r.complete).length, inFlightRequests: inFlight.map(r => ({ url: r.url, observedWireBytes: r.bytes })),
      inFlightObservedWireBytes: inFlight.reduce((sum, r) => sum + r.bytes, 0) };
  };
  await page.goto(report.url, { waitUntil: 'domcontentloaded', timeout });
  report.tDomContentLoaded = Date.now() - started;
  await page.waitForSelector('main.world-app canvas', { state: 'attached', timeout });
  report.tCanvas = Date.now() - started; // Diagnostic only: canvas existence is NOT playable.
  await page.waitForFunction(() => !!document.querySelector('main.world-app canvas') && !document.querySelector('.world-loading'), undefined, { timeout });
  report.tPlayable = Date.now() - started;
  report.playable = snapshot(report.tPlayable);
  report.readyGate = 'WorldApp removes .world-loading only when SceneLifecycle sets ready on its third frame.';
  report.drawingBuffer = await page.locator('main.world-app canvas').first().evaluate(canvas => {
    const gl = canvas.getContext('webgl2'), rect = canvas.getBoundingClientRect();
    return { pixels: [gl?.drawingBufferWidth ?? canvas.width, gl?.drawingBufferHeight ?? canvas.height], cssPixels: [rect.width, rect.height], devicePixelRatio, source: gl ? 'WebGL2 drawingBufferWidth/Height' : 'canvas backing dimensions' };
  });
  const readPosition = () => page.locator('aside.world-location svg circle.world-map-anchor').evaluate(n => {
    const x = n.getAttribute('cx'), z = n.getAttribute('cy');
    if (x === null || z === null || !Number.isFinite(Number(x)) || !Number.isFinite(Number(z))) throw new Error('normal radar position unavailable');
    return [Number(x), Number(z)];
  });
  const before = await readPosition(), samples = [];
  await page.keyboard.down('KeyW');
  const heldAt = Date.now();
  try {
    do {
      await page.waitForTimeout(Math.min(100, Math.max(1, 1000 - (Date.now() - heldAt))));
      const position = await readPosition(), distance = Math.hypot(position[0] - before[0], position[1] - before[1]);
      samples.push({ atMs: Date.now() - started, position, distance });
    } while (Date.now() - heldAt < 1000);
  } finally { await page.keyboard.up('KeyW'); }
  const after = await readPosition(), first = samples.find(s => s.distance >= .05);
  report.movement = { input: 'real keyboard KeyW held for one second; no QA/store/debug/teleport', source: 'normal HUD world-map-anchor cx/cy (world x/z metres)', heldMs: Date.now() - heldAt, before, after, distanceMetres: Math.hypot(after[0] - before[0], after[1] - before[1]), confirmed: !!first, firstMovementMs: first?.atMs ?? null, detectionThresholdMetres: .05, samples };
  // Settle requires zero unfinished HTTP requests AND three seconds without network activity.
  let settled = false;
  while (Date.now() - started < timeout) {
    const pending = [...requests.values()].some(r => r.url?.startsWith('http') && r.finishedAt == null && r.failedAt == null);
    if (!pending && Date.now() - lastActivity >= 3000) { settled = true; break; }
    await page.waitForTimeout(200);
  }
  report.settle = { ...snapshot(Date.now() - started), settled, quietWindowMs: 3000, timedOut: !settled };
  report.navigation = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { domContentLoadedMs: n?.domContentLoadedEventEnd, loadMs: n?.loadEventEnd || null, url: location.href }; });
  // Body-only gzip counterfactuals are not wire bytes, exclude incomplete/error/nonlocal requests, and never decide acceptance.
  if (dist) {
    const estimates = new Map();
    for (const r of rowsAt(report.settle.atMs).filter(r => r.complete && r.status >= 200 && r.status < 300 && r.method === 'GET' && new URL(r.url).origin === base)) {
      try { const body = await readFile(await staticFile(r.url)); estimates.set(r.id, { bodyBytes: body.length, gzipBodyBytes: gzipSync(body).length }); } catch { /* Coverage is reported; never substitute wire bytes as an estimate. */ }
    }
    report.gzipBodyEstimates = { notWireBytes: true, excludesHeaders: true, basis: 'completed successful local GET files only; temporary server sends no Content-Encoding', snapshots: {} };
    for (const [name, cutoff] of [['playable', report.tPlayable], ['settle', report.settle.atMs]]) {
      const rows = rowsAt(cutoff).filter(r => r.complete && estimates.has(r.id)), byKind = {};
      for (const r of rows) { const e = estimates.get(r.id); byKind[r.kind] = (byKind[r.kind] || 0) + e.gzipBodyBytes; }
      report.gzipBodyEstimates.snapshots[name] = { filesCovered: rows.length, uncompressedBodyBytes: rows.reduce((sum, r) => sum + estimates.get(r.id).bodyBytes, 0), gzipBodyBytes: rows.reduce((sum, r) => sum + estimates.get(r.id).gzipBodyBytes, 0), byKind };
    }
  }
  report.checks = {
    movementConfirmed: report.movement.confirmed,
    playableWithin8s: report.movement.confirmed && report.tPlayable <= budget.playableMs,
    firstMovementWithin8s: report.movement.confirmed && report.movement.firstMovementMs <= budget.playableMs,
    observedWireAtPlayableWithin15MB: report.playable.wireBytes <= budget.initialWireBytes,
    consoleZeroErrors: report.errors.console.length === 0, pageZeroErrors: report.errors.page.length === 0,
    httpZeroErrors: report.errors.http.length === 0, networkZeroErrors: report.errors.network.length === 0,
    allAssetsSettled: settled,
  };
  report.productionBudgetEligible = !!dist && throttleName === '100mbps';
  report.productionBudgetPass = report.productionBudgetEligible ? report.checks.playableWithin8s && report.checks.observedWireAtPlayableWithin15MB : null;
  report.largest = rowsAt(report.settle.atMs).sort((a, b) => b.bytes - a.bytes).slice(0, 25).map(r => ({ path: r.path, kind: r.kind, wireBytes: r.bytes, complete: r.complete, finishedAt: r.finishedAt ?? null }));
  if (!report.movement.confirmed || !settled || report.productionBudgetPass === false) process.exitCode = 1;
} catch (error) { report.failure = { message: error.message, stack: error.stack }; process.exitCode = 1; }
finally {
  await writeFile(path.join(out, 'load-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ url: report.url, tPlayable: report.tPlayable, movement: report.movement, playable: report.playable, settle: report.settle, drawingBuffer: report.drawingBuffer, checks: report.checks, productionBudgetEligible: report.productionBudgetEligible, productionBudgetPass: report.productionBudgetPass, errors: report.errors, failure: report.failure }, null, 2));
  await browser?.close();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
}
