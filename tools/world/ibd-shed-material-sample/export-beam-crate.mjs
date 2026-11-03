import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Ray, Vector3 } from 'three';
import { Builder } from '../../../src/components/world/WorldStreetGeometry.ts';
import { addIbdBridgeSample, addIbdStockCrateSample } from '../../../src/components/world/attractions/ibd-beam-crate-craft.ts';
import { buildIbdStatic } from '../../../src/components/world/attractions/ibd-yard-geometry.ts';

const dir = resolve(process.argv[2]);
const options = { separateCraftShells: true, shedExpansion: true, rackMode: 'family' };
const baseline = buildIbdStatic(options);
const variant = {
  bridge: buildIbdStatic({ ...options, bridgeSample: true }),
  crate: buildIbdStatic({ ...options, crateSample: true }),
  combined: buildIbdStatic({ ...options, bridgeSample: true, crateSample: true }),
};
const sha = (...values) => {
  const hash = createHash('sha256');
  for (const value of values) hash.update(ArrayBuffer.isView(value)
    ? Buffer.from(value.buffer, value.byteOffset, value.byteLength) : JSON.stringify(value));
  return hash.digest('hex');
};
const fixed = {};
for (const [key, input] of Object.entries(baseline)) {
  if (!['solids', 'walkSurface', 'groundSurface'].includes(key)) continue;
  for (const d of Object.values(variant)) assert.deepEqual(d[key], input);
  fixed[key] = key === 'solids' ? sha(input) : sha(input.vertices, input.indices);
}
const metrics = ({ geometry: g }) => ({ triangles: g.index.count / 3,
  bytes: Object.values(g.attributes).reduce((n,a) => n+a.array.byteLength, g.index.array.byteLength) });

function hits(g, origin, direction) {
  const ray = new Ray(new Vector3(...origin), new Vector3(...direction));
  const found = [];
  for (let i = 0; i < g.index.count; i += 3) {
    const pts = [0, 1, 2].map(j => new Vector3().fromBufferAttribute(g.attributes.position, g.index.getX(i+j)));
    const hit = ray.intersectTriangle(...pts, false, new Vector3());
    if (hit) found.push(hit.toArray());
  }
  return found;
}
const near = (points, axis, value) => assert(points.some(p => Math.abs(p[axis]-value) < 1e-5), JSON.stringify({ axis, value, points }));
const assets = [
  ['bridge', b => addIbdBridgeSample(b, -2), g => {
    near(hits(g, [-17,8.6,0], [0,0,-1]), 2, -1.825);
    near(hits(g, [-17,8.27,0], [0,0,-1]), 2, -1.75);
    for (const x of [-30,-3.8]) {
      const post = baseline.solids.find(s => s.at[0]===x && s.at[2]===-2 && s.size[0]===.42);
      assert(post && post.at[1]+post.size[1]/2===8.6);
      near(hits(g, [x,7.5,-2], [0,1,0]), 1, 8.15);
      near(hits(g, [x,8.5,0], [0,0,-1]), 2, -1.752);
    }
  }],
  ['stock-crate', b => addIbdStockCrateSample(b, 14.5, 1.3, -23), g => {
    near(hits(g, [14.78,1.40,-21], [0,0,-1]), 2, -22.198);
    near(hits(g, [14.78,1.63,-21], [0,0,-1]), 2, -22.23);
    near(hits(g, [16,1.40,-23], [-1,0,0]), 0, 15.567);
    near(hits(g, [16,1.63,-23], [-1,0,0]), 0, 15.535);
    near(hits(g, [14.5,1.35,-21], [0,0,-1]), 2, -22.198);
    near(hits(g, [14.5,1.35,-21], [0,0,-1]), 2, -22.18);
  }],
];
mkdirSync(dir, { recursive: true });
const archive = [];
const groupName = {
  bridge: { '0.6300/0.1000': 'box-web', '0.5800/0.1600': 'flanges-and-stiffeners', '0.5100/0.3100': 'bearing-and-diaphragm' },
  'stock-crate': { '0.8200/0.0000': 'planks-and-label', '0.7200/0.0000': 'corner-posts-and-rails',
    '0.9000/0.0000': 'inner-backing', '0.6600/0.1400': 'straps', '0.6800/0.1800': 'label-marks' },
};
for (const [name, emit, verify] of assets) {
  const builder = new Builder();
  emit(builder);
  const g = builder.build();
  verify(g);
  const { position, normal, color, aMat } = g.attributes;
  const parts = new Map();
  for (let i = 0; i < g.index.count; i += 3) {
    const tri = [0,1,2].map(j => g.index.getX(i+j));
    const positions = tri.map(v => new Vector3().fromBufferAttribute(position,v));
    assert(positions[1].clone().sub(positions[0]).cross(positions[2].clone().sub(positions[0])).lengthSq()>1e-12);
    const v = tri[0], key = [aMat.getX(v).toFixed(4), aMat.getY(v).toFixed(4)].join('/');
    if (!parts.has(key)) {
      const role = parts.size+1;
      parts.set(key, { part: `${name}-${groupName[name][key] ?? role}`, role,
        roughness: aMat.getX(v), metalness: aMat.getY(v), index: [], position: [], normal: [], color: [], vertices: new Map() });
    }
    const part = parts.get(key);
    for (const id of tri) {
      if (!part.vertices.has(id)) {
        part.vertices.set(id, part.vertices.size);
        for (const [attribute, values] of [[position,part.position],[normal,part.normal],[color,part.color]]) {
          values.push(attribute.getX(id), attribute.getY(id), attribute.getZ(id));
        }
      }
      part.index.push(part.vertices.get(id));
    }
  }
  archive.push({ asset: name, groups: parts.size, triangles: g.index.count/3 });
  writeFileSync(resolve(dir, `${name}.source.json`), JSON.stringify({ units:'metres',up:'Y',
    parts:[...parts.values()].map(({vertices,...part}) => part) })+'\n');
}
console.log(JSON.stringify({ baseline:metrics(baseline), ...Object.fromEntries(
  Object.entries(variant).map(([name,d]) => [name,metrics(d)])), fixed, archive }));
