// Run with node --import ./tools/world/alpha-mine-tests/register.mjs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildDjcClubGeometry } from '../../../src/components/world/WorldDjcClubGeometry.ts';

const signatures = new Map();
function hash(...values) {
  const sha = createHash('sha256');
  for (const value of values) {
    if (ArrayBuffer.isView(value)) sha.update(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    else sha.update(JSON.stringify(value));
  }
  return sha.digest('hex');
}

function inspect(mode, options) {
  const query = mode === 'baseline' ? '?djcPavilion=baseline' : mode === 'candidate' ? '?djcBasin=candidate' : '';
  globalThis.window = { location: { search: query } };
  const marked = {};
  const model = buildDjcClubGeometry({ ...options, recordAssembly: (family, part, ranges) => {
    for (const [batch, range] of Object.entries(ranges)) (marked[batch] ??= []).push({ family, part, range });
  } });
  if (mode === 'candidate') for (const [batch, ranges] of Object.entries(marked)) {
    const attribute = model.batches[batch].getAttribute('aDjcFinish');
    for (let i = 0; i < attribute.count; i += 3) {
      const owned = ranges.find(({ range: [start, end] }) => i >= start && i < end);
      const role = attribute.getZ(i);
      assert.equal(attribute.getZ(i + 1), role);
      assert.equal(attribute.getZ(i + 2), role);
      assert(owned ? (owned.family === 'pavilion' ? role >= 1 && role <= 3 : role >= 4 && role <= 7) : role === 0,
        batch + ' role outside the assembly or missing at triangle ' + i / 3);
    }
  }
  delete globalThis.window;
  const record = {};
  for (const family of ['batches','daybeds','poolLanterns','umbrellas','furniture']) {
    record[family] = Object.fromEntries(Object.entries(model[family]).map(([id, g]) => {
      const attributes = Object.values(g.attributes).map(a => a.array);
      const positions = g.getAttribute('position');
      const entry = { triangles: positions.count / 3, bytes: attributes.reduce((n, a) => n + a.byteLength, 0), hash: hash(...attributes) };
      g.dispose();
      return [id, entry];
    }));
  }
  record.colliders = Object.fromEntries(Object.entries(model.colliders).map(([id, c]) => [id, hash(c.vertices, c.indices)]));
  record.seats = hash(model.seats, model.daybedApproaches);
  record.water = hash(...Object.values(model.pool.attributes).map(a => a.array), model.pool.index?.array ?? null, model.pool.userData);
  model.pool.dispose();
  return record;
}
const options = { separateDaybeds: true, separatePoolLanterns: true, separateUmbrellas: true, separateFurniture: true };
for (const mode of ['baseline','candidate','production']) signatures.set(mode, inspect(mode, options));
if (process.argv.includes('--print-baseline')) console.log(JSON.stringify(signatures.get('baseline'), null, 2));
else {
  const baseline = JSON.parse(readFileSync(new URL('baseline.json', import.meta.url)));
  assert.deepEqual(signatures.get('baseline'), baseline);
  const candidate = signatures.get('candidate');
  for (const family of ['colliders','seats','water','daybeds','poolLanterns','umbrellas','furniture']) {
    assert.deepEqual(candidate[family], baseline[family], family);
  }
  const production = signatures.get('production');
  assert.deepEqual(production.batches.stone, baseline.batches.stone, 'default stone matches bdd9d2e byte for byte');
  assert.deepEqual(production.batches.wood, candidate.batches.wood);
  assert.deepEqual(production.batches.fabric, candidate.batches.fabric);
  assert.deepEqual(production, { ...candidate, batches: { ...candidate.batches, stone: baseline.batches.stone } });
  const allowed = new Set(['wood','fabric','stone']);
  for (const [key, value] of Object.entries(candidate.batches)) {
    if (!allowed.has(key)) assert.deepEqual(value, baseline.batches[key], key);
  }
  console.log(JSON.stringify(Object.fromEntries([...allowed].map(id => {
    const a = baseline.batches[id], b = candidate.batches[id];
    return [id, { triangles: [a.triangles,b.triangles], bytes: [a.bytes,b.bytes] }];
  })), null, 2));
}
