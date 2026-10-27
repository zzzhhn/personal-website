import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { Euler, Quaternion } from 'three';
import { buildIbdStatic, buildIbdCoil, buildIbdPack, buildIbdLid, buildIbdCrane, buildIbdHook, buildIbdCables, buildIbdShutter, buildIbdTools } from './ibd-yard-geometry.ts';
import { IBD_STATIONS, IBD_CARGO_HOME } from './ibd-yard-layout.ts';
await RAPIER.init();
const identity = { x: 0, y: 0, z: 0, w: 1 }, capsule = new RAPIER.Capsule(.48, .34);
function fixture() {
  const data = buildIbdStatic(), world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  for (const s of data.solids) {
    const q = new Quaternion().setFromEuler(new Euler(...(s.rotation ?? [0, 0, 0])));
    world.createCollider(RAPIER.ColliderDesc.cuboid(...s.size.map(n => n / 2)).setTranslation(...s.at).setRotation(q));
  }
  for (const [slot, at] of Object.entries(IBD_CARGO_HOME)) {
    const coil = slot.startsWith('coil');
    world.createCollider(RAPIER.ColliderDesc.cuboid(...(coil ? [2, 2, 1.4] : [1.4, .55, 1.3])).setTranslation(at[0], at[1] + (coil ? 0 : .45), at[2]));
  }
  world.step();
  const free = (x, foot, z) => {
    let hit = false;
    world.intersectionsWithShape({ x, y: foot + .86, z }, identity, capsule, () => { hit = true; return false; });
    return !hit;
  };
  return { world, data, free, dispose: () => { world.free(); data.geometry.dispose(); } };
}
test('geometry is finite, bounded to the survey, and stays below the provisional triangle budget', () => {
  const staticData = buildIbdStatic();
  const geometries = [staticData.geometry, buildIbdCoil(false), buildIbdCoil(true, 2), buildIbdPack(4, 'M8'), buildIbdPack(3, 'M8'),
    buildIbdLid(), buildIbdLid(), buildIbdCrane(), buildIbdHook(), buildIbdCables(), buildIbdShutter(), buildIbdTools(), buildIbdPack(4, 'M6')];
  let triangles = 0;
  for (const g of geometries) {
    assert.ok(g.index && g.getAttribute('color')); triangles += g.index.count / 3;
    assert.ok([...g.getAttribute('position').array].every(Number.isFinite)); g.dispose();
  }
  assert.ok(triangles < 70000, `${triangles} triangles`);
  assert.ok(staticData.geometry.boundingBox.min.x >= -27.51 && staticData.geometry.boundingBox.max.x <= 27.51);
  assert.ok(staticData.geometry.boundingBox.min.z >= -22.51 && staticData.geometry.boundingBox.max.z <= 22.51);
});
test('south entrance and the outside portal landings have no facility collider obstruction', () => {
  const f = fixture();
  try {
    for (let z = 22; z <= 30; z += .5) for (const x of [-1, 0, 1]) assert.ok(f.free(x, .1, z), `entry blocked at ${x},${z}`);
    for (const z of [28.5, 31, 33.5]) assert.ok(f.free(-13, .1, z), `portal blocked at ${z}`);
  } finally { f.dispose(); }
});
test('west ramp, north deck and side gallery form a continuous capsule-clear route', () => {
  const f = fixture();
  try {
    for (let z = 4; z >= -13.5; z -= .25) {
      const top = .1 + Math.max(0, Math.min(4, (3.5 - z) * 4 / 17));
      assert.ok(f.free(-24, top, z), `ramp blocked at ${z}`);
    }
    for (let x = -24; x <= -6; x += .25) assert.ok(f.free(x, 4.12, -13.5), `deck blocked at ${x}`);
    for (let z = -13.5; z <= -2.5; z += .25) assert.ok(f.free(-6, 4.12, z), `gallery blocked at ${z}`);
  } finally { f.dispose(); }
});
test('every station has a collision-free standing point within its own interaction radius', () => {
  const f = fixture();
  try {
    for (const station of IBD_STATIONS) {
      const foot = station.id.startsWith('gallery') ? 4.12 : .1;
      const candidates = [[0, 0], [0, .6], [0, -.6], [.6, 0], [-.6, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
      assert.ok(candidates.some(([dx, dz]) => {
        const x = station.at[0] + dx, z = station.at[2] + dz;
        if (!f.free(x, foot, z)) return false;
        const origin = { x, y: foot + .86 + .45, z };
        const delta = { x: station.at[0] - x, y: station.at[1] + .2 - origin.y, z: station.at[2] - z };
        const length = Math.hypot(delta.x, delta.y, delta.z);
        return length < .35 || !f.world.castRay(new RAPIER.Ray(origin, { x: delta.x / length, y: delta.y / length, z: delta.z / length }), length - .3, true);
      }), `${station.id} has no clear standing point and line of sight`);
    }
  } finally { f.dispose(); }
});
