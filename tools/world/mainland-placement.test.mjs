import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { build } from 'esbuild';
import R from '@dimforge/rapier3d-compat';
import { Matrix4, Vector3 } from 'three';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'src/components/world/terrain-artifacts.generated.json'), 'utf8'));
const dir = await mkdtemp(path.join(root, 'tools/world/.placement-test-'));
let world;
test.after(async () => { world?.free(); await rm(dir, { recursive: true, force: true }); });
await build({ stdin: { contents: `
  export * from './WorldLandform';
  export * from './terrain-artifact';
  export {mineFoundationSurface} from './alpha-mine-foundation';
  export {ALPHA_MINE_FOOTPRINT_POINTS} from './alpha-mine-layout';
  export {buildAlphaExchangeGeometry} from './WorldAlphaExchangeGeometry';
  export {exchangePlatformSlabs,ALPHA_EXCHANGE_ORIGIN} from './alpha-exchange-layout';
  export {exchangeGroundSkirt,djcWalkwayOutline,djcWalkwaySupports} from './facility-site-contact';
  export {buildDjcClubGeometry} from './WorldDjcClubGeometry';
  export {CLUB_WALKWAYS} from './djc-club-layout';
  export {buildAttractionApproachGeometry} from './attractions/WorldAttractionApproach';
  export {billboardPlacements} from './WorldStreetBillboards';
  export {pavingMesh, PAVE_STRIDE} from './WorldTerrainPaving';
  export {streetFurnitureMatrix} from './WorldStreetFixed';
  export {knockablesV4, solidsV4} from './layout-v4';
  export * as streetAssets from './WorldStreetAssets';
`, resolveDir: path.join(root, 'src/components/world') }, bundle: true, platform: 'node', format: 'esm', packages: 'external',
  define: { 'import.meta.env.SSR': 'false', 'import.meta.env.DEV': 'false' }, outfile: path.join(dir,'client.mjs'), logLevel: 'silent' });
const client = await import(pathToFileURL(path.join(dir,'client.mjs')).href);
assert.throws(()=>client.requireMeshHeight(0,0),/must be loaded/);
assert.throws(()=>client.terrainHeight(0,0),/authoring height is unavailable/);
const zipped=await readFile(path.join(root,'public',manifest.v4.url)),raw=gunzipSync(zipped);
const artifact=client.decodeTerrainArtifact(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'v4');
client.installTerrainArtifact(artifact);
await R.init(); world=new R.World({x:0,y:-9.81,z:0});
world.createCollider(R.ColliderDesc.trimesh(artifact.terrain.positions,artifact.terrain.indices));world.step();
const earth=(x,z)=>{
  const hit=world.castRay(new R.Ray({x,y:200,z},{x:0,y:-1,z:0}),500,true);
  assert.ok(hit,`no physical terrain at ${x},${z}`);return 200-hit.timeOfImpact;
};
const finite=g=>{for(const attr of Object.values(g.attributes))assert.ok(attr.array.every(Number.isFinite));};

test('mine foundation outer vertices meet the physical terrain with authoring disabled',()=>{
  const g=client.mineFoundationSurface(client.requireMeshHeight),n=client.ALPHA_MINE_FOOTPRINT_POINTS.length;
  for(let i=n*3;i<g.vertices.length;i+=3)assert.ok(Math.abs(g.vertices[i+1]-earth(g.vertices[i],g.vertices[i+2]))<.0002);
  for(let i=0;i<n;i++){
    const a=g.vertices.slice((n+i)*3,(n+i)*3+3),b=g.vertices.slice((n+(i+1)%n)*3,(n+(i+1)%n)*3+3);
    const steps=Math.ceil(Math.hypot(b[0]-a[0],b[2]-a[2])/.25);
    for(let j=0;j<=steps;j++){
      const p=a.map((v,k)=>v+(b[k]-v)*j/steps);
      assert.ok(p[1]<=earth(p[0],p[2])+.006,`mine skirt floats at ${p}`);
    }
  }
});
test('exchange wall feet remain embedded in real terrain and full production geometry builds',()=>{
  const origin=client.ALPHA_EXCHANGE_ORIGIN;let feet=0;
  for(const slab of client.exchangePlatformSlabs()){
    const p=client.exchangeGroundSkirt(slab,origin,client.requireMeshHeight);
    for(let i=0;i<p.length;i+=18)for(const offset of [6,15]){
      const j=i+offset;assert.ok(p[j+1]+origin[1]<=earth(p[j]+origin[0],p[j+2]+origin[2])-.024);feet++;
    }
    for(let i=0;i<p.length;i+=18)for(let j=0;j<=8;j++){
      const q=[0,1,2].map(k=>p[i+6+k]+(p[i+15+k]-p[i+6+k])*j/8+origin[k]);
      assert.ok(q[1]<=earth(q[0],q[2])+.002,`exchange wall floats at ${q}`);
    }
  }
  assert.ok(feet>40);
  const g=client.buildAlphaExchangeGeometry();try{finite(g.body);finite(g.glass);}finally{g.body.dispose();g.glass.dispose();}
});
test('Club piles reach terrain and full detailed geometry builds without an analytical floor',()=>{
  let count=0;
  for(const p of client.CLUB_WALKWAYS)for(const post of client.djcWalkwaySupports(client.djcWalkwayOutline(p),client.requireMeshHeight).posts){
    assert.ok(Math.abs(post.bottom-(earth(post.x,post.z)-.03))<.0002);assert.ok(post.top>post.bottom);count++;
    for(let i=0;i<8;i++)assert.ok(post.bottom<=earth(post.x+.1*Math.cos(i*Math.PI/4),post.z+.1*Math.sin(i*Math.PI/4))+.002);
  }
  assert.equal(count,8);
  const g=client.buildDjcClubGeometry();
  const geometries=[g.pool,...['batches','daybeds','poolLanterns','umbrellas','furniture'].flatMap(k=>Object.values(g[k]))];
  try{geometries.forEach(finite);}finally{geometries.forEach(g=>g.dispose());}
});
test('production approach ribbons and all billboard candidates have physical terrain support',()=>{
  const g=client.buildAttractionApproachGeometry();
  try {
    g.meshes.forEach(m=>finite(m.geometry));finite(g.walk);
    // Paint always follows mesh height with its authored 55 mm separation.
    const p=g.meshes[2].positions;
    for(let i=0;i<p.length;i+=3)assert.ok(Math.abs(p[i+1]-earth(p[i],p[i+2])-.055)<.001);
    for(const [x,z] of [[.8,-59],[-19,-117]])assert.ok(Math.abs(client.requireMeshHeight(x,z)-earth(x,z))<.0002);
  }finally{g.meshes.forEach(m=>{m.geometry.dispose();m.material.dispose();});g.walk.dispose();}
  const boards=client.billboardPlacements();assert.equal(boards.length,3);
  for(const {position:[x,y,z],yaw} of boards){
    assert.ok(Math.abs(y-earth(x,z))<.0002);
    for(const u of [-1.55,0,1.55])for(const v of [-.65,0,.65])earth(x+Math.cos(yaw)*u+Math.sin(yaw)*v,z-Math.sin(yaw)*u+Math.cos(yaw)*v);
  }
});

test('street furniture feet meet the terrain and paving collision triangles across the mainland', t => {
  const scene = new R.World({ x: 0, y: -9.81, z: 0 });
  t.after(() => scene.free());
  scene.createCollider(R.ColliderDesc.trimesh(artifact.terrain.positions, artifact.terrain.indices));
  for (const chunk of client.pavingMesh().chunks) {
    for (const [vertices, top] of [[chunk.v, chunk.top], [chunk.fv, chunk.ftop]]) {
      if (!top.length) continue;
      const positions = new Float32Array(vertices.length / client.PAVE_STRIDE * 3);
      for (let i = 0; i < positions.length / 3; i++) {
        const v = i * client.PAVE_STRIDE;
        positions.set(vertices.slice(v, v + 3), 3 * i);
      }
      scene.createCollider(R.ColliderDesc.trimesh(positions, Uint32Array.from(top)));
    }
  }
  scene.step();
  const api = client.streetAssets, cell = [0, 0, 1, 1];
  const models = { bench: api.bench().L0, bollard: api.bollard().L0, shelter: api.shelterGeometry(0, cell),
    lamp: api.lamp().L0, signal: api.signal().L0, stop: api.stopGeometry(0, cell), direction: api.directionGeometry(0, cell),
    chevron: api.chevronGeometry(0, cell), delineator: api.delineator().L0, bin: api.bin().L0, billboard: api.billboard(0, cell) };
  const soles = new Map();
  for (const [kind, model] of Object.entries(models)) {
    const points = new Map();
    const minY = model.pos.reduce((min, value, i) => i % 3 === 1 ? Math.min(min, value) : min, Infinity);
    for (let i = 0; i < model.pos.length; i += 3) {
      const [x, y, z] = model.pos.slice(i, i + 3);
      if (y <= minY + .001) points.set([x, y, z].join(','), new Vector3(x, y, z));
    }
    assert.ok(points.size >= 3, kind + ' has no measurable foot');
    soles.set(kind, [...points.values()]);
  }
  const objects = client.solidsV4().filter(s => ['bench', 'bollard', 'shelter'].includes(s.kind))
    .map(s => ({ id: s.kind + '@' + s.position.join(','), kind: s.kind, matrix: client.streetFurnitureMatrix(s) }));
  for (const item of [...client.knockablesV4(), ...client.billboardPlacements()]) {
    objects.push({ id: item.id, kind: item.kind, matrix: new Matrix4().makeRotationY(item.yaw).setPosition(...item.position) });
  }
  const errors = [];
  let samples = 0;
  let maxDeviation = 0;
  assert.deepEqual(new Set(objects.map(o => o.kind)), new Set(soles.keys()), 'every street model needs a placed instance');
  for (const {id, kind, matrix} of objects) {
    let worst = 0;
    for (const foot of soles.get(kind)) {
      const p = foot.clone().applyMatrix4(matrix);
      const hit = scene.castRay(new R.Ray({ x: p.x, y: p.y + 2, z: p.z }, { x: 0, y: -1, z: 0 }), 10, true);
      assert.ok(hit, id + ' has no support at ' + p.toArray());
      const gap = hit.timeOfImpact - 2;
      maxDeviation = Math.max(maxDeviation, Math.abs(gap));
      if (Math.abs(gap) > Math.abs(worst)) worst = gap;
      samples++;
    }
    if (Math.abs(worst) > .025) errors.push({id, gapMm: Math.round(worst * 1000)});
  }
  t.diagnostic(`${objects.length} street placements, ${samples} sole samples, largest deviation ${(1000 * maxDeviation).toFixed(1)} mm`);
  assert.deepEqual(errors, []);
});
