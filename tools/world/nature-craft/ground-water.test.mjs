import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { CHROME, loadPlaywright } from '../playtest/lib.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const fixture = '/tools/world/nature-craft/ground-water-fixture.mjs';
const path = '/__ground-water-test';
const server = await createServer({ root, configFile: false, logLevel: 'warn', esbuild: { jsx: 'automatic' },
  cacheDir: 'node_modules/.vite/ground-water-test',
  optimizeDeps: { entries: [fixture.slice(1)], include: ['react', 'react/jsx-runtime', 'three', '@react-three/fiber', '@react-three/rapier'] },
  server: { host: '127.0.0.1', port: 0, ws: false }, plugins: [{ name: 'ground-water-fixture',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (new URL(req.url, 'http://localhost').pathname !== path) return next();
        res.setHeader('Content-Type', 'text/html');
        res.end('<!doctype html><html lang="en"><title>Ground and sea material tests</title></html>');
      });
    },
  }],
});

function close(a, b, message, tolerance = .001) {
  assert.equal(a.length, b.length, message);
  a.forEach((value, i) => assert.ok(Math.abs(value - b[i]) <= tolerance, `${message} [${i}]: ${value} vs ${b[i]}`));
}

function finite(samples) {
  for (const [name, image] of Object.entries(samples)) {
    assert.equal(image.nonFinite, 0, `${name} contains non-finite WebGL values`);
  }
}

await test('the shipped island and sea materials compile and render in WebGL2', async t => {
  t.after(() => server.close());
  await server.listen();
  const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  t.after(() => browser.close());
  const base = `http://127.0.0.1:${server.httpServer.address().port}${path}`;
  async function sample(query, water = true) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(base + query);
      const result = await page.evaluate(async ({ fixture, water }) => {
        const { sampleGround, sampleWater } = await import(fixture);
        const sea = water ? sampleWater() : null;
        return { sea, ground: await sampleGround() };
      }, { fixture, water });
      assert.deepEqual(errors, []);
      return result;
    } catch (error) {
      if (errors.length) throw new Error(errors.join('\n'), { cause: error });
      throw error;
    } finally { await page.close(); }
  }
  const modern = await sample('');
  const legacy = await sample('?natureCraft=legacy');
  const fallback = await sample('?groundPbr=0', false);
  const fallbackLegacy = await sample('?groundPbr=0&natureCraft=legacy', false);

  await t.test('terrain draws with the six published scans and the fallback stays procedural', () => {
    for (const { ground } of [modern, legacy, fallback, fallbackLegacy]) {
      const scans = ground.pbr ? ['uAlb0', 'uAlb1', 'uAlb2', 'uNr0', 'uNr1', 'uNr2'] : [];
      assert.deepEqual(ground.uniforms.filter(name => /^u(?:Alb|Nr)\d+$/.test(name)).sort(), scans);
      assert.equal(ground.scans.length, scans.length);
      ground.scans.forEach(({ width, height, colorSpace, repeated }, i) => {
        assert.ok(width >= 128 && height >= 128 && repeated);
        assert.equal(colorSpace, i % 2 ? '' : 'srgb');
      });
      finite(ground.shipped);
      assert.ok(Math.abs(ground.shipped.grass.mean[0] - ground.shipped.grass.mean[2]) > .03, 'grass keeps its warm vertex tint');
      assert.ok(ground.shipped.stone.maximum[0] - ground.shipped.stone.minimum[0] > .06, 'stone retains visible strata');
      assert.ok(ground.drySand.mean[3] - ground.wetSand.mean[3] > .06, 'waterline changes real sand roughness');
    }
    assert.ok(modern.ground.pbr && legacy.ground.pbr && !fallback.ground.pbr && !fallbackLegacy.ground.pbr);
    const stone = modern.ground.shipped.stone.mean;
    close(stone, fallback.ground.shipped.stone.mean, 'pure rock remains scan independent');
    for (const name of Object.keys(fallback.ground.shipped)) {
      close(fallback.ground.shipped[name].mean, fallbackLegacy.ground.shipped[name].mean, `fallback ${name} is independent of the craft switch`);
    }
    assert.notEqual(modern.ground.cacheKey, legacy.ground.cacheKey, 'different Three programs can coexist');
    assert.equal(fallback.ground.cacheKey, fallbackLegacy.ground.cacheKey);
  });

  await t.test('mixed terrain uses scan coverage and rotated normals; extrapolated edges remain finite', () => {
    const { ground } = modern;
    const { direction, flat, mixture, darkMixture, grassWithDarkSand, boundary, pureSand } = ground;
    assert.deepEqual(ground.edge, [0, 1], 'all emitted terrain weights stay in range');
    assert.deepEqual(ground.examples, { grass: [1, 0, 0, 0], sand: [0, 1, 0, 0], dirt: [0, 0, 1, 0], stone: [0, 0, 0, 1] });
    assert.deepEqual(ground.outside, [-.125, 1.125, 0, 0]);
    finite({ direction, flat, mixture, darkMixture, grassWithDarkSand, boundary, pureSand });
    close(boundary.mean, pureSand.mean, 'extrapolated grass weight must leave a usable sand normal', .0001);
    assert.ok(boundary.minimum[2] > .97, 'edge remains lit by a valid upward normal');
    close(direction.mean, grassWithDarkSand.mean, 'sand scan has zero influence on pure grass');
    assert.ok(darkMixture.mean[0] - mixture.mean[0] > .01, 'darkening only sand albedo gives mixed normals more grass coverage');
    assert.ok(direction.mean[0] - flat.mean[0] > .08, 'the grass scan perturbs the actual normal');
    assert.ok(legacy.ground.direction.mean[0] - direction.mean[0] > .02, 'rotation reorients the controlled directional normal');
  });

  await t.test('sea opacity, wave displacements and actor wakes survive both material variants', () => {
    const { sea } = modern;
    for (const { sea: sample } of [modern, legacy]) {
      finite({ deep: sample.deep, shoal: sample.shoal, opening: sample.opening, depth: sample.depth });
      close([sample.deep.center[3], sample.shoal.center[3], sample.opening.center[3], sample.opening.maximum[3]],
        [1, .628, .42, 1], 'deep, shallow and actor opening opacity');
      assert.ok(sample.opening.mean[3] > .9 && sample.opening.mean[3] < .98, 'the opening falls off to fully opaque water');
      assert.ok(sample.opening.center[1] > sample.deep.center[1] + .01, 'the opening keeps its teal rim tint');
      assert.ok(sample.hit > .06, 'an actual actor water impact brightens the water');
      assert.ok(sample.expired < .0001, 'the expired impact restores the same water surface');
      assert.ok(sample.motion > .0003 && sample.motion < .003, 'wind moves the rasterized surface depth');
    }
    close(sea.depth.mean, legacy.sea.depth.mean, 'displacement is shared by the material variants');
    close(sea.opening.mean, legacy.sea.opening.mean, 'craft keeps clear-hole tint and alpha');
    assert.notEqual(sea.cacheKey, legacy.sea.cacheKey);
  });

  await t.test('water foam breaks and scatters light, and short ripples fade with pixel footprint', () => {
    const { sea } = modern;
    finite({ foam: sea.drawFoam, gloss: sea.gloss });
    assert.ok(sea.drawFoam.maximum[0] - sea.drawFoam.minimum[0] > .4, 'foam breaks leave lit and dark samples');
    assert.ok(legacy.sea.drawFoam.mean[0] - sea.drawFoam.mean[0] > .06, 'the smaller modern swash term leaves more water visible');
    assert.ok(sea.gloss.maximum[3] > .88 && sea.gloss.minimum[3] < .60, 'foam is rougher than adjacent water');
    close([legacy.sea.gloss.maximum[3]], [.5], 'legacy retains its uniform sea roughness');
    assert.ok(sea.footprint > .01 && sea.footprint < .03, `short ripples fade at matched world positions: ${sea.footprint}`);
    assert.ok(legacy.sea.footprint < .001, 'the longer legacy ripples survive both test footprints');
  });

  t.diagnostic(JSON.stringify({ edge: modern.ground.boundary.mean, foam: modern.sea.gloss.maximum[3],
    footprint: [modern.sea.footprint, legacy.sea.footprint], wake: modern.sea.hit, motion: modern.sea.motion }));
});
