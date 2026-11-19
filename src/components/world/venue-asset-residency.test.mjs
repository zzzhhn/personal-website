import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { act, createElement as h, StrictMode, Suspense } from 'react';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera } from 'three';
import { compileWorldComponent } from '../../../tools/world/alpha-mine-tests/component-host.mjs';
import { readWorldCraftGltf, disposeWorldCraftGltf } from './world-craft-gltf-test.mjs';
import { useOwnedWorldVisual } from './useOwnedWorldVisual.ts';
import { CLUB, CLUB_DAYBEDS } from './djc-club-layout.ts';
import { IBD_YARD } from './attractions/attraction-layout.ts';
import * as lamps from './djc-pool-lantern-visual.ts';
import * as beds from './djc-daybed-visual.ts';
import * as umbrellas from './djc-umbrella-visual.ts';
import * as furniture from './djc-furniture-visual.ts';
import * as crates from './attractions/ibd-crate-visual.ts';
import * as equipment from './attractions/ibd-static-craft-visual.ts';

import * as bar from './djc-bar-layout.ts';
import * as fixedContacts from './club-fixed-contact.ts';
import * as daybedContacts from './club-daybed-contact.ts';
import * as barStools from './club-north-bar-contact.ts';
import * as barStructure from './club-north-bar-structure.ts';

const require = createRequire(import.meta.url);
const fiber = require('@react-three/fiber');
const physics = require('@react-three/rapier');
const rapier = createRequire(require.resolve('@react-three/rapier'))('@dimforge/rapier3d-compat');
await rapier.init();
fiber.extend({ BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D });
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
const contactRoots = {
  WorldDjcClubLanterns: ['djc-pool-lantern-contact', lamps.DJC_POOL_LANTERN_POSITIONS.length],
  WorldDjcClubDaybeds: ['djc-daybed-contact', CLUB_DAYBEDS.length],
  WorldDjcClubUmbrellas: ['djc-umbrella-contact', umbrellas.DJC_UMBRELLA_PLACEMENTS.length],
  WorldDjcClubFurniture: ['djc-furniture-contact', 5],
};

function mountedPhysics() {
  let current;
  function ReadWorld() { current = physics.useRapier(); return null; }
  return {
    wrap: child => h(Suspense, {fallback:null}, h(physics.Physics, {paused:true, colliders:false}, h(ReadWorld), child)),
    installed() {
      assert.ok(current, 'Rapier Physics provider mounted');
      const rows=[...current.colliderStates].flatMap(([handle, state]) => {
        const collider = current.world.getCollider(handle);
        return collider?.isValid() ? [[state.object.name, collider]] : [];
      });
      const installed=new Map(rows);
      assert.equal(installed.size,rows.length,'each live fixture collider has a unique name');
      return installed;
    },
  };
}

async function createScene(camera) {
  const root = fiber.createRoot({});
  const renderer = { render() {}, setSize() {}, setPixelRatio() {}, capabilities: { getMaxAnisotropy: () => 4 } };
  await root.configure({ gl: renderer, camera, frameloop: 'never', dpr: 1, size: { width: 320, height: 200, top: 0, left: 0 } });
  return root;
}

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
    const root = await createScene(camera);
    const local = entry.startsWith('attractions/') ? '../' : './';
    const contact = contactRoots[entry];
    const host = (contact || entry.endsWith('WorldIbdStaticCraft')) && mountedPhysics();
    let ready = false, release, requests = 0, failure;
    const pending = new Promise(resolve => { release = resolve; });
    const Component = compileWorldComponent(new URL('./' + entry + '.tsx', import.meta.url))({
      [visualImport]: visualModule,
      './useOwnedWorldVisual': { useOwnedWorldVisual },
      './ibd-static-craft-visual': equipment,
      './attraction-layout': { IBD_YARD },
      './djc-club-layout': { CLUB, CLUB_DAYBEDS },
      './club-fixed-contact': fixedContacts,
      './club-daybed-contact': daybedContacts,
      '@react-three/rapier': physics,
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
    const geometry = contact && new BoxGeometry(1, .5, .75);
    const fallback = geometry ? h('mesh', { name:'original-geometry', geometry, dispose:null }) : h('group', { name: 'original-geometry' });
    const uniform = { value: 0 };
    let store, elapsed = 0;
    const render = (props = {}) => act(async () => {
      const child = h(Component, { fallback, uniform, part, geometry:geometry ? [geometry] : undefined, active: false, legacy: false, ...props });
      store = root.render(h(StrictMode, null, host ? host.wrap(child) : child));
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
      const parent = contact ? scene.getObjectByName(contact[0]) : original().parent;
      parent.addEventListener('childadded', ({ child }) => materialsOf(child).forEach(observe));
      const checkContacts = (fallback) => {
        if (!contact) {
          if (host) assert.equal(host.installed().size > 0,!fallback);
          return;
        }
        const installed = host.installed(), names = [...installed.keys()];
        if (fallback) assert.deepEqual(names,[`${contact[0]}-fallback`]);
        else {
          assert.equal(names.length, contact[1]);
          assert.ok(names.every(name => name.startsWith(contact[0]+'-')&&!name.endsWith('-fallback')));
        }
        assert.ok([...installed.values()].every(collider => collider.shapeType() === rapier.ShapeType.TriMesh && collider.parent()?.isFixed()));
      };
      if (part) {
        await render({ active: true, legacy: true });
        assert.ok(original());
        assert.equal(requests, 0);
        await render({ active: true });
      } else await move(89);
      assert.ok(requests > 0);
      assert.ok(original(), 'keep the original model while the GLB is pending');
      checkContacts(true);
      await act(async () => { ready = true; release(); });
      const mounted = scene.getObjectByName(model);
      assert.ok(mounted);
      assert.equal(original(), undefined);
      checkContacts(false);
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
        checkContacts(true);
      } else {
        await move(182);
        assert.equal(mounted.parent.visible, false);
        checkContacts(false);
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
      geometry?.dispose();
      disposeWorldCraftGltf(gltf.scene);
    }
  });
}

test('the Club bar keeps the far model and both fixed bodies during a suspended near-model transition', async () => {
  const { DJC_BAR_ORIGIN: origin, DJC_BAR_ASSETS: urls } = bar;
  const packs = new Map();
  for (const url of Object.values(urls)) {
    const gltf = await readWorldCraftGltf(['public' + url]);
    assert.ok(gltf, url);
    packs.set(url, gltf);
  }
  const camera = new PerspectiveCamera(50, 1.8, .1, 600);
  camera.position.set(origin[0] + 220, origin[1], origin[2]);
  camera.lookAt(...origin);
  const root = await createScene(camera);
  const host = mountedPhysics();
  let elapsed = 0, store, release, nearReady = false, environments = 0;
  const pending = new Promise(resolve => { release = resolve; });
  const requests = new Set();
  const disposed = new WeakMap();
  function observe(resource) {
    if (disposed.has(resource)) return;
    disposed.set(resource, 0);
    resource.addEventListener('dispose', () => disposed.set(resource, disposed.get(resource) + 1));
  }
  const Bar = compileWorldComponent(new URL('./WorldDjcClubBar.tsx', import.meta.url), {lowerDynamicImports:true})({
    './djc-bar-layout': { ...bar, buildDjcBarProxy(omitStools) {
      const proxy = bar.buildDjcBarProxy(omitStools);
      observe(proxy.roof);
      return proxy;
    } },
    './useOwnedWorldVisual': { useOwnedWorldVisual },
    './WorldAssetDecoder': { withWorldAssetDecoder() {} },
    './WorldNight': { night: { value: 0 } },
    './WorldDjcFurnitureEnvironment': { useDjcFurnitureEnvironment() { environments++; return null; } },
    './club-north-bar-contact': barStools,
    './club-north-bar-structure': barStructure,
    '@react-three/rapier': physics,
    '@react-three/fiber': { ...fiber, useLoader(_loader, url) {
      requests.add(url);
      if (url === urls.near && !nearReady) throw pending;
      return packs.get(url);
    } },
  }).default;
  const move = distance => act(async () => {
    camera.position.set(origin[0] + distance, origin[1], origin[2]);
    store.getState().advance(++elapsed, false);
  });
  const contacts = fallback => {
    const installed=host.installed();
    const expected=['surface','solid'].map(kind=>barStools.djcBarStructureSupply(kind,fallback))
      .concat(bar.DJC_BAR_STOOLS.map((_,i)=>barStools.djcBarStoolSupply(i)));
    assert.deepEqual([...installed.keys()].sort(),expected.sort());
    assert.ok([...installed.values()].every(collider=>collider.shapeType()===rapier.ShapeType.TriMesh&&collider.parent()?.isFixed()));
    return Object.fromEntries([...installed].map(([name,collider])=>[name,collider.handle]));
  };
  const stools = contacts => Object.entries(contacts).filter(([name])=>name.startsWith('djc-bar-stool'));
  try {
    await act(async () => { store = root.render(null); });
    await act(async () => { root.render(h(StrictMode, null, host.wrap(h(Bar)))); });
    const scene = store.getState().scene;
    const visual = scene.getObjectByName('djc-north-bar-visual');
    const fallbackContacts = contacts(true);
    const fallback = visual.getObjectByName('djc-north-bar-fallback');
    assert.ok(fallback);
    const roof = fallback.children.find(mesh => disposed.has(mesh.geometry)).geometry;
    assert.equal(disposed.get(roof), 0, 'the mounted fallback roof must survive effect replay');
    assert.equal(environments, 0);
    await move(91);
    assert.equal(requests.size, 0);
    visual.addEventListener('childadded', ({ child }) => materialsOf(child).forEach(observe));
    const art = () => visual.children.filter(child=>child.name===packs.get(urls.far).scene.name);
    await move(90);
    const [far] = art();
    assert.ok(far);
    assert.equal(visual.getObjectByName(fallback.name),undefined);
    const farContacts=contacts(false);
    assert.deepEqual(stools(farContacts),stools(fallbackContacts));
    assert.deepEqual([...requests], [urls.far]);
    for (const m of materialsOf(far)) assert.equal(disposed.get(m), 0);
    await move(25);
    assert.deepEqual([...requests], [urls.far, urls.near]);
    assert.deepEqual(art(),[far]);
    assert.equal(far.visible, true);
    assert.deepEqual(contacts(false),farContacts);
    await act(async () => { nearReady = true; release(); });
    const [near] = art();
    assert.notEqual(near, far);
    assert.deepEqual(art(),[near]);
    assert.deepEqual(contacts(false),farContacts);
    for (const m of materialsOf(far)) assert.equal(disposed.get(m), 1);
    for (const m of materialsOf(near)) assert.equal(disposed.get(m), 0);
    await move(29);
    assert.deepEqual(art(),[near]);
    await move(31);
    assert.notEqual(art()[0], near);
    assert.deepEqual(contacts(false),farContacts);
    for (const m of materialsOf(near)) assert.equal(disposed.get(m), 1);
    await move(200);
    assert.equal(visual.visible, false);
    assert.deepEqual(contacts(false),farContacts);
    await act(async () => { root.render(null); });
    assert.equal(disposed.get(roof), 1);
  } finally {
    await act(async () => { root.unmount(); });
    for (const gltf of packs.values()) disposeWorldCraftGltf(gltf.scene);
  }
});
