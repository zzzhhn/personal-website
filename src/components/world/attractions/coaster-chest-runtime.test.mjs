import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { jsx as reactJsx, jsxs as reactJsxs, Fragment } from 'react/jsx-runtime';
import { Matrix4, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { createCoasterChestRuntime, CHEST_OPEN_LID } from './coaster-chest-runtime.ts';
import { readWorldCraftGltf, disposeWorldCraftGltf } from '../world-craft-gltf-test.mjs';

const gltf = await readWorldCraftGltf(['docs/world/phase-2-playground/coaster-chest-transfer-20261104/coaster-chest.glb']);
assert.ok(gltf, 'approved GLB must exist; never skip this audit');
const source = gltf.scene;
source.updateMatrixWorld(true);
const sourceMeshes = [];
source.traverse(o => { if (o instanceof Mesh) sourceMeshes.push(o); });
const digest = array => createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
const snapshot = () => sourceMeshes.map(m => ({
  geometry: Object.fromEntries(Object.entries(m.geometry.attributes).map(([key, a]) => [key, digest(a.array)])),
  index: digest(m.geometry.index.array), matrix: m.matrix.toArray(),
  parent: m.parent.uuid, material: m.material.toJSON(),
}));
const before = snapshot();
const collect = root => { const a = []; root.traverse(o => { if (o instanceof Mesh) a.push(o); }); return a; };
const near = (a, b, eps = 1e-6) => {
  assert.equal(a.length, b.length);
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < eps, `coordinate ${i}: ${v} vs ${b[i]}`));
};
const parentOf = mesh => mesh.name.startsWith('ChestLamps-') ? 'lamp' : mesh.name.startsWith('ChestShackles-') ? 'shackle' : '';

test('approved file identity, exact shell geometry, complete PBR channels and separate hinge root survive', () => {
  const bytes = readFileSync(new URL('../../../../docs/world/phase-2-playground/coaster-chest-transfer-20261104/coaster-chest.glb', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '0e4483bcee6ba2fe63848691c81b24d5fb1091f5415e26272c5cc3c22a2f7382');
  const pack = createCoasterChestRuntime(source);
  try {
    assert.equal(pack.materials.length, 8);
    for (const name of ['ChestBody', 'ChestLid']) {
      const input = source.getObjectByName(name), output = pack.root.getObjectByName(name);
      near(input.position.toArray(), output.position.toArray());
      const oldMeshes = collect(input), newMeshes = collect(output).filter(m => m.receiveShadow);
      assert.equal(oldMeshes.length, newMeshes.length);
      oldMeshes.forEach((old, i) => {
        assert.equal(newMeshes[i].geometry, old.geometry, 'shell channels are borrowed, never rebuilt');
        near(new Matrix4().multiplyMatrices(input.matrixWorld.clone().invert(), old.matrixWorld).elements, newMeshes[i].matrix.elements);
        assert.notEqual(newMeshes[i].material, old.material);
        for (const key of ['color', 'emissive', 'roughness', 'metalness', 'clearcoat', 'clearcoatRoughness',
          'side', 'shadowSide', 'transparent', 'opacity', 'alphaTest', 'map', 'roughnessMap', 'metalnessMap',
          'normalMap', 'aoMap', 'clearcoatMap', 'clearcoatRoughnessMap']) {
          const a = newMeshes[i].material[key], b = old.material[key];
          if (a?.isColor) near(a.toArray(), b.toArray()); else assert.equal(a, b, key);
        }
      });
    }
    assert.equal(pack.lid.userData.shadowDynamic, true, 'opening lid must not enter immutable shadow chunks');
    assert.equal(CHEST_OPEN_LID, -1.3);
    for (const angle of [0, -.32, -.85, -1.3]) {
      pack.lid.rotation.x = angle; pack.root.updateMatrixWorld(true);
      const expected = source.getObjectByName('ChestLid').matrix.clone().multiply(new Matrix4().makeRotationX(angle));
      near(pack.lid.matrixWorld.elements, expected.elements);
    }
  } finally { pack.dispose(); }
});

test('merged lamp vertices, normals and UV retain every approved primitive in the same order', () => {
  const pack = createCoasterChestRuntime(source);
  const lamps = collect(pack.root).filter(m => parentOf(m) === 'lamp');
  try {
    const ids = [...Array.from({ length: 6 }, (_, i) => `LockLens${String(i + 1).padStart(2, '0')}`),
      ...Array.from({ length: 7 }, (_, i) => `Signal${String(i + 1).padStart(2, '0')}`)];
    let offset = 0;
    for (const name of ids) {
      const input = collect(source.getObjectByName(name))[0];
      const transformed = input.geometry.clone().applyMatrix4(input.matrixWorld);
      for (const mesh of lamps) for (const key of Object.keys(transformed.attributes)) {
        const a = transformed.getAttribute(key), b = mesh.geometry.getAttribute(key);
        const start = offset * a.itemSize;
        near(Array.from(a.array), Array.from(b.array.subarray(start, start + a.array.length)), 2e-6);
      }
      offset += transformed.getAttribute('position').count;
      transformed.dispose();
    }
    assert.equal(lamps[0].geometry.getAttribute('position').count, offset);
  } finally { pack.dispose(); }
});

test('all 128 task masks preserve lock order, independent task lights and material selection without reallocating buffers', () => {
  const pack = createCoasterChestRuntime(source);
  try {
    const batches = collect(pack.root), locks = batches.filter(m => parentOf(m) === 'shackle'), lamps = batches.filter(m => parentOf(m) === 'lamp');
    const indices = lamps.map(m => m.geometry.index);
    const lampIds = [...Array.from({ length: 6 }, (_, i) => `LockLens${String(i + 1).padStart(2, '0')}`),
      ...Array.from({ length: 7 }, (_, i) => `Signal${String(i + 1).padStart(2, '0')}`)];
    const lampSources = lampIds.map(name => collect(source.getObjectByName(name))[0]);
    const matrix = new Matrix4();
    let maxDraws = 0;
    for (let mask = 0; mask < 128; mask++) {
      const passed = Array.from({ length: 7 }, (_, i) => `T${i + 1}`).filter((_, i) => mask & (1 << i));
      pack.setPassed(passed);
      const counts = [0, 0], expectedIndices = [[], []];
      for (let i = 0; i < 6; i++) {
        const opened = i < passed.length, state = opened ? 1 : 0;
        const input = source.getObjectByName(`Shackle${String(i + 1).padStart(2, '0')}`);
        const child = collect(input)[0], local = new Matrix4().multiplyMatrices(input.matrixWorld.clone().invert(), child.matrixWorld);
        const transform = new Matrix4().makeRotationY(opened ? -1.12 : 0);
        transform.setPosition(input.position.x, input.position.y + (opened ? .058 : 0), input.position.z);
        const expected = new Matrix4().multiplyMatrices(input.parent.matrixWorld, transform).multiply(local);
        locks[state].getMatrixAt(counts[state]++, matrix);
        near(matrix.elements, expected.elements);
        assert.equal(locks[state].geometry, collect(source.getObjectByName('Shackle01'))[0].geometry);
        // The free end's real world point is unchanged by instancing.
        near(new Vector3(.216, -.035, 0).applyMatrix4(expected).toArray(),
          new Vector3(.216, -.035, 0).applyMatrix4(matrix).toArray());
      }
      locks.forEach((m, i) => {
        assert.equal(m.count, counts[i]); assert.equal(m.visible, counts[i] > 0);
        if (m.count) assert.ok(Number.isFinite(m.boundingSphere.radius));
      });
      let offset = 0;
      lampSources.forEach((m, i) => {
        const on = i < 6 ? i < passed.length : passed.includes(`T${i - 5}`);
        expectedIndices[on ? 1 : 0].push(...Array.from(m.geometry.index.array, v => v + offset));
        offset += m.geometry.getAttribute('position').count;
      });
      lamps.forEach((m, i) => {
        assert.equal(m.geometry.index, indices[i], 'state changes retain the same GPU index allocation');
        assert.equal(m.visible, expectedIndices[i].length > 0);
        assert.equal(m.geometry.drawRange.count, expectedIndices[i].length);
        assert.deepEqual(Array.from(m.geometry.index.array.subarray(0, m.geometry.drawRange.count)), expectedIndices[i]);
        assert.equal(m.castShadow, false);
      });
      maxDraws = Math.max(maxDraws, batches.filter(m => m.visible).length);
    }
    assert.equal(maxDraws, 15, '13 visible material batches plus two nonwriting exact shadow carriers');
  } finally { pack.dispose(); }
});

test('two full-resolution opaque shadow carriers retain all triangles at closed, intermediate and open poses', () => {
  const pack = createCoasterChestRuntime(source);
  try {
    const casters = collect(pack.root).filter(m => m.castShadow);
    assert.equal(casters.length, 2);
    for (const name of ['ChestBody', 'ChestLid']) {
      const input = source.getObjectByName(name), shadow = pack.root.getObjectByName(name + 'Shadow');
      let cursor = 0;
      const indices = [];
      for (const mesh of collect(input)) {
        const part = mesh.geometry.clone().applyMatrix4(new Matrix4().multiplyMatrices(input.matrixWorld.clone().invert(), mesh.matrixWorld));
        const expected = part.getAttribute('position');
        near(Array.from(expected.array), Array.from(shadow.geometry.getAttribute('position').array.subarray(cursor * 3, cursor * 3 + expected.array.length)));
        indices.push(...Array.from(part.index.array, i => i + cursor));
        cursor += expected.count;
        part.dispose();
      }
      assert.equal(shadow.geometry.index.count, collect(input).reduce((sum, m) => sum + m.geometry.index.count, 0));
      assert.deepEqual(Array.from(shadow.geometry.index.array), indices, 'winding and complete triangle topology stay exact');
      assert.equal(shadow.material.side, 2); assert.equal(shadow.material.shadowSide, 2);
      assert.equal(shadow.material.colorWrite, false); assert.equal(shadow.material.depthWrite, false);
      for (const angle of [0, -.65, -1.3]) {
        pack.lid.rotation.x = angle; pack.root.updateMatrixWorld(true);
        assert.equal(shadow.parent, pack.root.getObjectByName(name));
        near(shadow.matrixWorld.elements, shadow.parent.matrixWorld.elements);
      }
    }
  } finally { pack.dispose(); }
});

test('baseline component cleanup actually disposes materials still reused by StrictMode effect replay', () => {
  const sourceText = execFileSync('git', ['show', 'b75c474:src/components/world/attractions/WorldCoasterChestTransfer.tsx'], { encoding: 'utf8' });
  const js = ts.transpileModule(sourceText, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const ast = ts.createSourceFile('baseline.js', js, ts.ScriptTarget.Latest, true);
  const functionText = name => ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(ast);
  const legacy = new Function('Mesh', 'MeshStandardMaterial', 'indexName',
    functionText('requireNode') + '\n' + functionText('makeChest') + '\nreturn makeChest;'
  )(Mesh, MeshStandardMaterial, i => String(i + 1).padStart(2, '0'))(source);
  const effects = [];
  const env = {
    useGLTF: () => ({ scene: source }), assetUrl: 'unused', useMemo: f => f(), makeChest: () => legacy,
    useDjcFurnitureEnvironment: () => null, useRef: x => ({ current: x }), useLayoutEffect: f => f(),
    useEffect: f => effects.push(f), useFrame: () => {}, night: { value: 0 },
    OPEN_LID: -1.3, OPEN_SHACKLE: -1.12, SHACKLE_LIFT: .058, _jsx: (type, props) => ({ type, props }),
  };
  new Function(...Object.keys(env), `return (${functionText('ChestModel')});`)(...Object.values(env))({ open: false, passed: [] });
  let disposals = 0;
  legacy.materials.forEach(m => m.addEventListener('dispose', () => disposals++));
  effects[0]()();
  effects[0]();
  assert.equal(disposals, legacy.materials.length, 'baseline replay really reuses disposed materials');
});

test('component retains the exact paused lid easing callback', () => {
  const baseline = execFileSync('git', ['show', 'b75c474:src/components/world/attractions/WorldCoasterChestTransfer.tsx'], { encoding: 'utf8' });
  const current = readFileSync(new URL('./WorldCoasterChestTransfer.tsx', import.meta.url), 'utf8');
  const ast = text => ts.createSourceFile('component.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const a = ast(baseline), b = ast(current);
  const declaration = (tree, name) => tree.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  const frame = tree => {
    let result;
    function find(node) {
      if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useFrame') result = node.getText(tree);
      ts.forEachChild(node, find);
    }
    find(declaration(tree, 'ChestModel'));
    return result;
  };
  assert.equal(frame(a), frame(b).replaceAll('CHEST_OPEN_LID', 'OPEN_LID'));
});

test('actual chest output preserves pickup/gate visibility, both key transforms and chest click for default and supplied key visuals', () => {
  const js = ts.transpileModule(readFileSync(new URL('./WorldCoasterChestTransfer.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const ast = ts.createSourceFile('chest.js', js, ts.ScriptTarget.Latest, true);
  const declaration = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'WorldCoasterChestTransfer');
  const fn = declaration.getText(ast).replace(/^export\s+default\s+/, '');
  const jsx = reactJsx;
  const list = value => value && typeof value === 'object'
    ? [value, ...[value.props?.children].flat(Infinity).flatMap(list)] : [];
  const offset = [50, 1, -195], gateZ = 56;
  for (const supplied of [false, true]) for (const chestOpen of [false, true])
    for (const keyTaken of [false, true]) for (const gateOpen of [false, true]) {
      const progress = { chestOpen, keyTaken, gateOpen, passed: [] };
      const events = [], geometry = { dispose() {} }, visual = jsx('authored-key', {});
      const env = {
        useIntentStore: selector => selector({ progress }), useMemo: f => f(), createIntentKey: () => geometry, useEffect: () => {},
        coasterWorld: p => p.map((v, i) => v + offset[i]), COASTER_GATE_Z: gateZ,
        activateIntentTarget: target => events.push(target), _jsx: jsx, _jsxs: reactJsxs, _Fragment: Fragment,
        Suspense: 'Suspense', ChestModel: 'ChestModel', WorldIntentReflectiveSurface: 'reflective-surface',
      };
      const Component = new Function(...Object.keys(env), `return (${fn});`)(...Object.values(env));
      const output = Component(supplied ? { keyVisual: visual } : undefined), elements = list(output);
      const interaction = elements.find(o => o.type === 'group' && o.props.onClick);
      assert.deepEqual(interaction.props.position, [42, 1, -135.5]);
      let stopped = 0;
      interaction.props.onClick({ stopPropagation() { stopped++; } });
      assert.equal(stopped, 1); assert.deepEqual(events, ['chest']);
      const local = elements.filter(o => o.type === 'group' && JSON.stringify(o.props.position) === JSON.stringify([-.2, 1.4, .25]));
      const gate = elements.filter(o => o.type === 'group' && JSON.stringify(o.props.position) === JSON.stringify([55.3, 2.65, -138.5]));
      assert.equal(local.length, chestOpen && !keyTaken ? 1 : 0);
      assert.equal(gate.length, gateOpen ? 1 : 0);
      if (local.length) assert.deepEqual(local[0].props.rotation, [-.25, 0, .25]);
      for (const placement of [...local, ...gate]) {
        if (supplied) assert.equal(placement.props.children, visual);
        else {
          assert.equal(placement.props.children.type, 'mesh');
          assert.equal(placement.props.children.props.geometry, geometry);
        }
      }
      assert.equal(elements.filter(o => o.type === 'authored-key').length, supplied ? local.length + gate.length : 0);
      assert.equal(elements.filter(o => o.type === 'mesh' && o.props.geometry === geometry).length, supplied ? 0 : local.length + gate.length);
    }
});

test('actual component effect survives StrictMode cleanup/replay and finally releases each owned resource once', async () => {
  const js = ts.transpileModule(readFileSync(new URL('./WorldCoasterChestTransfer.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const ast = ts.createSourceFile('component.js', js, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'ChestModel');
  const effects = []; let pack;
  const env = {
    useGLTF: () => ({ scene: source }), assetUrl: 'unused', useMemo: f => f(),
    createCoasterChestRuntime: s => (pack = createCoasterChestRuntime(s)),
    useDjcFurnitureEnvironment: () => null, useRef: x => ({ current: x }), useLayoutEffect: f => f(),
    useEffect: f => effects.push(f), useFrame: () => {}, night: { value: 0 },
    CHEST_OPEN_LID, _jsx: (type, props) => ({ type, props }),
  };
  new Function(...Object.keys(env), `return (${fn.getText(ast)});`)(...Object.values(env))({ open: false, passed: [] });
  const counts = new Map();
  const owned = [...pack.resources.geometry, ...pack.resources.materials, ...pack.resources.instances];
  owned.forEach(item => item.addEventListener('dispose', () => counts.set(item, (counts.get(item) || 0) + 1)));
  let borrowedDisposals = 0;
  const borrowed = new Set(sourceMeshes.flatMap(m => [m.geometry, m.material, ...Object.values(m.material).filter(v => v?.isTexture)]));
  borrowed.forEach(item => item.addEventListener('dispose', () => borrowedDisposals++));
  const cleanup = effects[0](); cleanup(); cleanup();
  const finalCleanup = effects[0](); await Promise.resolve();
  assert.equal(counts.size, 0, 'StrictMode reuses resources instead of reviving disposed GPU buffers');
  finalCleanup(); await Promise.resolve(); pack.dispose();
  assert.equal(counts.size, owned.length);
  owned.forEach(item => assert.equal(counts.get(item), 1));
  assert.equal(borrowedDisposals, 0);
  assert.deepEqual(snapshot(), before, 'derived assets never change the cached original');
});

test.after(() => disposeWorldCraftGltf(source));
