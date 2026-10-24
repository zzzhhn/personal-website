/** Shadows v4 acceptance bot (QA page ?qa=1). Movement and camera use only real input: WASD/Shift/Space
 * keys, Esc (pause), mouse drag (orbit), wheel (zoom), and the settings dialog buttons (Night). No teleport,
 * no store writes. QA-only toggles (window.__worldDebug.shadowQa) are used while the world is paused to
 * isolate one shadow: frame A (guide casts) vs frame B (guide does not cast) vs frame C (guide hidden).
 *   shadow mask = lum(B) - lum(A) > T, minus the guide's own silhouette |B - C| > T
 * Mask pixels are mapped to the ground plane under the feet with the frame's camera.
 * Usage: node shadow-v4-evidence.mjs [BASE] [OUTDIR] [parts=body,orbit,fire,occlusion,crawl,perf] */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadPlaywright, CHROME, openWorld, frameTiming } from './lib.mjs';
const base = process.argv[2] || 'http://127.0.0.1:4322';
const out = process.argv[3] || 'docs/world/quality-v3/shadows-v4/evidence';
const parts = new Set((process.argv[4] || 'body,orbit,fire,occlusion,crawl,perf').split(','));
await mkdir(out, { recursive: true });
const W = 1920, H = 1080;
const SUN = [-90, 40, 65]; const sunGround = Math.atan2(-SUN[2], -SUN[0]) * 180 / Math.PI; // shadow direction on ground (deg, atan2(z,x))
const FIRE = [-42, 6.5, 30];
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const report = { base, startedAt: new Date().toISOString(), machine: 'Apple M5 Pro, headless Chrome, ANGLE Metal (no M1 claim)', viewport: [W, H], sunShadowGroundDeg: sunGround, sections: {}, errors: [] };
const { page, errors } = await openWorld(browser, base + '/world/?qa=1', { width: W, height: H, preserve: true });
await page.routeWebSocket('**/*', ws => ws.close());
const box = await page.locator('canvas').first().boundingBox();
const CX = box.x + box.width / 2, CY = box.y + box.height / 2;
const held = new Set();
async function hold(keys) { const n = new Set(keys); for (const k of [...held]) if (!n.has(k)) { await page.keyboard.up(k); held.delete(k); } for (const k of n) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); } }
const fb = () => page.evaluate(() => { const d = window.__worldDebug, s = d.snapshot(); return { p: s.player, yaw: s.playerYaw, grounded: s.grounded, cam: d.camera(), paused: d.state().paused, light: d.state().light, occ: d.shadowQa.occlusionInfo() }; });
const cameraRelative = (x, z, yaw) => { const fx = -Math.cos(yaw), fz = -Math.sin(yaw), rx = Math.sin(yaw), rz = -Math.cos(yaw); return [x * rx + z * fx, x * rz + z * fz]; };
function combo(dx, dz, yaw) {
  let best = null, score = -Infinity; const m = Math.hypot(dx, dz) || 1;
  for (const x of [-1, 0, 1]) for (const z of [-1, 0, 1]) { if (!x && !z) continue; const v = cameraRelative(x, z, yaw), n = Math.hypot(...v); const s = (v[0] * dx + v[1] * dz) / (n * m); if (s > score) { score = s; best = [z > 0 ? 'KeyW' : z < 0 ? 'KeyS' : null, x > 0 ? 'KeyD' : x < 0 ? 'KeyA' : null].filter(Boolean); } }
  return best;
}
async function walkTo([tx, tz], { arrive = .45, timeout = 15, run = false } = {}) {
  const t0 = Date.now(); let s = await fb(), last = { t: Date.now(), d: Infinity };
  while (Date.now() - t0 < timeout * 1000) {
    s = await fb(); const dx = tx - s.p[0], dz = tz - s.p[2], d = Math.hypot(dx, dz);
    if (d < arrive) break;
    if (Date.now() - last.t > 900) { if (last.d - d < .2) { await hold(['Space']); await page.waitForTimeout(120); } last = { t: Date.now(), d }; }
    await hold([...combo(dx, dz, s.cam.yaw), ...(run || d > 4 ? ['ShiftLeft'] : [])]); await page.waitForTimeout(35);
  }
  await hold([]); await page.waitForTimeout(450); s = await fb();
  return { target: [tx, tz], at: s.p, reached: Math.hypot(tx - s.p[0], tz - s.p[2]) < arrive + .4, seconds: (Date.now() - t0) / 1000 };
}
async function pause(on) { const s = await fb(); if (s.paused !== on) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); } }
async function orbit(dx, dy = 0) { await page.mouse.move(CX, CY); await page.mouse.down(); for (let i = 1; i <= 12; i++) await page.mouse.move(CX + dx * i / 12, CY + dy * i / 12); await page.mouse.up(); await page.waitForTimeout(700); }
async function zoomTo(target) { for (let i = 0; i < 80; i++) { const c = (await fb()).cam; if (Math.abs(c.distance - target) / target < .04) break; await page.mouse.move(CX, CY); await page.mouse.wheel(0, c.distance > target ? -100 : 100); await page.waitForTimeout(25); } await page.waitForTimeout(900); }
const qa = (fn, ...args) => page.evaluate(([fn, args]) => window.__worldDebug.shadowQa[fn](...args), [fn, args]);
/** In-page capture/analysis. */
await page.evaluate(() => {
  window.__sv4 = {
    grab: () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => { const c = document.querySelector('canvas'); const o = new OffscreenCanvas(c.width, c.height); const x = o.getContext('2d'); x.drawImage(c, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; const l = new Float32Array(c.width * c.height); for (let i = 0; i < l.length; i++) l[i] = .2126 * d[i * 4] + .7152 * d[i * 4 + 1] + .0722 * d[i * 4 + 2]; res({ l, w: c.width, h: c.height, rgba: d }); })))),
  };
});
/** Isolated shadow of the guide (world must be paused). light: which light's shadow to keep (sun|fire). */
async function guideShadow(name, { keep = 'sun', groundY, from, save = true } = {}) {
  const r = await page.evaluate(async ({ keep, groundY, from, save }) => {
    const d = window.__worldDebug, q = d.shadowQa, g = window.__sv4;
    q.sunShadowIntensity(keep === 'fire' ? 0 : 1); q.fireShadowIntensity(keep === 'sun' ? 0 : 1);
    q.guideVisible(true); q.guideCastShadow(true); const A = await g.grab();
    q.guideCastShadow(false); const B = await g.grab();
    q.guideVisible(false); const C = await g.grab();
    q.guideVisible(true); q.guideCastShadow(true); q.sunShadowIntensity(1); q.fireShadowIntensity(1);
    const { w, h } = A, T = 6; let n = 0, sx = 0, sz = 0, sil = 0; const pts = [];
    const mask = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, body = Math.abs(B.l[i] - C.l[i]) > T, sh = B.l[i] - A.l[i] > T && !body;
      if (body) sil++;
      mask[i * 4] = sh ? 255 : body ? 60 : A.rgba[i * 4] * .25; mask[i * 4 + 1] = sh ? 255 : body ? 160 : A.rgba[i * 4 + 1] * .25; mask[i * 4 + 2] = sh ? 255 : body ? 255 : A.rgba[i * 4 + 2] * .25; mask[i * 4 + 3] = 255;
      if (!sh || (x + y) % 2) continue;
      const p = q.groundHit(x + .5, y + .5, w, h, groundY); if (!p) continue;
      n++; sx += p[0]; sz += p[2]; pts.push(p[0], p[2]);
    }
    let png = null;
    if (save) { const o = new OffscreenCanvas(w, h); o.getContext('2d').putImageData(new ImageData(mask, w, h), 0, 0); const b = await o.convertToBlob({ type: 'image/png' }); const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); png = btoa(s); }
    if (!n) return { pixels: 0, silhouettePixels: sil, png };
    const c = [sx / n, sz / n], ang = Math.atan2(c[1] - from[1], c[0] - from[0]);
    const ux = Math.cos(ang), uz = Math.sin(ang); let minD = Infinity, maxAlong = -Infinity, s2 = 0, sa = 0, sa2 = 0;
    for (let i = 0; i < pts.length; i += 2) { const dx = pts[i] - from[0], dz = pts[i + 1] - from[1]; minD = Math.min(minD, Math.hypot(dx, dz)); const a = dx * ux + dz * uz, p = -dx * uz + dz * ux; maxAlong = Math.max(maxAlong, a); s2 += p * p; sa += a; sa2 += a * a; }
    const m = pts.length / 2, feet = q.project([[from[0], groundY, from[1]], [c[0], groundY, c[1]]], w, h);
    return { pixels: n * 2, silhouettePixels: sil, centroid: c, dirDeg: ang * 180 / Math.PI, contactGap_m: minD, length_m: maxAlong, widthStd_m: Math.sqrt(s2 / m), alongStd_m: Math.sqrt(Math.max(0, sa2 / m - (sa / m) ** 2)),
      screenDirDeg: Math.atan2(feet[1][1] - feet[0][1], feet[1][0] - feet[0][0]) * 180 / Math.PI, png };
  }, { keep, groundY, from, save, name });
  if (r.png) { await writeFile(path.join(out, name + '-mask.png'), Buffer.from(r.png, 'base64')); r.mask = path.join(out, name + '-mask.png'); }
  delete r.png; return r;
}
const feetY = p => p[1] - .82; // capsule centre - (radius + half height)
const angDiff = (a, b) => ((a - b + 540) % 360) - 180;
try {
  report.entryUrl = page.url();
  // ---------- (1) body tracking under the fixed sun ----------
  if (parts.has('body')) {
    const sec = report.sections.body = { note: 'dusk sun shadow of the guide only (fire shadow intensity 0 during capture)', cases: [] };
    await zoomTo(7);
    await walkTo([-36, 41], { timeout: 25 }); // open ground: the ~5 m dusk shadow (toward +x,-z) misses benches and tree shadows
    const add = async (label, extra = {}) => { await pause(true); const s = await fb(); const m = await guideShadow('body-' + label, { keep: 'sun', groundY: extra.groundY ?? feetY(s.p), from: [s.p[0], s.p[2]] }); await pause(false); sec.cases.push({ label, player: s.p, facingRad: s.yaw, grounded: s.grounded, ...m, expectedDirDeg: sunGround, dirErrorDeg: m.dirDeg != null ? angDiff(m.dirDeg, sunGround) : null }); return { s, m }; };
    // idle, facing set by a short tap in four camera-relative directions
    for (const [label, keys] of [['face-forward', ['KeyW']], ['face-right', ['KeyD']], ['face-back', ['KeyS']], ['face-left', ['KeyA']]]) { await hold(keys); await page.waitForTimeout(160); await hold([]); await page.waitForTimeout(700); await add(label); }
    // walking mid-stride (three moments), pause while the key is held
    for (const t of [180, 420, 660]) { await hold(['KeyD']); await page.waitForTimeout(t); await pause(true); await hold([]); const s = await fb(); const m = await guideShadow('body-walk-' + t, { keep: 'sun', groundY: feetY(s.p) - 0, from: [s.p[0], s.p[2]] }); await pause(false); sec.cases.push({ label: 'walk+' + t + 'ms', player: s.p, facingRad: s.yaw, ...m, dirErrorDeg: m.dirDeg != null ? angDiff(m.dirDeg, sunGround) : null }); await page.waitForTimeout(500); await hold(['KeyA']); await page.waitForTimeout(t); await hold([]); await page.waitForTimeout(500); }
    // jump: ground reference, then airborne at two moments; ground plane stays at the take-off feet height
    const ref = await add('jump-ref');
    for (const t of [140, 300]) { const g = feetY(ref.s.p); await page.keyboard.press('Space'); await page.waitForTimeout(t); await pause(true); const s = await fb(); const m = await guideShadow('body-jump-' + t, { keep: 'sun', groundY: g, from: [ref.s.p[0], ref.s.p[2]] }); await pause(false); await page.waitForTimeout(900);
      const h = feetY(s.p) - g, shift = m.centroid && ref.m.centroid ? Math.hypot(m.centroid[0] - ref.m.centroid[0], m.centroid[1] - ref.m.centroid[1]) : null;
      sec.cases.push({ label: 'jump+' + t + 'ms', player: s.p, grounded: s.grounded, heightAboveTakeoff_m: h, centroidShiftFromGround_m: shift, expectedShift_m: h / Math.tan(Math.asin(SUN[1] / Math.hypot(...SUN))), ...m }); }
  }
  // ---------- (2) free camera: screen direction changes, world direction stays ----------
  if (parts.has('orbit')) {
    const sec = report.sections.orbit = { note: 'standing still; camera orbited by mouse drag; sun fixed', cases: [] };
    await zoomTo(7);
    for (let i = 0; i < 6; i++) { await pause(true); const s = await fb(); const m = await guideShadow('orbit-' + i, { keep: 'sun', groundY: feetY(s.p), from: [s.p[0], s.p[2]] }); await pause(false); sec.cases.push({ cameraYawRad: s.cam.yaw, cameraPitchRad: s.cam.pitch, cameraDistance_m: s.cam.distance, worldDirDeg: m.dirDeg, screenDirDeg: m.screenDirDeg, contactGap_m: m.contactGap_m, pixels: m.pixels, mask: m.mask }); await orbit(190, i === 2 ? 60 : 0); }
    const sd = sec.cases.map(c => c.screenDirDeg).filter(v => v != null), wd = sec.cases.map(c => c.worldDirDeg).filter(v => v != null);
    let span = 0, acc = 0; for (let i = 1; i < sd.length; i++) { acc += angDiff(sd[i], sd[i - 1]); span = Math.max(span, Math.abs(acc)); }
    sec.screenDirectionTravelDeg = span; sec.worldDirectionMaxDevDeg = Math.max(...wd.map(v => Math.abs(angDiff(v, sunGround))));
  }
  // ---------- (3) night: walk a full circle around the fire ----------
  if (parts.has('fire')) {
    const sec = report.sections.fire = { note: 'night via settings dialog; fire key light shadow only (sun shadow intensity 0 during capture)', cases: [] };
    await pause(true); await page.getByRole('button', { name: /^Night$|^夜晚$/ }).click(); await page.waitForTimeout(200); await pause(false); await page.waitForTimeout(2300);
    await zoomTo(16);
    sec.fireInfo = await page.evaluate(() => window.__worldDebug.fireShadowInfo());
    const R = 3.3; const start = Math.atan2(37 - 30, -41 + 42);
    for (let k = 0; k < 12; k++) {
      const a = start + k * Math.PI / 6, wp = [FIRE[0] + R * Math.cos(a), FIRE[2] + R * Math.sin(a)];
      const w = await walkTo(wp, { arrive: .5, timeout: 10 });
      await pause(true); const s = await fb();
      const m = await guideShadow('fire-' + k, { keep: 'fire', groundY: feetY(s.p), from: [s.p[0], s.p[2]] });
      await pause(false);
      const expected = Math.atan2(s.p[2] - FIRE[2], s.p[0] - FIRE[0]) * 180 / Math.PI;
      sec.cases.push({ station: k, walk: w, player: s.p, fireToPlayerDeg: expected, shadowDirDeg: m.dirDeg, errorDeg: m.dirDeg != null ? angDiff(m.dirDeg, expected) : null, pixels: m.pixels, contactGap_m: m.contactGap_m, length_m: m.length_m, mask: m.mask });
    }
    const d = sec.cases.map(c => c.shadowDirDeg); let acc = 0, min = 0, max = 0; for (let i = 1; i < d.length; i++) { if (d[i] == null || d[i - 1] == null) continue; acc += angDiff(d[i], d[i - 1]); min = Math.min(min, acc); max = Math.max(max, acc); }
    sec.shadowDirectionSweepDeg = max - min; sec.maxAbsErrorDeg = Math.max(...sec.cases.map(c => Math.abs(c.errorDeg ?? 999)));
    // back to dusk for the remaining sections
    await pause(true); await page.getByRole('button', { name: /^Dusk$|^黄昏$/ }).click(); await page.waitForTimeout(200); await pause(false); await page.waitForTimeout(2300);
  }
  // ---------- (4) occlusion: tree crown and tent between camera and guide ----------
  if (parts.has('occlusion')) {
    const sec = report.sections.occlusion = { cases: [] };
    async function visiblePixels() { return page.evaluate(async () => { const q = window.__worldDebug.shadowQa, g = window.__sv4; q.guideCastShadow(false); q.guideVisible(true); const A = await g.grab(); q.guideVisible(false); const B = await g.grab(); q.guideVisible(true); q.guideCastShadow(true); let n = 0; for (let i = 0; i < A.l.length; i++) if (Math.abs(A.l[i] - B.l[i]) > 6) n++; return n; }); }
    async function shot(file) { await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); const u = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png')); await writeFile(path.join(out, file), Buffer.from(u.split(',')[1], 'base64')); return path.join(out, file); }
    async function caseAt(label, occluder, { route, yaw, pitch, distance = 12 }) {
      const legs = []; for (const wp of route) legs.push(await walkTo(wp, { arrive: .35, timeout: 20 }));
      await zoomTo(distance);
      let c = (await fb()).cam;
      if (yaw != null) { await orbit(angDiff(yaw * 180 / Math.PI, c.yaw * 180 / Math.PI) * Math.PI / 180 / .0055); c = (await fb()).cam; }
      if (pitch != null) { await orbit(0, (pitch - c.pitch) / .0055); c = (await fb()).cam; }
      await page.waitForTimeout(900);
      const res = { label, occluder, route, walk: legs };
      for (const on of [false, true]) {
        await qa('occlusion', on); await page.waitForTimeout(700); await pause(true);
        const s = await fb(); res[on ? 'on' : 'off'] = { blockers: s.occ.blockers, fades: s.occ.fades, visiblePixels: await visiblePixels(), shot: await shot(`occ-${label}-${on ? 'fade' : 'nofade'}.png`), camera: s.cam, player: s.p, occlusionStats: { candidates: s.occ.candidates, tested: s.occ.tested, rays: s.occ.rays, ms: s.occ.ms } };
        await pause(false);
      }
      sec.cases.push(res);
    }
    // Crowns do not collide (trees collide only at the trunk), so the follow camera can end up behind them.
    // Stand so the default-yaw sight line (camera toward +x,+z, 45 deg pitch, 12 m) passes through the crown.
    await caseAt('tree-G17', 'G17 crown at (-51.9, 8.6, 45)', { route: [[-53.95, 42.45]], yaw: null, pitch: null });
    await caseAt('tree-G16', 'G16 crown at (-29, 8.9, 17)', { route: [[-31.0, 14.4]], yaw: null, pitch: null });
    // Tent (spec 14 item 6): stand just north (-z) of the tent's back gable, camera on the door side (+z),
    // pulled back to 18 m and pitched steeply (1.1-1.2 rad), so the camera's pivot ray clears the ridge
    // (no camera collision pull-in) while the sight lines to the legs/torso cross the canvas.
    await caseAt('tent-C04', 'C04 shell at (-51, 6.0, 12.5), ridge 7.2 m', { route: [[-46.3, 17], [-46.3, 10.4], [-51, 10.4]], yaw: Math.PI / 2, pitch: 1.1, distance: 18 });
    await caseAt('tent-C03', 'C03 shell at (-42, 6.4, 12.5), ridge 7.9 m', { route: [[-46.3, 17], [-46.3, 10.0], [-42, 10.0]], yaw: Math.PI / 2, pitch: 1.2, distance: 18 });
    await qa('occlusion', true);
  }
  // ---------- (4b) driving occlusion: chase camera behind a G16 crown ----------
  // Fixture start (logged): the 4x4 is placed just north of the G16 at (-29, 17) facing away from it (+z),
  // the player beside it; entering (E), driving (W) and braking (Space) are real keys. The chase camera
  // settles 7+ m behind the car, i.e. behind the crown, so the crown sits on the sight line.
  if (parts.has('drive')) {
    const sec = report.sections.drive = { fixtures: [], frames: [] };
    const carPx = () => page.evaluate(async () => { const q = window.__worldDebug.shadowQa, g = window.__sv4; q.vehicleVisible(true); const A = await g.grab(); q.vehicleVisible(false); const B = await g.grab(); q.vehicleVisible(true); let n = 0; for (let i = 0; i < A.l.length; i++) if (Math.abs(A.l[i] - B.l[i]) > 6) n++; return n; });
    const shotFile = async file => { const u = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png')); await writeFile(path.join(out, file), Buffer.from(u.split(',')[1], 'base64')); return path.join(out, file); };
    const car = () => page.evaluate(() => { const s = window.__worldDebug.snapshot(); return { active: s.activeVehicle, v: s.vehicles.find(v => v.id === 'offroad') }; });
    const fix = [[-29, 6.02, 21.6], -Math.PI / 2];
    sec.fixtures.push({ teleportVehicle: ['offroad', ...fix] }, { teleportPlayer: [-27.2, 5.8, 21.6] });
    await page.evaluate(([p, yaw]) => window.__worldDebug.teleportVehicle('offroad', p, yaw), fix);
    await page.evaluate(() => window.__worldDebug.teleportPlayer([-27.2, 5.8, 21.6]));
    await page.waitForTimeout(700);
    await page.keyboard.press('KeyE'); await page.waitForTimeout(2600);
    const capture = async label => {
      await qa('occlusion', false); await page.waitForTimeout(500); await pause(true);
      const off = { visiblePixels: await carPx(), shot: await shotFile(`drive-${label}-nofade.png`), occ: (await fb()).occ, camera: (await fb()).cam, car: await car() };
      await pause(false); await qa('occlusion', true); await page.waitForTimeout(500); await pause(true);
      const on = { visiblePixels: await carPx(), shot: await shotFile(`drive-${label}-fade.png`), occ: (await fb()).occ, camera: (await fb()).cam, car: await car() };
      await pause(false);
      sec.frames.push({ label, off, on });
    };
    await capture('parked-after-entry');
    // creep forward with real keys: W pulses, then brake
    const track = [];
    for (let i = 0; i < 14; i++) { await hold(['KeyW']); await page.waitForTimeout(90); await hold([]); await page.waitForTimeout(60); const o = await page.evaluate(() => window.__worldDebug.shadowQa.occlusionInfo()); const c = await car(); track.push({ t: i, p: c.v.position, active: c.active, blockers: o.blockers, corridor: o.corridor_m }); }
    await hold(['Space']); await page.waitForTimeout(500); await hold([]);
    sec.track = track;
    await capture('after-creep');
    await page.keyboard.press('KeyE'); await page.waitForTimeout(800); sec.exitedVehicle = (await car()).active === null;
  }
  // ---------- (5) static shadows do not crawl ----------
  if (parts.has('crawl')) {
    const sec = report.sections.crawl = { points: [[-42, 4.85, 30], [-37.76, 5.1, 34.24], [-58.97, 4.9, 34.01]], samples: [] };
    const sample = async tag => sec.samples.push(await page.evaluate(([tag, pts]) => { const d = window.__worldDebug, s = d.shadowInfo(); return { tag, t: performance.now(), texels: d.shadowTexelsOf(pts), half: s.cascades.map(c => c.halfExtent_m), updates: s.updates }; }, [tag, sec.points]));
    await zoomTo(6);
    for (let i = 0; i < 25; i++) { await hold(['KeyW']); await page.waitForTimeout(60); await sample('walk'); }
    await hold([]);
    for (let i = 0; i < 20; i++) { await page.mouse.move(CX, CY); await page.mouse.down(); await page.mouse.move(CX + 30, CY + (i % 5 === 0 ? 6 : 0)); await page.mouse.up(); await sample('orbit'); }
    for (let i = 0; i < 16; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(40); await sample('zoom'); }
    // classify frame pairs: same extents -> fractional texel parts must be identical
    let same = 0, crawl = 0, resample = 0, worst = 0;
    for (let i = 1; i < sec.samples.length; i++) {
      const a = sec.samples[i - 1], b = sec.samples[i];
      for (let c = 0; c < a.half.length; c++) {
        const sameExt = a.half[c][0] === b.half[c][0] && a.half[c][1] === b.half[c][1];
        if (!sameExt) { resample++; continue; }
        same++;
        for (let p = 0; p < a.texels.length; p++) for (let k = 0; k < 2; k++) { const fa = a.texels[p][c][k] % 1, fb2 = b.texels[p][c][k] % 1; let df = Math.abs(fa - fb2); df = Math.min(df, 1 - df); worst = Math.max(worst, df); if (df > 1e-3) crawl++; }
      }
    }
    sec.byPhase = Object.fromEntries(['walk', 'orbit', 'zoom'].map(t => { let ch = 0, n = 0; for (let i = 1; i < sec.samples.length; i++) { if (sec.samples[i].tag !== t) continue; n++; if (JSON.stringify(sec.samples[i].half) !== JSON.stringify(sec.samples[i - 1].half)) ch++; } return [t, { frames: n, extentChanges: ch }]; }));
    sec.summary = { pairs: same, extentChanges_resample: resample, crawlingCoordinates: crawl, worstFractionalDrift_texel: worst };
  }
  // ---------- (6) cost ----------
  if (parts.has('perf')) {
    const sec = report.sections.perf = { budget: { calls: 300, triangles: 500000 }, cases: {} };
    const series = async (label, n = 90) => {
      const r = await page.evaluate(n => Promise.all([window.__worldDebug.shadowQa.frameSeries(n), new Promise(res => setTimeout(res, 0))]).then(x => x[0]), n);
      const t = await frameTiming(page, 3);
      const f = await page.evaluate(() => window.__worldDebug.fireShadowInfo());
      sec.cases[label] = { ...r, timing: t, fire: { mode: f.mode, distance_m: f.distanceToFocus_m, mapSize: f.mapSize } };
      return sec.cases[label];
    };
    // Peak over the frames of each state (frameSeries returns max / median / min of per-frame totals).
    await zoomTo(10);
    await series('dusk-spawn-10m');
    await zoomTo(30); await series('dusk-spawn-30m'); await zoomTo(10);
    await pause(true); await page.getByRole('button', { name: /^Night$|^夜晚$/ }).click(); await pause(false); await page.waitForTimeout(2300);
    for (const wp of [[-46.3, 17], [-48, 30], [-42, 33.4]]) sec.walk = [...(sec.walk ?? []), await walkTo(wp, { timeout: 25 })];
    await series('night-near-fire-10m-fireShadowOn');
    // walking around the fire (dynamic caster moving every frame)
    const walkSeries = page.evaluate(() => window.__worldDebug.shadowQa.frameSeries(120));
    await hold(['KeyD', 'ShiftLeft']); await page.waitForTimeout(1500); await hold([]);
    sec.cases['night-walking-by-fire-fireShadowOn'] = await walkSeries;
    await zoomTo(30); await series('night-near-fire-30m-fireShadowOn'); await zoomTo(10);
    await qa('fireCastShadow', false); await page.waitForTimeout(500);
    await series('night-near-fire-10m-fireShadowOff');
    await qa('fireCastShadow', true); await page.waitForTimeout(300);
    // balanced tier (512 fire cube, 3 x 1254 sun)
    await pause(true); await page.getByRole('button', { name: /^Balanced$|^流畅$/ }).click(); await pause(false); await page.waitForTimeout(1500);
    await series('balanced-night-near-fire-10m-fireShadowOn');
    await pause(true); await page.getByRole('button', { name: /^High$|^高清$/ }).click(); await page.getByRole('button', { name: /^Dusk$|^黄昏$/ }).click(); await pause(false); await page.waitForTimeout(2300);
    sec.note = 'headless rAF timing on M5 Pro; draw calls include shadow passes (gl.info resets per render).';
  }
  // ---------- (7) budget over a view grid (night, by the fire, fire shadow on), peak per view ----------
  if (parts.has('perfgrid')) {
    const sec = report.sections.perfgrid = { budget: { calls: 300, triangles: 500000 }, views: [] };
    const tier = process.env.QUALITY || 'High';
    await pause(true);
    await page.getByRole('button', { name: /^Night$|^\u591c\u665a$/ }).click();
    await page.getByRole('button', { name: new RegExp('^' + tier + '$') }).click();
    await pause(false); await page.waitForTimeout(2300);
    for (const wp of [[-46.3, 17], [-48, 30], [-42, 33.4]]) sec.walk = [...(sec.walk ?? []), await walkTo(wp, { timeout: 25 })];
    const setView = async (yaw, pitch) => { let c = (await fb()).cam; await orbit(angDiff(yaw * 180 / Math.PI, c.yaw * 180 / Math.PI) * Math.PI / 180 / .0055); c = (await fb()).cam; await orbit(0, (pitch - c.pitch) / .0055); };
    for (const dist of [10, 30]) {
      await zoomTo(dist);
      for (const pitch of [.3, .79, 1.2]) for (const yaw of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
        await setView(yaw, pitch); await page.waitForTimeout(350);
        const r = await page.evaluate(() => window.__worldDebug.shadowQa.frameSeries(20));
        const c = (await fb()).cam;
        sec.views.push({ dist, yaw: +c.yaw.toFixed(2), pitch: +c.pitch.toFixed(2), actual: +c.actualDistance.toFixed(2), calls: r.calls.max, triangles: Math.round(r.triangles.max), fireFrames: r.fireFrames, frames: r.frames });
      }
    }
    const worst = [...sec.views].sort((a, b) => (b.calls / 300 + b.triangles / 5e5) - (a.calls / 300 + a.triangles / 5e5))[0];
    sec.peak = { calls: Math.max(...sec.views.map(v => v.calls)), triangles: Math.max(...sec.views.map(v => v.triangles)), worst };
    await zoomTo(worst.dist); await setView(worst.yaw, worst.pitch); await page.waitForTimeout(400);
    sec.worstBreakdown = await page.evaluate(async () => { const rows = await window.__worldDebug.shadowQa.frameBreakdown(); return rows; });
  }
} catch (e) { report.errors.push(String(e.stack || e)); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
report.pageErrors = errors.filter(e => !/\[vite\]|api\/events|Outdated Optimize/.test(e));
report.finishedAt = new Date().toISOString();
await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
const brief = JSON.parse(JSON.stringify(report.sections, (k, v) => (k === 'samples' || k === 'mask' || k === 'shot' || k === 'fades' || k === 'camera') ? undefined : typeof v === 'number' ? +v.toFixed(3) : v));
console.log(JSON.stringify(brief).slice(0, 12000)); console.log('errors', report.errors, report.pageErrors.slice(0, 5));
await browser.close();
