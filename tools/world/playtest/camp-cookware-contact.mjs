import assert from 'node:assert/strict';
import { Bot, CHROME, comboFor, loadPlaywright } from './lib.mjs';

const [base = 'http://127.0.0.1:4343', mode = 'candidate'] = process.argv.slice(2);
assert.ok(['before', 'candidate', 'legacy', 'delayed', 'failed', 'ordinary'].includes(mode));
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const bot = new Bot(page);
const path = [[-42, 39], [-37, 39], [-34, 39.8], [-32.03, 39.97]];
const release = Promise.withResolvers();
const errors = [];
let packRequests = 0;

async function walkOrdinary() {
  const dot = page.locator('aside.world-location svg circle[r="2.6"]');
  for (const target of path) {
    const deadline = Date.now() + 14_000;
    while (true) {
      const [x, z] = await dot.evaluate(el => [el.cx.baseVal.value, el.cy.baseVal.value]);
      if (Math.hypot(target[0] - x, target[1] - z) < .46) break;
      assert.ok(Date.now() < deadline, JSON.stringify({ target, x, z }));
      await bot.hold(comboFor(target[0] - x, target[1] - z).keys);
      await page.waitForTimeout(75);
    }
    await bot.release();
  }
}

async function sample() {
  return page.evaluate(async before => {
    const d = window.__worldDebug;
    const c = window.__worldCampContent;
    const [x, , z] = c.placements().C14.position;
    const [wok, collision] = await Promise.all([
      d.reviewCollisionSources('camp-content-C14-wok'),
      d.reviewCollisionSources(before ? 'camp-content-body-C14' : 'camp-C14-contact'),
    ]);
    const visual = wok.meshes.find(mesh => mesh.path.includes('C14_wok')) ?? wok.meshes[0];
    return {
      step: d.snapshot().physicsStep, card: d.state().card, feedback: c.feedback(), overall: c.hard().find(row => row.id === 'C14'),
      visual: visual ? { path: visual.path, y: visual.matrixWorld[13], basisX: visual.matrixWorld.slice(0, 3) } : null,
      probe: d.probeAsset('C14', [x, 6.7, z], [0, -1, 0], .006),
      surfaces: [...new Set(collision.meshes.map(mesh => mesh.declaration?.surface).filter(Boolean))].sort(),
      colliders: collision.colliders.map(collider => ({
        id: collider.name, type: collider.bodyType, role: collider.shape.type, translation: collider.translation, rotation: collider.rotation,
        indices: collider.shape.indices, sha: collider.shape.positionBufferSha256,
      })),
    };
  }, mode === 'before');
}

try {
  page.on('pageerror', error => errors.push(error.message));
  await page.routeWebSocket('**/*', ws => ws.close());
  await page.route('**/camp-facilities-v1.glb', async route => {
    packRequests++;
    if (mode === 'failed') return route.abort();
    if (mode === 'delayed') await release.promise;
    await route.continue();
  });
  const url = new URL('/world/', base);
  if (mode !== 'ordinary') url.searchParams.set('qa', '1');
  if (mode === 'legacy') url.searchParams.set('facilityCraft', 'legacy');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.locator('button.world-camp-return:enabled').waitFor({ timeout: 60_000 });

  if (mode === 'ordinary') {
    assert.equal(await page.evaluate(() => Boolean(window.__worldDebug)), false);
    await walkOrdinary();
    await page.locator('.world-prompt li.is-active').getByText('Cooking', { exact: true }).waitFor({ timeout: 8_000 });
    await bot.press('e');
    await page.getByRole('dialog').getByRole('heading', { name: 'In my free time', exact: true }).waitFor({ timeout: 10_000 });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ mode, qa: false, teleport: bot.fixtureCalls, keys: bot.events }));
  } else {
    await page.waitForFunction(({ expectCandidate, before }) => {
      const d = window.__worldDebug, c = window.__worldCampContent;
      if (!d?.snapshot().grounded || !c?.hard().some(row => row.id === 'C14')) return false;
      return before || d.sceneObjects().some(name => name === (expectCandidate ? 'camp-facility-C14-C14_wok' : 'camp-C14-legacy-wok'));
    }, { expectCandidate: mode === 'candidate', before: mode === 'before' }, { timeout: 45_000 });
    const walk = await bot.walk(path, { arrive: .46, timeout: 16, maxRecoveries: 1 });
    assert.ok(walk.legs.length === path.length && walk.legs.every(leg => leg.reached), JSON.stringify(walk.legs));
    await page.waitForFunction(() => window.__worldDebug.state().nearbyInteract?.choices?.some(row => row.id === 'camp-about-wok'), undefined, { timeout: 6_000 });
    const rest = await sample();
    await bot.press('e');
    const motion = [];
    for (let i = 0; i < 7; i++) {
      await page.waitForTimeout(45);
      motion.push(await sample());
    }
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1850)));
    const settled = await sample();
    console.log(JSON.stringify({ mode, start: walk.legs[0].start, stand: walk.legs.at(-1).end, packRequests, rest, motion, settled, teleport: bot.fixtureCalls, errors }));
    assert.ok(motion.some(row => row.card?.kind === 'about' && row.card?.id === 'interests' && row.card?.page === 2));
    assert.ok(motion.some(row => row.feedback.includes('wok') && row.visual.y - rest.visual.y > .08));
    assert.ok(Math.abs(settled.visual.y - rest.visual.y) < .001);
    if (mode === 'before') {
      assert.equal(rest.colliders.length, 1);
      assert.ok(motion.every(row => row.colliders[0]?.sha === rest.colliders[0].sha));
      assert.deepEqual(rest.overall, settled.overall);
    } else {
      const stove = row => row.colliders.find(c => c.id === 'camp-content-collider-C14-stove');
      const wok = row => row.colliders.find(c => c.id === 'camp-content-collider-C14-wok');
      assert.equal(rest.colliders.length, 2);
      assert.deepEqual(rest.surfaces, [stove(rest).id, wok(rest).id]);
      assert.equal(stove(rest).type, 1);
      assert.equal(wok(rest).type, 2);
      assert.ok(motion.every(row => row.colliders.length === 2 && JSON.stringify(stove(row)) === JSON.stringify(stove(rest))));
      for (const row of [rest, ...motion, settled]) {
        assert.ok(Math.abs(wok(row).translation.y - row.visual.y) < .00002, JSON.stringify(row));
        const { x, y, z, w } = wok(row).rotation;
        const basis = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)];
        assert.ok(basis.every((component, i) => Math.abs(1.3 * component - row.visual.basisX[i]) < .00002));
        assert.equal(wok(row).sha, wok(rest).sha);
      }
      assert.ok(motion.some(row => wok(row).translation.y - wok(rest).translation.y > .08));
      assert.ok(motion.some(row => Math.abs(wok(row).rotation.x - wok(rest).rotation.x) > .01));
      assert.ok(motion.some(row => row.probe?.point[1] - rest.probe?.point[1] > .075), 'The actual shape cast must hit the lifted bowl');
      assert.deepEqual(wok(rest).translation, wok(settled).translation);
      if (mode === 'failed') assert.ok(errors.every(message => /camp-facilities-v1\.glb.*Failed to fetch/.test(message)), JSON.stringify(errors));
      else assert.deepEqual(errors, []);
      if (mode === 'delayed') {
        release.resolve();
        await page.waitForFunction(() => window.__worldDebug.sceneObjects().includes('camp-facility-C14-C14_wok'), undefined, { timeout: 18_000 });
        const switched = await sample();
        assert.equal(switched.colliders.length, 2);
        assert.notEqual(wok(switched).sha, wok(rest).sha);
        assert.notEqual(stove(switched).sha, stove(rest).sha);
        console.log(JSON.stringify({ mode, switched }));
      }
      if (mode === 'legacy') assert.equal(packRequests, 0);
      else assert.equal(packRequests, 1);
    }
  }
  assert.equal(bot.fixtureCalls.length, 0);
} finally {
  release.resolve();
  await browser.close();
}
