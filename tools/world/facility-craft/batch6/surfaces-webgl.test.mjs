import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { CHROME, loadPlaywright } from '../../playtest/lib.mjs';

const fixture = '/tools/world/facility-craft/batch6/surfaces-webgl-fixture.mjs';
const pagePath = '/__facility-surface-test';
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const luma = ([r, g, b]) => .2126 * r + .7152 * g + .0722 * b;
function close(actual, expected, note, tolerance = .001) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${note} (${actual} vs ${expected})`);
}

await test('street and park use their installed materials and shared scans in WebGL2', async t => {
  const server = await createServer({
    root, configFile: false, logLevel: 'warn', cacheDir: 'node_modules/.vite/facility-surface-test',
    optimizeDeps: { entries: [fixture.slice(1)], include: ['three'] },
    server: { host: '127.0.0.1', port: 0, ws: false },
    plugins: [{ name: 'facility-test-page', configureServer({ middlewares }) {
      middlewares.use((request, response, next) => {
        if (request.url !== pagePath) return next();
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><html lang="en"><title>Facility surface tests</title></html>');
      });
    } }],
  });
  t.after(() => server.close());
  await server.listen();
  const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  t.after(() => browser.close());
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(`http://127.0.0.1:${server.httpServer.address().port}${pagePath}`);
  assert.ok(response.ok());
  const result = await page.evaluate(async fixturePath => (await import(fixturePath)).sampleFacilitySurfaces(), fixture);
  assert.deepEqual(errors, []);

  await t.test('published wood has visible grain and reacts to albedo, roughness and normal independently', () => {
    assert.equal(result.scans.length, 3);
    result.scans.forEach((scan, i) => {
      assert.ok(scan.repeat && scan.width >= 128 && scan.height >= 128);
      assert.equal(scan.colorSpace, i === 0 ? 'srgb' : '');
    });
    for (const [name, sample] of Object.entries(result.surface)) {
      const { shipped, untagged, gold, gray, untreatedAfterSwap, forward, reverse, normalUntagged } = sample;
      assert.ok(shipped.maximum[0] - shipped.minimum[0] > .025, `${name}: published wood grain varies across the face`);
      assert.ok(Math.abs(gold[0] - gray[0]) > .18, `${name}: changes in the wood texture reach the albedo`);
      close(gold[3], .66, `${name}: the smooth scan is clamped`);
      close(gray[3], .90, `${name}: the rough scan is clamped`);
      assert.ok(forward[0] - .5 > .03 && forward[0] - .5 < .075, `${name}: the sampled normal tips with a small positive X`);
      assert.ok(.5 - reverse[0] > .03 && .5 - reverse[0] < .075, `${name}: the opposite sampled normal tips the other way`);
      close(normalUntagged[0], .5, `${name}: an untreated face keeps its geometric normal`);
      for (let lane = 0; lane < 4; lane++) {
        close(untagged.mean[lane], untreatedAfterSwap.mean[lane], `${name}: repainting the scans leaves the untreated face at its original values`);
      }
    }
  });

  await t.test('daylight reflection is confined to annotated faces and dims at night', () => {
    for (const [name, { day, night }] of Object.entries(result.ibl)) {
      const morning = luma(day.wood), dark = luma(night.wood);
      assert.ok(morning > .025, `${name}: the borrowed environment reaches the wood`);
      close(dark / morning, .1, `${name}: night reduces the measured environmental light`, .018);
      for (const frame of [day, night]) close(luma(frame.untreated), 0, `${name}: untagged faces get zero environmental light`);
    }
  });

  await t.test('the street sign pulls both atlas colors and partial opacity is a repeated ordered pattern', () => {
    const [red, blue] = result.street.atlas;
    assert.ok(red[0] > .45 && red[0] > 6 * red[2], `left atlas cell should read red (${red})`);
    assert.ok(blue[2] > .45 && blue[2] > 6 * blue[0], `right atlas cell should read blue (${blue})`);
    for (const { fade, coverage, tile, repeated } of result.street.frames) {
      close(coverage, fade, 'surviving fragment coverage equals the batched fade');
      assert.ok(repeated && tile.every(alpha => alpha === 0 || alpha === 1));
    }
    assert.deepEqual(result.street.frames[2].tile, [1,0,1,0, 0,1,0,1, 1,0,1,0, 0,1,0,1]);
  });

  await t.test('park window emission switches on at night and the existing booth glow stays cyan', () => {
    const [stone, window, booth] = result.glow.dusk, [darkStone, gold, cyan] = result.glow.night;
    for (const pixel of [stone, window, darkStone]) close(luma(pixel), 0, 'non-emitting surfaces contribute no light in this scene');
    assert.ok(gold[0] > .30 && gold[0] > gold[1] && gold[1] > gold[2], `night window should emit warm light (${gold})`);
    assert.ok(luma(booth) > .02 && luma(cyan) > luma(booth) * 4, 'the booth retains a dim dusk glow that brightens at night');
    assert.ok(cyan[1] > cyan[2] && cyan[2] > 3 * cyan[0], `night booth should stay cyan (${cyan})`);
  });

  t.diagnostic(JSON.stringify({
    drawingDevice: result.drawingDevice,
    wood: Object.fromEntries(Object.entries(result.surface).map(([name, image]) => [name, {
      grain: image.shipped.maximum[0] - image.shipped.minimum[0], roughness: [image.gold[3], image.gray[3]],
      normalX: [image.forward[0], image.reverse[0]],
    }])),
    nightReflection: Object.fromEntries(Object.entries(result.ibl).map(([name, frame]) => [name, luma(frame.night.wood) / luma(frame.day.wood)])),
    sign: result.street.atlas, fade: result.street.frames.map(frame => frame.coverage), glow: result.glow,
  }));
});
