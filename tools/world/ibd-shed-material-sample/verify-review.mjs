import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const dir = new URL('../../../docs/world/phase-2-playground/asset-batch6-20261103/ibd-rework/screenshots/', import.meta.url);
const keys = ['view','fov','cameraPosition','quaternion','exposure','dpr','time','canvas','quality','night','blend'];
const pairs = {};
for (const time of ['day','night']) {
  const shots = ['baseline','candidate'].map(mode => {
    const name = mode + '-' + time;
    const shot = JSON.parse(readFileSync(new URL(name + '.json', dir)));
    const image = readFileSync(new URL(name + '.jpg', dir));
    assert(image.length > 50_000 && image.readUInt16BE() === 0xffd8);
    assert.equal(shot.view.id, 'Coil shed walk-up');
    assert.equal(shot.dpr, 1);
    assert.equal(shot.shadow.pending, false);
    assert(shot.warmup.stableAgeMs >= 3000 && shot.warmup.checks >= 3);
    assert.equal(shot.night, Number(time === 'night'));
    assert.equal(shot.ibd.compiled, mode === 'candidate');
    assert.equal(shot.ibd.material, mode === 'candidate' ? 'ibd-industrial-v4-static:coil-bay-v1' : 'ibd-industrial-v4-static');
    assert.deepEqual(shot.ibd.roles, mode === 'candidate' ? [0,1,2,3,4,5] : []);
    assert(shot.ibd.attributes.aIbdBake > 0);
    return { shot, sha256: createHash('sha256').update(image).digest('hex') };
  });
  const [base, candidate] = shots.map(x => x.shot);
  for (const key of keys) assert.deepEqual(base[key], candidate[key], time + ' ' + key);
  assert.notEqual(shots[0].sha256, shots[1].sha256);
  pairs[time] = shots.map(({ shot, sha256 }) => ({
    sha256, ibd: shot.ibd, calls: shot.renderer.render.calls,
    triangles: shot.renderer.render.triangles, textures: shot.renderer.memory.textures,
  }));
}
console.log(JSON.stringify(pairs, null, 2));
