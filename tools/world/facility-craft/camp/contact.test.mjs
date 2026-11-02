import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const root = new URL('../../../../', import.meta.url);
const source = fs.readFileSync(new URL('src/components/world/camp-suitcase-contact.ts', root), 'utf8');
const pure = vm.createContext({ ...THREE });
vm.runInContext(ts.transpileModule(source.replace(/^import .*\n/, '').replaceAll(/^export /gm, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, pure);
const bytes = execFileSync('git', ['show', 'HEAD:public/assets/world/facility-craft/camp/camp-facilities-v1.glb'], { cwd: root, maxBuffer: 4 * 1024 * 1024 });
const pack = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const candidate = () => pack.scene.getObjectByName('C15').clone(true);
const pose = (x = 0, y = 4.9, z = 0, angle = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, angle)), new THREE.Vector3(1, 1, 1));
function paving(width = 3, depth = 2.4, yaw = 0) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 1);
  mesh.name = 'camp-C02-flagstones';
  mesh.setMatrixAt(0, new THREE.Matrix4().compose(new THREE.Vector3(0, 4.865, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(width, .07, depth)));
  return mesh;
}
function fixture(pad = paving(), wheels = pure.suitcaseContactWheels(candidate())) {
  const cache = pure.suitcaseContactSupport(pad), records = [];
  let queries = 0;
  const model = pure.createSuitcaseContactModel(wheels, { heightAt(x, z) { queries++; return cache.heightAt(x, z); } }, (change, positions, strengths, visible) => records.push({ change, positions: [...positions], strengths: [...strengths], visible }));
  return { model, records, get queries() { return queries; } };
}

test('actual C15 yields exactly four low tire shells, using real vertices without altering loader resources', () => {
  const root = candidate(), before = [];
  root.traverse(mesh => { if (mesh.isMesh) before.push([mesh.geometry, mesh.geometry.getAttribute('position').array.slice(), mesh.material]); });
  const wheels = pure.suitcaseContactWheels(root);
  assert.equal(wheels.length, 4);
  for (const wheel of wheels) {
    assert.equal(wheel.vertices.length / 3, 120, 'welded real tire vertices, not box corners');
    assert.ok(wheel.radiusX < .04 && wheel.radiusZ < .02);
  }
  for (const [geometry, values, material] of before) { assert.deepEqual(geometry.getAttribute('position').array, values); assert.ok(material); }
  assert.equal(pure.suitcaseContactWheels(new THREE.Group()).length, 0);
});

test('support cache respects actual rotated instance triangles and finite edges, not a height plane or bounding box', () => {
  const pad = paving(2, 2, Math.PI / 4), support = pure.suitcaseContactSupport(pad);
  assert.ok(Math.abs(support.heightAt(0, 0) - 4.9) < 1e-6);
  assert.equal(support.heightAt(1.3, 1.3), null, 'inside world AABB but outside the rotated tile');
  assert.equal(support.heightAt(3, 0), null);
  pad.position.x = 100; pad.updateMatrixWorld();
  assert.ok(support.heightAt(0, 0) !== null, 'support is a mount-time cache of the fixed paving');
});

test('real-wheel patches follow translation and vanish off paving, below it, or when tipped over', () => {
  const f = fixture(); f.model.update(pose(), 1);
  assert.equal(f.records.at(-1).visible, true); assert.ok(f.records.at(-1).strengths.every(value => value > .99));
  const initial = f.records.at(-1).positions;
  f.model.update(pose(.3), 1);
  assert.ok(Math.abs(f.records.at(-1).positions[0] - initial[0] - .3) < 1e-6);
  f.model.update(pose(4), 1); assert.equal(f.records.at(-1).visible, false);
  f.model.update(pose(), 1); f.model.update(pose(0, 4.85), 1); assert.equal(f.records.at(-1).visible, false, 'no projection up through the paving');
  f.model.update(pose(), 1); f.model.update(pose(0, 4.9, 0, Math.PI / 2), 1); assert.equal(f.records.at(-1).visible, false);
});

test('support boundaries reject patch corners beyond geometry even with a supported wheel centre', () => {
  const wheel = { vertices: new Float64Array([0, 0, 0, 0, .03, 0]), radiusX: .04, radiusZ: .02 };
  const f = fixture(paving(2, 2), [wheel, wheel, wheel, wheel]);
  f.model.update(pose(.94), 1); assert.equal(f.records.at(-1).visible, true);
  f.model.update(pose(.98), 1); assert.equal(f.records.at(-1).visible, false);
  const empty = fixture(new THREE.Group()); empty.model.update(pose(), 1); assert.equal(empty.records.length, 0);
});

test('tilted wheel contact uses the transformed shell minimum rather than its original bottom point', () => {
  const wheel = { vertices: new Float64Array([-.1, 0, 0, .1, 0, 0, 0, .1, 0]), radiusX: .02, radiusZ: .02 };
  const f = fixture(paving(), [wheel, wheel, wheel, wheel]), angle = .1;
  f.model.update(pose(0, 4.9 + .1 * Math.sin(angle), 0, angle), 1);
  const patch = f.records.at(-1); assert.equal(patch.visible, true); assert.ok(patch.strengths.every(value => value > .99));
  const centreX = (patch.positions[0] + patch.positions[3] + patch.positions[6] + patch.positions[9]) / 4;
  assert.ok(Math.abs(centreX + .1 * Math.cos(angle)) < 1e-6, 'shadow follows the lowest transformed tire vertex');
});

test('visible feedback lift attenuates by real support distance; fade alone performs no new support query', () => {
  const f = fixture(); f.model.update(pose(), 1);
  const full = f.records.at(-1).strengths[0];
  f.model.update(pose(0, 4.915), 1); const lifted = f.records.at(-1).strengths[0]; assert.ok(lifted > 0 && lifted < full);
  const queries = f.queries; f.model.update(pose(0, 4.915), .25);
  assert.equal(f.queries, queries); assert.ok(Math.abs(f.records.at(-1).strengths[0] - lifted * .25) < 1e-7);
  assert.equal(f.records.at(-1).change, 'fade');
  f.model.update(pose(0, 4.95), 1); assert.equal(f.records.at(-1).visible, false);
  f.model.update(pose(), 1); assert.equal(f.records.at(-1).visible, true, 'home reset restores contact');
  f.model.update(pose(), 0); assert.equal(f.records.at(-1).visible, false);
  f.model.update(pose(), 1, false); assert.equal(f.records.at(-1).visible, false);
  const hiddenFirst = fixture(); hiddenFirst.model.update(pose(), 0); hiddenFirst.model.update(pose(), 1);
  assert.equal(hiddenFirst.records.at(-1).change, 'pose', 'first visible frame must upload geometry after an initially invisible fade');
});

test('300 unchanged normal frames cause zero support queries and zero uploads; disposal stays inert', () => {
  const f = fixture(); f.model.update(pose(), 1); const queries = f.queries, uploads = f.records.length;
  for (let frame = 0; frame < 300; frame++) f.model.update(pose(), 1);
  assert.equal(f.queries, queries); assert.equal(f.records.length, uploads);
  f.model.dispose(); assert.equal(f.records.at(-1).visible, false);
  const after = f.records.length; f.model.update(pose(.3), 1); assert.equal(f.queries, queries); assert.equal(f.records.length, after);
});

test('craft registration ignores stale unmounts and fallback has no current contact root', () => {
  const slot = pure.createSuitcaseContactSlot(), a = new THREE.Group(), b = new THREE.Group();
  const releaseA = slot.register(a), releaseB = slot.register(b);
  releaseA(); assert.equal(slot.root, b); releaseB(); assert.equal(slot.root, null);
  const releaseReplay = slot.register(b); releaseReplay(); const finalCleanup = slot.register(b);
  assert.equal(slot.root, b); finalCleanup(); assert.equal(slot.root, null);
});

test('actual craft ready effect registers only mounted C15 candidates and releases the matching generation', () => {
  const adapter = fs.readFileSync(new URL('src/components/world/WorldCampFacilityCraft.tsx', root), 'utf8');
  const component = adapter.slice(adapter.indexOf('function CraftVisual'), adapter.indexOf('\nclass CraftBoundary'));
  const slot = pure.createSuitcaseContactSlot(), effects = [], a = candidate(), b = candidate(); let ready = a;
  const hooks = vm.createContext({
    GLTFLoader: null, CAMP_FACILITY_URL: '', CampSuitcaseContactContext: null, night: { value: 0 },
    useLoader: () => ({}), useDjcFurnitureEnvironment: () => null, useMemo: create => create(),
    useContext: () => slot.register, useLayoutEffect: effect => effects.push(effect), useEffect: () => {}, useFrame: () => {},
    createCampFacilityVisual: () => ({ root: ready }), React: { createElement: () => {} },
  });
  vm.runInContext(ts.transpileModule(component, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText, hooks);
  assert.equal(slot.root, null, 'fallback/loading creates no candidate registration');
  hooks.CraftVisual({ family: 'C15' }); const cleanupA = effects[0](); assert.equal(slot.root, a);
  ready = b; hooks.CraftVisual({ family: 'C15' }); const cleanupB = effects[1]();
  cleanupA(); assert.equal(slot.root, b); cleanupB(); assert.equal(slot.root, null);
  hooks.CraftVisual({ family: 'C12' }); assert.equal(effects[2](), undefined); assert.equal(slot.root, null);
});

test('mounted component owns just one eight-triangle mesh and cleans up without disposing the pack', () => {
  const component = fs.readFileSync(new URL('src/components/world/WorldCampSuitcaseContact.tsx', root), 'utf8');
  const scene = new THREE.Scene(), pad = paving(), visual = candidate(), slot = pure.createSuitcaseContactSlot();
  visual.position.y = 4.9; scene.add(pad, visual);
  const effects = [], microtasks = []; let mesh;
  const hooks = vm.createContext({ ...THREE,
    createContext: () => ({}), useMemo: create => create(), useThree: selector => selector({ scene }), useLayoutEffect: effect => effects.push(effect),
    createSuitcaseContactModel: pure.createSuitcaseContactModel, suitcaseContactSupport: pure.suitcaseContactSupport, suitcaseContactWheels: pure.suitcaseContactWheels,
    queueMicrotask: callback => microtasks.push(callback), React: { createElement: (_tag, props) => { mesh = props.object; } }, slot,
  });
  vm.runInContext(ts.transpileModule(component.replaceAll(/^import .*\n/gm, '').replaceAll(/^export default /gm, '').replaceAll(/^export /gm, '') + '\nWorldCampSuitcaseContact({slot});', { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText, hooks);
  const firstCleanup = effects[0](), release = slot.register(visual); slot.update();
  assert.equal(mesh.visible, true); assert.equal(mesh.geometry.index.count / 3, 8); assert.equal(mesh.castShadow, false); assert.equal(mesh.receiveShadow, false);
  assert.equal(mesh.material.depthWrite, false); assert.equal(mesh.material.uniforms.map, undefined);
  const rays = new THREE.Raycaster(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -1, 0));
  assert.deepEqual(rays.intersectObject(mesh), [], 'contact shading cannot intercept exploration rays');
  const position = mesh.geometry.getAttribute('position'), strength = mesh.geometry.getAttribute('strength'), versions = [position.version, strength.version];
  for (let frame = 0; frame < 300; frame++) slot.update();
  assert.deepEqual([position.version, strength.version], versions, 'steady actual component does not mark buffers for upload');
  visual.position.y += .05; slot.update(); assert.equal(mesh.visible, false, 'actual visual feedback transform is used');
  visual.position.y -= .05; slot.update(); assert.equal(mesh.visible, true);
  release(); slot.update(); assert.equal(mesh.visible, false, 'unmount/fallback hides old candidate contact');
  let geometryDisposals = 0, materialDisposals = 0, borrowedDisposals = 0;
  mesh.geometry.addEventListener('dispose', () => geometryDisposals++); mesh.material.addEventListener('dispose', () => materialDisposals++);
  visual.traverse(object => { if (object.isMesh) object.geometry.addEventListener('dispose', () => borrowedDisposals++); });
  firstCleanup(); const finalCleanup = effects[0](); microtasks.splice(0).forEach(callback => callback());
  assert.equal(geometryDisposals, 0); assert.equal(materialDisposals, 0);
  finalCleanup(); microtasks.splice(0).forEach(callback => callback());
  assert.equal(slot.update, null); assert.equal(geometryDisposals, 1); assert.equal(materialDisposals, 1); assert.equal(borrowedDisposals, 0);
});

test('new component/helper pass strict semantic checking', () => {
  const files = ['camp-suitcase-contact.ts', 'WorldCampSuitcaseContact.tsx'].map(name => new URL(`src/components/world/${name}`, root).pathname);
  const program = ts.createProgram(files, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX, strict: true, noEmit: true, skipLibCheck: true });
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')), []);
});
