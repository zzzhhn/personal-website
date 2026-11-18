import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Frustum, Matrix4, OrthographicCamera, PerspectiveCamera, Ray, Sphere, Vector3 } from 'three';
import { ShadowViewSweep } from './shadow-view-sweep.ts';

const sun = new Vector3(-90, 40, 65).normalize();
function projection(camera) {
  camera.updateMatrixWorld();
  return new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
}

test('a small elevated caster can shadow the viewport beyond forty half-metre samples', () => {
  const sweep = new ShadowViewSweep(sun);
  sweep.update(new Matrix4());
  const high = sun.clone().multiplyScalar(70);
  assert.ok(sweep.intersects(high.x, high.y, high.z, .1));
  assert.equal(sweep.intersects(high.x + 10, high.y, high.z, .1), false);
});

test('clipping agrees with segment hits on the expanded camera box, including parallel and grazing rays', () => {
  const camera = new OrthographicCamera(-4, 5, 6, -3, 1, 21);
  camera.position.z = 11;
  const base = new Box3(new Vector3(-4, -3, -10), new Vector3(5, 6, 10));
  for (const dir of [sun, new Vector3(0, 1, 0)]) {
    const sweep = new ShadowViewSweep(dir);
    sweep.update(projection(camera));
    for (const r of [0, .25, 1.25]) {
      const box = base.clone().expandByScalar(r);
      for (const x of [-20, -4 - r, 0, 5 + r, 6, 25]) for (const y of [-15, -3, 0, 6, 24]) for (const z of [-11, -10 - r, 0, 10 + r, 18]) {
        const at = new Vector3(x, y, z), hit = new Ray(at, dir.clone().negate()).intersectBox(box, new Vector3());
        const length = Math.max(0, (y + r + .7) / dir.y);
        const expected = box.containsPoint(at) || Boolean(hit && at.distanceTo(hit) <= length + 1e-7);
        assert.equal(sweep.intersects(x, y, z, r), expected, JSON.stringify([x, y, z, r]));
      }
    }
  }
});

test('after a camera move every shadow with a witnessed intersection remains visible', () => {
  const camera = new PerspectiveCamera(50, 16 / 9, .1, 250), sweep = new ShadowViewSweep(sun);
  const sphere = new Sphere(), ref = new Frustum();
  let hits = 0, misses = 0;
  for (const [cx, cy, cz] of [[15, 9, 24], [-21, 4, -11]]) {
    camera.position.set(cx, cy, cz); camera.lookAt(0, 1, 0);
    const matrix = projection(camera);
    sweep.update(matrix); ref.setFromProjectionMatrix(matrix);
    for (let i = 0; i < 600; i++) {
      const x = i * 13.3 % 180 - 90, y = i * 2.1 % 65, z = i * 9.7 % 180 - 90, r = .1 + i % 4;
      const visible = sweep.intersects(x, y, z, r), length = (y + r + .7) / sun.y;
      sphere.radius = r;
      for (let k = 0; k <= 100; k++) {
        sphere.center.set(x, y, z).addScaledVector(sun, -k / 100 * length);
        if (ref.intersectsSphere(sphere)) { assert.ok(visible); hits++; break; }
      }
      if (!visible) misses++;
    }
  }
  assert.ok(hits > 50 && misses > 50);
});
