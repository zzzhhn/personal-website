/** Material-only revisions may repartition primitives and change COLOR_0.
 * Preserve every oriented position/normal/UV triangle and node transform.
 * --freeze creates the immutable R9 datum once; --check never updates it.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const mode=process.argv[2],id=process.argv[3]??'G21';
assert.ok(['--freeze','--check'].includes(mode));assert.equal(id,'G21');
const file=path.join(root,'public/assets/world/nature-camp-craft',id+'.glb');
const raw=fs.readFileSync(file),length=raw.readUInt32LE(12),j=JSON.parse(raw.subarray(20,20+length)),bin=raw.subarray(28+length);
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function bytes(id,index){
 const a=j.accessors[id],v=j.bufferViews[a.bufferView],n={VEC2:2,VEC3:3,VEC4:4,SCALAR:1}[a.type],size={5126:4,5125:4,5123:2,5121:1}[a.componentType]*n;
 assert.ok(size);const offset=(v.byteOffset??0)+(a.byteOffset??0)+index*(v.byteStride??size);
 return bin.subarray(offset,offset+size);
}
function indices(id){const a=j.accessors[id];return Array.from({length:a.count},(_,i)=>{const b=bytes(id,i);return a.componentType===5123?b.readUInt16LE():b.readUInt32LE()})}
const triangles=[];
for(const mesh of j.meshes)for(const p of mesh.primitives){
 const channels=['POSITION','NORMAL','TEXCOORD_0','TEXCOORD_1'];
 assert.ok(channels.every(c=>p.attributes[c]!==undefined),'All frozen geometry channels required');
 const ix=indices(p.indices);
 for(let i=0;i<ix.length;i+=3){
  const corners=ix.slice(i,i+3).map(v=>Buffer.concat(channels.map(c=>bytes(p.attributes[c],v))).toString('hex'));
  const cyclic=[corners.join(''),[corners[1],corners[2],corners[0]].join(''),[corners[2],corners[0],corners[1]].join('')];
  triangles.push(cyclic.sort()[0]);
 }
}
triangles.sort();
const transforms=j.nodes.map(n=>({mesh:n.mesh??null,children:n.children??[],translation:n.translation??[0,0,0],rotation:n.rotation??[0,0,0,1],scale:n.scale??[1,1,1],matrix:n.matrix??null}));
const datum={id,triangles:triangles.length,orientedPositionNormalUVHash:hash(triangles.join('\n')),nodeTransformHash:hash(JSON.stringify(transforms))};
const record=path.join(root,'docs/world/phase-2-playground/asset-batch6-20261103/nature-camp',id+'-geometry-freeze-r9.json');
if(mode==='--freeze'){
 assert.ok(!fs.existsSync(record),'Never overwrite a frozen geometry datum');
 fs.writeFileSync(record,JSON.stringify({...datum,sourceGLBSHA:hash(raw),scope:'R9 shape direction accepted by coordinator; COLOR_0 and material partitions may change, geometry/normals/UVs/transforms may not'},null,2)+'\n');
}else{const expected=JSON.parse(fs.readFileSync(record));for(const k of Object.keys(datum))assert.deepEqual(datum[k],expected[k],'Changed frozen '+k);}
console.log(JSON.stringify({mode,...datum,GLBSHA:hash(raw)}));
