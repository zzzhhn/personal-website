import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { buildAlphaExchangeGeometry, EXCHANGE_COLLIDER_NAMES } from './WorldAlphaExchangeGeometry.ts';
import { ALPHA_EXCHANGE_ORIGIN } from './alpha-exchange-layout.ts';
import { EXCHANGE_ARCHIVE_DRAWERS, EXCHANGE_PLAY_PROPS } from './alpha-exchange-play-layout.ts';
import { exchangeGlassBays } from './exchange-glass-bays.ts';

await R.init();

test('every exchange render range covers its own faces and every collision triangle traces back to exactly one range', () => {
  const built = buildAlphaExchangeGeometry();
  const byName = new Map(Object.entries(EXCHANGE_COLLIDER_NAMES).map(([kind, name]) => [name, built.colliders[kind]]));
  const ranges = new Map([...byName.keys()].map(name => [name, []]));
  try {
    for (const [geometry, sources] of [[built.body, built.bodySources], [built.glass, built.glassSources]]) {
      const visible = geometry.getAttribute('position').array;
      const ids = new Set();
      let end = 0;
      assert.equal(geometry.index, null);
      for (const source of sources) {
        assert.ok(!ids.has(source.id), source.id);
        ids.add(source.id);
        assert.equal(source.firstVertex, end, source.id);
        assert.ok(source.vertexCount > 0 && source.vertexCount % 3 === 0, source.id);
        end += source.vertexCount;
        if (source.collision === 'none') {
          assert.equal(source.surfaceId, undefined, source.id);
          continue;
        }
        const collider = byName.get(source.surfaceId);
        assert.ok(collider, source.id);
        const start = source.colliderFirstVertex;
        assert.deepEqual(collider.vertices.subarray(start * 3, (start + source.vertexCount) * 3),
          visible.subarray(source.firstVertex * 3, end * 3), source.id);
        ranges.get(source.surfaceId).push(source);
      }
      assert.equal(end * 3, visible.length);
    }
    for (const [name, collider] of byName) {
      let end = 0;
      for (const source of ranges.get(name).sort((a,b) => a.colliderFirstVertex - b.colliderFirstVertex)) {
        assert.equal(source.colliderFirstVertex, end, source.id);
        end += source.vertexCount;
      }
      assert.equal(end * 3, collider.vertices.length, name);
      assert.equal(end, collider.indices.length, name);
      assert.ok(collider.indices.every((vertex, index) => vertex === index), name);
    }
    const source = id => built.bodySources.find(source => source.id === id);
    assert.equal(source('entry-porch-top')?.surfaceId, EXCHANGE_COLLIDER_NAMES.surface);
    assert.equal(source('gallery-rear-top')?.surfaceId, EXCHANGE_COLLIDER_NAMES.surface);
    assert.equal(source('entry-ramp-top')?.surfaceId, EXCHANGE_COLLIDER_NAMES.surface);
    assert.equal(source('clock-housing')?.surfaceId, EXCHANGE_COLLIDER_NAMES.solid);
    assert.equal(source('clock-bezel')?.surfaceId, EXCHANGE_COLLIDER_NAMES.solid);
    assert.equal(source('trading-island-brass-inlay')?.collision, 'none');
  } finally {
    built.body.dispose();
    built.glass.dispose();
  }
});

test('the installed exchange support and contact faces meet their visible model in world coordinates', t => {
  const built = buildAlphaExchangeGeometry();
  const world = new R.World({ x: 0, y: -12.5, z: 0 });
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const bays = exchangeGlassBays(built.glass, built.glassRanges);
  const meshes = [built.body, ...bays].map(geometry => new Mesh(geometry, material));
  const registrations = new Map();
  try {
    for (const mesh of meshes) {
      mesh.position.set(...ALPHA_EXCHANGE_ORIGIN);
      mesh.updateMatrixWorld();
    }
    for (const [kind, descriptor] of Object.entries(built.colliders)) {
      const owner = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...ALPHA_EXCHANGE_ORIGIN));
      const collider = world.createCollider(R.ColliderDesc.trimesh(descriptor.vertices, descriptor.indices, descriptor.flags), owner);
      registrations.set(collider.handle, EXCHANGE_COLLIDER_NAMES[kind]);
    }
    world.step();
    const downward = [0, -1, 0], north = [0, 0, -1], east = [1, 0, 0];
    const cases = [
      ['bridge side of the porch seam', [0, .25, 3.41], downward, 'surface', 'approach-top'],
      ['porch side of the bridge seam', [0, .25, 3.39], downward, 'surface', 'entry-porch-top'],
      ['front door sill', [0, .25, 1.19], downward, 'surface', 'vestibule-top'],
      ['entrance ramp', [0, .55, -6.1], downward, 'surface', 'entry-ramp-top'],
      ['side exit slope onto the island', [24.8, .25, -32.5], downward, 'surface', 'side-exit-grade-top'],
      ['gallery above the ground floor', [2.5, 5.5, -37.3], downward, 'surface', 'gallery-rear-top'],
      ['same XZ below the gallery', [2.5, 1.0, -37.3], downward, 'surface', 'rear-walk-top'],
      ['trading desk position rail', [-1.35, 1.106, -15], north, 'solid', 'desk-position-rail'],
      ['archive ticket tray', [-11.7, 1.445, -18], north, 'solid', 'archive-ticket-tray'],
      ['clock bezel', [1.57, 10.55, -38], north, 'solid', 'clock-bezel'],
      ['window shared draw range', [16, 8.15, -10], east, 'solid', 'window-1--12'],
      ...EXCHANGE_ARCHIVE_DRAWERS.map(({ contact: [x,y,z] }, i) =>
        [`drawer ${i + 1} floor`, [x, y + .02, z + .04], downward, 'solid', `archive-drawer-${i}-floor`]),
    ];
    for (const [label, position, direction, kind, id] of cases) {
      const start = new Vector3(...position).add(new Vector3(...ALPHA_EXCHANGE_ORIGIN));
      const ray = new Vector3(...direction);
      const hit = new Raycaster(start, ray, 0, 2.5).intersectObjects(meshes)[0];
      const physical = world.castRay(new R.Ray(start, ray), 2.5, true);
      assert.ok(hit && physical, label);
      const sources = hit.object === meshes[0] ? built.bodySources : built.glassSources;
      const source = sources.find(p => hit.face.a >= p.firstVertex && hit.face.a < p.firstVertex + p.vertexCount);
      assert.equal(source?.id, id, label);
      assert.equal(registrations.get(physical.collider.handle), EXCHANGE_COLLIDER_NAMES[kind], label);
      const gap = Math.abs(hit.distance - physical.timeOfImpact);
      assert.ok(gap < .001, `${label}: geometry and physics separated by ${gap} m`);
      t.diagnostic(`${label}: ${gap.toFixed(6)} m render/physics difference`);
    }
    const { receiptRest: [x,y,z], receiptSize } = EXCHANGE_PLAY_PROPS.clearing;
    const origin = new Vector3(x, y, z).add(new Vector3(...ALPHA_EXCHANGE_ORIGIN));
    const tray = world.castRay(new R.Ray(origin, { x: 0, y: -1, z: 0 }), .05, true);
    assert.ok(tray && Math.abs(tray.timeOfImpact - receiptSize[1] / 2) < .001,
      'the scripted paper receipt rests directly on the visible tray');
  } finally {
    world.free();
    material.dispose();
    for (const g of [built.body, built.glass, ...bays]) g.dispose();
  }
});
