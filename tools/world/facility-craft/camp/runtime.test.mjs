import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { BoxGeometry, DoubleSide, FrontSide, Group, Mesh, MeshStandardMaterial, Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import '../../alpha-mine-tests/register.mjs';

const root = new URL('../../../../', import.meta.url);
const adapter = fs.readFileSync(new URL('src/components/world/WorldCampFacilityCraft.tsx', root), 'utf8');
const { createCampFacilityVisual, updateCampFacilityNight, campFacilityLegacy } = await import('../../../../src/components/world/WorldCampFacilityCraft.tsx');
const { bindCampPushableVisual } = await import('../../../../src/components/world/WorldCampPushableVisual.ts');
const context = { create: createCampFacilityVisual, bind: bindCampPushableVisual, updateNight: updateCampFacilityNight };

let packPromise;
function loadPack() {
  if (!packPromise) {
    const path = 'public/assets/world/facility-craft/camp/camp-facilities-v1.glb';
    // The release checkout may keep binary assets sparse. Read the exact current tracked pack.
    const bytes = fs.existsSync(new URL(path, root)) ? fs.readFileSync(new URL(path, root)) :
      execFileSync('git', ['show', `HEAD:${path}`], { cwd: root, maxBuffer: 4 * 1024 * 1024 });
    packPromise = new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  }
  return packPromise;
}

function countWrites(object, key) {
  let value = object[key], writes = 0;
  Object.defineProperty(object, key, { configurable: true, get: () => value, set: next => { value = next; writes++; } });
  return () => writes;
}

test('pushable registers late deep Suspense swaps at the current fade and restores native surface flags', () => {
  const root = new Group(), nested = new Group(); root.add(nested);
  const source = new MeshStandardMaterial(), own = source.clone(), fallback = new Mesh(new BoxGeometry(), source);
  fallback.name = 'camp-content-C12-strings'; nested.add(fallback);
  const binding = context.bind(root, own);
  assert.equal(fallback.material, own); assert.equal(binding.strings, fallback);
  binding.setFade(.4); assert.equal(own.opacity, .4); assert.equal(source.opacity, 1);
  const native = new MeshStandardMaterial({ transparent: true, opacity: .25, depthWrite: false });
  const craft = new Group(), a = new Mesh(fallback.geometry, native), b = new Mesh(fallback.geometry, native);
  a.userData.facilityCraft = b.userData.facilityCraft = true; craft.add(a, b);
  nested.remove(fallback); nested.add(craft);
  assert.equal(fallback.material, source); assert.equal(binding.strings, undefined);
  assert.equal(a.material, native); assert.equal(native.opacity, .1); assert.equal(native.transparent, true);
  binding.setFade(1); assert.equal(native.opacity, .25); assert.equal(native.transparent, true); assert.equal(native.depthWrite, false);
  binding.setFade(.2); craft.remove(a); assert.equal(native.opacity, .05, 'shared material remains faded until its last mesh leaves');
  craft.remove(b); assert.equal(native.opacity, .25);
  const writes = countWrites(native, 'opacity'); binding.setFade(.3); assert.equal(writes(), 0, 'detached materials are not retained');
  nested.add(fallback); assert.equal(fallback.material, own); assert.equal(own.opacity, .3, 'late error fallback inherits the current fade too');
  assert.equal(binding.strings, fallback);
  binding.setFade(1); assert.equal(own.transparent, false); assert.equal(own.depthWrite, true);
  binding.dispose();
});

test('steady pushables do no tree search or opacity writes; effect replay releases registrations without disposing shared assets', () => {
  const root = new Group(), material = new MeshStandardMaterial(), original = new MeshStandardMaterial();
  const mesh = new Mesh(new BoxGeometry(), original); root.add(mesh);
  let disposed = 0; original.addEventListener('dispose', () => disposed++); mesh.geometry.addEventListener('dispose', () => disposed++);
  let binding = context.bind(root, material);
  const opacityWrites = countWrites(material, 'opacity');
  let childReads = 0; const children = root.children;
  Object.defineProperty(root, 'children', { get: () => { childReads++; return children; } });
  root.traverse = root.getObjectByName = () => { throw new Error('steady tree search'); };
  for (let frame = 0; frame < 300; frame++) { binding.setFade(1); assert.equal(binding.strings, undefined); }
  assert.equal(opacityWrites(), 0); assert.equal(childReads, 0);
  binding.setFade(.5); assert.equal(opacityWrites(), 1); assert.equal(material.transparent, true); assert.equal(material.depthWrite, false);
  binding.setFade(.5); assert.equal(opacityWrites(), 1);
  binding.dispose(); assert.equal(mesh.material, original); assert.equal(material.opacity, 1);
  binding = context.bind(root, material); binding.setFade(.5); binding.setFade(1);
  assert.equal(material.opacity, 1); assert.equal(material.transparent, false); assert.equal(material.depthWrite, true);
  binding.dispose();
  const late = new Mesh(mesh.geometry, original); root.add(late); assert.equal(late.material, original, 'disposed listeners do not adopt new children');
  assert.equal(disposed, 0);
});

test('craft effect replay defers owned-material disposal and never releases loader geometry', () => {
  const source = new Group(), family = new Group(), geometry = new BoxGeometry(), original = new MeshStandardMaterial();
  family.name = 'C12'; family.add(new Mesh(geometry, original)); source.add(family);
  const effects = [], microtasks = []; let primitive;
  const hooks = vm.createContext({
    GLTFLoader: null, CAMP_FACILITY_URL: '', night: { value: 0 },
    useLoader: () => ({ scene: source }), useDjcFurnitureEnvironment: () => null,
    useMemo: create => create(), useEffect: effect => effects.push(effect), useFrame: () => {},
    useContext: () => null, useLayoutEffect: () => {}, CampSuitcaseContactContext: null,
    createCampFacilityVisual: context.create, updateCampFacilityNight: context.updateNight,
    queueMicrotask: callback => microtasks.push(callback), React: { createElement: (_tag, props) => { primitive = props.object; } },
  });
  const component = adapter.slice(adapter.indexOf('function CraftVisual'), adapter.indexOf('\nclass CraftBoundary'));
  vm.runInContext(ts.transpileModule(`${component}\nCraftVisual({ family: 'C12' });`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText, hooks);
  let ownedDisposals = 0, borrowedDisposals = 0;
  primitive.children[0].material.addEventListener('dispose', () => ownedDisposals++);
  original.addEventListener('dispose', () => borrowedDisposals++); geometry.addEventListener('dispose', () => borrowedDisposals++);
  const firstCleanup = effects[0](); firstCleanup();
  const finalCleanup = effects[0](); microtasks.splice(0).forEach(callback => callback());
  assert.equal(ownedDisposals, 0, 'StrictMode replay keeps mounted copies alive');
  finalCleanup(); microtasks.splice(0).forEach(callback => callback());
  assert.equal(ownedDisposals, 1); assert.equal(borrowedDisposals, 0);
});

test('night lighting only writes when the clamped amount changes', () => {
  const wick = new MeshStandardMaterial(); wick.name = 'camp_craft_wick';
  const visual = { materials: [wick], nightAmount: NaN };
  const environmentWrites = countWrites(wick, 'envMapIntensity'), emissionWrites = countWrites(wick, 'emissiveIntensity');
  context.updateNight(visual, 0);
  for (let frame = 0; frame < 300; frame++) context.updateNight(visual, 0);
  assert.equal(environmentWrites(), 1); assert.equal(emissionWrites(), 1);
  context.updateNight(visual, .5); assert.equal(wick.envMapIntensity, 1); assert.equal(wick.emissiveIntensity, 1.17);
  context.updateNight(visual, 2); context.updateNight(visual, 3); assert.equal(environmentWrites(), 3);
});

test('actual pack keeps main surfaces double-sided and casting while strings, glass and wick stop casting', async () => {
  const { scene } = await loadPack();
  const sourceStates = new Map();
  scene.traverse(object => { if (object.isMesh) sourceStates.set(object, { material: object.material, side: object.material.side, castShadow: object.castShadow, opacity: object.material.opacity }); });
  let nonCasters = 0, frontSurfaces = 0, mainSurfaces = 0;
  for (const family of ['C12', 'C13', 'C14', 'C15', 'C16']) {
    const visual = context.create(scene, family, undefined, null);
    visual.root.traverse(mesh => {
      if (!mesh.isMesh) return;
      const expectedNonCaster = mesh.name === 'camp-content-C12-strings' || ['camp_craft_glass', 'camp_craft_wick'].includes(mesh.material.name);
      assert.equal(mesh.castShadow, !expectedNonCaster, mesh.name); assert.equal(mesh.receiveShadow, true);
      if (expectedNonCaster) nonCasters++;
      if (['camp_craft_paper', 'camp_craft_brass'].includes(mesh.material.name)) { assert.equal(mesh.material.side, FrontSide); frontSurfaces++; }
      else { assert.equal(mesh.material.side, DoubleSide, mesh.name); mainSurfaces++; }
    });
    visual.materials.forEach(material => material.dispose());
  }
  assert.equal(nonCasters, 3); assert.equal(frontSurfaces, 5); assert.equal(mainSurfaces, 26);
  for (const [mesh, before] of sourceStates) {
    assert.equal(mesh.material, before.material); assert.equal(mesh.material.side, before.side);
    assert.equal(mesh.castShadow, before.castShadow); assert.equal(mesh.material.opacity, before.opacity);
  }
});

test('every paper/brass shell selected for FrontSide is closed, consistently wound and outward in the actual GLB', async () => {
  const { scene } = await loadPack();
  let primitives = 0, shells = 0;
  scene.traverse(mesh => {
    if (!mesh.isMesh || !['camp_craft_paper', 'camp_craft_brass'].includes(mesh.material.name)) return;
    primitives++;
    const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
    const parents = new Map(), edges = new Map(), triangles = [];
    const key = xyz => xyz.map(value => value.toFixed(7)).join(',');
    const find = vertex => {
      if (!parents.has(vertex)) parents.set(vertex, vertex);
      if (parents.get(vertex) !== vertex) parents.set(vertex, find(parents.get(vertex)));
      return parents.get(vertex);
    };
    for (let i = 0; i < index.count; i += 3) {
      const xyz = [0, 1, 2].map(offset => { const j = index.getX(i + offset); return [position.getX(j), position.getY(j), position.getZ(j)]; });
      const vertices = xyz.map(key); assert.equal(new Set(vertices).size, 3, `${mesh.name}: degenerate face`);
      triangles.push({ xyz, vertices });
      parents.set(find(vertices[1]), find(vertices[0])); parents.set(find(vertices[2]), find(vertices[0]));
      for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
        const edgeKey = [vertices[a], vertices[b]].sort().join('|');
        const edge = edges.get(edgeKey) ?? { count: 0, winding: 0 };
        edge.count++; edge.winding += vertices[a] < vertices[b] ? 1 : -1; edges.set(edgeKey, edge);
      }
    }
    for (const edge of edges.values()) { assert.equal(edge.count, 2, `${mesh.name}: open/nonmanifold edge`); assert.equal(edge.winding, 0, `${mesh.name}: inconsistent winding`); }
    const volume = new Map();
    for (const { xyz: [a, b, c], vertices } of triangles) {
      const shell = find(vertices[0]);
      const v = (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
      volume.set(shell, (volume.get(shell) ?? 0) + v);
    }
    for (const value of volume.values()) assert.ok(value > 0, `${mesh.name}: inward or zero-volume shell`);
    shells += volume.size;
  });
  assert.equal(primitives, 5); assert.equal(shells, 141);
});

test('PBR copies preserve exported physical classes while borrowing loader geometry/images', () => {
  const scene = new Group(), guitar = new Group(), strings = new Group();
  guitar.name = 'C12'; strings.name = 'C12_strings';
  const geometry = new BoxGeometry(), map = new Texture(), environment = new Texture();
  const wood = new MeshStandardMaterial({ roughness: .60, metalness: 0, map });
  const metal = new MeshStandardMaterial({ roughness: .30, metalness: .82 });
  guitar.add(new Mesh(geometry, wood), new Mesh(geometry, wood));
  strings.add(new Mesh(geometry, metal)); guitar.add(strings); scene.add(guitar);
  const visual = context.create(scene, 'C12', undefined, environment);
  assert.equal(visual.materials.length, 2);
  const meshes=[]; visual.root.traverse(o => { if (o.isMesh) meshes.push(o); });
  assert.equal(meshes[0].geometry, geometry);
  assert.equal(meshes[0].material, meshes[1].material);
  assert.notEqual(meshes[0].material, wood);
  assert.equal(meshes[0].material.map, map);
  assert.equal(meshes[0].material.envMap, environment);
  assert.equal(meshes[2].material.metalness, .82);
  assert.equal(meshes[2].material.roughness, .30);
  assert.ok(meshes.every(mesh => mesh.userData.facilityCraft));
  assert.ok(visual.root.getObjectByName('camp-content-C12-strings'));
  assert.equal(guitar.getObjectByName('C12_strings'), strings);
  visual.materials.forEach(material => material.dispose()); geometry.dispose(); wood.dispose(); metal.dispose(); map.dispose(); environment.dispose();
});

test('articulated subtree keeps geometry local and removes the already applied wok pivot once', () => {
  const scene=new Group(), family=new Group(), wok=new Group();
  family.name='C14'; wok.name='C14_wok'; wok.position.set(.0276710987,.3179999888,-.0723563731);
  wok.add(new Mesh(new BoxGeometry(),new MeshStandardMaterial())); family.add(wok); scene.add(family);
  const visual=context.create(scene,'C14','C14_wok',null);
  assert.deepEqual(visual.root.position.toArray(),[0,0,0]);
  assert.equal(wok.position.y,.3179999888);
  assert.throws(() => context.create(scene,'C15',undefined,null),/missing C15/);
});

test('legacy query bypasses candidate independent of qa flag', () => {
  assert.equal(campFacilityLegacy('?facilityCraft=legacy'),true);
  assert.equal(campFacilityLegacy('?qa=1&facilityCraft=legacy'),true);
  assert.equal(campFacilityLegacy('?qa=1'),false);
});

test('real craft pack exposes independent stove, wok and lantern material ownership', async () => {
  const { scene } = await loadPack();
  const stove = createCampFacilityVisual(scene,'C14','C14_stove',null);
  const wok = createCampFacilityVisual(scene,'C14','C14_wok',null);
  const lantern = createCampFacilityVisual(scene,'C16',undefined,null);
  const names = visual => {
    const result = [];
    visual.root.traverse(object => { if (object.isMesh) result.push(object.name); });
    return result;
  };
  try {
    assert.equal(names(stove).length,4);
    assert.ok(names(stove).every(name=>name.startsWith('C14_stove')));
    assert.equal(names(wok).length,3);
    assert.ok(names(wok).every(name=>name.startsWith('C14_wok')));
    assert.ok(names(lantern).some(name=>name.startsWith('C16_frame')));
    assert.ok(names(lantern).some(name=>name.startsWith('C16_glass')));
    assert.ok(names(lantern).some(name=>name.startsWith('C16_wick')));
    const wick = lantern.materials.find(material=>material.name==='camp_craft_wick');
    const glass = lantern.materials.find(material=>material.name==='camp_craft_glass');
    assert.ok(wick && glass?.transparent);
    updateCampFacilityNight(lantern,1);
    assert.ok(wick.emissiveIntensity>2);
    assert.ok(stove.materials.every(material=>material.name!=='camp_craft_wick'));
    assert.ok(wok.materials.every(material=>material.name!=='camp_craft_wick'));
  } finally {
    for (const visual of [stove,wok,lantern]) visual.materials.forEach(material=>material.dispose());
  }
});
