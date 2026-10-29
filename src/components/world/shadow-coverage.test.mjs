import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectionalLight, Object3D, PerspectiveCamera, Scene, Vector3 } from 'three';
import { fitSunShadow, shadowTelemetry, worldSun } from './WorldShadows.ts';
import { worldShadowCapture } from './world-shadow-capture.ts';
import { WORLD_SHOTS } from './layout.ts';

function fixture(focus, position, capture) {
  const scene = new Scene(), light = new DirectionalLight(), target = new Object3D();
  const camera = new PerspectiveCamera(50, 1710 / 875, .1, 1000);
  camera.position.set(...position); camera.lookAt(...focus); camera.updateMatrixWorld();
  scene.add(light, target);
  fitSunShadow(light, target, camera, { mapSize: 2048, wide: capture?.wide ?? false, wideBounds: capture?.bounds, focus });
  const sun = worldSun(); sun.shadow.updateMatrices(sun, camera);
  return { cameras: sun.shadow._cameras, close: () => scene.remove(light) };
}
const contained = p => Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && Math.abs(p.z) < 1;

test('actual play shadow cameras keep the near ground in range across the expanded island', () => {
  for (const focus of [[-42, 1, 30], [-72, 1.085, -157.5], [180, 1, -400], [102, 78, -310]]) {
    const f = fixture(focus, [focus[0] - 8, focus[1] + 6, focus[2] + 14]);
    try {
      const ndc = new Vector3(...focus).project(f.cameras[0]);
      assert.ok(contained(ndc), `near receiver ${focus} clipped: ${ndc.toArray()}`);
      const roof = new Vector3(focus[0], focus[1] + 9, focus[2]);
      assert.ok(f.cameras.some(c => contained(roof.clone().project(c))), 'nearby overhead caster stays in at least one cascade');
      assert.deepEqual(shadowTelemetry().atlas, [3762, 1254], 'expanded coverage does not enlarge the atlas');
    } finally { f.close(); }
  }
});

test('IBD close capture uses its camera target and retains actual truck and roof shadow coverage', () => {
  const capture = worldShadowCapture('ibd-dispatch-detail-day');
  const view = WORLD_SHOTS.find(v => v.id === 'ibd-dispatch-detail-day');
  assert.equal(capture.wide, false);
  const f = fixture(capture.focus, view.position, capture);
  try {
    for (const point of [[-72, 1.085, -157.5], [-72, 1.085, -167.5], [-71, 9.8, -162.5]]) {
      assert.ok(f.cameras.some(c => contained(new Vector3(...point).project(c))), `capture clipped ${point}`);
    }
  } finally { f.close(); }
});

test('northern overview cameras contain all eight corners of their surveyed facility extent', () => {
  for (const id of ['ibd-overview-day', 'coaster-v4-overview-day']) {
    const capture = worldShadowCapture(id), view = WORLD_SHOTS.find(v => v.id === id);
    assert.ok(capture.wide && capture.bounds);
    const f = fixture(capture.focus, view.position, capture), b = capture.bounds;
    try {
      for (let i = 0; i < 8; i++) {
        const p = new Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
        assert.ok(contained(p.project(f.cameras[0])), `${id} clipped corner ${i}`);
      }
    } finally { f.close(); }
  }
});
