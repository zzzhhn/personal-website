import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { compileWorldComponent } from '../../../../tools/world/alpha-mine-tests/component-host.mjs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { Box3, BufferGeometry, DoubleSide, Group, Mesh, Raycaster, Texture, Vector3 } from 'three';
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

const loadGate = compileWorldComponent(new URL('./WorldCoasterGateCraft.tsx', import.meta.url));

for (const part of ['static', 'leaf', 'key']) {
  test(`actual ${part} component effect survives cleanup/replay and disposes only owned materials once at final unmount`, async () => {
    const effects = [];
    const environment = new Texture();
    const Component = loadGate({
      three: THREE, 'three/examples/jsm/utils/BufferGeometryUtils.js': { mergeGeometries },
      react: { useMemo: f => f(), useRef: current => ({ current }), useEffect: f => effects.push(f) },
      '@react-three/fiber': { useFrame() {} }, '@react-three/drei': { useGLTF: () => gltf },
      '../WorldDjcFurnitureEnvironment': { useDjcFurnitureEnvironment: () => environment },
      '../WorldNight': { night: { value: .4 } },
    }).default;
    const output = Component({ part });
    const root = output.props.children.props.object;
    const rendered = [];
    root.traverse(node => { if (node.isMesh) rendered.push(node); });
    const shadow = rendered.find(mesh => mesh.castShadow && !mesh.receiveShadow) ?? null;
    const materials = [...new Set(rendered.filter(m => m !== shadow).flatMap(m => [m.material].flat()))];
    const original = source.getObjectByName({ static: 'GateStatic', leaf: 'GateLeaf', key: 'GateKey' }[part]);
    const originals = [];
    original.traverse(o => { if (o instanceof Mesh) originals.push(o); });
    const copies = [];
    root.traverse(o => { if (o instanceof Mesh && o !== shadow) copies.push(o); });
    assert.notEqual(root, original);
    assert.equal(output.props.dispose, null);
    assert.equal(output.props.children.props.dispose, null);
    assert.equal(copies.length, originals.length);
    const counts = new Map();
    const borrowedCounts = new Map();
    const owned = [...materials, ...(shadow ? [shadow.geometry, shadow.material] : [])];
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
        const carrier = shadow;
        assert.ok(carrier);
        assert.equal(carrier.parent, root);
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
        hinge.add(root);
        for (const side of [-1, 1]) for (const angle of [0, side * .71, side * 1.45]) {
          hinge.position.set(side * 5, 0, 56);
          hinge.rotation.y = angle;
          root.scale.set(-side, 1, 1);
          hinge.updateMatrixWorld(true);
          assert.deepEqual(carrier.matrixWorld.toArray(), root.matrixWorld.toArray(), 'carrier follows mirrored hinged parent');
          let offset = 0;
          const visiblePoint = new Vector3(), shadowPoint = new Vector3();
          for (const authored of authoredShadow) {
            const authoredWorld = authored.matrixWorld.clone().premultiply(toRoot).premultiply(root.matrixWorld);
            const positions = authored.geometry.getAttribute('position');
            for (let i = 0; i < positions.count; i++) {
              visiblePoint.fromBufferAttribute(positions, i).applyMatrix4(authoredWorld);
              shadowPoint.fromBufferAttribute(carrier.geometry.getAttribute('position'), offset + i).applyMatrix4(carrier.matrixWorld);
              assert.ok(visiblePoint.distanceTo(shadowPoint) < 1e-5, 'authored proxy world vertices match at closed/intermediate/open mirrored poses');
            }
            offset += positions.count;
          }
        }
        hinge.remove(root);
        root.scale.set(1, 1, 1);
        root.updateMatrixWorld(true);
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
      } else assert.equal(shadow, null, 'static/key retain original shadow treatment');
      finalCleanup.forEach(release => { release?.(); release?.(); });
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(counts.size, owned.length);
      owned.forEach(resource => assert.equal(counts.get(resource), 1, 'final cleanup releases exactly once'));
      assert.equal(borrowedCounts.size, 0, 'cached source materials/geometry/maps and renderer environment stay borrowed');
    } finally {
      borrowed.forEach(item => item.removeEventListener('dispose', observeBorrowed));
      environment.removeEventListener('dispose', observeBorrowed);
      environment.dispose();
    }
  });
}

test.after(() => disposeWorldCraftGltf(source));
