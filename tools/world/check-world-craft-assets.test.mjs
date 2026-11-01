import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkWorldCraftAsset } from './check-world-craft-assets.mjs';

const base=()=>({asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,1]}],
  nodes:[{name:'Shell',children:[2]},{name:'Lid',children:[3]},{mesh:0},{mesh:0}],
  buffers:[{byteLength:4}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1}}]}],materials:[{pbrMetallicRoughness:{roughnessFactor:.7,metallicFactor:0}}]});
function fixture(doc){
  const json=Buffer.from(JSON.stringify(doc)),jsonLength=Math.ceil(json.length/4)*4,bytes=Buffer.alloc(20+jsonLength+12,0x20);
  bytes.writeUInt32LE(0x46546c67,0);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);
  bytes.writeUInt32LE(jsonLength,12);bytes.writeUInt32LE(0x4e4f534a,16);json.copy(bytes,20);
  bytes.writeUInt32LE(4,20+jsonLength);bytes.writeUInt32LE(0x004e4942,24+jsonLength);bytes.fill(0,28+jsonLength);
  return bytes;
}
test('production crate export checker rejects a missing asset, merged hinge, nonidentity origin and embedded rig/light',()=>{
  const dir=mkdtempSync(join(tmpdir(),'world-craft-assets-')),file=join(dir,'crate.glb');
  try{
    assert.throws(()=>checkWorldCraftAsset(file,'crate'),/ENOENT/);
    writeFileSync(file,fixture(base()));assert.equal(checkWorldCraftAsset(file,'crate').primitives,1);
    for(const mutate of [
      doc=>{doc.scenes[0].nodes=[0];},
      doc=>{doc.nodes[1].translation=[0,1.08,-1.25];},
      doc=>{doc.animations=[{channels:[],samplers:[]}];},
      doc=>{doc.nodes[2].skin=0;},
      doc=>{doc.nodes[2].name='rigMast';},
      doc=>{doc.extensionsUsed=['KHR_lights_punctual'];},
      doc=>{doc.materials[0].extensions={KHR_materials_transmission:{transmissionFactor:1}};},
      doc=>{doc.buffers[0].byteLength=1000;},
    ]){
      const doc=base();mutate(doc);writeFileSync(file,fixture(doc));assert.throws(()=>checkWorldCraftAsset(file,'crate'));
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});
