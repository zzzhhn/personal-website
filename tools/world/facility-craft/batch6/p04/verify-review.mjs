import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const dir = new URL('../../../../../docs/world/phase-2-playground/asset-batch6-20261103/p04/screenshots/', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => readFileSync(new URL(file, dir));
for (const [time, minutes, night] of [['day', 720, 0], ['night', 0, 1]]) {
  const states = ['baseline', 'candidate'].map(mode => {
    const key = mode + '-' + time;
    const data = JSON.parse(read(key + '.json'));
    const shot = read(key + '.jpg');
    const ready = data.reviewReady;
    assert.equal(shot.subarray(0, 3).toString('hex'), 'ffd8ff');
    assert.equal(data.surfaceMode, mode);
    assert.equal(data.time, minutes);
    assert.equal(data.night, night);
    assert.equal(data.quality, 'balanced');
    assert.equal(data.exposure, 1);
    assert.equal(data.dpr, 1);
    assert.equal(data.blend, 1);
    assert.equal(data.shadowPending, false);
    assert.ok(data.reviewWarmup.stableAgeMs >= 3000 && data.reviewWarmup.checks >= 3);
    assert.ok(ready.ready && ready.cameraReady && ready.texturesReady && ready.geometryReady && ready.sampleReady && ready.instancesReady);
    assert.equal(ready.lensFaces, 48);
    assert.deepEqual(ready.slots, mode === 'baseline' ? [] : [0,1,2]);
    assert.equal(ready.textures.length, 3);
    assert.ok(ready.textures.every(texture => texture.width === 1024 && texture.height === 512
      && texture.gpuVersion === texture.version && texture.version > 0));
    assert.equal(data.lampInstances.find(x => x.name === 'park-lamp-physics-proxy').nonZeroPositions, 9);
    console.log(key + ' ' + hash(shot));
    return data;
  });
  for (const key of ['view','sourceVersion','canvas','fov','dpr','devicePixelRatio','exposure','quality','lampInstances']) {
    assert.deepEqual(states[0][key], states[1][key]);
  }
  for (const key of ['cameraPosition','cameraDirection','sampleHome']) {
    assert.deepEqual(states[0].reviewReady[key], states[1].reviewReady[key]);
  }
}
