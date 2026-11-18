import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { act, createElement as h, StrictMode } from 'react';
import { Group, PerspectiveCamera } from 'three';
import { compileWorldComponent } from '../../../tools/world/alpha-mine-tests/component-host.mjs';
import { readWorldCraftGltf, disposeWorldCraftGltf } from './world-craft-gltf-test.mjs';
import { useOwnedDjcVisual } from './useOwnedDjcVisual.ts';
import { CLUB } from './djc-club-layout.ts';
import { IBD_YARD } from './attractions/attraction-layout.ts';
import * as lamps from './djc-pool-lantern-visual.ts';
import * as beds from './djc-daybed-visual.ts';
import * as umbrellas from './djc-umbrella-visual.ts';
import * as furniture from './djc-furniture-visual.ts';
import * as crates from './attractions/ibd-crate-visual.ts';
import * as equipment from './attractions/ibd-static-craft-visual.ts';

const fiber = createRequire(import.meta.url)('@react-three/fiber');
fiber.extend({ Group });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const cases = [
  ['WorldDjcClubLanterns', './djc-pool-lantern-visual', lamps, lamps.DJC_POOL_LANTERN_ASSET, CLUB.pool, 'djc-crafted-pool-lanterns'],
  ['WorldDjcClubDaybeds', './djc-daybed-visual', beds, beds.DJC_DAYBED_ASSET, [70, 0, 56], 'djc-crafted-daybeds'],
  ['WorldDjcClubUmbrellas', './djc-umbrella-visual', umbrellas, umbrellas.DJC_UMBRELLA_ASSET, [74, 0, 55], 'djc-crafted-umbrellas'],
  ['WorldDjcClubFurniture', './djc-furniture-visual', furniture, furniture.DJC_FURNITURE_ASSET, [52, 0, 55], 'djc-crafted-furniture'],
  ['attractions/WorldIbdStaticCraft', './ibd-static-craft-visual', equipment, equipment.IBD_STATIC_CRAFT_ASSET, IBD_YARD.center, 'ibd-static-craft'],
  ...['Shell', 'Lid'].map(part => ['attractions/WorldIbdCratePart', './ibd-crate-visual', crates, crates.IBD_CRATE_ASSET,
    IBD_YARD.center, 'ibd-crafted-crate-' + part.toLowerCase(), part]),
];

function materialsOf(root) {
  const materials = new Set();
  root.traverse(node => {
    if (node.isMesh) for (const material of [node.material].flat()) materials.add(material);
  });
  return materials;
}

for (const [entry, visualImport, visualModule, asset, center, model, part] of cases) {
  test(model + ' loads on approach, keeps its fallback, and releases mounted materials once', async t => {
    const gltf = await readWorldCraftGltf(['public' + asset]);
    assert.ok(gltf, 'missing shipping model: ' + asset);
    const camera = new PerspectiveCamera();
    camera.position.set(center[0] + 200, 2, center[2]);
    const root = fiber.createRoot({});
    const renderer = { render() {}, setSize() {}, setPixelRatio() {}, capabilities: { getMaxAnisotropy: () => 4 } };
    await root.configure({ gl: renderer, camera, frameloop: 'never', dpr: 1, size: { width: 320, height: 200, top: 0, left: 0 } });
    const local = entry.startsWith('attractions/') ? '../' : './';
    let ready = false, release, requests = 0, failure;
    const pending = new Promise(resolve => { release = resolve; });
    const Component = compileWorldComponent(new URL('./' + entry + '.tsx', import.meta.url))({
      [visualImport]: visualModule,
      './useOwnedDjcVisual': { useOwnedDjcVisual },
      './ibd-static-craft-visual': equipment,
      './attraction-layout': { IBD_YARD },
      './djc-club-layout': { CLUB },
      [local + 'WorldAssetDecoder']: { withWorldAssetDecoder() {} },
      [local + 'WorldNight']: { night: { value: 0 } },
      [local + 'WorldDjcFurnitureEnvironment']: { useDjcFurnitureEnvironment: () => null },
      '@react-three/fiber': { ...fiber, useLoader(_loader, url) {
        assert.equal(url, asset);
        requests++;
        if (failure) throw failure;
        if (!ready) throw pending;
        return gltf;
      } },
    }).default;
    const fallback = h('group', { name: 'original-geometry' });
    const uniform = { value: 0 };
    let store, elapsed = 0;
    const render = (props = {}) => act(async () => {
      store = root.render(h(StrictMode, null, h(Component, { fallback, uniform, part, active: false, legacy: false, ...props })));
    });
    const move = distance => act(async () => {
      camera.position.x = center[0] + distance;
      store.getState().advance(++elapsed, false);
    });
    const counts = new WeakMap();
    const observe = material => {
      if (counts.has(material)) return;
      counts.set(material, 0);
      material.addEventListener('dispose', () => counts.set(material, counts.get(material) + 1));
    };
    const originals = materialsOf(gltf.scene);
    originals.forEach(observe);
    try {
      await render();
      const scene = store.getState().scene;
      const original = () => scene.getObjectByName('original-geometry');
      assert.ok(original());
      assert.equal(requests, 0);
      // Observe attachment before passive effects run, including their StrictMode replay.
      const parent = original().parent;
      parent.addEventListener('childadded', ({ child }) => materialsOf(child).forEach(observe));
      if (part) {
        await render({ active: true, legacy: true });
        assert.ok(original());
        assert.equal(requests, 0);
        await render({ active: true });
      } else await move(89);
      assert.ok(requests > 0);
      assert.ok(original(), 'keep the original model while the GLB is pending');
      await act(async () => { ready = true; release(); });
      const mounted = scene.getObjectByName(model);
      assert.ok(mounted);
      assert.equal(original(), undefined);
      const materials = materialsOf(mounted);
      assert.ok(materials.size > 0);
      for (const material of materials) {
        assert.ok(!originals.has(material));
        assert.equal(counts.get(material), 0, 'mounted material was disposed during effect replay');
      }
      if (part) {
        await render({ active: false });
        assert.equal(scene.getObjectByName(model), mounted);
      } else if (entry.startsWith('attractions/')) {
        await move(108);
        assert.equal(scene.getObjectByName(model), mounted, 'retain inside the exit radius');
        await move(117);
        assert.ok(original());
        assert.equal(scene.getObjectByName(model), undefined);
      } else {
        await move(182);
        assert.equal(mounted.parent.visible, false);
        await move(85);
        assert.equal(scene.getObjectByName(model), mounted);
        assert.equal(mounted.parent.visible, true);
      }
      await act(async () => { root.render(null); });
      for (const material of materials) assert.equal(counts.get(material), 1, 'release each owned material once');
      for (const material of originals) assert.equal(counts.get(material), 0, 'preserve loader cache');
      if (part === 'Shell') {
        failure = Error('fixture asset unavailable');
        const warn = t.mock.method(console, 'warn', () => {});
        const error = t.mock.method(console, 'error', () => {});
        await render({ active: true });
        assert.ok(original(), 'an unreadable crate restores its original shell');
        assert.equal(scene.getObjectByName(model), undefined);
        assert.ok(warn.mock.calls.some(call => call.arguments.includes(failure)));
        warn.mock.restore();
        error.mock.restore();
      }
    } finally {
      await act(async () => { root.unmount(); });
      disposeWorldCraftGltf(gltf.scene);
    }
  });
}
