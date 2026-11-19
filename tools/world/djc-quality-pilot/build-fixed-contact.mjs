/** Offline static contact from the published GLB. The browser only reads the compact arrays. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { Matrix4, Vector3 } from 'three';
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js';
import { readWorldCraftGltf, disposeWorldCraftGltf } from '../../../src/components/world/world-craft-gltf-test.mjs';

const roots = {
  'pool-lantern': { asset:'lantern/pool-lantern-v2.glb', maximumError:.0014, target:.08 },
  umbrella: { asset:'umbrella/umbrella-v1.glb', maximumError:.004, target:.06 },
  daybed: { asset:'daybed/daybed-ao-v1.glb', maximumError:.004, target:.035, keepMaterial:'03 Sea teal tailored mattress' },
  ...Object.fromEntries(['lounger','console','speaker'].map(family=>[`furniture-${family}`,{
    asset:'furniture/furniture-v1.glb', node:`DJC_Furniture_${family}`, maximumError:family==='speaker'?.002:.003, target:.075,
  }])),
};
const id = process.argv[2] ?? 'pool-lantern';
const {asset,node,maximumError,target,keepMaterial} = roots[id];
const source = `public/assets/world/club/${asset}`;
const sourceUrl = new URL(`../../../${source}`,import.meta.url);
const {scene} = await readWorldCraftGltf([source]);
await MeshoptSimplifier.ready;
const materials = [], vertices = [], indices = [], p = new Vector3(), output = new Map();
const scale = 1e-5;
try {
  scene.updateMatrixWorld(true);
  const group=node ? scene.getObjectByName(node) : scene;
  if(!group)throw new Error(`Missing GLB family ${node}`);
  const inverse = node ? group.matrixWorld.clone().invert() : new Matrix4();
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) throw new Error('Expected one GLTFLoader primitive per mesh');
    const attribute=mesh.geometry.attributes.position, index=mesh.geometry.index, points=[], lookup=new Map(), remap=[];
    const local=new Matrix4().multiplyMatrices(inverse,mesh.matrixWorld);
    for(let i=0;i<attribute.count;i++) {
      const point=p.fromBufferAttribute(attribute,i).applyMatrix4(local).toArray().map(v=>Math.round(v/scale));
      const key=point.join(',');
      if(!lookup.has(key)){lookup.set(key,points.length/3);points.push(...point);}
      remap[i]=lookup.get(key);
    }
    const triangles=[];
    for(let i=0;i<(index?.count??attribute.count);i+=3){
      const [a,b,c]=[i,i+1,i+2].map(j=>remap[index?.getX(j)??j]);
      if(a!==b&&b!==c&&c!==a)triangles.push(a,b,c);
    }
    const wanted=Math.round(triangles.length*target/3)*3, input=Uint32Array.from(triangles);
    const [simple,error]=mesh.material.name===keepMaterial ? [input,0] :
      MeshoptSimplifier.simplify(input,Float32Array.from(points,n=>n*scale),3,wanted,maximumError,['ErrorAbsolute','LockBorder']);
    if(simple.length===0||error>maximumError)throw new Error(`Contact simplification failed for ${mesh.material.name}`);
    for(const i of simple){
      const point=points.slice(3*i,3*i+3), key=point.join(',');
      if(!output.has(key)){output.set(key,vertices.length/3);vertices.push(...point);}
      indices.push(output.get(key));
    }
    materials.push({ name:mesh.material.name, sourceTriangles:triangles.length/3, contactTriangles:simple.length/3, error });
  });
  if(!materials.length)throw new Error('The shipped GLB has no contact primitives');
  const sha256=createHash('sha256').update(await readFile(sourceUrl)).digest('hex');
  const targetUrl=new URL(`../../../src/components/world/club-${id}-contact.generated.json`,import.meta.url);
  await writeFile(targetUrl,JSON.stringify({source,node,sha256,scale,materials,vertices,indices})+'\n');
  console.log(id, JSON.stringify(materials));
} finally { disposeWorldCraftGltf(scene); }
