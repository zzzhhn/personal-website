import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from 'three';

/** Decode only this 2.2 MB shipped asset using the already bundled 188 KB decoder.
 * No browser, Blender, texture fetching or world/terrain construction. */
export async function readMineStaticVisual(){
  const path=new URL('../../../public/world/alpha-mine/quarry-static.glb',import.meta.url),bytes=readFileSync(path),jsonLength=bytes.readUInt32LE(12);
  const json=JSON.parse(bytes.subarray(20,20+jsonLength)),bin=bytes.subarray(28+jsonLength);
  assert.ok(json.materials.every(material=>(material.alphaMode??'OPAQUE')==='OPAQUE'),'the shipped visual materials are opaque');
  const dracoPath=new URL('../../../public/assets/world/draco/',import.meta.url);
  const factory=vm.runInNewContext(readFileSync(new URL('draco_wasm_wrapper.js',dracoPath),'utf8')+';DracoDecoderModule;',
    {console,TextDecoder,WebAssembly,Buffer,Uint8Array,ArrayBuffer,setTimeout,clearTimeout});
  const draco=await factory({wasmBinary:readFileSync(new URL('draco_decoder.wasm',dracoPath))});
  const root=new Group(),geometries=json.meshes.map(mesh=>{
    assert.equal(mesh.primitives.length,1);
    const primitive=mesh.primitives[0],extension=primitive.extensions.KHR_draco_mesh_compression,view=json.bufferViews[extension.bufferView];
    const data=bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength),buffer=new draco.DecoderBuffer(),decoder=new draco.Decoder(),decoded=new draco.Mesh();
    buffer.Init(new Int8Array(data.buffer,data.byteOffset,data.length),data.length);
    const status=decoder.DecodeBufferToMesh(buffer,decoded);assert.ok(status.ok(),status.error_msg());
    const attribute=decoder.GetAttributeByUniqueId(decoded,extension.attributes.POSITION),values=new draco.DracoFloat32Array();
    assert.ok(decoder.GetAttributeFloatForAllPoints(decoded,attribute,values));
    const points=new Float32Array(values.size());for(let i=0;i<points.length;i++)points[i]=values.GetValue(i);
    const indices=new Uint32Array(decoded.num_faces()*3),face=new draco.DracoInt32Array();
    for(let i=0;i<decoded.num_faces();i++){decoder.GetFaceFromMesh(decoded,i,face);for(let k=0;k<3;k++)indices[i*3+k]=face.GetValue(k);}
    const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(points,3));geometry.setIndex(Array.from(indices));
    [face,values,decoded,decoder,buffer].forEach(value=>draco.destroy(value));
    return geometry;
  });
  const nodes=json.nodes.map(node=>{
    const object=node.mesh===undefined?new Group():new Mesh(geometries[node.mesh],new MeshStandardMaterial());object.name=node.name??'';
    if(node.matrix){object.matrix.fromArray(node.matrix);object.matrix.decompose(object.position,object.quaternion,object.scale);}
    if(node.translation)object.position.fromArray(node.translation);if(node.rotation)object.quaternion.fromArray(node.rotation);if(node.scale)object.scale.fromArray(node.scale);
    return object;
  });
  json.nodes.forEach((node,i)=>node.children?.forEach(child=>nodes[i].add(nodes[child])));
  for(const index of json.scenes[json.scene??0].nodes)root.add(nodes[index]);
  return {root,dispose:()=>{geometries.forEach(g=>g.dispose());nodes.forEach(n=>{if(n.isMesh)n.material.dispose();});}};
}
