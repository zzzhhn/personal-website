import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, DirectionalLight, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Scene } from 'three';
import { fitSunShadow, shadowChunkWork } from './WorldShadows.ts';

test('actual scene rescans append late stable casters, reuse untouched mesh/buffers, and rebuild on removal/replacement', t => {
  const scene = new Scene(), target = new Object3D(), light = new DirectionalLight(), camera = new PerspectiveCamera();
  scene.add(target, light);
  const material = new MeshBasicMaterial(), a = new BoxGeometry(), b = new BoxGeometry(), c = new BoxGeometry(), replacement = new BoxGeometry(2, 2, 2);
  const near = new Mesh(a, material), far = new Mesh(b, material), late = new Mesh(c, material);
  near.name = 'early-near'; far.name = 'early-far'; late.name = 'late-near'; far.position.x = 100; late.position.y = .1;
  for (const mesh of [near, far, late]) mesh.castShadow = true;
  scene.add(near, far);
  const advance = frames => { for (let i = 0; i < frames; i++) fitSunShadow(light, target, camera, { mapSize: 2048, wide: false, focus: [0, 0, 0] }); };
  const chunks = () => scene.getObjectByName('world-shadow-proxies').children.filter(o => o.name.startsWith('sun-chunk-'));
  let sourceDisposals = 0;
  for (const geometry of [a, b, c, replacement]) geometry.addEventListener('dispose', () => sourceDisposals++);
  t.after(() => { scene.remove(light, near, far, late); [a, b, c, replacement].forEach(g => g.dispose()); material.dispose(); });
  advance(61);
  const initial = new Map(chunks().map(m => [m.name, { mesh: m, geometry: m.geometry }]));
  assert.ok(initial.size > 0);
  let oldVertexReads = 0;
  for (const geometry of [a, b]) {
    const position = geometry.getAttribute('position'), getX = position.getX;
    position.getX = function(i) { oldVertexReads++; return getX.call(this, i); };
  }
  scene.add(late); advance(90);
  assert.equal(oldVertexReads, 0, 'a new stable caster must not re-transform early source vertices');
  let reused = 0, replaced = 0;
  for (const mesh of chunks()) {
    const old = initial.get(mesh.name); if (!old) continue;
    assert.equal(mesh, old.mesh);
    if (mesh.geometry === old.geometry) reused++; else replaced++;
  }
  assert.ok(reused > 0); assert.ok(replaced > 0);
  const settled = chunks().map(m => m.geometry); advance(90);
  assert.deepEqual(chunks().map(m => m.geometry), settled);
  scene.remove(late); advance(30);
  assert.ok(oldVertexReads > 0, 'removal uses the conservative full rebuild');
  const beforeReplacement = chunks().map(m => m.geometry);
  near.geometry = replacement; advance(30);
  assert.ok(chunks().some(m => !beforeReplacement.includes(m.geometry)));
  assert.equal(sourceDisposals, 0, 'the shadow system never owns source geometry');
  scene.remove(near, far); advance(30);
  assert.equal(chunks().length, 0, 'empty scene releases all final shadow chunk meshes');
  t.diagnostic(`Actual WorldShadows rescans on a tiny Three scene: ${reused} chunk buffers reused, ${replaced} replaced; no WebGL renderer or production assets.`);
});

test('pending first cohort retains actual raw shadow draws, cancels on replacement/exit, and reenters without stale chunks', t => {
  const scene = new Scene(), target = new Object3D(), light = new DirectionalLight(), camera = new PerspectiveCamera();
  camera.position.set(0, 2, 8); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  scene.add(target, light);
  const geometry = new BoxGeometry(), replacement = new BoxGeometry(2, 2, 2), material = new MeshBasicMaterial();
  const cohort = Array.from({ length: 80 }, (_, i) => {
    const mesh = new Mesh(geometry, material); mesh.name = `sliced-${i}`; mesh.castShadow = true; scene.add(mesh); return mesh;
  });
  const advance = frames => { for (let i = 0; i < frames; i++) fitSunShadow(light, target, camera, { mapSize: 2048, wide: false, focus: [0, 0, 0] }); };
  const chunks = () => scene.getObjectByName('world-shadow-proxies')?.children.filter(o => o.name.startsWith('sun-chunk-')) ?? [];
  const pending = () => {
    for (let i = 0; i < 100; i++) { advance(1); if (shadowChunkWork().pending) return; }
    assert.fail('expected a sliced job');
  };
  const finish = () => {
    for (let i = 0; i < 300; i++) { advance(1); if (!shadowChunkWork().pending && chunks().length) return; }
    assert.fail('job did not finish');
  };
  t.after(() => { scene.remove(light); geometry.dispose(); replacement.dispose(); material.dispose(); });
  advance(60); assert.equal(chunks().length, 0, 'stable scan qualification remains unchanged');
  pending(); assert.equal(chunks().length, 0, 'no partial chunk publication');
  let rawDraws = 0, chunkDraws = 0;
  const renderer = { shadowMap: { render() {
    const sun = scene.getObjectByName('world-sun-cascaded');
    sun.shadow.updateMatrices(sun, camera); sun.shadow.getFrustum(0);
    rawDraws = cohort.filter(m => m.castShadow).length;
    chunkDraws = chunks().filter(m => m.castShadow).length;
  } } };
  scene.onBeforeRender(renderer, scene, camera); renderer.shadowMap.render();
  assert.equal(rawDraws, cohort.length, 'original casters really participate in the shadow pass while pending');
  assert.equal(chunkDraws, 0);
  const before = shadowChunkWork().cancelled;
  cohort[0].geometry = replacement; advance(1);
  assert.equal(shadowChunkWork().pending, false); assert.equal(shadowChunkWork().cancelled, before + 1);
  assert.equal(chunks().length, 0);
  pending();
  scene.remove(light);
  assert.equal(shadowChunkWork().pending, false, 'unmount cancels immediately without another fit frame');
  assert.equal(chunks().length, 0);
  scene.add(light); finish();
  assert.ok(chunks().some(m => m.geometry.getAttribute('position').array.includes(1)), 'replacement geometry is represented after reentry');
  renderer.shadowMap.render(); assert.equal(rawDraws, 0); assert.ok(chunkDraws > 0);
  assert.ok(cohort.every(m => m.castShadow), 'shadow pass restores original flags');
  t.diagnostic('No WebGL: exercised the real wrapped shadow pass and cascade selection with 80 synthetic box casters.');
});

test('late qualification does not restart the first cohort; mutation, subtree removal and geometry disposal cancel without stale publication', t => {
  const scene = new Scene(), root = new Object3D(), target = new Object3D(), light = new DirectionalLight(), camera = new PerspectiveCamera();
  const geometry = new BoxGeometry(), material = new MeshBasicMaterial();
  scene.add(root, target, light);
  const cohort = Array.from({ length: 600 }, () => {
    const mesh = new Mesh(geometry, material); mesh.castShadow = true; root.add(mesh); return mesh;
  });
  const advance = frames => { for (let i = 0; i < frames; i++) fitSunShadow(light, target, camera, { mapSize: 2048, wide: false, focus: [0, 0, 0] }); };
  const chunks = () => scene.getObjectByName('world-shadow-proxies')?.children.filter(o => o.name.startsWith('sun-chunk-')) ?? [];
  const pending = () => {
    for (let i = 0; i < 100; i++) { advance(1); if (shadowChunkWork().pending) return; }
    assert.fail('expected pending work');
  };
  t.after(() => { scene.remove(light); geometry.dispose(); material.dispose(); });
  pending(); const cancellations = shadowChunkWork().cancelled;
  const late = new Mesh(geometry, material); late.castShadow = true; root.add(late);
  advance(90);
  assert.equal(shadowChunkWork().pending, true);
  assert.ok(shadowChunkWork().slices > 90);
  assert.equal(shadowChunkWork().cancelled, cancellations, 'late stable cohort must not starve the initial transaction');
  for (let i = 0; i < 300 && chunks().length === 0; i++) advance(1);
  assert.ok(chunks().length > 0);
  advance(45); // Publish the later append too.
  assert.equal(shadowChunkWork().pending, false);
  const vertexCount = chunks().reduce((n, m) => n + m.geometry.getAttribute('position').count, 0);
  assert.equal(vertexCount, cohort.concat(late).length * 36 * 3);

  scene.remove(light); scene.add(light); pending();
  cohort[0].position.x = 2; advance(1);
  assert.equal(shadowChunkWork().pending, false); assert.equal(chunks().length, 0);
  pending(); scene.remove(root);
  assert.equal(shadowChunkWork().pending, false, 'subtree exit releases scratch without another frame');
  scene.add(root); pending();
  geometry.dispose();
  assert.equal(shadowChunkWork().pending, false, 'source dispose releases scratch immediately');
  assert.equal(chunks().length, 0);
});
