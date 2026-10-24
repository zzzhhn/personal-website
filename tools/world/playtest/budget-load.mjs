/** First-load measurement (render session): normal entry /world/ (no QA), records every response until the player can
 * move (canvas present + 'ready' heuristics) and after full asset settle. Reports transferred bytes per type, the
 * largest files, and timings. Uses CDP Network events (encodedDataLength = bytes on the wire).
 * Env: LOAD_THROTTLE=fast3g|none (default none; dev server, so absolute times are local-only). */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CHROME, loadPlaywright } from './lib.mjs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
// LOAD_DIST=<astro build outDir>: serve that production build on 127.0.0.1:4398 (gzip off: raw bytes reported, plus a
// gzip estimate per file) instead of measuring the dev server, which ships unbundled modules.
const dist = process.env.LOAD_DIST;
let server = null;
if (dist) {
  const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
  server = createServer(async (q, r) => { let f = path.join(dist, decodeURIComponent(q.url.split('?')[0])); try { if ((await stat(f)).isDirectory()) f = path.join(f, 'index.html'); const b = await readFile(f); r.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' }); r.end(b); } catch { r.writeHead(404); r.end(); } });
  await new Promise(res => server.listen(4398, '127.0.0.1', res));
}
const base = dist ? 'http://127.0.0.1:4398' : process.env.WORLD_BASE_URL || 'http://127.0.0.1:4338', out = path.resolve(process.env.WORLD_PLAYTEST_DIR || '/tmp/world-load');
await mkdir(out, { recursive: true });
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } }), page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
const req = new Map(); const t0 = Date.now();
cdp.on('Network.responseReceived', e => { const r = req.get(e.requestId) ?? {}; Object.assign(r, { url: e.response.url, mime: e.response.mimeType, status: e.response.status }); req.set(e.requestId, r); });
cdp.on('Network.loadingFinished', e => { const r = req.get(e.requestId) ?? {}; r.bytes = e.encodedDataLength; r.at = Date.now() - t0; req.set(e.requestId, r); });
await page.goto(`${base}/world/`, { waitUntil: 'load', timeout: 120000 });
const tLoad = Date.now() - t0;
await page.waitForSelector('canvas', { timeout: 60000 }); const tCanvas = Date.now() - t0;
// Settle: no new finished request for 3 s.
let last = -1, quiet = 0; while (quiet < 3000 && Date.now() - t0 < 90000) { await page.waitForTimeout(500); const n = [...req.values()].filter(r => r.bytes).length; if (n === last) quiet += 500; else { quiet = 0; last = n; } }
const rows = [...req.values()].filter(r => r.url && r.bytes != null).map(r => ({ ...r, path: r.url.replace(base, '') }));
const kind = r => /\.glb/.test(r.path) ? 'glb' : /\.(png|jpe?g|webp|ktx2)/.test(r.path) ? 'texture' : /draco|\.wasm/.test(r.path) ? 'draco' : /\.m?js|\.ts|\.tsx|@vite|node_modules/.test(r.path) ? 'js' : /\.css/.test(r.path) ? 'css' : 'other';
if (dist) { const { gzipSync } = await import('node:zlib'); for (const r of rows) { try { r.gzip = gzipSync(await readFile(path.join(dist, r.path.split('?')[0]))).length; } catch { r.gzip = r.bytes; } } }
const gz = {}; for (const r of rows) { const k = kind(r); gz[k] = (gz[k] ?? 0) + (r.gzip ?? r.bytes); }
const by = {}; for (const r of rows) { const k = kind(r); by[k] = (by[k] ?? 0) + r.bytes; }
const report = { base, tLoad, tCanvas, total: rows.reduce((a, r) => a + r.bytes, 0), byKind: by, byKindGzip: gz, count: rows.length,
  largest: rows.filter(r => kind(r) !== 'js').sort((a, b) => b.bytes - a.bytes).slice(0, 25).map(r => ({ path: r.path, kb: +(r.bytes / 1024).toFixed(1), at: r.at })) };
await writeFile(path.join(out, 'load-report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ tLoad, tCanvas, totalMB: +(report.total / 1048576).toFixed(2), byKindKB: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, Math.round(v / 1024)])), gzipKB: Object.fromEntries(Object.entries(gz).map(([k, v]) => [k, Math.round(v / 1024)])) }));
for (const r of report.largest) console.log(r.kb, r.path);
await browser.close();
server?.close();
