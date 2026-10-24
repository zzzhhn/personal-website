/** On-screen budget probe (render session; used by every session and the main thread).
 *
 * What it measures: for a fixed set of worst-case views (gameplay cameras around the player, a driving
 * chase camera, and the integration smoke's fixed QA shots), ONE real frame through the real render path:
 * total draw calls / triangles including every shadow submission (sun cascades + campfire cube), split by
 * pass and by zone (__worldDebug.budget.frame, which wraps renderer.renderBufferDirect for one render call;
 * its total is cross-checked against gl.info). Optional hide-diff (BUDGET_HIDE=1): hide each zone's
 * renderables and its shadow proxies, cost = baseline - hidden (independent second estimate).
 *
 * Usage (from any worktree that has this file and WorldQuality.createBudgetProbe):
 *   /Users/bobby/Desktop/3D-personal-world/tools/bot-run.sh <wt> <port> tools/world/playtest/budget-peak.mjs [outdir]
 * Env (all optional):
 *   BUDGET_VIEWS=spawn,camp,...   subset of view ids (default: all gameplay + drive + QA shots)
 *   BUDGET_QUALITY=high|balanced|both   (default high)
 *   BUDGET_SIZE=1920x1080         viewport (default 1920x1080, dpr 1)
 *   BUDGET_HIDE=1                 also run the per-zone hide-diff (slower)
 *   BUDGET_SHOTS=0                skip the fixed QA shots
 * Output: <outdir>/budget-report.json, budget-report.md (tables), view-<id>-<quality>.jpg (small).
 * Zones and limits come from the page (WorldQuality BUDGET_ZONES), so the tool never hand-copies the table.
 * Tag your own objects with userData.budgetZone only if they are not under your district's mount group.
 * Teleports are fixtures (logged in the report); camera aim uses real mouse drags and wheel. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Bot, CHROME, loadPlaywright, openWorld } from './lib.mjs';
import { aim as aimView, cam, look } from './budget-lib.mjs';

const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4338';
const out = path.resolve(process.env.WORLD_PLAYTEST_DIR || '/tmp/world-budget');
const [W, H] = (process.env.BUDGET_SIZE || '1920x1080').split('x').map(Number);
const qualities = (process.env.BUDGET_QUALITY || 'high') === 'both' ? ['high', 'balanced'] : [process.env.BUDGET_QUALITY || 'high'];
const only = process.env.BUDGET_VIEWS ? new Set(process.env.BUDGET_VIEWS.split(',')) : null;
const hide = process.env.BUDGET_HIDE === '1';
await mkdir(out, { recursive: true });

// Orbit camera: camera = target + (cos p cos y, sin p, cos p sin y) * d, so looking along ground dir (dx, dz)
// needs yaw = atan2(-dz, -dx).
const Y = 1.25; // standing on road level (ROAD_Y 1.14)
/** Worst-case gameplay views per district (v4 layout; the player stands where a visitor would). */
const GAME_VIEWS = [
  { id: 'spawn', note: '出生点默认镜头（第一眼）', player: [-42, 5.9, 35], cam: null },
  { id: 'camp', note: '营地：南侧望营火，远景', player: [-42, 5.9, 41], cam: { yaw: look(0, -1), pitch: .55, distance: 22 } },
  { id: 'camp-night', note: '营地夜晚（营火立方阴影每帧更新）', light: 'night', player: [-42, 5.9, 37], cam: { yaw: look(0, -1), pitch: .45, distance: 14 } },
  { id: 'avenue', note: '大道：J1 向北望六楼', player: [21, Y, 28], cam: { yaw: look(0, -1), pitch: .35, distance: 16 } },
  { id: 'ring-west', note: '环岛西段：向东望全岛', player: [-88, Y, 10], cam: { yaw: look(1, 0), pitch: .45, distance: 26 } },
  { id: 'north-hill', note: '北丘顶：向东南俯瞰城区与营地', player: [-30, 5.3, -76], cam: { yaw: look(.45, 1), pitch: .75, distance: 30 } },
  { id: 'south-beach', note: '南滩栏道：向北望营地山', player: [-26, 1.6, 84], cam: { yaw: look(0, -1), pitch: .3, distance: 18 } },
  { id: 'shore-sea', note: '南滩向外海：低仰角海岸近景（海的最坏视角）', player: [-26, 1.6, 84], cam: { yaw: look(0, 1), pitch: .12, distance: 9 } },
  { id: 'park', note: '园区：桥头望园区', player: [49, Y, -46], cam: { yaw: look(13, 18), pitch: .5, distance: 22 } },
  { id: 'town-overview', note: '城区俯瞰：J6 向东，最高仰角最远距离', player: [-4, Y, -12], cam: { yaw: look(1, 0), pitch: 1.2, distance: 30 } },
  { id: 'drive', note: '驾驶追尾镜头：轿跑沿大道向北', drive: { car: 'coupe', at: [26.2, Y, 2] } },
];
/** integration.mjs fixed QA shots (shot mode: whole-island shadow window, so shadow cost is a QA upper bound). */
const SHOT_VIEWS = ['camp', 'town', 'bridge', 'park', 'ridge', 'overview'].map(id => ({ id: `shot-${id}`, note: `QA 固定机位 ${id}（非游戏镜头）`, shot: id }));
const VIEWS = [...GAME_VIEWS, ...(process.env.BUDGET_SHOTS === '0' ? [] : SHOT_VIEWS)].filter(v => !only || only.has(v.id));

const aim = (page, target) => aimView(page, target, W, H);

const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const report = { tool: 'budget-peak', base, startedAt: new Date().toISOString(), viewport: [W, H], qualities, hideDiff: hide, fixtures: [], errors: [], runs: [] };
try {
  const { page, errors, readyMs, assetsLoaded } = await openWorld(browser, `${base}/world/?qa=1`, { width: W, height: H });
  Object.assign(report, { readyMs, assetsLoaded });
  const bot = new Bot(page);
  await page.waitForFunction(() => !!window.__worldDebug?.budget, undefined, { timeout: 30000 });
  report.limits = await page.evaluate(() => { const b = __worldDebug.budget; return { zones: b.zones, shadow: b.shadowBudget, total: b.totalBudget }; });
  report.layout = await page.evaluate(() => __worldDebug.layout()?.version ?? null);
  report.claimed = await page.evaluate(() => __worldDebug.claimedGreybox?.() ?? []);
  report.inventory = await page.evaluate(() => __worldDebug.budget.inventory());
  for (const quality of qualities) {
    await page.evaluate(q => __worldDebug.set({ quality: q }), quality);
    await page.waitForTimeout(1500);
    for (const view of VIEWS) {
      const row = { view: view.id, note: view.note, quality, light: view.light ?? 'dusk' };
      try {
        await page.evaluate(l => __worldDebug.set({ shot: null, light: l, card: null, seat: null }), row.light);
        if (view.shot) {
          await page.evaluate(v => __worldDebug.set({ shot: v }), view.shot);
          await page.waitForTimeout(1800);
        } else if (view.drive) {
          if ((await page.evaluate(() => __worldDebug.snapshot().activeVehicle))) await page.evaluate(() => __worldDebug.exit());
          const p = [view.drive.at[0] - 2.2, view.drive.at[1], view.drive.at[2]];
          report.fixtures.push({ view: view.id, to: p, reason: `stand next to ${view.drive.car}` });
          await bot.fixtureTeleport(p, `stand next to ${view.drive.car}`);
          await page.waitForTimeout(600);
          await bot.press('KeyE'); await page.waitForTimeout(900);
          let active = await page.evaluate(() => __worldDebug.snapshot().activeVehicle);
          if (!active) { report.fixtures.push({ view: view.id, enter: view.drive.car, reason: 'E did not pick the car; debug enter' }); await page.evaluate(id => __worldDebug.enter(id), view.drive.car); await page.waitForTimeout(600); }
          await bot.hold(['KeyW']); await page.waitForTimeout(2600); await bot.release();
          await page.waitForTimeout(400);
          row.camera = await cam(page);
          row.activeVehicle = await page.evaluate(() => __worldDebug.snapshot().activeVehicle);
        } else {
          if ((await page.evaluate(() => __worldDebug.snapshot().activeVehicle))) { await bot.press('KeyE'); await page.waitForTimeout(800); }
          report.fixtures.push({ view: view.id, to: view.player, reason: 'budget view' });
          await bot.fixtureTeleport(view.player, `budget view ${view.id}`);
          await page.waitForTimeout(900);
          row.camera = view.cam ? await aim(page, view.cam) : await cam(page);
          row.player = (await page.evaluate(() => __worldDebug.snapshot().player))?.map(v => +v.toFixed(2));
        }
        await page.waitForTimeout(500);
        row.frame = await page.evaluate(t => __worldDebug.budget.frame(t), +(process.env.BUDGET_TOP || 30));
        row.series = await page.evaluate(() => __worldDebug.budget.series(8));
        row.lights = await page.evaluate(() => __worldDebug.budget.lights());
        row.fire = await page.evaluate(() => __worldDebug.fireShadowInfo?.() ?? null);
        row.shadowInfo = await page.evaluate(() => { const t = __worldDebug.shadowInfo?.(); return t ? { groups: t.groups, chunks: t.chunks, passes: t.passes, groundTexel: t.cascades?.map(c => c.groundTexel_m) } : null; });
        if (hide) row.hideDiff = await page.evaluate(() => __worldDebug.budget.hideDiff());
        await page.screenshot({ path: path.join(out, `view-${view.id}-${quality}.jpg`), type: 'jpeg', quality: 72 });
        if (view.drive) { await bot.press('KeyE'); await page.waitForTimeout(800); }
      } catch (e) { row.error = String(e.stack || e); }
      report.runs.push(row);
      const f = row.frame;
      console.log(`${quality.padEnd(8)} ${view.id.padEnd(16)} ${f ? `${f.total.calls} calls / ${(f.total.triangles / 1000).toFixed(1)}k tris (shadow ${f.shadow.calls} / ${(f.shadow.triangles / 1000).toFixed(1)}k)` : row.error}`);
    }
  }
  await page.evaluate(() => __worldDebug.set({ shot: null, light: 'dusk', quality: 'high' }));
  report.errors.push(...errors);
} catch (e) { report.errors.push(String(e.stack || e)); }
await browser.close();

// ------------------------------------------------------------------------------------------ summary
const L = report.limits ?? { zones: {}, shadow: { calls: 85, triangles: 68000 }, total: { calls: 300, triangles: 500000 } };
const k = n => `${(n / 1000).toFixed(1)}k`;
const flag = (v, lim) => lim == null ? '' : v > lim ? ' ✖' : '';
const ok = report.runs.filter(r => r.frame);
const game = ok.filter(r => !r.view.startsWith('shot-'));
const peak = rows => rows.length ? { calls: Math.max(...rows.map(r => r.frame.total.calls)), triangles: Math.max(...rows.map(r => r.frame.total.triangles)),
  callsAt: rows.reduce((a, r) => r.frame.total.calls > a.frame.total.calls ? r : a).view, trianglesAt: rows.reduce((a, r) => r.frame.total.triangles > a.frame.total.triangles ? r : a).view } : null;
const zones = Object.keys(L.zones);
const zonePeak = {};
for (const z of zones) {
  const rows = game.map(r => ({ view: r.view, ...(r.frame.byZone[z]?.main ?? { calls: 0, triangles: 0 }) }));
  zonePeak[z] = { calls: Math.max(0, ...rows.map(r => r.calls)), triangles: Math.max(0, ...rows.map(r => r.triangles)),
    worstView: rows.sort((a, b) => b.triangles - a.triangles)[0]?.view ?? null, limit: L.zones[z] };
}
zonePeak.shadow = { calls: Math.max(0, ...game.map(r => r.frame.shadow.calls)), triangles: Math.max(0, ...game.map(r => r.frame.shadow.triangles)),
  worstView: [...game].sort((a, b) => b.frame.shadow.triangles - a.frame.shadow.triangles)[0]?.view ?? null, limit: L.shadow };
report.summary = { gameplayPeak: peak(game), shotPeak: peak(ok.filter(r => r.view.startsWith('shot-'))), zonePeak,
  pointLightsMax: Math.max(0, ...ok.map(r => r.lights?.point ?? 0)), infoMismatch: ok.filter(r => r.frame.total.calls !== r.frame.info.calls).map(r => r.view), errors: report.errors.length };
await writeFile(path.join(out, 'budget-report.json'), JSON.stringify(report, null, 1));

const md = [`# budget-peak ${report.startedAt}`, '', `base ${base} · viewport ${W}x${H} · layout ${report.layout} · claimed: ${(report.claimed || []).join(', ') || 'none'}`, '',
  `Hard line per frame: ${L.total.calls} calls / ${k(L.total.triangles)} triangles (main + all shadow passes).`, '',
  '| quality | view | light | calls | triangles | main calls | main tris | shadow calls | shadow tris | c0 / c1 / c2 / fire calls | gl.info check |', '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  ...ok.map(r => { const f = r.frame, m = f.byPass.main ?? { calls: 0, triangles: 0 };
    return `| ${r.quality} | ${r.view} | ${r.light} | ${f.total.calls}${flag(f.total.calls, L.total.calls)} | ${k(f.total.triangles)}${flag(f.total.triangles, L.total.triangles)} | ${m.calls} | ${k(m.triangles)} | ${f.shadow.calls}${flag(f.shadow.calls, L.shadow.calls)} | ${k(f.shadow.triangles)}${flag(f.shadow.triangles, L.shadow.triangles)} | ${['sun0', 'sun1', 'sun2', 'fire'].map(p => f.byPass[p]?.calls ?? 0).join(' / ')} | ${f.info.calls === f.total.calls ? 'ok' : `info ${f.info.calls}`} |`; }),
  '', '## Per-zone main pass (gameplay views; ✖ = over its limit)', '',
  `| view | ${zones.join(' | ')} | shadow |`, `| --- | ${zones.map(() => '---:').join(' | ')} | ---: |`,
  `| limit | ${zones.map(z => `${L.zones[z].calls} / ${k(L.zones[z].triangles)}`).join(' | ')} | ${L.shadow.calls} / ${k(L.shadow.triangles)} |`,
  ...game.map(r => `| ${r.view}${qualities.length > 1 ? ` (${r.quality})` : ''} | ${zones.map(z => { const c = r.frame.byZone[z]?.main ?? { calls: 0, triangles: 0 };
    return `${c.calls}${flag(c.calls, L.zones[z].calls || null)} / ${k(c.triangles)}${flag(c.triangles, L.zones[z].triangles || null)}`; }).join(' | ')} | ${r.frame.shadow.calls}${flag(r.frame.shadow.calls, L.shadow.calls)} / ${k(r.frame.shadow.triangles)}${flag(r.frame.shadow.triangles, L.shadow.triangles)} |`),
  '', '## Shadow submissions by caster zone (gameplay views)', '',
  `| view | ${zones.join(' | ')} |`, `| --- | ${zones.map(() => '---:').join(' | ')} |`,
  ...game.map(r => `| ${r.view} | ${zones.map(z => { const c = r.frame.byZone[z]?.shadow; return c ? `${c.calls} / ${k(c.triangles)}` : '-'; }).join(' | ')} |`),
  '', `Gameplay peak: ${JSON.stringify(report.summary.gameplayPeak)}`, `QA-shot peak: ${JSON.stringify(report.summary.shotPeak)}`,
  `Point lights (max visible): ${report.summary.pointLightsMax}`, `Errors: ${report.errors.length}`, ''];
if (hide) md.push('## Hide-diff (baseline - zone hidden, p50 of 4 frames)', '', ...game.map(r => `- ${r.view}: ${zones.map(z => { const d = r.hideDiff?.[z]; return d?.objects ? `${z} ${d.calls}/${k(d.triangles)}` : null; }).filter(Boolean).join(', ')}`), '');
await writeFile(path.join(out, 'budget-report.md'), md.join('\n'));
console.log(JSON.stringify(report.summary));
