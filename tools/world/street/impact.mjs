/** Street props impact bot: a person (real WASD) and the three cars (real W / Space) hit street props.
 * QA entry (?qa=1). Start positions are logged fixture teleports; all motion is keyboard input.
 * Records per case: first contact, max prop rise / speed, actor rise (car lift), blocked (stuck), and whether
 * the actor passed through the prop's footprint (penetration). Cases: STREET_CASES=json array or default set.
 * Targets are looked up by prop id (knockables) or by world point (fixed props, later groups).
 * Usage: tools/bot-run.sh street 4334 tools/world/street/impact.mjs <outdir> */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { Bot, CHROME, loadPlaywright, openWorld, ensureDir } from '../playtest/lib.mjs';
const out = await ensureDir(process.env.WORLD_PLAYTEST_DIR || '/tmp/street-impact');
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4334';
const H = { offroad: 1.176, coupe: 1.054, van: 1.452 };
/** actor: person | offroad | coupe | van; target: knockable id or {p:[x,y,z], r} fixed; from: approach start
 * (xz, 9-14 m away on a clear line), speed target m/s for cars. */
const DEFAULT = [
  { name: 'person-lamp', actor: 'person', target: 'lamp-0' },
  { name: 'person-bin', actor: 'person', target: 'bin-1' },
  { name: 'person-stop', actor: 'person', target: 'stop-3' },
  { name: 'offroad-lamp', actor: 'offroad', target: 'lamp-12', speed: 7 },
  { name: 'coupe-signal', actor: 'coupe', target: 'signal-2', speed: 7 },
  { name: 'van-bin', actor: 'van', target: 'bin-1', speed: 6 },
  { name: 'coupe-delineator', actor: 'coupe', target: 'delineator-1', speed: 8 },
  { name: 'van-direction', actor: 'van', target: 'direction-3', speed: 6 },
];
const SETS = {
  g4: [
    { name: 'person-seawall', actor: 'person', target: { p: [31, 1.15, 5] }, from: [25.5, 5] },
    { name: 'coupe-seawall', actor: 'coupe', target: { p: [31, 1.15, -12] }, from: [24.5, -3], speed: 5 },
    { name: 'offroad-guard', actor: 'offroad', target: 'rail-guard-2-1', speed: 7 },
    { name: 'van-guard', actor: 'van', target: 'rail-guard-4-1', speed: 6 },
    { name: 'person-guard', actor: 'person', target: 'rail-guard-1-1' },
    { name: 'offroad-hillbeam', actor: 'offroad', target: 'rail-beam-12', speed: 5 },
    { name: 'person-hillbeam', actor: 'person', target: 'rail-beam-7' },
    { name: 'coupe-parapet', actor: 'coupe', target: { p: [36, 1.14, -38.2] }, from: [29.5, -41.6], speed: 5 },
  ],
  g23: [
    { name: 'person-roadblock', actor: 'person', target: 'roadblock-2' },
    { name: 'coupe-roadblock', actor: 'coupe', target: 'roadblock-2', speed: 6 },
    { name: 'van-roadblock', actor: 'van', target: 'roadblock-0', from: [9, 30.3], speed: 6 },
    { name: 'person-bench', actor: 'person', target: { p: [12.4, 1.15, 9.9] }, from: [21, 9.9] },
    { name: 'offroad-bench', actor: 'offroad', target: { p: [30.1, 1.15, 16] }, from: [23.5, 12], speed: 5 },
    { name: 'person-bollard', actor: 'person', target: { p: [14.8, 1.15, 6.3] }, from: [21, 6.3] },
    { name: 'coupe-bollard', actor: 'coupe', target: { p: [14.8, 1.15, -3.7] }, from: [19.5, -14], speed: 5 },
    { name: 'van-shelter', actor: 'van', target: { p: [29.6, 1.15, -20] }, from: [23.5, -9], speed: 5 },
  ],
};
const cases = process.env.STREET_SET ? SETS[process.env.STREET_SET] : process.env.STREET_CASES ? JSON.parse(process.env.STREET_CASES) : DEFAULT;
const only = process.env.STREET_ONLY ? process.env.STREET_ONLY.split(',') : null;
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const report = { base, cases: [], errors: [] };
const headingYaw = (dx, dz) => Math.atan2(-dz, dx); // vehicle yaw so local +X points along (dx, dz)
for (const c of cases) {
  if (only && !only.includes(c.name)) continue;
  const { page, errors, context } = await openWorld(browser, base + '/world/?qa=1', { width: 1280, height: 720 });
  const bot = new Bot(page);
  try {
    await page.waitForFunction(() => window.__worldDistricts?.knockables?.().length > 0 || window.__worldStreet, undefined, { timeout: 30000 });
    await page.waitForTimeout(1200);
    const tgt = typeof c.target === 'string'
      ? await page.evaluate(id => window.__worldDistricts.knockables().find(k => k.id === id), c.target)
      : { id: 'fixed', home: c.target.p, kind: 'fixed' };
    if (!tgt) throw new Error('target not found ' + c.target);
    const home = tgt.home;
    // Approach from the road side (or the case's from point): 11 m back along the given direction.
    const dir = c.dir ?? await page.evaluate(h => { const q = window.__worldDistricts.layout?.() ?? null; return null; }, home);
    let from = c.from;
    if (!from) {
      // Start in the nearest drivable lane centre, 11 m back along the road; the actor heads straight at the
      // prop, so it crosses the curb at a shallow angle like a real run-off.
      const lane = await page.evaluate(h => window.__worldDistricts?.recoveryProbe?.(h[0], h[2])?.road ?? null, home);
      const rx = lane ? lane[0] - home[0] : 1, rz = lane ? lane[2] - home[2] : 0, rl = Math.hypot(rx, rz) || 1, sg = c.side ?? 1;
      from = [home[0] + rx + (-rz / rl) * 11 * sg, home[2] + rz + (rx / rl) * 11 * sg];
    }
    const dx = home[0] - from[0], dz = home[2] - from[1], L = Math.hypot(dx, dz);
    const row = { name: c.name, actor: c.actor, target: tgt.id, kind: tgt.kind, home, from, samples: [], fixtures: null };
    if (c.actor === 'person') {
      await bot.fixtureTeleport([from[0], home[1] + 1.2, from[1]], `${c.name} start`);
      await page.waitForTimeout(500);
    } else {
      await page.evaluate(({ id, p, yaw }) => window.__worldDebug.teleportVehicle(id, p, yaw), { id: c.actor, p: [from[0], home[1] + H[c.actor] + .05, from[1]], yaw: headingYaw(dx, dz) });
      await bot.fixtureTeleport([from[0] - dx / L * 0 + dz / L * 2.2, home[1] + 1.2, from[1] - dz / L * 0 - dx / L * 2.2], `${c.name} driver start next to car`);
      await page.waitForTimeout(600); await bot.press('KeyE'); await page.waitForTimeout(300);
    }
    const read = () => page.evaluate(({ id, actor }) => {
      const s = window.__worldDebug.snapshot(), car = s.vehicles.find(v => v.id === actor), k = id === 'fixed' ? null : window.__worldDistricts.knockables().find(q => q.id === id);
      return { t: performance.now(), active: s.activeVehicle, actor: actor === 'person' ? s.player : car.position, v: actor === 'person' ? s.playerVelocity : car.velocity,
        prop: k ? { p: k.position, sleeping: k.sleeping, knocked: k.knocked, phase: k.phase } : null, contacts: window.__worldDebug.contacts().map(x => ({ kind: x.other.kind, name: x.other.name })) };
    }, { id: tgt.id, actor: c.actor });
    const r0 = await read(); row.initial = r0;
    let first = null, closest = Infinity; const t0 = Date.now();
    const dur = c.actor === 'person' ? 6000 : 9000;
    while (Date.now() - t0 < dur) {
      const r = await read(); row.samples.push(r);
      const hd = Math.hypot(r.actor[0] - home[0], r.actor[2] - home[2]); closest = Math.min(closest, hd);
      // Only the street asset itself counts as the impact (curb walls are 'solid' too).
      const touching = r.contacts.some(k => k.kind === 'obstacle' || String(k.name ?? '').startsWith('street-'));
      if (first === null && (touching || (r.prop && !r.prop.sleeping))) first = { t: r.t, actorSpeed: Math.hypot(r.v?.[0] ?? 0, r.v?.[2] ?? 0) };
      if (c.actor === 'person') {
        // Walk / run straight at the prop (camera-relative combo toward it), keep pushing 2.5 s after contact.
        const p = r.actor, ddx = home[0] - p[0], ddz = home[2] - p[2];
        const { comboFor } = await import('../playtest/lib.mjs');
        if (first && r.t - first.t > 2500) await bot.release(); else await bot.hold([...comboFor(ddx, ddz).keys, 'ShiftLeft']);
      } else {
        const sp = Math.hypot(r.v[0], r.v[2]);
        if (first && r.t - first.t > 400) await bot.hold(['Space']); else await bot.hold(sp < (c.speed ?? 7) - .2 ? ['KeyW'] : sp > (c.speed ?? 7) + .3 ? ['Space'] : []);
        if (first && r.t - first.t > 3500) break;
      }
      await page.waitForTimeout(30);
    }
    await bot.release();
    await page.waitForTimeout(400);
    const last = await read();
    const pre = row.samples.filter(s => first && s.t <= first.t && s.t >= first.t - 300);
    row.firstContact = first;
    row.approachSpeed = pre.length ? Math.max(...pre.map(s => Math.hypot(s.v?.[0] ?? 0, s.v?.[2] ?? 0))) : null;
    const contactY = first ? row.samples.find(s => s.t >= first.t)?.actor[1] : r0.actor[1];
    row.maxActorRise = first ? Math.max(0, ...row.samples.filter(s => s.t >= first.t).map(s => s.actor[1] - contactY)) : 0;
    row.maxPropRise = row.samples.some(s => s.prop) ? Math.max(0, ...row.samples.filter(s => s.prop).map(s => s.prop.p[1] - home[1])) : null;
    // Max prop speed estimate between samples (m/s): launch check.
    let vmax = 0; for (let i = 1; i < row.samples.length; i++) { const a = row.samples[i - 1], b = row.samples[i]; if (!a.prop || !b.prop) continue; const dt = (b.t - a.t) / 1000; if (dt > 0) vmax = Math.max(vmax, Math.hypot(b.prop.p[0] - a.prop.p[0], b.prop.p[1] - a.prop.p[1], b.prop.p[2] - a.prop.p[2]) / dt); }
    row.maxPropSpeed = +vmax.toFixed(2);
    row.closestActorToHome = +closest.toFixed(3);
    row.final = last;
    row.propDisplaced = last.prop ? Math.hypot(last.prop.p[0] - home[0], last.prop.p[2] - home[2]) : null;
    row.propKnocked = last.prop?.knocked ?? null;
    row.fixtures = bot.fixtureCalls;
    row.errors = errors.slice();
    await page.screenshot({ path: path.join(out, c.name + '.png') });
    row.samples = row.samples.filter((_, i) => i % 3 === 0);
    report.cases.push(row);
    console.log(JSON.stringify({ name: row.name, contact: !!first, approach: row.approachSpeed?.toFixed(2), closest: row.closestActorToHome, actorRise: row.maxActorRise.toFixed(3), propRise: row.maxPropRise?.toFixed(2), propV: row.maxPropSpeed, displaced: row.propDisplaced?.toFixed(2), knocked: row.propKnocked, active: last.active, errs: errors.length }));
  } catch (e) { report.errors.push(c.name + ': ' + (e.stack || e)); console.error(c.name, e.message); }
  await context.close();
}
await writeFile(path.join(out, 'impact.json'), JSON.stringify(report, null, 1));
await browser.close();
