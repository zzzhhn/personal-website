import test from 'node:test';
import assert from 'node:assert/strict';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { buildIbdCrane, buildIbdHook, buildIbdCoil } from './ibd-yard-geometry.ts';
import { IBD_CRANE_Y, IBD_SHEDS } from './ibd-yard-layout.ts';
import { IBD_FIXTURES, nearestIbdFixtures } from './ibd-yard-lighting.ts';

test('trolley keeps an open chassis and the hoist clears the shed throughout its existing travel', () => {
  const g = buildIbdCrane(), material = new MeshBasicMaterial({ side: DoubleSide });
  try {
    const mesh = new Mesh(g, material), ray = new Raycaster(new Vector3(0, 2, 1.1), new Vector3(0, -1, 0), 0, 3);
    assert.equal(ray.intersectObject(mesh).length, 0, 'a solid slab closes the trolley chassis');
    assert.ok(g.boundingBox.min.x >= -1.9 && g.boundingBox.max.x <= 1.9);
    assert.ok(g.boundingBox.min.z >= -2.2 && g.boundingBox.max.z <= 2.2);
    const shed = IBD_SHEDS.find(s => s.id === 'coil');
    for (let x = -20; x <= -12; x += .5) {
      const roof = shed.eave + shed.rise * (1 - Math.abs(x - shed.x) / (shed.width / 2)) - .22;
      assert.ok(IBD_CRANE_Y + .7 + g.boundingBox.max.y < roof - .25, `hoist roof clearance at ${x}`);
    }
  } finally { g.dispose(); material.dispose(); }
});

test('clamp shoes meet the coil shoulders instead of stopping above them', () => {
  const coil = buildIbdCoil(false), hook = buildIbdHook(), material = new MeshBasicMaterial({ side: DoubleSide });
  try {
    const mesh = new Mesh(coil, material);
    for (const x of [-1.3, 1.3]) {
      const ray = new Raycaster(new Vector3(x, 3, 0), new Vector3(0, -1, 0), 0, 3);
      const hit = ray.intersectObject(mesh)[0];
      assert.ok(hit, 'coil shoulder missing');
      const shoeBottom = 2.4 - .89 - .06;
      assert.ok(Math.abs(shoeBottom - hit.point.y) < .12, `clamp contact ${shoeBottom} vs ${hit.point.y}`);
    }
    assert.ok(hook.boundingBox.min.y > -1, 'spreader enters the inspection-face zone');
  } finally { coil.dispose(); hook.dispose(); material.dispose(); }
});

test('each actual inspection face selects its forward worklight within the fixed two-light budget', () => {
  for (const z of [-2.65, -7.65]) {
    const pair = [-1, -1];
    nearestIbdFixtures(-12, z, pair, 2.35);
    assert.ok(pair.some(i => i >= 0 && IBD_FIXTURES[i].mount === 'strip'
      && Math.abs(IBD_FIXTURES[i].aim[2] - z) < .01), `workface at ${z} has no local key light`);
  }
});
