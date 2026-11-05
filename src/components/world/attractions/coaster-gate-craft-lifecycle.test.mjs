import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { Box3, BufferGeometry, DoubleSide, Group, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Raycaster, Texture, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { readWorldCraftGltf, disposeWorldCraftGltf } from '../world-craft-gltf-test.mjs';

// Load the actual exported geometry/material graph. The existing CPU loader mocks
// texture decode only: this test makes no image, renderer or GPU assertions.
const gltf = await readWorldCraftGltf(['docs/world/phase-2-playground/coaster-gate-craft-20261105/coaster-gate.glb']);
assert.ok(gltf, 'gate GLB must exist; do not silently skip its lifecycle');
const source = gltf.scene;
const repoUrl = new URL('../../../../', import.meta.url);
const path = relative => fileURLToPath(new URL(relative, repoUrl));
const assetPath = 'docs/world/phase-2-playground/coaster-gate-craft-20261105/';
execFileSync('python3', [path('tools/world/coaster-gate-craft-20261105/visible_signature.py'),
  path(assetPath + 'coaster-gate.glb'), '--compare', path(assetPath + 'visible-before-shadow.json')]);
const sourceMeshes = [];
source.traverse(o => { if (o instanceof Mesh) sourceMeshes.push(o); });
const borrowed = new Set(sourceMeshes.flatMap(mesh => [mesh.geometry,
  ...[mesh.material].flat().flatMap(material => [material, ...Object.values(material).filter(v => v?.isTexture)])]));

const sourceText = readFileSync(new URL('./WorldCoasterGateCraft.tsx', import.meta.url), 'utf8');
const js = ts.transpileModule(sourceText, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const ast = ts.createSourceFile('gate.js', js, ts.ScriptTarget.Latest, true);
const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'WorldCoasterGateCraft');
assert.ok(declaration, 'test must invoke the actual exported component');
const fn = declaration.getText(ast).replace(/^export\s+default\s+/, '');
const constants = ast.statements.find(node => ts.isVariableStatement(node)
  && node.declarationList.declarations.some(d => d.name.getText(ast) === 'ROOTS')).getText(ast);

for (const part of ['static', 'leaf', 'key']) {
  test(`actual ${part} component effect survives cleanup/replay and disposes only owned materials once at final unmount`, async () => {
    const effects = [], memos = [];
    const environment = new Texture();
    const env = {
      useGLTF: () => ({ scene: source }), assetUrl: 'unused',
      useMemo: factory => { const value = factory(); memos.push(value); return value; },
      useDjcFurnitureEnvironment: () => environment, useRef: value => ({ current: value }),
      useEffect: factory => effects.push(factory), useFrame: () => {},
      night: { value: .4 }, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, MeshStandardMaterial, Matrix4, mergeGeometries,
      _jsx: (type, props) => ({ type, props }), _jsxs: (type, props) => ({ type, props }),
    };
    const Component = new Function(...Object.keys(env), `${constants}\nreturn (${fn});`)(...Object.values(env));
    const output = Component({ part });
    const pack = memos[0];
    const original = source.getObjectByName({ static: 'GateStatic', leaf: 'GateLeaf', key: 'GateKey' }[part]);
    const originals = [];
    original.traverse(o => { if (o instanceof Mesh) originals.push(o); });
    const copies = [];
    pack.root.traverse(o => { if (o instanceof Mesh && o !== pack.shadow) copies.push(o); });
    assert.notEqual(pack.root, original);
    assert.equal(output.props.dispose, null);
    assert.equal(output.props.children.props.dispose, null);
    assert.equal(copies.length, originals.length);
    const counts = new Map();
    const borrowedCounts = new Map();
    const owned = [...pack.materials, ...(pack.shadow ? [pack.shadow.geometry, pack.shadow.material] : [])];
    owned.forEach(resource => resource.addEventListener('dispose', () => counts.set(resource, (counts.get(resource) ?? 0) + 1)));
    const observeBorrowed = event => borrowedCounts.set(event.target, (borrowedCounts.get(event.target) ?? 0) + 1);
    borrowed.forEach(item => item.addEventListener('dispose', observeBorrowed));
    environment.addEventListener('dispose', observeBorrowed);
    try {
      // Execute the component's real registered effects, then the StrictMode
      // setup -> cleanup -> setup replay without rebuilding its memoized model.
      const cleanup = effects.map(effect => effect());
      cleanup.forEach(release => { release?.(); release?.(); });
      const finalCleanup = effects.map(effect => effect());
      await Promise.resolve();
      assert.equal(counts.size, 0, 'no disposed material may be reused by replay');
      assert.equal(borrowedCounts.size, 0);
      copies.forEach((mesh, i) => {
        assert.equal(mesh.geometry, originals[i].geometry, 'geometry is borrowed unchanged');
        assert.deepEqual(mesh.matrix.toArray(), originals[i].matrix.toArray());
        assert.equal(mesh.castShadow, part !== 'leaf');
        assert.equal(mesh.receiveShadow, true);
        const currentMaterials = [mesh.material].flat(), originalMaterials = [originals[i].material].flat();
        currentMaterials.forEach((material, j) => {
          const input = originalMaterials[j];
          assert.notEqual(material, input);
          for (const key of ['map', 'roughnessMap', 'metalnessMap', 'normalMap', 'aoMap', 'clearcoatMap',
            'clearcoatRoughnessMap', 'roughness', 'metalness', 'clearcoat', 'clearcoatRoughness', 'side']) {
            assert.equal(material[key], input[key], `unchanged PBR ${key}`);
          }
          assert.deepEqual(material.color.toArray(), input.color.toArray());
          assert.equal(material.envMap, environment);
          assert.equal(material.envMapIntensity, .85 * .6 + .5 * .4);
        });
      });
      if (part === 'leaf') {
        const carrier = pack.shadow;
        assert.ok(carrier);
        assert.equal(carrier.parent, pack.root);
        assert.equal(carrier.castShadow, true);
        assert.equal(carrier.receiveShadow, false);
        assert.equal(carrier.material.transparent, false);
        assert.equal(carrier.material.opacity, 1);
        assert.equal(carrier.material.colorWrite, false);
        assert.equal(carrier.material.depthWrite, false);
        assert.equal(carrier.material.side, DoubleSide);
        assert.equal(carrier.material.shadowSide, DoubleSide);
        assert.deepEqual(carrier.geometry.groups, [], 'one complete shadow draw, no inherited material groups');
        assert.deepEqual(Object.keys(carrier.geometry.attributes), ['position'], 'opaque shadow copies no PBR-only channels');
        assert.equal(carrier.material.alphaMap, null);
        let cursor = 0;
        const expectedIndices = [];
        const shadowSource = source.getObjectByName('GateLeafShadow');
        const authoredShadow = [];
        shadowSource.traverse(o => { if (o instanceof Mesh) authoredShadow.push(o); });
        shadowSource.updateWorldMatrix(true, true);
        const toRoot = shadowSource.matrixWorld.clone().invert();
        for (const original of authoredShadow) {
          original.updateWorldMatrix(true, false);
          const transform = original.matrixWorld.clone().premultiply(toRoot);
          const derived = new BufferGeometry();
          derived.setAttribute('position', original.geometry.getAttribute('position').clone());
          derived.setIndex(original.geometry.index.clone());
          derived.applyMatrix4(transform);
          const attribute = derived.getAttribute('position'), actual = carrier.geometry.getAttribute('position');
          const start = cursor * attribute.itemSize;
          assert.deepEqual(Array.from(actual.array.subarray(start, start + attribute.array.length)), Array.from(attribute.array), 'complete transformed position');
          expectedIndices.push(...Array.from(derived.index.array, i => i + cursor));
          cursor += derived.getAttribute('position').count;
          derived.dispose();
        }
        assert.deepEqual(Array.from(carrier.geometry.index.array), expectedIndices, 'all authored proxy triangles and winding remain exact');
        assert.equal(carrier.geometry.getAttribute('position').count, cursor);
        assert.ok(carrier.geometry.index.count / 3 < 1200, 'bounded simplified proxy, not the complete visible leaf');
        const hinge = new Group();
        hinge.add(pack.root);
        for (const side of [-1, 1]) for (const angle of [0, side * .71, side * 1.45]) {
          hinge.position.set(side * 5, 0, 56);
          hinge.rotation.y = angle;
          pack.root.scale.set(-side, 1, 1);
          hinge.updateMatrixWorld(true);
          assert.deepEqual(carrier.matrixWorld.toArray(), pack.root.matrixWorld.toArray(), 'carrier follows mirrored hinged parent');
          let offset = 0;
          const visiblePoint = new Vector3(), shadowPoint = new Vector3();
          for (const authored of authoredShadow) {
            const authoredWorld = authored.matrixWorld.clone().premultiply(toRoot).premultiply(pack.root.matrixWorld);
            const positions = authored.geometry.getAttribute('position');
            for (let i = 0; i < positions.count; i++) {
              visiblePoint.fromBufferAttribute(positions, i).applyMatrix4(authoredWorld);
              shadowPoint.fromBufferAttribute(carrier.geometry.getAttribute('position'), offset + i).applyMatrix4(carrier.matrixWorld);
              assert.ok(visiblePoint.distanceTo(shadowPoint) < 1e-5, 'authored proxy world vertices match at closed/intermediate/open mirrored poses');
            }
            offset += positions.count;
          }
        }
        hinge.remove(pack.root);
        pack.root.scale.set(1, 1, 1);
        pack.root.updateMatrixWorld(true);
        const visibleBounds = new Box3().setFromObject(original), proxyBounds = new Box3().setFromObject(carrier);
        assert.ok(visibleBounds.min.distanceTo(proxyBounds.min) < 1e-5);
        assert.ok(visibleBounds.max.distanceTo(proxyBounds.max) < 1e-5, 'outer envelope stays the visible leaf envelope');
        for (const direction of [-1, 1]) {
          const cast = x => new Raycaster(new Vector3(x, 2.9, direction * 2), new Vector3(0, 0, -direction), 0, 4).intersectObject(carrier, false);
          for (let i = 0; i < 9; i++) assert.equal(cast(.69 + i * .46).length, 0, 'each upper grille gap stays open from both sides');
          for (let i = 0; i < 10; i++) assert.ok(cast(.46 + i * .46).length > 0, 'every actual picket still casts from both sides');
        }
        const buffers = Object.values(carrier.geometry.attributes).reduce((sum, a) => sum + a.array.byteLength, 0)
          + carrier.geometry.index.array.byteLength;
        console.log(JSON.stringify({ gateLeafShadowCandidate: { trianglesPerLeaf: carrier.geometry.index.count / 3,
          extraBufferBytesPerLeaf: buffers,
          attributeBytes: Object.fromEntries(Object.entries(carrier.geometry.attributes).map(([name, a]) => [name, a.array.byteLength])),
          indexBytes: carrier.geometry.index.array.byteLength,
          visibleDrawsBefore: copies.length, visibleDrawsAfter: copies.length + 1,
          shadowDrawsBefore: copies.length, shadowDrawsAfter: 1,
          scope: 'CPU geometry/submission inventory only; no FPS claim' } }));
      } else assert.equal(pack.shadow, null, 'static/key retain original shadow treatment');
      finalCleanup.forEach(release => { release?.(); release?.(); });
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(counts.size, owned.length);
      owned.forEach(resource => assert.equal(counts.get(resource), 1, 'final cleanup releases exactly once'));
      assert.equal(borrowedCounts.size, 0, 'cached source materials/geometry/maps and renderer environment stay borrowed');
      assert.throws(() => pack.retain(), /disposed gate craft/);
    } finally {
      borrowed.forEach(item => item.removeEventListener('dispose', observeBorrowed));
      environment.removeEventListener('dispose', observeBorrowed);
      environment.dispose();
    }
  });
}

test.after(() => disposeWorldCraftGltf(source));
