import assert from 'node:assert/strict';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { Bot, CHROME, loadPlaywright } from '../playtest/lib.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:4343';
const selected = new Set(process.argv.slice(3));
const timeout = 60_000;
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const bot = new Bot(page);
const ready = () => page.locator('button.world-camp-return:enabled').waitFor({ timeout });
const rootFor = kind => `park-${kind}-lod-instances`;
const read = id => page.evaluate(id => window.__parkKnock().find(item => item.id === id), id);
const survey = kind => page.evaluate(root => window.__worldDebug.reviewCollisionSources(root), rootFor(kind));
const lod = kind => page.evaluate(kind => window.__parkLodInstances().find(row => row.id === kind), kind);

async function verifyTopology(kind, meshCount, colliderCount, triangleCounts) {
  const result = await survey(kind);
  const inventory = await page.evaluate(() => window.__worldDebug.reviewCollisionInventory());
  assert.deepEqual(inventory.errors.filter(message => message.includes(rootFor(kind))), []);
  assert.equal(inventory.registrations[rootFor(kind)], colliderCount);
  assert.equal(result.colliders.length, colliderCount);
  assert.equal(new Set(result.colliders.map(collider => collider.name)).size, colliderCount);
  assert.ok(result.colliders.every(collider => collider.bodyType === 0 && collider.enabled && !collider.sensor
    && collider.shape.type === 'ConvexPolyhedron'));
  const proxy = result.meshes.find(row => row.path.endsWith('-physics-proxy'));
  assert.equal(proxy.instances.length, meshCount);
  assert.equal(proxy.submitted, false);
  const near = result.meshes.find(row => row.path.endsWith('/park-' + kind));
  const far = result.meshes.find(row => row.path.endsWith('-far'));
  assert.equal(near.geometry, proxy.geometry);
  assert.equal(near.instances.length + far.instances.length, meshCount);
  assert.equal(new Set([...near.instances, ...far.instances].map(row => row.source)).size, meshCount);
  assert.deepEqual([near, far].map(row => result.geometries[row.geometry].vertices / 3), triangleCounts);
  for (const mesh of [near, far]) {
    for (const slot of mesh.instances) {
      const proxySlot = proxy.instances.find(row => row.source === slot.source);
      assert.deepEqual(slot.localMatrix, proxySlot.localMatrix, slot.source);
      assert.ok(slot.surfaceIds.every(id => result.colliders.some(collider => collider.name === id)), slot.source);
    }
  }
  return { proxy, near, far, colliders: result.colliders };
}

function verifyPose(topology, id, side) {
  const mesh = topology[side];
  const slot = mesh.instances.find(instance => instance.source === id);
  assert.ok(slot, `${id} has no ${side} slot`);
  const collider = topology.colliders.find(row => row.name.startsWith(id + ':'));
  const p = collider.bodyTranslation, q = collider.bodyRotation;
  const bodyWorld = new Matrix4().compose(new Vector3(p.x, p.y, p.z), new Quaternion(q.x, q.y, q.z, q.w), new Vector3(1, 1, 1));
  const renderWorld = new Matrix4().fromArray(mesh.matrixWorld).multiply(new Matrix4().fromArray(slot.localMatrix));
  const difference = Math.max(...renderWorld.elements.map((value, i) => Math.abs(value - bodyWorld.elements[i])));
  assert.ok(difference < .05, JSON.stringify({ id, side, difference, body: p }));
  return { poseError: difference, position: [p.x, p.y, p.z] };
}

function probe(kind, point, dir, radius) {
  return page.evaluate(({ kind, point, dir, radius }) => window.__worldDebug.probeAsset(kind, point, dir, radius),
    { kind, point, dir, radius });
}

function moveFrom(item, outward, distance, height) {
  const [x, y, z] = item.position;
  return [x + outward[0] * distance, y + height, z + outward[1] * distance];
}

async function rest(at, reason) {
  assert.equal(await bot.fixtureTeleport(at, reason), true);
  await page.waitForFunction(() => window.__worldDebug.snapshot().grounded && window.__worldDebug.snapshot().player[1] > 1.8, undefined, { timeout });
}

async function push(item, inward, kind) {
  const setup = moveFrom(item, inward, 1.65, .88);
  await rest(setup, `${item.id} impact approach`);
  const target = moveFrom(item, inward, -.85, .88);
  const attempt = await bot.walk([[target[0], target[2]]], { run: true, arrive: .15, timeout: 3, maxRecoveries: 0 });
  await page.waitForFunction(id => window.__parkKnock().find(row => row.id === id)?.knocked, item.id, { timeout: 10_000 });
  const impact = await read(item.id);
  const old = item.position;
  const distance = Math.hypot(...impact.position.map((value, i) => value - old[i]));
  assert.ok(distance > .08 || Math.hypot(impact.rotation[0], impact.rotation[2]) > .13, JSON.stringify({ impact, attempt }));
  assert.ok(attempt.trace.some(row => row.contacts?.some(contact => contact.other.assetId === kind)), JSON.stringify(attempt.legs));
  return { impact, distance, setup };
}

async function reset(item, setup) {
  await rest(setup, `${item.id} clear the reset area`);
  await page.waitForFunction(id => {
    const row = window.__parkKnock().find(candidate => candidate.id === id);
    return row.resetPhaseDone && row.fade < .8;
  }, item.id, { timeout: 80_000 });
  const fading = await read(item.id);
  await page.waitForFunction(id => {
    const row = window.__parkKnock().find(candidate => candidate.id === id);
    return !row.knocked && row.sleeping && row.fade > .99 && Math.hypot(...row.position.map((value, i) => value - row.home[i])) < .025;
  }, item.id, { timeout: 10_000 });
  return { fading, asleepAtHome: await read(item.id) };
}

try {
  await page.goto(new URL('/world/', base).href, { waitUntil: 'domcontentloaded' });
  await ready();
  assert.equal(await page.evaluate(() => Boolean(window.__worldDebug)), false);
  await page.goto(new URL('/world/?qa=1', base).href, { waitUntil: 'domcontentloaded' });
  await ready();
  await page.waitForFunction(() => window.__parkKnock?.().filter(row => row.id.startsWith('rail-') || row.id.startsWith('lamp-')).length === 51,
    undefined, { timeout });
  const park = await page.evaluate(() => window.__parkWalk);
  const cases = [
    { kind: 'rail', id: 'rail-0-r-0', items: park.railList, shapes: 546, triangles: [156, 36], mass: 40 },
    { kind: 'lamp', id: park.lampList.find(row => row.id.startsWith('lamp-1-')).id, items: park.lampList, shapes: 36, triangles: [766, 146], mass: 45 },
  ];
  for (const { kind, id, items, shapes, triangles, mass } of cases) {
    if (selected.size && !selected.has(kind)) continue;
    const item = items.find(row => row.id === id);
    const inward = kind === 'rail' ? [Math.cos(item.yaw), -Math.sin(item.yaw)] : [Math.sin(item.yaw), Math.cos(item.yaw)];
    await page.evaluate(() => window.__worldDebug.set({ shot: 'camp' }));
    await page.waitForFunction(kind => window.__parkLodInstances().find(row => row.id === kind)?.nearCount === 0, kind, { timeout });
    const farBefore = verifyPose(await verifyTopology(kind, items.length, shapes, triangles), id, 'far');
    await page.evaluate(() => window.__worldDebug.set({ shot: null }));
    await rest(moveFrom(item, inward, 1.65, .88), `${id} near contact position`);
    await page.waitForFunction(id => window.__parkKnock().find(row => row.id === id)?.sleeping, id, { timeout: 20_000 });
    const before = await read(id);
    assert.ok(Math.abs(before.mass - mass) < .01, JSON.stringify(before));
    assert.equal(before.knocked, false);
    const nearBefore = verifyPose(await verifyTopology(kind, items.length, shapes, triangles), id, 'near');
    const probes = [];
    for (const h of kind === 'rail' ? [.2, .35, .5, .72, .935] : [.03, 1.4, 2.66]) {
      const hit = await probe(kind, moveFrom(item, inward, .85, h), [-inward[0], 0, -inward[1]], .015);
      if (kind === 'rail' && (h === .35 || h === .72)) assert.equal(hit, null, JSON.stringify({ h, hit }));
      else assert.ok(hit && hit.visualBoundaryGap !== null && hit.visualBoundaryGap < .075, JSON.stringify({ h, hit }));
      probes.push({ h, hit });
    }
    const { impact, distance, setup } = await push(item, inward, kind);
    const nearAfter = verifyPose(await verifyTopology(kind, items.length, shapes, triangles), id, 'near');
    await page.evaluate(() => window.__worldDebug.set({ shot: 'camp' }));
    await page.waitForFunction(kind => window.__parkLodInstances().find(row => row.id === kind)?.nearCount === 0, kind, { timeout });
    const farAfter = verifyPose(await verifyTopology(kind, items.length, shapes, triangles), id, 'far');
    assert.ok(Math.hypot(...farAfter.position.map((value, i) => value - farBefore.position[i])) > .08, JSON.stringify({ farBefore, farAfter }));
    await page.evaluate(() => window.__worldDebug.set({ shot: null }));
    const restore = await reset(item, setup);
    console.log(JSON.stringify({ kind, id, colliderCount: shapes, triangles, before, probes, impact, distance, farBefore, nearBefore,
      nearAfter, farAfter, restore, lod: await lod(kind) }));
  }
  console.log(JSON.stringify({ fixtures: bot.fixtureCalls }));
} finally { await browser.close(); }
