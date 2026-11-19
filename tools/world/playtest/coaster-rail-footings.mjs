import assert from 'node:assert/strict';
import { CHROME, loadPlaywright } from './lib.mjs';

const [base = 'http://127.0.0.1:4343', mode = 'after'] = process.argv.slice(2);
assert.ok(['before','after'].includes(mode));
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = new URL('/world/',base);
  const ready = async () => {
    try { await page.locator('.world-camp-return:enabled').waitFor({ timeout: 75_000 }); }
    catch (failure) { throw new Error(JSON.stringify({ errors, ui: (await page.locator('body').innerText()).slice(-1500) }), { cause: failure }); }
  };
  await page.goto(url.href); await ready();
  assert.equal(await page.evaluate(() => Boolean(window.__worldDebug)),false);
  url.searchParams.set('qa','1');
  const root = 'coaster-rail-footings-contact';
  if (mode === 'after') {
    await page.goto(url.href); await ready();
    await page.waitForFunction(root => window.__worldDebug.sceneObjects().includes(root), root);
    const cold = await page.evaluate(root => window.__worldDebug.reviewCollisionSources(root),root);
    assert.equal(cold.meshes.length,1);
    assert.equal(cold.meshes[0].declaration.ranges.length,216);
    assert.equal(cold.colliders.length,0);
    console.log(JSON.stringify({ phase: 'far', meshCount: cold.meshes.length, geometry: cold.geometries[0], colliders: cold.colliders.length }));
  }
  url.searchParams.set('start','coaster');
  await page.goto(url.href); await ready();
  if (mode === 'after') await page.waitForFunction(() => window.__worldDebug.physicsInventory().some(c => c.assetId === 'coaster-rail-footing' && c.shape === 'trimesh'));
  const observed = await page.evaluate(mode => {
    const d = window.__worldDebug, asset = mode === 'after' ? 'coaster-rail-footing' : 'intent-coaster';
    const x=27.865862442969014, z=-172.58622432908732, direction=[0,-1,0];
    const point = (dx,dz) => ({ physical:d.probeAsset(asset, [x+dx,2.55,z+dz],direction,.005),
      visual:d.visualRaycast([x+dx,2.55,z+dz],direction,asset) });
    return { corner:point(1.235,1.235), ledge:point(1.20,0), start:d.snapshot().player };
  },mode);
  assert.equal(Boolean(observed.corner.physical), mode === 'before');
  assert.ok(observed.ledge.physical);
  if (mode === 'after') {
    assert.equal(observed.corner.visual.length,0);
    assert.ok(observed.ledge.visual.length && observed.ledge.physical.visualBoundaryGap < .002);
    const near = await page.evaluate(root => window.__worldDebug.reviewCollisionSources(root),root);
    assert.equal(near.meshes.length,1);
    assert.equal(near.colliders.length,39);
    assert.equal(near.colliders.reduce((n,c)=>n+c.shape.indices/3,0),10416);
    console.log(JSON.stringify({ phase:'near', mounted:near.meshes[0].path, colliders:near.colliders.length, ...observed }));
  } else console.log(JSON.stringify({ phase:'legacy', ...observed }));
  assert.deepEqual(errors,[]);
} finally { await browser.close(); }
