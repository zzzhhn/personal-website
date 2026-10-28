import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, DirectionalLight, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Scene } from 'three';
import { fitSunShadow } from './WorldShadows.ts';

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
  t.after(() => { scene.remove(near, far, late); advance(30); [a, b, c, replacement].forEach(g => g.dispose()); material.dispose(); });
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
