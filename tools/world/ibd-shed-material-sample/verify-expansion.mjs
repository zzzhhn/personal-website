import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const dir = process.argv[2];
const record = name => {
  assert(statSync(`${dir}/screenshots/${name}.jpg`).size > 25_000, name);
  return JSON.parse(readFileSync(`${dir}/screenshots/${name}.json`, 'utf8'));
};

for (const [prefix, view] of [
  ['coil', 'Coil shed walk-up'], ['parts', 'Parts shed'],
  ['dispatch', 'Dispatch shed'],
]) {
  for (const time of ['day', 'night']) {
    const base = record(`${prefix}-baseline-${time}`);
    const next = record(`${prefix}-candidate-${time}`);
    for (const key of ['view', 'cameraPosition', 'quaternion', 'canvas', 'dpr', 'fov', 'exposure', 'time', 'quality', 'night']) {
      assert.deepEqual(base[key], next[key], `${prefix} ${time} ${key}`);
    }
    assert.equal(base.view.id, view);
    assert.equal(base.night, time === 'night' ? 1 : 0);
    assert.equal(base.ibd.material, 'ibd-industrial-v4-static');
    assert.equal(base.ibd.triangles, 45469);
    assert.equal(next.ibd.material, 'ibd-industrial-v4-static:ibd-envelope-v2');
    assert.equal(next.ibd.triangles, 46693);
    assert(next.ibd.compiled && next.ibd.roles.includes(37) && !next.ibd.roles.includes(8));
    for (const r of [base, next]) {
      assert.equal(r.dpr, 1);
      assert.equal(r.blend, 1);
      assert(r.warmup.stableAgeMs >= 3000 && r.warmup.checks >= 3);
      assert.equal(r.shadow.pending, false);
    }
  }
}
const joint = record('eave-candidate-day');
assert.equal(joint.view.id, 'East eave joint');
assert.equal(joint.ibd.triangles, 46693);
assert.equal(joint.night, 0);
assert(joint.ibd.compiled && joint.warmup.checks >= 3 && !joint.shadow.pending);
console.log('Verified three matched day/night pairs and the eave detail.');
