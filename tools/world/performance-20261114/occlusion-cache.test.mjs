import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(spec, ctx, next) { return next(spec === './store.ts' ? new URL('./store-stub.mjs', import.meta.url).href : spec, ctx); } });
const { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Vector3 } = await import('three');
const { WorldOcclusion } = await import(process.env.OCCLUSION_MODULE ?? '../../../src/components/world/WorldOcclusion.ts');

function rig() {
  const scene = new Scene(), camera = new PerspectiveCamera(50, 1, .1, 100), target = new Vector3(0, 1.2, 0);
  const source = new MeshStandardMaterial({ color: '#808080' });
  let hookRuns = 0;
  source.onBeforeCompile = shader => { hookRuns++; shader.uniforms.uOwn = { value: 1 }; };
  source.customProgramCacheKey = () => 'own-hook';
  const wall = new Mesh(new BoxGeometry(4, 4, .4), source); wall.castShadow = true; wall.position.set(0, 1.2, 5);
  scene.add(wall); scene.updateMatrixWorld(true);
  const occ = new WorldOcclusion();
  const look = blocked => { camera.position.set(blocked ? 0 : 20, 1.2, 10); camera.updateMatrixWorld(true); };
  const run = (blocked, frames = 20, dt = 1 / 30) => { look(blocked); for (let i = 0; i < frames; i++) occ.update(scene, camera, target, dt); };
  return { scene, occ, wall, source, run, hookRuns: () => hookRuns };
}
const disposals = m => { const box = { n: 0 }; m.addEventListener('dispose', () => box.n++); return box; };

test('a faded mesh reuses its cached corridor material instead of disposing it', () => {
  const r = rig();
  r.run(true, 2);
  const copy = r.wall.material; assert.notEqual(copy, r.source); assert.equal(copy.transparent, true); assert.equal(copy.depthWrite, false);
  const gone = disposals(copy);
  r.run(false, 30);
  assert.equal(r.wall.material, r.source, 'inactive mesh shows its untouched source');
  assert.equal(gone.n, 0, 'copy kept alive (program reference held)');
  r.source.color.set('#ff0000'); r.source.roughness = .3;
  r.run(true, 2);
  assert.equal(r.wall.material, copy, 'same copy reused: no new program');
  assert.ok(copy.color.equals(new Color('#ff0000')) && copy.roughness === .3, 'source property updates propagate');
  assert.equal(copy.transparent, true); assert.equal(copy.depthWrite, false);
  const c = r.occ.debug().cache; assert.equal(c.created, 1); assert.equal(c.reused, 1); assert.equal(c.released, 0);
});

test('fade amount and visuals start from zero on reuse and keep the original hook and key', () => {
  const r = rig();
  r.run(true, 1);
  const copy = r.wall.material;
  assert.equal(copy.customProgramCacheKey(), 'own-hook-view-corridor-v2');
  const shader = { uniforms: {}, vertexShader: '#include <project_vertex>', fragmentShader: '#include <alphatest_fragment>' };
  copy.onBeforeCompile(shader, null);
  assert.equal(r.hookRuns(), 1); assert.ok(shader.uniforms.uOwn && shader.uniforms.uViewFade && shader.uniforms.uViewFadeStart);
  assert.match(shader.fragmentShader, /uViewFade \* fadeMask/);
  r.run(false, 30); r.run(true, 1);
  const amount = r.occ.debug().fades[0].amount; assert.ok(amount > 0 && amount < .4, `reuse restarts the fade (${amount})`);
});

test('swapped source material, unmounted mesh and dispose release cached copies', () => {
  const r = rig();
  r.run(true, 2); const copy = r.wall.material, gone = disposals(copy);
  r.run(false, 30);
  const replacement = new MeshStandardMaterial(); r.wall.material = replacement;
  r.run(false, 20, .1);
  assert.equal(gone.n, 1); assert.equal(r.wall.material, replacement); assert.equal(r.occ.debug().cache.entries, 0);

  r.run(true, 2); const copy2 = r.wall.material, gone2 = disposals(copy2);
  r.run(false, 30); r.scene.remove(r.wall);
  r.run(false, 20, .1);
  assert.equal(gone2.n, 1); assert.equal(r.occ.debug().cache.entries, 0);

  r.scene.add(r.wall); r.wall.material = r.source; r.scene.updateMatrixWorld(true);
  r.run(true, 2); const copy3 = r.wall.material, gone3 = disposals(copy3);
  r.occ.dispose(); assert.equal(r.wall.material, r.source); assert.equal(gone3.n, 1);
});

test('owner swapping the material while faded is not overwritten', () => {
  const r = rig();
  r.run(true, 2); const copy = r.wall.material, gone = disposals(copy);
  const replacement = new MeshStandardMaterial(); r.wall.material = replacement;
  r.run(false, 30, .1);
  assert.equal(r.wall.material, replacement); assert.equal(gone.n, 1);
});

test('idle variants are released after the idle limit', () => {
  const r = rig();
  r.run(true, 2); const gone = disposals(r.wall.material);
  r.run(false, 30); r.run(false, 200, .5);
  assert.equal(gone.n, 1); assert.equal(r.occ.debug().cache.entries, 0);
});

function arrayRig() {
  const r = rig(); const a = new MeshStandardMaterial(), b = new MeshStandardMaterial();
  const geometry = r.wall.geometry.clone(); geometry.clearGroups(); geometry.addGroup(0, 18, 0); geometry.addGroup(18, 18, 1);
  r.wall.geometry = geometry; const list = [a, b]; r.wall.material = list; return { ...r, list, a, b };
}
test('material arrays: in-place member/length edits invalidate the cache (inactive and active)', () => {
  const r = arrayRig();
  r.run(true, 2); const applied = r.wall.material; assert.ok(Array.isArray(applied) && applied !== r.list && applied[0] !== r.a);
  const gone = disposals(applied[0]);
  r.run(false, 30); assert.equal(r.wall.material, r.list);
  const c = new MeshStandardMaterial(); r.list[1] = c;                      // in-place edit while inactive
  r.run(true, 2); assert.equal(gone.n, 1, 'stale variant released');
  const fresh = r.wall.material; assert.equal(fresh.length, 2); assert.notEqual(fresh[0], applied[0]);
  assert.equal(r.occ.debug().cache.created, 2);
  const gone2 = disposals(fresh[0]);
  const own = new MeshStandardMaterial(); fresh[1] = own;                   // owner edits our applied array while active
  r.run(false, 30, .1); assert.equal(gone2.n, 1); assert.equal(r.wall.material, fresh, 'external edit not overwritten');
  r.list.push(new MeshStandardMaterial()); r.wall.material = r.list; r.run(true, 2); r.run(false, 30);
  const g3 = r.occ.debug().cache.created; r.list.length = 2; r.run(true, 2);   // length change while inactive
  assert.equal(r.occ.debug().cache.created, g3 + 1);
});
test('geometry change releases the cache; active fade does not overwrite an external replacement when not hit', () => {
  const r = rig();
  r.run(true, 2); const gone = disposals(r.wall.material);
  r.run(false, 30); r.wall.geometry = new BoxGeometry(4, 4, .4); r.run(true, 2);
  assert.equal(gone.n, 1); assert.equal(r.occ.debug().cache.created, 2);
  const copy = r.wall.material, gone2 = disposals(copy);
  r.wall.geometry = new BoxGeometry(4, 4, .4); r.run(false, 1);               // geometry swap during an active fade
  assert.equal(gone2.n, 1); assert.equal(r.wall.material, r.source, 'disposed copy never left on the mesh');
  r.run(true, 2); const rebuilt = r.wall.material;
  assert.notEqual(rebuilt, copy); assert.equal(r.occ.debug().cache.created, 3, 'rebuilt from the real source');
  r.run(true, 2); r.wall.geometry = new BoxGeometry(4, 4, .4); r.run(true, 1);  // geometry swap while still hit
  assert.notEqual(r.wall.material, rebuilt); assert.equal(r.occ.debug().cache.created, 4);
  r.run(false, 30); assert.equal(r.wall.material, r.source);
  r.run(true, 2); const c3 = r.wall.material, gone3 = disposals(c3);
  const replacement = new MeshStandardMaterial(); r.wall.material = replacement; r.run(false, 1);
  assert.equal(r.wall.material, replacement); assert.equal(gone3.n, 1);
});

test('owner editing its source array in place during an active fade releases and restores the owner array', () => {
  const r = arrayRig();
  r.run(true, 2); const applied = r.wall.material, gone = disposals(applied[0]);
  const c = new MeshStandardMaterial(); r.list[1] = c;                      // owner array is not on the mesh right now
  r.run(false, 1);
  assert.equal(gone.n, 1); assert.equal(r.wall.material, r.list, 'owner array restored, disposed copies removed');
  r.run(true, 2); const next = r.wall.material;
  assert.ok(Array.isArray(next) && next[0] !== r.a && next[1] !== c && next[1].type === 'MeshStandardMaterial');
  r.list.length = 1; r.list[0] = new MeshStandardMaterial(); r.wall.geometry.clearGroups(); r.wall.geometry.addGroup(0, Infinity, 0);
  r.run(true, 1); assert.equal(r.occ.debug().cache.released, 2, 'length edit while hit also invalidates');
  assert.equal(r.wall.material.length, 1);
});
