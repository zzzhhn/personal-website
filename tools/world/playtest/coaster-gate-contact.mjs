import assert from 'node:assert/strict';
import { Bot, CHROME, comboFor, loadPlaywright } from './lib.mjs';

const [base = 'http://127.0.0.1:4343', mode = 'after'] = process.argv.slice(2);
assert.ok(['before', 'after', 'rails', 'site'].includes(mode));
const authored = mode !== 'before';
const authoredRails = mode === 'rails' || mode === 'site';
const railRoots = ['coaster-rail-footings-contact','coaster-running-rails-contact','coaster-rail-steel-contact'];
const url = new URL('/world/?start=coaster', base);
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url.href);
  await page.locator('button.world-camp-return:enabled').waitFor({ timeout: 75_000 });
  assert.equal(await page.evaluate(() => Boolean(window.__worldDebug)), false);
  const saveKey = 'bobby-world.intent-coaster.progress.v1';
  await page.addInitScript(key => {
    localStorage.setItem(key, JSON.stringify({ version: 1, bankRevision: 'original-20261027-v1',
      passed: ['T1','T2','T3','T4','T5','T6'], clarified: [], chestOpen: true, keyTaken: true, gateOpen: false }));
  }, saveKey);
  url.searchParams.set('qa', '1');
  await page.goto(url.href);
  const wait = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 55_000 });
  await wait(() => {
    const d = window.__worldDebug;
    return d?.state().ready && d.snapshot().grounded && d.sceneObjects().includes('coaster-gate-craft-leaf');
  });
  const bot = new Bot(page);
  const actor = () => page.evaluate(() => {
    const d = window.__worldDebug, a = d.snapshot();
    return { p: a.player, yaw: d.camera()?.yaw, step: a.physicsStep, grounded: a.grounded,
      offer: d.state().nearbyInteract?.id, toast: d.state().toast?.en };
  });
  const walk = async (x, z, arrive = .68, offer) => {
    const started = await actor();
    let best = Infinity, progress = started.step;
    try {
      while (true) {
        const state = await actor(), dx = x - state.p[0], dz = z - state.p[2], distance = Math.hypot(dx, dz);
        if (distance < arrive && (!offer || state.offer === offer)) return state;
        if (best - distance > .04) { best = distance; progress = state.step; }
        if (state.step - progress >= 150 || state.step - started.step >= 1300) {
          const contact = await page.evaluate(([x,z]) => {
            const d = window.__worldDebug, p = d.snapshot().player;
            const direction = Math.hypot(x-p[0],z-p[2]);
            const next = [p[0] + (x-p[0]) * .8 / direction,p[1],p[2] + (z-p[2]) * .8 / direction];
            return { sweep: d.castPlayer(p,next), contacts: d.contacts().filter(c => c.self === 'player') };
          }, [x,z]);
          assert.fail(JSON.stringify({ x, z, best, state, contact }));
        }
        // Reorient the bot's standard camera axes to the actual follow-camera azimuth.
        const delta = Math.atan2(.8, .6) - (state.yaw ?? Math.atan2(.8, .6));
        await bot.hold(comboFor(dx * Math.cos(delta) - dz * Math.sin(delta),
          dx * Math.sin(delta) + dz * Math.cos(delta)).keys);
        await wait(step => window.__worldDebug.snapshot().physicsStep >= step, state.step + 6);
      }
    } finally { await bot.release(); }
  };
  const probe = () => page.evaluate(() => {
    const d = window.__worldDebug;
    const ray = x => ({ visual: d.visualRaycast([x,3.35,-137.7], [0,0,-1], 'coaster-gate'),
      physical: d.probeAsset('coaster-gate', [x,3.35,-137.7], [0,0,-1], .065) });
    return { gap: ray(45.69), picket: ray(45.46), leaves: d.physicsInventory().filter(c => c.assetId === 'coaster-gate') };
  });
  const spawn = await actor();
  const locked = await probe();
  console.log(JSON.stringify({ phase: 'closed', spawn, ...locked }));
  assert.equal(locked.gap.visual.length, 0, 'actual gap between pickets at head height');
  assert.equal(Boolean(locked.gap.physical), mode === 'before', 'only the legacy collider blocks the narrow opening');
  assert.ok(locked.picket.visual.length > 0 && locked.picket.physical, 'the visible picket is physically present');
  const portal = await page.evaluate(mode => {
    const d = window.__worldDebug, asset = mode === 'before' ? 'intent-coaster' : 'coaster-gate-portal';
    const point = [56.575, 3.25, -137.25], direction = [0,0,-1];
    return { physical: d.probeAsset(asset, point, direction, .006), visual: d.visualRaycast(point, direction, asset),
      former: d.probeAsset('intent-coaster', point, direction, .006) };
  }, mode);
  assert.ok(portal.physical, 'stone is physically solid');
  if (authored) {
    assert.ok(portal.visual.length && portal.physical.visualBoundaryGap < .002, 'stone first hit follows the actual recessed return');
    assert.equal(portal.former, null, 'the coarse station box cannot still occupy the portal');
    const sources = await page.evaluate(() => window.__worldDebug.reviewCollisionSources('coaster-gate-portal-contact'));
    assert.equal(sources.meshes.length, 5);
    assert.deepEqual(sources.colliders.map(c => [c.name, c.shape.type]), [['coaster-gate-portal','TriMesh']]);
    assert.equal(sources.colliders[0].shape.indices, sources.meshes.reduce((n, m) => n + m.declaration.ranges[0].indexCount, 0));
  } else assert.ok(portal.physical.point[2] > -138.15, 'the legacy box hits before the recessed return');
  console.log(JSON.stringify({ phase: 'portal', ...portal }));
  if (authored) {
    const source = await page.evaluate(() => window.__worldDebug.reviewCollisionSources('coaster-gate-leaves'));
    assert.equal(source.meshes.length, 10);
    assert.deepEqual(source.colliders.map(collider => [collider.name, collider.shape.type]).sort(),
      [['coaster-gate-leaf-1', 'TriMesh'], ['coaster-gate-leaf-2', 'TriMesh']]);
    for (const leaf of source.colliders) {
      const ranges = source.meshes.flatMap(mesh => mesh.declaration?.ranges ?? []).filter(range => range.surfaceId === leaf.name);
      assert.equal(ranges.length, 4);
      assert.equal(ranges.reduce((sum, range) => sum + range.indexCount, 0), leaf.shape.indices);
    }
    console.log(JSON.stringify({ phase: 'source', ...source }));
  }
  await walk(52, -127.2);
  await walk(52, -132.9);
  const atGate = await walk(50.6, -136.5, .65, 'intent-gate');
  await bot.press('KeyE');
  await wait(key => JSON.parse(localStorage.getItem(key)).gateOpen, saveKey);
  await wait(() => {
    const leaves = window.__worldDebug.physicsInventory().filter(c => c.assetId === 'coaster-gate');
    return leaves.length === 2 && leaves.every(c => Math.abs(c.rotation[1]) > .662);
  });
  const through = await walk(50.4, -142.7, .85);
  const open = await probe();
  console.log(JSON.stringify({ phase: 'open', atGate, through, ...open }));
  assert.equal(open.gap.physical, null);
  assert.ok(through.grounded);
  const platform = await walk(55.36, -151.945, .72, 'intent-board');
  console.log(JSON.stringify({ phase: 'platform', platform, actor: await actor() }));
  if (authored) {
    const station = await page.evaluate(() => window.__worldDebug.reviewCollisionSources('coaster-station-architecture-contact'));
    const visible = station.meshes.filter(mesh => mesh.submitted);
    assert.equal(station.meshes.length, 15);
    assert.ok(visible.some(mesh => mesh.path.includes('/Near/')), 'the ordinary approach draws the near station LOD');
    assert.ok(!visible.some(mesh => mesh.path.includes('/Far/')));
    const shapes = station.colliders.map(c => [c.name, c.shape.type, c.shape.indices / 3]).sort();
    assert.deepEqual(shapes, [['coaster-boarding-support','TriMesh',504], ['coaster-station-building','TriMesh',28976]]);
    console.log(JSON.stringify({ phase: 'station-source', shapes, pathCount: station.meshes.length,
      submitted: visible.map(mesh => mesh.path), supportedTreads: 7 }));
    const train = await page.evaluate(() => window.__worldDebug.reviewCollisionSources('coaster-train-craft'));
    const cars = train.colliders.map(c => [c.name, c.shape.type, c.shape.indices / 3]).sort();
    assert.equal(train.meshes.length, 17);
    assert.deepEqual(cars, [1,2,3].map(i => [`coaster-parked-car-${i}`,'TriMesh',21772]));
    for (const mesh of train.meshes.filter(row => row.instances && row.declaration?.policy === 'solid')) {
      assert.deepEqual(mesh.instances.map(row => row.source), [1,2,3].map(i => `coaster-parked-car-${i}`));
    }
    console.log(JSON.stringify({ phase: 'train-source', cars, pathCount: train.meshes.length }));
  }
  if (authoredRails) {
    const active = await page.evaluate(async roots => {
      const d = window.__worldDebug;
      return { sources: await Promise.all(roots.map(root => d.reviewCollisionSources(root))),
        inventory: d.reviewCollisionInventory(), frames: d.renderLoop().frameMs };
    },railRoots);
    const shapes = [[1,39,10416],[1,44,76160],[2,45,125052]];
    for (const [i,{meshes,colliders}] of active.sources.entries()) {
      const [batches,cells,triangles] = shapes[i], root = railRoots[i];
      assert.equal(meshes.length,batches);
      assert.equal(colliders.length,cells);
      assert.equal(active.inventory.registrations[root],cells,'actual registrations at the active local facility');
      assert.equal(colliders.reduce((sum,c) => sum + c.shape.indices/3,0),triangles);
      assert.ok(colliders.every(c => c.shape.type === 'TriMesh'));
      const declared = meshes.flatMap(mesh => mesh.declaration.ranges);
      for (const c of colliders) assert.equal(declared.filter(range => range.surfaceId === c.name)
        .reduce((sum,range) => sum + range.indexCount,0),c.shape.indices);
    }
    assert.deepEqual(active.inventory.errors.filter(error => railRoots.some(root => error.includes(root))),[]);
    console.log(JSON.stringify({ phase: 'rails-source', shapes, frames: active.frames }));
  }
  if (mode === 'site') {
    const current = await page.evaluate(async () => {
      const d = window.__worldDebug, inventory = d.reviewCollisionInventory();
      const site = await d.reviewCollisionSources('coaster-site-contact');
      const approach = await d.reviewCollisionSources('north-attractions-approach');
      return { site, walk: approach.colliders.filter(c=>c.name==='coaster-arrival-walk'),
        registrations: inventory.registrations['coaster-site-contact'],
        errors: inventory.errors.filter(error=>error.includes('coaster-site-contact')) };
    });
    assert.equal(current.site.meshes.length,1);
    const [mesh] = current.site.meshes;
    assert.ok(!mesh.declaration.partial);
    assert.equal(mesh.declaration.ranges.reduce((n,r)=>n+r.vertexCount/3,0),62032);
    assert.ok(current.walk.length===1 && current.walk[0].shape.type==='TriMesh');
    assert.equal(current.registrations,420);
    assert.equal(current.site.colliders.length,419);
    assert.deepEqual(new Set([...current.site.colliders,...current.walk].map(c=>c.name)),
      new Set(mesh.declaration.ranges.map(range=>range.surfaceId)));
    assert.deepEqual(current.errors,[]);
    console.log(JSON.stringify({ phase:'site-source',registrations:current.registrations,triangles:62032 }));
  }
  await bot.press('KeyE');
  const skip = page.getByRole('button', { name: 'Skip travel and return to station', exact: true });
  try { await skip.waitFor({ timeout: 23_000 }); }
  catch (error) {
    const ui = await page.locator('body').innerText();
    const path = await page.evaluate(() => {
      const d = window.__worldDebug, p = d.snapshot().player;
      return [0, .012, .025, .060].map(lift => d.castPlayer([p[0],p[1]+lift,p[2]], [54.3455,1.9+lift,-152.1119]));
    });
    throw new Error(JSON.stringify({ actor: await actor(), path, ui: ui.slice(-2000) }), { cause: error });
  }
  if (authored) {
    assert.equal(await page.evaluate(() => window.__worldDebug.physicsInventory().filter(c => c.assetId === 'coaster-parked-car').length), 0);
  }
  await skip.click();
  await wait(() => {
    const a = window.__worldDebug.snapshot(), p = a.player;
    return a.grounded && p && !document.querySelector('.intent-riding') && Math.hypot(p[0] - 55.3619, p[2] + 151.9450) < .35;
  });
  const exit = await actor();
  const resumed = await walk(exit.p[0]+1.4, exit.p[2], .55);
  console.log(JSON.stringify({ phase: 'board-return', mode, platform, exit, resumed, keys: bot.events, relocations: bot.fixtureCalls, errors }));
  assert.deepEqual(bot.fixtureCalls, []);
  if (authored) {
    await page.locator('button.world-camp-return:enabled').click();
    await wait(() => {
      const d = window.__worldDebug;
      return d.snapshot().player[0] < 0 && d.sceneObjects().includes('coaster-gate-portal-contact') &&
        !d.physicsInventory().some(c => c.assetId === 'coaster-gate-portal' || c.assetId === 'coaster-gate');
    });
    const cold = await page.evaluate(() => window.__worldDebug.reviewCollisionSources('coaster-gate-portal-contact'));
    assert.equal(cold.meshes.length, 5, 'far gate remains present');
    assert.equal(cold.colliders.length, 0);
    const station = await page.evaluate(() => window.__worldDebug.reviewCollisionSources('coaster-station-architecture-contact'));
    assert.equal(station.meshes.length, 15);
    assert.equal(station.colliders.length, 0);
    if (authoredRails) {
      const distant = await page.evaluate(async roots => {
        const d = window.__worldDebug, inventory = d.reviewCollisionInventory();
        const surveys = await Promise.all(roots.map(root => d.reviewCollisionSources(root)));
        return surveys.map(({meshes,colliders},i) => [meshes.length,colliders.length,inventory.registrations[roots[i]] ?? 0]);
      },railRoots);
      assert.deepEqual(distant,[[1,0,0],[1,0,0],[2,0,0]],'rail finishes stay mounted at camp with separate sleeping contact');
    }
    if (mode === 'site') {
      await wait(async () => {
        const d = window.__worldDebug, site = await d.reviewCollisionSources('coaster-site-contact');
        const farTriangles = site.meshes[0]?.declaration?.ranges?.reduce((n,r)=>n+r.vertexCount/3,0);
        return farTriangles===55312 && !site.colliders.length && d.reviewCollisionInventory().registrations['coaster-site-contact']===undefined;
      });
      const walk = await page.evaluate(() => window.__worldDebug.physicsInventory().filter(c=>c.name==='coaster-arrival-walk'));
      assert.equal(walk.length,1,'the original approach support keeps its independent lifecycle');
    }
    const coverage = await page.evaluate(async () => {
      const drawn = await window.__worldDebug.reviewCollisionSources('intent-coaster');
      return { mounted: drawn.meshes.length, withoutPolicy: drawn.meshes.filter(m => !m.declaration || m.declaration.partial).map(m => m.path) };
    });
    console.log(JSON.stringify({ phase: 'camp-return', actor: await actor(), portalSources: cold.meshes.length, stationSources: station.meshes.length,
      portalColliders: cold.colliders.length, stationColliders: station.colliders.length, coverage }));
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
