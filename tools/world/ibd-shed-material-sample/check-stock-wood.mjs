import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildIbdStatic } from '../../../src/components/world/attractions/ibd-yard-geometry.ts';
import { createIbdMaterial } from '../../../src/components/world/attractions/ibd-yard-lighting.ts';
import { applyCoilBayMaterial } from '../../../src/components/world/attractions/ibd-coil-bay-material.ts';

const options = { separateCraftShells: true, shedExpansion: true, rackMode: 'family' };
const reference = buildIbdStatic({ ...options, crateSample: 'reference' });
const grain = buildIbdStatic({ ...options, crateSample: 'grain' });
for (const key of ['solids', 'walkSurface', 'groundSurface']) assert.deepEqual(reference[key], grain[key]);

function outsideCrate(g, expectWood) {
  const { position, aIbdCladding, aMat } = g.attributes;
  const counts = {};
  const hash = createHash('sha256');
  for (let i = 0; i < g.index.count; i += 3) {
    const ids = [0, 1, 2].map(j => g.index.getX(i + j));
    const value = aIbdCladding.getX(ids[0]), role = value % 16;
    assert(ids.every(v => aIbdCladding.getX(v) === value));
    const inside = ids.every(v => Math.abs(position.getX(v) - 14.5) < 1.11
      && Math.abs(position.getY(v) - 1.3) < .95 && Math.abs(position.getZ(v) + 23) < .95);
    if (role >= 7) {
      assert(expectWood && inside && role <= 12);
      assert(ids.every(v => aMat.getZ(v) === 0 && aMat.getW(v) === 0));
      counts[role] = (counts[role] ?? 0) + 1;
    }
    if (inside) continue;
    for (const id of ids) for (const a of Object.values(g.attributes)) {
      const length = a.itemSize * a.array.BYTES_PER_ELEMENT;
      hash.update(Buffer.from(a.array.buffer, a.array.byteOffset + id * length, length));
    }
  }
  return { hash: hash.digest('hex'), counts };
}
const stock = outsideCrate(grain.geometry, true);
assert.equal(grain.geometry.index.count / 3, reference.geometry.index.count / 3 - 210);
assert.equal(outsideCrate(reference.geometry, false).hash, stock.hash);
assert.deepEqual(Object.keys(stock.counts), ['7', '8', '9', '10', '11', '12']);

const shaderStub = () => ({ uniforms: {}, vertexShader: '#include <begin_vertex>',
  fragmentShader: ['color_fragment', 'roughnessmap_fragment', 'metalnessmap_fragment', 'normal_fragment_maps',
    'emissivemap_fragment', 'aomap_fragment'].map(key => `#include <${key}>`).join('\n') });
for (const enabled of [false, true]) {
  const material = applyCoilBayMaterial(createIbdMaterial(true, { value: 0 }), true, enabled);
  const shader = shaderStub();
  material.onBeforeCompile(shader, null);
  assert.match(shader.vertexShader, /vCoilCladding = vec4\(position, aIbdCladding\)/);
  assert.match(shader.fragmentShader, /coilFinish\(vCoilCladding.xyz/);
  assert.match(shader.fragmentShader, /uIbdNight \* \(diffuseColor.rgb \* vIbdBake/);
  assert.equal(/stockWoodFinish\(vCoilCladding.xyz/.test(shader.fragmentShader), enabled);
  assert.equal(material.customProgramCacheKey().endsWith(':stock-wood-v2'), enabled);
  material.dispose();
}
const metrics = ({ geometry: g }) => ({ triangles: g.index.count / 3,
  bytes: Object.values(g.attributes).reduce((n, a) => n + a.array.byteLength, g.index.array.byteLength) });
console.log(JSON.stringify({ reference: metrics(reference), grain: metrics(grain), ...stock }));
