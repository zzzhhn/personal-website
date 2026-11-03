import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const directory = new URL('../../../docs/world/phase-2-playground/asset-batch6-20261103/club-rework/screenshots/', import.meta.url);
const expected = {
  fabric: { triangles: [3120, 2896], roughness: .94 },
  wood: { triangles: [23507, 25287], roughness: .85 },
  stone: { triangles: [14324, 14460], roughness: .95 },
};
const settings = ['baseline','view','cameraPosition','cameraQuaternion','fov','time','canvas','exposure','dpr','quality','night','blend'];
const records = [];
const revisions = {};
for (const view of ['pavilion','basin']) for (const time of ['day','night']) {
  const pair = ['baseline','candidate'].map((mode, i) => {
    const label = view + '-' + mode + '-' + time;
    const historicalPavilionBaseline = view === 'pavilion' && mode === 'baseline';
    const location = historicalPavilionBaseline ? new URL('../structure-stage/', directory) : directory;
    const record = JSON.parse(readFileSync(new URL(label + '.json', location)));
    const screenshot = readFileSync(new URL(label + '.jpg', location));
    assert(screenshot.length > 20_000 && screenshot.readUInt16BE() === 0xffd8, label);
    assert.equal(record.mode, mode);
    assert.equal(record.view.id, 'D-' + view);
    assert.deepEqual(record.cameraPosition, record.view.eye);
    assert.equal(record.night, Number(time === 'night'));
    assert.equal(record.dpr, 1);
    assert.equal(record.blend, 1);
    assert.equal(record.shadow.pending, false);
    assert(record.warmup.stableAgeMs >= 3000 && record.warmup.checks >= 3);
    const revisionKey = view + '-' + mode;
    revisions[revisionKey] ??= record.revision;
    assert.equal(record.revision, revisions[revisionKey]);
    for (const surface of record.clubMaterials) {
      const { key, present, vertexColors, triangles, roughness, map, colors, roles, finishCompiled, finishGpuBytes, programKey } = surface;
      assert(present && vertexColors && !map && Object.keys(colors).length > 1);
      assert.equal(triangles, expected[key].triangles[i], label + ' ' + key);
      assert.equal(roughness, expected[key].roughness);
      if (!historicalPavilionBaseline) {
        assert.equal(finishCompiled, !!i);
        if (key === 'stone') assert(programKey.includes('club-basin-caustics'));
        if (i) assert(programKey.includes('djc-facility-finish'));
        assert.equal(finishGpuBytes, i ? triangles * 36 : 0);
        if (i) {
          assert.equal(Object.values(roles).reduce((n, count) => n + count, 0), triangles);
          const owned = { wood: [2, 3], fabric: [1, 2], stone: [4, 5, 6, 7] }[key];
          assert(owned.every(role => roles[role] > 0), label + ' ' + key + ' surface roles');
        } else assert.deepEqual(roles, {});
      }
      assert.equal(Object.values(colors).reduce((n, count) => n + count, 0), triangles);
    }
    return { record, hash: createHash('sha256').update(screenshot).digest('hex') };
  });
  const [baseline, candidate] = pair.map(({ record }) => record);
  for (const field of settings) assert.deepEqual(candidate[field], baseline[field], view + ' ' + field);
  if (view === 'basin') assert.equal(candidate.revision, baseline.revision);
  for (const [i, surface] of candidate.clubMaterials.entries()) assert.notDeepEqual(surface.colors, baseline.clubMaterials[i].colors);
  assert.notEqual(pair[0].hash, pair[1].hash);
  records.push({ view, time, scene: pair.map(({ record, hash }) => ({
    sha256: hash, calls: record.renderer.render.calls, triangles: record.renderer.render.triangles,
    geometries: record.renderer.memory.geometries, textures: record.renderer.memory.textures,
  })) });
}
const water = ['baseline','candidate'].map(mode => {
  const record = JSON.parse(readFileSync(new URL('basin-capture-' + mode + '.json', directory)));
  assert(record.enabled && record.budgeted && record.delta.captures > 0);
  assert.equal(record.durationMs, 12000);
  assert.equal(record.yawRadians, .064);
  return { mode, ...record, callsPerPass: record.delta.calls / record.delta.passes,
    trianglesPerPass: record.delta.triangles / record.delta.passes };
});
assert.deepEqual(water[0].targetSize, water[1].targetSize);
console.log(JSON.stringify({ revisions, records, water }, null, 2));
