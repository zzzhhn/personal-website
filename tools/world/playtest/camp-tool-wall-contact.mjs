import assert from 'node:assert/strict';
import { Bot, CHROME, loadPlaywright, comboFor } from './lib.mjs';

const [base = 'http://127.0.0.1:4343', mode = 'preferred'] = process.argv.slice(2);
assert.ok(['before', 'preferred', 'legacy', 'delayed', 'failed', 'ordinary'].includes(mode));
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const bot = new Bot(page);
const workshop = '**/camp-workshop.glb';
const pending = Promise.withResolvers();
const errors = [];
const lanes = ['hammer', 'wrench', 'screwdriver', 'handsaw', 'pliers'];
const frontRoute = [[-41.2, 33.2], [-38.8, 31], [-35.4, 30], [-34.6, 24.5], [-33.8, 23]];
const wait = (predicate, argument, timeout = 12_000) => page.waitForFunction(predicate, argument, { timeout });
let requests = 0;

async function follow(path, radius = .68) {
  const dot = page.locator('aside.world-location svg circle[r="2.6"]');
  const reached = [];
  for (const target of path) {
    const deadline = Date.now() + 17_000;
    while (true) {
      const [x, z] = await dot.evaluate(el => [el.cx.baseVal.value, el.cy.baseVal.value]);
      const distance = Math.hypot(x - target[0], z - target[1]);
      if (distance < radius) { reached.push([x, z]); break; }
      assert.ok(Date.now() < deadline, JSON.stringify({ target, x, z }));
      await bot.hold(comboFor(target[0] - x, target[1] - z).keys);
      await page.waitForTimeout(55);
      // A short final step prevents inertia carrying the guide past the narrow grip.
      if (radius < .3 && distance < .65) {
        await bot.release();
        await page.waitForTimeout(140);
      }
    }
    await bot.release();
  }
  return reached;
}
async function selected(id) {
  await wait(id => window.__worldDebug.state().nearbyInteract?.choices.some(row => row.id === id), id, 9_000);
  for (let i = 0; i < 7; i++) {
    if (await page.evaluate(id => window.__worldDebug.state().nearbyInteract.id === id, id)) return;
    await bot.press('KeyQ'); await page.waitForTimeout(150);
  }
  assert.fail(`Could not select ${id}`);
}

async function acquire(id) {
  try {
    await wait(id => {
      const current = window.__worldCampPropPlay();
      return current.id === id && current.state?.phase === 'held' && current.state.age > .45;
    }, id);
  } catch (error) {
    const context = await page.evaluate(() => {
      const state = window.__worldDebug.state();
      return { activity: window.__worldCampPropPlay(), nearby: state.nearbyInteract, notice: state.toast };
    });
    throw new Error(`Failed to take ${id}: ${JSON.stringify(context)}`, { cause: error });
  }
}

async function bumpWall(from, to) {
  await follow([from], .21);
  await bot.hold(comboFor(to[0] - from[0], to[1] - from[1]).keys);
  try {
    await wait(() => window.__worldDebug.contacts().some(contact => contact.other.assetId === 'C11'), undefined, 7_000);
    return await page.evaluate(() => window.__worldDebug.contacts().filter(contact => contact.other.assetId === 'C11'));
  } finally { await bot.release(); }
}

async function survey() {
  return page.evaluate(async before => {
    const d = window.__worldDebug;
    const inspected = await d.reviewCollisionSources(before ? 'world-camp-content' : 'camp-C11-contact');
    const count = mesh => {
      const g = inspected.geometries[mesh.geometry];
      return (g.indices || g.vertices) / 3;
    };
    return {
      player: d.snapshot().player,
      activity: window.__worldCampPropPlay(),
      visibleTools: inspected.meshes.filter(mesh => mesh.path.includes('/camp-carried-tool-')).map(mesh => ({
        path: mesh.path, matrix: mesh.matrixWorld, triangles: count(mesh), policy: mesh.declaration?.policy ?? null,
      })),
      parts: inspected.colliders.filter(collider => collider.name?.includes('C11')).map(collider => ({
        id: collider.name, enabled: collider.enabled, triangles: collider.shape.indices / 3, buffer: collider.shape.positionBufferSha256,
      })).sort((a, b) => a.id.localeCompare(b.id)),
      owners: inspected.meshes.filter(mesh => mesh.path.includes('C11_tools') && mesh.declaration?.policy === 'solid')
        .flatMap(mesh => mesh.declaration.ranges.map(range => range.surfaceId)).filter((id, index, all) => all.indexOf(id) === index).sort(),
    };
  }, mode === 'before');
}

try {
  await page.routeWebSocket('**/*', ws => ws.close());
  page.on('pageerror', error => errors.push(error.message));
  await page.route(workshop, async route => {
    requests++;
    if (mode === 'failed') return route.abort();
    if (mode === 'delayed') await pending.promise;
    await route.continue();
  });
  const url = new URL('/world/', base);
  if (mode !== 'ordinary') url.searchParams.set('qa', '1');
  if (mode === 'legacy') url.searchParams.set('campBatch', 'legacy');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.locator('button.world-camp-return:enabled').waitFor({ timeout: 60_000 });
  if (mode === 'ordinary') {
    assert.equal(await page.evaluate(() => Boolean(window.__worldDebug)), false);
    await follow(frontRoute);
    await follow([[-31.93, 19.93]], .16);
    const active = page.locator('.world-prompt li.is-active');
    for (let i = 0; i < 7; i++) {
      if (await active.getByText('Take screwdriver', { exact: true }).count()) break;
      await bot.press('KeyQ'); await page.waitForTimeout(170);
    }
    await active.getByText('Take screwdriver', { exact: true }).waitFor({ timeout: 7_000 });
    await bot.press('KeyE');
    await active.getByText('Return screwdriver', { exact: true }).waitFor({ timeout: 8_000 });
    await bot.press('KeyE');
    await page.locator('.world-prompt').getByText('Take screwdriver', { exact: true }).waitFor({ timeout: 8_000 });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ mode, noQA: true, keys: bot.events, teleports: bot.fixtureCalls }));
  } else {
    await wait(() => window.__worldDebug?.snapshot().grounded && window.__worldCampContent?.hard().some(row => row.id === 'C11'), undefined, 60_000);
    const at = await follow(frontRoute);
    const layout = await page.evaluate(() => {
      const { position, yaw } = window.__worldCampContent.placements().C11;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const local = (x, y, z) => [position[0] + c * x + s * z, position[1] + y, position[2] - s * x + c * z];
      const stands = window.__worldInteract.list().filter(row => row.id.startsWith('camp-prop-tool-'))
        .sort((a, b) => a.id.localeCompare(b.id)).map(row => [row.position[0] + c * .55, row.position[2] - s * .55]);
      const d = window.__worldDebug;
      // Sweep the standing capsule above the paving skin to isolate both wall faces.
      const sides = [d.castPlayer(local(1.25, 1.03, 0), local(0, 1.03, 0)), d.castPlayer(local(-1.25, 1.03, 0), local(0, 1.03, 0))];
      const walk = (x, z) => { const [px, , pz] = local(x, 0, z); return [px, pz]; };
      return { stands, sides, front: walk(1.02, 0), back: walk(-1.02, 0), centre: walk(0, 0),
        around: [walk(1.02, 1.72), walk(-1.02, 1.72)] };
    });
    assert.equal(layout.stands.length, 5);
    assert.ok(layout.sides.every(probe => probe.hit && probe.other.assetId === 'C11'), JSON.stringify(layout.sides));
    const trials = [];
    for (const lane of mode === 'before' ? [2] : lanes.keys()) {
      const id = `camp-prop-tool-${lane}`;
      await follow([layout.stands[lane]], .16);
      await selected(id);
      const rest = await survey();
      await selected(id);
      await bot.press('KeyE');
      await acquire(id);
      const held = await survey();
      await selected(id);
      await bot.press('KeyE');
      await wait(() => !window.__worldCampPropPlay().id && !window.__worldDebug.sceneObjects().some(name => /^camp-carried-tool-\d$/.test(name)));
      const returned = await survey();
      console.log(JSON.stringify({ mode, lane, rest, held, returned }));
      assert.ok(held.visibleTools.length > 0 && held.visibleTools.every(tool => tool.path.endsWith(`camp-carried-tool-${lane}`) || tool.path.includes(`camp-carried-tool-${lane}[`)));
      assert.equal(returned.visibleTools.length, 0);
      assert.deepEqual(returned.parts, rest.parts);
      if (mode === 'before') {
        assert.equal(rest.parts.length, 1);
        assert.deepEqual(held.parts, rest.parts);
      } else {
        const parked = `camp-content-collider-C11-tool-${lane}`;
        assert.ok(held.visibleTools.every(tool => tool.policy === 'none'));
        const localGrip = [-.006, [-.235, -.16, -.092, -.058, -.225][lane], [.742, .371, 0, -.371, -.742][lane]];
        const palm = held.activity.hand.palm;
        assert.ok(palm && held.visibleTools.every(({ matrix }) => Math.hypot(...palm.map((value, axis) =>
          value - matrix[12 + axis] - localGrip.reduce((sum, point, component) => sum + point * matrix[axis + component * 4], 0))) < .04));
        assert.equal(rest.parts.length, 6);
        assert.ok(rest.parts.every(part => part.enabled));
        assert.deepEqual(held.parts.filter(part => !part.enabled).map(part => part.id), [parked]);
        assert.deepEqual(held.owners, rest.owners.filter(owner => owner !== parked));
        assert.equal(held.visibleTools.reduce((sum, tool) => sum + tool.triangles, 0), rest.parts.find(part => part.id === parked).triangles);
        assert.deepEqual(held.parts.filter(part => part.id !== parked), rest.parts.filter(part => part.id !== parked));
      }
      trials.push(lanes[lane]);
    }
    let contacts;
    if (mode === 'preferred') {
      const front = await bumpWall(layout.front, layout.centre);
      await follow([layout.front, ...layout.around], .22);
      const back = await bumpWall(layout.back, layout.centre);
      assert.ok(back.some(contact => contact.other.name === 'camp-collider-C11-workshop-0-body-0'));
      contacts = { front, back };
    } else if (mode === 'delayed') {
      const fallback = await survey();
      const id = 'camp-prop-tool-4';
      await selected(id);
      await bot.press('KeyE'); await acquire(id);
      pending.resolve();
      await wait(() => window.__worldDebug.sceneObjects().includes('camp-workshop-C11_body') && !window.__worldCampPropPlay().id);
      const loaded = await survey();
      assert.equal(loaded.parts.length, 6);
      assert.ok(loaded.parts.every((part, index) => part.enabled && part.buffer !== fallback.parts[index].buffer));
      assert.deepEqual(loaded.visibleTools, []);
      await selected(id);
      await bot.press('KeyE'); await acquire(id);
      await selected(id);
      await bot.press('KeyE');
      await wait(() => !window.__worldCampPropPlay().id);
      console.log(JSON.stringify({ mode, handoff: loaded }));
    }
    if (mode !== 'before') {
      const attached = await page.evaluate(() => window.__worldDebug.reviewCollisionSources('world-camp-content'));
      assert.ok(attached.meshes.every(mesh => mesh.declaration?.policy || mesh.declaration?.ranges?.length), JSON.stringify(attached.meshes.filter(mesh => !mesh.declaration).map(mesh => mesh.path)));
      assert.ok(new Set(attached.colliders.filter(collider => collider.enabled).map(collider => collider.name)).size === attached.colliders.filter(collider => collider.enabled).length);
    }
    if (mode === 'failed') assert.ok(errors.every(error => /camp-workshop\.glb.*Failed to fetch/.test(error)), JSON.stringify(errors));
    else assert.deepEqual(errors, []);
    console.log(JSON.stringify({ mode, at, trials, sides: layout.sides, contacts, requests, errors, teleports: bot.fixtureCalls }));
  }
  assert.deepEqual(bot.fixtureCalls, []);
} finally {
  pending.resolve();
  await browser.close();
}
