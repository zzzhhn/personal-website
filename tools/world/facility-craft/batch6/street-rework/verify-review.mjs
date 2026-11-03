import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const directory = new URL('../../../../../docs/world/phase-2-playground/asset-batch6-20261103/street-rework/screenshots/', import.meta.url);
const families = {
  barrier: ['G-barrier', 1440, 1680],
  lamp: ['G-lamp', 2118, 2550],
  signal: ['S-signal', 3210, 3518],
};
const poseFields = ['sampleHome', 'actualHome', 'cameraPosition', 'cameraDirection', 'glow'];
const settings = ['view', 'fov', 'time', 'canvas', 'exposure', 'dpr', 'devicePixelRatio', 'quality', 'night', 'blend', 'sourceVersion'];
let sourceVersion;
const records = [];
for (const [family, [id, baselineTriangles, candidateTriangles]] of Object.entries(families)) {
  for (const light of ['day', 'night']) {
    const captures = ['baseline', 'candidate'].map((mode, i) => {
      const name = family + '-' + mode + '-' + light;
      const record = JSON.parse(readFileSync(new URL(name + '.json', directory)));
      const screenshot = readFileSync(new URL(name + '.jpg', directory));
      const { reviewReady: ready } = record;
      assert(screenshot.length > 20_000 && screenshot.readUInt16BE() === 0xffd8, name);
      assert.equal(record.view.id, id);
      assert.equal(record.surfaceMode, mode);
      assert.equal(ready.currentMode, mode);
      assert.equal(record.night, Number(light === 'night'));
      assert.equal(record.shadowPending, false);
      assert.equal(record.dpr, 1);
      assert.equal(record.blend, 1);
      assert(ready.ready && ready.sampleReady && ready.cameraReady && ready.texturesReady);
      assert(record.reviewWarmup.stableAgeMs >= 3000 && record.reviewWarmup.checks >= 3);
      assert.equal(ready.triangles, i ? candidateTriangles : baselineTriangles);
      assert(i ? ready.counts[2] > 0 && ready.counts[3] > 0 : Object.keys(ready.counts).join() === '0');
      sourceVersion ??= record.sourceVersion;
      assert.deepEqual(record.sourceVersion, sourceVersion);
      return { record, digest: createHash('sha256').update(screenshot).digest('hex') };
    });
    const [baseline, candidate] = captures.map(({ record }) => record);
    for (const field of settings) assert.deepEqual(candidate[field], baseline[field], family + ' ' + field);
    for (const field of poseFields) {
      assert.deepEqual(candidate.reviewReady[field], baseline.reviewReady[field], family + ' ' + field);
    }
    assert.notEqual(captures[0].digest, captures[1].digest);
    const signalState = family === 'signal' ? captures.map(({ record }) => {
      const phase = (record.reviewReady.windTime + 7) % 14;
      return phase < 6 ? 'green' : phase < 7.5 ? 'amber' : 'red';
    }) : null;
    if (signalState) assert.equal(signalState[0], signalState[1], light + ' signal state');
    records.push({ family, light, signalState, scene: captures.map(({ record, digest }) => ({
      sha256: digest, calls: record.renderer.render.calls, triangles: record.renderer.render.triangles,
      geometries: record.renderer.memory.geometries, textures: record.renderer.memory.textures,
    })) });
  }
}
console.log(JSON.stringify(records, null, 2));
