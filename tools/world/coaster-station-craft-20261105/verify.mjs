import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { Box3, Matrix4, Mesh, Quaternion, Raycaster, Vector3 } from 'three';
import { readWorldCraftGltf, disposeWorldCraftGltf } from '../../../src/components/world/world-craft-gltf-test.mjs';
import { createCoasterStationCraft } from '../../../src/components/world/attractions/coaster-station-craft-runtime.ts';

const out = new URL('../../../docs/world/phase-2-playground/coaster-station-craft-20261105/', import.meta.url);
const contract = JSON.parse(await readFile(new URL('contract.json', out)));
const near = (a, b, eps = 3e-5) => assert.ok(a.every((v, i) => Math.abs(v-b[i]) < eps), `${a} != ${b}`);
for (const [file, hash] of Object.entries(contract.sourceHashes)) {
  const bytes = await readFile(new URL('../../../src/components/world/attractions/' + file, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, 'generated from current source ' + file);
}
const bytes = await readFile(new URL('station.glb', out));
assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
const data = JSON.parse(bytes.subarray(20, 20+bytes.readUInt32LE(12)));
assert.equal(data.animations, undefined);
assert.equal(data.cameras, undefined);
assert.equal(data.skins, undefined);
assert.equal(data.materials.length, 7);
assert.ok(data.materials.every(m => (m.alphaMode || 'OPAQUE') === 'OPAQUE' && !m.doubleSided));
assert.equal(data.images.length, 3);
const bin = 28+bytes.readUInt32LE(12);
for (const image of data.images) {
  assert.equal(image.mimeType, 'image/png'); assert.ok(!image.uri);
  const offset = bin+(data.bufferViews[image.bufferView].byteOffset || 0);
  assert.deepEqual([bytes.readUInt32BE(offset+16), bytes.readUInt32BE(offset+20)], [256,256]);
}
const gltf = await readWorldCraftGltf(['docs/world/phase-2-playground/coaster-station-craft-20261105/station.glb']);
assert.ok(gltf);
const source = gltf.scene; source.updateMatrixWorld(true);
assert.deepEqual(source.children.map(o => o.name).sort(), ['Far','Near','Shadow']);
const pack = createCoasterStationCraft(source);
const statistics = {};
const toKey = p => p.map(v => Math.round(v*10000)).join(',');
for (const name of ['Near','Far','Shadow']) {
  const level = source.getObjectByName(name), positionKeys = new Set();
  const meshes = []; level.traverse(o => { if (o instanceof Mesh) meshes.push(o); });
  let triangles = 0, vertices = 0;
  for (const mesh of meshes) {
    const g = mesh.geometry;
    const position = g.getAttribute('position'), normal = g.getAttribute('normal'), uv = g.getAttribute('uv');
    assert.ok(position && normal && uv && g.index);
    vertices += position.count; triangles += g.index.count/3;
    for (const attr of [position, normal, uv]) assert.ok(attr.array.every(Number.isFinite));
    const p = new Vector3(), n = new Vector3();
    for (let i = 0; i < position.count; i++) {
      p.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld); positionKeys.add(toKey(p.toArray()));
      n.fromBufferAttribute(normal,i); assert.ok(Math.abs(n.length()-1)<.002);
    }
    for (let i = 0; i < g.index.count; i += 3) {
      const a = new Vector3().fromBufferAttribute(position, g.index.getX(i));
      const b = new Vector3().fromBufferAttribute(position, g.index.getX(i+1));
      const c = new Vector3().fromBufferAttribute(position, g.index.getX(i+2));
      assert.ok(b.sub(a).cross(c.sub(a)).length()>1e-9, 'degenerate ' + mesh.name);
    }
    assert.ok(g.index.array.every(i => i >= 0 && i < position.count));
  }
  const bounds = new Box3().setFromObject(level);
  statistics[name] = { meshes: meshes.length, triangles, vertices, bounds: [bounds.min.toArray(), bounds.max.toArray()] };
  assert.ok(meshes.length <= (name === 'Shadow' ? 1 : 7));
  // All six structural contacts retain their eight original transformed corners.
  for (const member of contract.members) {
    const matrix = new Matrix4().compose(new Vector3(...member.position),
      new Quaternion(...member.quaternion), new Vector3(1,1,1));
    for (const x of [-.5,.5]) for (const y of [-.5,.5]) for (const z of [-.5,.5]) {
      const point = new Vector3(x*member.size[0],y*member.size[1],z*member.size[2]).applyMatrix4(matrix);
      assert.ok(positionKeys.has(toKey(point.toArray())), `contact corner ${name} ${member.position}`);
    }
  }
  for (const step of contract.steps) {
    const [w,h,d] = step.size, top = step.at[1]+h/2;
    const rotation = new Quaternion(0,Math.sin(step.yaw/2),0,Math.cos(step.yaw/2));
    for (const x of [-w/2+.006, 0, w/2-.006]) for (const z of [-d/2+.004, 0, d/2-.004]) {
      const foot = new Vector3(x, h/2, z).applyQuaternion(rotation).add(new Vector3(...step.at));
      const ray = new Raycaster(foot.clone().add(new Vector3(0,.012,0)),new Vector3(0,-1,0),0,.025);
      const hit = ray.intersectObject(level,true)[0];
      assert.ok(hit, `${name} ${step.name} has full top surface`);
      near(hit.point.toArray(), foot.toArray()); assert.ok(Math.abs(hit.point.y-top)<3e-5);
    }
    // Reproduce the reported grazing-side fault: each exterior cheek must have
    // exactly one outward-facing skin. Probe both sides independently; no depth
    // bias is allowed to hide duplicate geometry.
    if (name !== 'Shadow') for (const sign of [-1,1]) for (const y of [-h/2+.02, -h/2+(h-.055)*.43]) for (const z of [-d*.27,d*.19]) {
      const face = new Vector3(sign*w/2,y,z).applyQuaternion(rotation).add(new Vector3(...step.at));
      const outward = new Vector3(sign,0,0).applyQuaternion(rotation);
      const ray = new Raycaster(face.clone().addScaledVector(outward,.04),outward.clone().negate(),0,.045);
      const hits = ray.intersectObject(level,true).filter(hit => Math.abs(hit.distance-.04)<.00005);
      assert.equal(hits.length,1,`${name} ${step.name}: single exterior side at ${sign},${y},${z}`);
    }
  }
  // Top silhouette is the old extruded section, not a new canopy shape.
  for (const x of [-10.8,-9.5,-8.4,-4,0,4.4,5.3,6.8]) for (const z of [33,49]) {
    const roofY = x < -8.7 ? 6.55+(x+11)*.85/2.3 : x > 4.7 ? 7.4-(x-4.7)*.85/2.3 : 7.4;
    const ray = new Raycaster(new Vector3(x,8,z),new Vector3(0,-1,0),0,2.1);
    const hit = ray.intersectObject(level,true)[0];
    assert.ok(hit, 'roof outward normals ' + name);
    near(hit.point.toArray(), [x,roofY,z]);
  }
  // Negative-Z approach and central aisle do not acquire a wall or a new booth.
  for (const z of [32,35,38,45,48,50]) for (const x of [-7,-4,0,3]) {
    const ray = new Raycaster(new Vector3(x,.1,z),new Vector3(0,1,0),0,5.7);
    assert.equal(ray.intersectObject(level,true).length,0, 'central passage ' + name);
  }
}
assert.ok(statistics.Far.triangles < statistics.Near.triangles*.65, 'real distant geometry derivative');
// State changes select one level; cache geometry and maps remain borrowed.
const owned = [...pack.materials, pack.depth], disposed = new Map();
owned.forEach(o => o.addEventListener('dispose', () => disposed.set(o,(disposed.get(o)||0)+1)));
let borrowedDisposals = 0;
source.traverse(o => { if (o instanceof Mesh) {
  for (const resource of [o.geometry,o.material,...Object.values(o.material).filter(v=>v?.isTexture)]) {
    resource.addEventListener('dispose', () => borrowedDisposals++);
  }
} });
pack.setDetailed(false); assert.equal(pack.near.visible,false); assert.equal(pack.far.visible,true);
pack.setDetailed(true); assert.equal(pack.near.visible,true); assert.equal(pack.far.visible,false);
const release = pack.retain(); release();
const finalRelease = pack.retain(); await Promise.resolve(); assert.equal(disposed.size,0);
finalRelease(); await Promise.resolve(); pack.dispose();
assert.equal(disposed.size,owned.length); owned.forEach(o => assert.equal(disposed.get(o),1));
assert.equal(borrowedDisposals,0);
const report = {
  baseline: contract.baseline, sha256: createHash('sha256').update(bytes).digest('hex'),
  editableSha256: createHash('sha256').update(await readFile(new URL('station-editable.blend',out))).digest('hex'),
  bytes: bytes.length, statistics, materials: data.materials.map(m=>m.name),
  images: 3, imageSize: [256,256], contract: 'roof, structural contact corners, all 7 tread tops, central passage',
  channelCheck: 'finite unit normals, nondegenerate indices, UV, physical material separation',
  resourceCheck: 'shared source untouched; final owned material disposal once; StrictMode retain/release',
  review: 'CPU structural check only; actual ordinary-view WebGL day/night and performance pending',
};
await writeFile(new URL('export-check.json',out),JSON.stringify(report,null,2)+'\n');
disposeWorldCraftGltf(source);
console.log(JSON.stringify({ bytes:bytes.length, Near:statistics.Near.triangles, Far:statistics.Far.triangles, Shadow:statistics.Shadow.triangles, checked:'seven contact tops and original roof/member datums' }));
