import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { Group, Mesh, BoxGeometry, MeshPhysicalMaterial, PerspectiveCamera, Ray, Texture, Vector3 } from 'three';
import { buildDjcClubGeometry } from './WorldDjcClubGeometry.ts';
import { DJC_BAR_ASSETS, DJC_BAR_BOXES, DJC_BAR_DANCE_JOIN, DJC_BAR_ORIGIN, DJC_BAR_STOOLS, buildDjcBarProxy, cloneDjcBarVisual, createDjcBarPrefetchCheck, djcBarLod, djcBarQaOpaque, djcBarQaMode, djcBarWorld, shareDjcBarTexture } from './djc-bar-layout.ts';

const proxy = buildDjcBarProxy(), club = buildDjcClubGeometry();
function hit(data, origin, direction, cull = true) {
  const ray = new Ray(new Vector3(...origin), new Vector3(...direction)), p = data.vertices;
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), q = new Vector3();
  let distance = Infinity, point = null;
  for (let i = 0; i < p.length; i += 9) if (ray.intersectTriangle(a.fromArray(p, i), b.fromArray(p, i + 3), c.fromArray(p, i + 6), cull, q)) {
    const d = ray.origin.distanceTo(q); if (d < distance) { distance = d; point = q.clone(); }
  }
  return point;
}
test('GLB contract uses standard Y-up, exact origin and new stool positions', () => {
  assert.deepEqual(DJC_BAR_ORIGIN, [40.75, 1.2, 40]);
  assert.deepEqual(DJC_BAR_STOOLS.map(s => djcBarWorld(s.center)[0]), [37.2, 39.5, 41.8, 44.1]);
  for (const s of DJC_BAR_STOOLS) {
    assert.equal(djcBarWorld(s.center)[2], 40.25);
    const support = hit(proxy.surface, [s.center[0], 2, s.center[2]], [0, -1, 0]);
    assert.ok(support); assert.ok(Math.abs(support.y - .77) < 1e-6);
    const world = djcBarWorld([s.center[0], support.y, s.center[2]]);
    assert.ok(Math.abs(world[1] - 1.97) < 1e-6);
  }
  assert.equal(DJC_BAR_ASSETS.near, '/assets/world/club/bar/djc-north-bar-v1.glb');
  assert.equal(DJC_BAR_ASSETS.far, '/assets/world/club/bar/djc-north-bar-lod1-v1.glb');
});
test('fixed proxies have bounded, finite, nondegenerate triangles and no detail-LOD input', () => {
  for (const kind of ['surface', 'solid']) {
    const { vertices: p, indices } = proxy[kind];
    assert.ok(indices.length / 3 < 250);
    for (const v of p) assert.ok(Number.isFinite(v));
    for (let i = 0; i < p.length; i += 9) {
      const a = new Vector3().fromArray(p, i), b = new Vector3().fromArray(p, i + 3), c = new Vector3().fromArray(p, i + 6);
      assert.ok(b.sub(a).cross(c.sub(a)).lengthSq() > 1e-12);
    }
    const again = buildDjcBarProxy(); assert.deepEqual(again[kind], proxy[kind]); again.roof.dispose();
  }
  assert.equal(DJC_BAR_BOXES.filter(b => b.name === 'post').length, 4);
  assert.equal(DJC_BAR_BOXES.filter(b => b.name === 'planter').length, 2);
  assert.ok(Math.abs(hit(proxy.surface, [0, 1, 1.5], [0, -1, 0]).y) < 1e-6);
});
test('roof blocks rays from above and below with front-face camera culling', () => {
  for (const z of [-2, -.5, .5, 2]) {
    const above = hit(proxy.solid, [0, 6, z], [0, -1, 0]);
    const below = hit(proxy.solid, [0, 2.5, z], [0, 1, 0]);
    assert.ok(above && below, `roof z=${z}`);
    assert.ok(above.y > below.y && Math.abs(above.y - below.y - .12) < 1e-5);
  }
  assert.ok(hit(proxy.solid, [-4, 1.9, 1.8], [-1, 0, 0]), 'post is solid');
  assert.ok(hit(proxy.solid, [0, .6, 0], [0, 0, -1]), 'counter is solid');
});
test('dance approach meets the GLB deck without a step or an intersecting ramp', () => {
  const seam = DJC_BAR_DANCE_JOIN.z;
  for (const x of [36, 37.5, 39.5]) {
    const before = hit(proxy.surface, [x - DJC_BAR_ORIGIN[0], 2, seam - .01 - DJC_BAR_ORIGIN[2]], [0, -1, 0]);
    const after = hit(club.colliders.surface, [x, 3, seam + .01], [0, -1, 0]);
    assert.ok(before && after); assert.ok(Math.abs(after.y - (before.y + DJC_BAR_ORIGIN[1])) < .002);
    assert.equal(hit(club.colliders.surface, [x, 3, seam - .01], [0, -1, 0]), null, 'approach no longer overlaps the deck');
  }
});
test('legacy bar stools, roof and emitters are removed from procedural venue', () => {
  const oldSeat = hit(club.colliders.surface, [37.2, 3, 41.35], [0, -1, 0]);
  assert.ok(!oldSeat || oldSeat.y < 1.8, `old stool support ${oldSeat?.y}`);
  assert.equal(hit(club.colliders.solid, [40.8, 6.8, 38.9], [0, -1, 0]), null, 'old bar roof/counter removed');
  const amber = club.batches.amber.getAttribute('position');
  for (let i = 0; i < amber.count; i++) {
    const x = amber.getX(i), y = amber.getY(i), z = amber.getZ(i);
    assert.ok(!(x > 36.5 && x < 44.5 && y > 2 && y < 4 && z > 38 && z < 40), 'old bar light removed');
  }
});
test('ground approach crosses the bar front lip instead of meeting a 20 cm vertical wall', () => {
  for (const x of [40.75, 41.8, 43]) {
    let previous = 1.01;
    for (let z = 43.19; z >= DJC_BAR_DANCE_JOIN.z; z -= .04) {
      const point = hit(club.colliders.surface, [x, 1.3, z], [0, -1, 0]);
      assert.ok(point, `missing threshold at ${x},${z}`);
      assert.ok(point.y >= previous - 1e-5 && point.y - previous < .02);
      previous = point.y;
    }
    assert.ok(Math.abs(previous - DJC_BAR_DANCE_JOIN.y) < .015);
  }
});
test('LOD hysteresis and QA-only opaque comparison do not change collision contract', () => {
  assert.equal(djcBarLod(25, 'far'), 'near'); assert.equal(djcBarLod(27, 'far'), 'far');
  assert.equal(djcBarLod(29, 'near'), 'near'); assert.equal(djcBarLod(31, 'near'), 'far');
  assert.equal(djcBarQaOpaque('?djcBarTransmission=0'), false);
  assert.equal(djcBarQaOpaque('?qa=1&djcBarTransmission=0'), true);
  assert.equal(djcBarQaOpaque('?qa=1'), false);
  assert.equal(djcBarQaMode('?djcBar=legacy'), 'auto');
  assert.equal(djcBarQaMode('?qa=1&djcBar=legacy'), 'legacy');
  assert.equal(djcBarQaMode('?qa=1&djcBar=near'), 'near');
  assert.equal(djcBarQaMode('?qa=1&djcBar=far'), 'far');
});
test('bar prefetch accounts for the camp camera, the close offscreen radius and the viewport edge', () => {
  const wantsAsset = createDjcBarPrefetchCheck();
  const center = new Vector3(...DJC_BAR_ORIGIN), camera = new PerspectiveCamera(50, 1951 / 1062, .1, 600);
  const eligible = () => wantsAsset(camera, camera.position.distanceTo(center));
  camera.position.set(-36.5, 7, 24.6);
  camera.quaternion.set(-.06310534784218876, -.3773144837755987, -.025780923859161607, .9235728663033786);
  assert.equal(eligible(), false);
  camera.lookAt(center);
  assert.equal(eligible(), true);

  camera.position.copy(center);
  camera.position.x += 36;
  camera.lookAt(center.clone().add(new Vector3(100, 0, 0)));
  assert.equal(eligible(), false);
  camera.position.x -= 1;
  assert.equal(eligible(), true);

  const barCenter = center.clone().add(new Vector3(0, 2.5, 0));
  camera.position.copy(barCenter).x += 70;
  camera.lookAt(barCenter.x, barCenter.y, barCenter.z - 70);
  camera.updateMatrixWorld();
  assert.ok(Math.abs(barCenter.clone().project(camera).x) > 1);
  assert.equal(eligible(), true, 'the padded bound intersects the viewport');
});
test('QA legacy mode restores the actual frozen source mesh, not a recreated approximation', () => {
  const baseline = JSON.parse(readFileSync(new URL('../../../docs/world/phase-2-playground/djc-quality-pilot-20261101/baseline.json', import.meta.url)));
  const legacy = buildDjcClubGeometry({ includeNorthBar: true });
  for (const [name, expected] of Object.entries(baseline.batches)) {
    const p = legacy.batches[name].getAttribute('position').array, selected = [];
    for (let i = 0; i < p.length; i += 9) {
      let inside = true;
      for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) if (p[i + j * 3 + k] < baseline.bounds.min[k] || p[i + j * 3 + k] > baseline.bounds.max[k]) inside = false;
      if (inside) selected.push(...p.slice(i, i + 9));
    }
    assert.deepEqual(selected, expected.positions, name);
  }
  const support = hit(legacy.colliders.surface, [37.2, 3, 41.35], [0, -1, 0]);
  assert.ok(Math.abs(support.y - 1.845) < 1e-5);
  Object.values(legacy.batches).forEach(g => g.dispose()); legacy.pool.dispose();
});
test('two LODs share external GPU textures while sampler/color-space variants remain distinct', () => {
  const registry = new Map(), near = new Texture(), far = new Texture(), variant = new Texture();
  const uri = 'https://world.local/assets/world/club/bar/textures/wood_diff.jpg';
  assert.equal(shareDjcBarTexture(near, uri, registry), near);
  assert.equal(shareDjcBarTexture(far, uri, registry), near);
  variant.colorSpace = 'srgb'; assert.equal(shareDjcBarTexture(variant, uri, registry), variant);
  assert.equal(shareDjcBarTexture(far, undefined, registry), far, 'embedded sources are not guessed equal');
  assert.equal(registry.size, 2);
  let disposed = 0; near.addEventListener('dispose', () => disposed++);
  registry.clear(); assert.equal(disposed, 0, 'loader-owned canonical texture is never disposed by the bar');
  near.dispose(); far.dispose(); variant.dispose();
});
test('runtime glass keeps maps and source PBR while avoiding a whole-scene transmission pass', () => {
  const source = new Group(), map = new Texture(), env = new Texture(), geometry = new BoxGeometry();
  const material = new MeshPhysicalMaterial({ name: 'Oiled teak', map, transmission: 1, roughness: .23 });
  source.add(new Mesh(geometry, material), new Mesh(geometry, material));
  let sourceDisposals = 0, textureDisposals = 0, geometryDisposals = 0, cloneDisposals = 0;
  material.addEventListener('dispose', () => sourceDisposals++); map.addEventListener('dispose', () => textureDisposals++);
  geometry.addEventListener('dispose', () => geometryDisposals++);
  const normal = cloneDjcBarVisual(source, false, env), opaque = cloneDjcBarVisual(source, true, env);
  const full = cloneDjcBarVisual(source, false, env, undefined, true);
  assert.equal(normal.materials.length, 1); assert.equal(normal.materials[0].map, map);
  assert.equal(normal.materials[0].transmission, 0); assert.equal(normal.materials[0].envMap, env);
  assert.equal(normal.materials[0].transparent, true); assert.equal(normal.materials[0].depthWrite, false);
  assert.ok(normal.materials[0].opacity > 0 && normal.materials[0].opacity < .3);
  assert.equal(full.materials[0].transmission, 1); assert.equal(full.materials[0].transparent, false);
  assert.equal(opaque.materials[0].transmission, 0); assert.equal(material.transmission, 1);
  assert.equal(normal.root.children[0].geometry, geometry);
  assert.equal(normal.root.children[0].material, normal.root.children[1].material);
  normal.materials[0].addEventListener('dispose', () => cloneDisposals++);
  normal.dispose(); normal.dispose(); opaque.dispose(); full.dispose();
  assert.equal(cloneDisposals, 1); assert.equal(sourceDisposals + textureDisposals + geometryDisposals, 0);
  material.dispose(); geometry.dispose(); map.dispose(); env.dispose();
});
after(() => { proxy.roof.dispose(); Object.values(club.batches).forEach(g => g.dispose()); club.pool.dispose(); });
