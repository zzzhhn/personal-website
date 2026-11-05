import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import { readWorldCraftGltf, disposeWorldCraftGltf } from '../../../src/components/world/world-craft-gltf-test.mjs';

registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context); } catch (error) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return next(`${specifier}.ts`, context);
    throw error;
  }
} });
const { createWorkshopCraftRuntime } = await import('../../../src/components/world/attractions/coaster-workshop-craft-runtime.ts');
const { WORKSHOP_INTAKE, WORKSHOP_TOOLS } = await import('../../../src/components/world/attractions/intent-workshop-layout.ts');
const { coasterWorld } = await import('../../../src/components/world/attractions/coaster-track.ts');
const gltf = await readWorldCraftGltf(['docs/world/phase-2-playground/coaster-workshop-craft-20261105/coaster-workshop.glb']);
assert.ok(gltf);
const digest = object => {
  const hash = createHash('sha256');
  object.traverse(o => {
    if (!(o instanceof Mesh)) return;
    for (const attr of [o.geometry.index, ...Object.values(o.geometry.attributes)]) hash.update(Buffer.from(attr.array.buffer, attr.array.byteOffset, attr.array.byteLength));
    hash.update(JSON.stringify(o.material.toJSON()));
  });
  return hash.digest('hex');
};
const before = digest(gltf.scene);
const pack = createWorkshopCraftRuntime(gltf.scene);
assert.equal(pack.resources.leverBatches.length, 3);
assert.equal(pack.materials.length, 8);
assert.equal(pack.resources.ownedGeometry.size, 1, 'Only the static opaque shadow carrier allocates joined geometry');
const matrix = new Matrix4(), rotation = new Quaternion(), at = new Vector3(), scale = new Vector3(1,1,1), axis = new Vector3(1,0,0);
let articulatedMatrices = 0;
for (const angle of [0,.17,.425,.85]) {
  [WORKSHOP_INTAKE,...WORKSHOP_TOOLS.map(tool=>tool.at)].forEach((point,index)=>{
    at.set(...coasterWorld([point[0]+.96,1.3,point[2]+.75]));
    rotation.setFromAxisAngle(axis,angle);
    pack.setLeverAt(index,matrix.compose(at,rotation,scale));
    articulatedMatrices++;
  });
  pack.updateLevers();
  for (const batch of pack.resources.leverBatches) {
    for (let index=0;index<7;index++) {
      const observed=new Matrix4(); batch.getMatrixAt(index,observed);
      assert.ok(observed.elements.every(Number.isFinite));
      // All primitive-local transforms are baked into the instance and the
      // same exact angle/pivot was supplied. The exported object matrix may
      // include its original native part origin, intentionally retained.
      assert.ok(Math.abs(observed.determinant()-1)<1e-4);
    }
  }
}
const stats=()=>{
  let visual=0,shadow=0,triangles=0;
  pack.root.traverseVisible(mesh=>{
    if (!(mesh instanceof Mesh)) return;
    if (mesh.material.colorWrite) {
      visual++;
      triangles+=mesh.geometry.index.count/3*(mesh.isInstancedMesh?mesh.count:1);
    }
    if (mesh.castShadow) shadow++;
  });
  return {visualBatches:visual,shadowBatches:shadow,visualTriangles:triangles};
};
const idle=stats();
pack.capsule.visible=true;
for(const group of Object.values(pack.motion))group.visible=true;
const allOutputs=stats();
assert.deepEqual([idle.visualBatches,idle.shadowBatches],[11,1]);
assert.deepEqual([allOutputs.visualBatches,allOutputs.shadowBatches],[31,1]);
assert.equal(digest(gltf.scene),before,'Source channels and material cache must remain byte-identical');
assert.equal(pack.root.children.find(o=>o.name==='StaticWorkshop').position.toArray().join(),coasterWorld([0,0,0]).join());
const ownedGeometryBytes=[...pack.resources.ownedGeometry].reduce((sum,g)=>sum+(g.index?.array.byteLength??0)+Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0),0);
const instanceBytes=pack.resources.leverBatches.reduce((sum,m)=>sum+m.instanceMatrix.array.byteLength,0);
const staticShadow=[...pack.resources.ownedGeometry][0].index.count/3;
const sourceStats=JSON.parse(await readFile(new URL('../../../docs/world/phase-2-playground/coaster-workshop-craft-20261105/export-check.json',import.meta.url)));
const report={
  scope:'Actual GLB loaded through Three GLTFLoader for CPU geometry/material audit. Embedded textures use placeholder samplers; no image or GPU result.',
  glb:{bytes:sourceStats.glbBytes,triangles:sourceStats.triangles,visibleTriangles:sourceStats.visibleSourceTriangles,shadowTriangles:sourceStats.shadowSourceTriangles,primitives:sourceStats.primitives,materials:sourceStats.materials},
  idle,allOutputs,
  allocations:{ownedGeometryBytes,instanceBytes,borrowedSourceGeometry:'The original GLB geometry and texture cache remain resident; no second full visual clone'},
  staticShadowTriangles:staticShadow,
  countsExclude:'Original unchanged glow mesh and existing single point light, integrated by WorldIntentWorkshopCraft.',
  articulatedLeverMatrices:articulatedMatrices,
  materialChannels:'Eight cloned physical material responses, normals, UVs, roughness samplers and clearcoat survive the loader/adapter; source cache unchanged.',
  shadow:'One independent authored static silhouette, merged by position/index into an opaque double-sided carrier. No dynamic output or handle shadows were added.',
  shadowCost:'The independent low-detail shadow silhouette is also submitted in the main pass with color/depth writes disabled. Its position/index buffers are an additional owned copy; fewer triangles/submissions do not establish a performance win.',
  distanceStrategy:'No LOD, resolution reduction or distance-hide threshold. One static root uses its merged whole-workshop bounds; ordinary Three frustum culling applies. The seven lever sets retain the existing frustumCulled=false behavior.',
  nativeCollisionAuthority:'Original createWorkshopGeometry contact and workshopColliders, byte-identical source to b75c474.',
  runtimeVisual:'pending ordinary day/night and articulated WebGL view',runtimePerformance:'pending matched whole-scene frame windows',
};
await writeFile(new URL('../../../docs/world/phase-2-playground/coaster-workshop-craft-20261105/runtime-check.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
let ownedDisposed=0,borrowedDisposed=0;
for(const geometry of pack.resources.ownedGeometry)geometry.addEventListener('dispose',()=>ownedDisposed++);
const sourceGeometries=new Set();gltf.scene.traverse(o=>{if(o instanceof Mesh)sourceGeometries.add(o.geometry)});
for(const geometry of sourceGeometries)geometry.addEventListener('dispose',()=>borrowedDisposed++);
const release=pack.retain();release();await new Promise(resolve=>queueMicrotask(resolve));
assert.equal(ownedDisposed,1);assert.equal(borrowedDisposed,0);
disposeWorldCraftGltf(gltf.scene);
console.log(JSON.stringify({idle,allOutputs,articulatedLeverMatrices:articulatedMatrices,borrowedCachePreserved:true}));
