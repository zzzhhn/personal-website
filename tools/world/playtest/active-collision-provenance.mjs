/** Public placements and keyboard movement. QA only reads the running scene. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Bot, CHROME, comboFor, loadPlaywright } from './lib.mjs';

const [origin = 'http://127.0.0.1:4363', ...selected] = process.argv.slice(2);
const routes = {
  camp: { spawn: [-42,35], path: [[-40,38]], roots: ['world-camp-content','world-camp-slice','camp-C14-contact'] },
  town: { start: 'town', spawn: [14,-2.5], path: [[18,-3]], roots: ['world-town-assets','world-paving-v4'] },
  exchange: { start: 'exchange', spawn: [60,-52.6], path: [[60,-54.5],[60,-56]], roots: ['alpha-agent-exchange'] },
  club: { start: 'club', spawn: [30,39], path: [[30,42.7],[33,44.3]], roots: ['djc-beach-club','djc-north-bar-contact','djc-pool-lantern-contact'] },
  mine: { start: 'brain', spawn: [-84,-54.5], path: [[-84,-58]], roots: ['alpha-mine-attraction','alpha-mine-entry-tool-rack'] },
  ibd: { start: 'ibd', spawn: [-88,-143], path: [[-88,-147],[-88,-151]], roots: ['world-ibd-yard','ibd-hoist-contact','ibd-dispatch-shutter'] },
  coaster: { start: 'coaster', spawn: [50,-125], path: [[52,-127.2],[52,-132.9]], roots: ['coaster-gate-leaves','coaster-station-architecture-contact','coaster-site-contact'] },
  summit: { start: 'alpha-summit', spawn: [237,234], path: [[236.5,229.94]], roots: ['alpha-terrain-patch','alpha-shelf-lanterns'] },
};
const names = selected.length ? selected : Object.keys(routes);
assert.ok(names.every(name => Object.hasOwn(routes, name)), 'unknown route');
const mac = process.platform === 'darwin';
const browser = await loadPlaywright().chromium.launch({ executablePath: process.env.WORLD_CHROME || (mac ? CHROME : undefined),
  headless: true, ...(mac ? { args: ['--use-angle=metal'] } : {}) });
const viewport = { width: 960, height: 540 };
const emit = value => console.log(JSON.stringify(value));
const failed = [];
let htmlSha;
try {
  const context = await browser.newContext({ viewport });
  for (const name of names) {
    const { start, spawn, path, roots } = routes[name];
    const page = await context.newPage(), bot = new Bot(page);
    const pending = new Set(), completedAssets = new Set(), traces = [], errors = [], analytics = [];
    let lastAsset = 0, stage = 'public arrival';
    const url = new URL('/world/', origin);
    if (start) url.searchParams.set('start', start);
    url.searchParams.set('qa', '1');
    const asset = input => {
      const u = new URL(input);
      const isWorldAsset = u.origin === url.origin && /^\/(?:_astro|assets\/world|world\/alpha-mine)\//.test(u.pathname);
      // Media preload can keep a byte-range request open without affecting the mounted scene.
      return isWorldAsset && !/\.(?:mp3|ogg|wav|m4a|mp4|webm)$/i.test(u.pathname) ? u.pathname : null;
    };
    page.on('request', request => { if (asset(request.url())) pending.add(request); });
    page.on('requestfinished', request => {
      if (pending.delete(request)) { completedAssets.add(asset(request.url())); lastAsset = Date.now(); }
    });
    page.on('requestfailed', request => {
      if (pending.delete(request)) errors.push(request.failure() + ' ' + request.url());
    });
    page.on('response', response => {
      if (asset(response.url()) && response.status() >= 400) errors.push(response.status() + ' ' + response.url());
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      if (message.location().url === new URL('/api/events', url).href) analytics.push(message.text());
      else errors.push(message.text());
    });
    const wait = (predicate, arg, timeout = 30000) => page.waitForFunction(predicate, arg, { timeout, polling: 125 }).then(handle => handle.dispose());
    const live = () => page.evaluate(() => {
      const d = window.__worldDebug, s = d.snapshot(), w = d.state();
      return { position: s.player, grounded: s.grounded, step: s.physicsStep, yaw: d.camera()?.yaw,
        shot: w.shot, paused: w.paused, zone: w.zone, activeVehicle: s.activeVehicle, input: d.inputState() };
    });
    async function walk([x,z]) {
      const started = await live();
      let best = Infinity, advancedAt = started.step;
      try {
        for (let i = 0; i < 95; i++) {
          const a = await live(), dx = x - a.position[0], dz = z - a.position[2], remaining = Math.hypot(dx, dz);
          if (remaining < .55) return;
          if (remaining < best - .04) { best = remaining; advancedAt = a.step; }
          if (a.step - advancedAt > 126) assert.fail(JSON.stringify({ target: [x,z], remaining, actor: a }));
          // Adjust the keyboard headings for the public entry's follow-camera yaw.
          const delta = Math.atan2(.8, .6) - (a.yaw ?? Math.atan2(.8, .6));
          const keys = comboFor(dx * Math.cos(delta) - dz * Math.sin(delta), dx * Math.sin(delta) + dz * Math.cos(delta)).keys;
          await bot.hold(keys);
          traces.push({ step: a.step, position: a.position, grounded: a.grounded, keys });
          await wait(step => window.__worldDebug.snapshot().physicsStep >= step, a.step + 7);
        }
        assert.fail('walk did not reach ' + [x,z]);
      } finally { await bot.release(); }
    }
    async function settle() {
      const until = Date.now() + 55000;
      let latest, previous, consecutive = 0;
      while (Date.now() < until) {
        latest = await page.evaluate(() => {
          const d = window.__worldDebug, a = d.snapshot();
          return { inventory: d.reviewCollisionInventory(true), grounded: a.grounded, step: a.physicsStep,
            frame: d.renderLoop().frame, guideLoaded: d.actor().loaded };
        });
        const { inventory } = latest;
        const key = JSON.stringify([inventory.mounted, inventory.registrations, inventory.mountedGapsByRegion, inventory.errors]);
        const hydrated = latest.guideLoaded && latest.grounded && roots.every(root => (inventory.registrations[root] ?? 0) > 0);
        if (hydrated && !pending.size && Date.now() - lastAsset > 450 && key === previous) consecutive++;
        else consecutive = 0;
        if (consecutive >= 2) return latest;
        previous = key;
        await page.waitForTimeout(300);
      }
      return { ...latest, timedOut: true };
    }
    let arrival, settled;
    try {
      const response = await page.goto(url.href, { waitUntil: 'domcontentloaded' });
      assert.ok(response?.ok(), 'world entry did not return success');
      const build = createHash('sha256').update(await response.body()).digest('hex');
      htmlSha ??= build;
      assert.equal(build, htmlSha, 'preview build changed mid-run');
      await page.locator('button.world-camp-return:enabled').waitFor({ timeout: 75000 });
      await wait(() => window.__worldDebug?.state().ready && window.__worldDebug.snapshot().grounded, undefined, 35000);
      arrival = await live();
      assert.ok(Math.hypot(arrival.position[0] - spawn[0], arrival.position[2] - spawn[1]) < .55, 'unexpected public spawn');
      assert.ok(!arrival.shot && !arrival.paused && arrival.activeVehicle === null);
      stage = 'keyboard walk';
      for (const point of path) await walk(point);
      stage = 'asset and collider stability';
      settled = await settle();
      const end = await live(), { inventory } = settled;
      const distance = Math.hypot(end.position[0] - arrival.position[0], end.position[2] - arrival.position[2]);
      const issue = settled.timedOut || !end.grounded || !!end.shot || end.paused || distance < 1.25 || !traces.length || errors.length
        || inventory.errors.length || inventory.mounted.invalid || inventory.submitted.invalid || inventory.mounted.unclassified
        || inventory.submitted.unclassified || !inventory.submitted.meshes;
      emit({ route: name, url: url.href, ok: !issue, build, viewport, arrival, end, distance, traces,
        roots, settled, completedAssets: [...completedAssets].sort(), pending: [...pending].map(request => asset(request.url())), errors, analytics });
      if (issue) failed.push(name);
    } catch (error) {
      failed.push(name);
      emit({ route: name, url: url.href, ok: false, stage, failure: error.message, arrival, traces, settled,
        end: await live().catch(() => null), errors, analytics });
    } finally {
      await bot.release();
      await page.close();
    }
  }
} finally { await browser.close(); }
assert.deepEqual(failed, [], 'active collision provenance for the audited venues');
