import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Quaternion,Vector3,SkinnedMesh} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';

export function glb(path){const bytes=readFileSync(path),length=bytes.readUInt32LE(12);return{bytes,json:JSON.parse(bytes.subarray(20,20+length)),bin:bytes.subarray(28+length)};}
function accessor(asset,index){
  const a=asset.json.accessors[index],view=asset.json.bufferViews[a.bufferView],width={SCALAR:1,VEC3:3,VEC4:4,MAT4:16}[a.type];
  const size=width*4,stride=view.byteStride??size,start=(view.byteOffset??0)+(a.byteOffset??0),out=Buffer.alloc(a.count*size);
  for(let i=0;i<a.count;i++)asset.bin.copy(out,i*size,start+i*stride,start+i*stride+size);return out;
}
export function motionDigest(asset){
  const h=createHash('sha256');h.update(JSON.stringify(asset.json.nodes));h.update(JSON.stringify(asset.json.skins));
  for(const clip of asset.json.animations){h.update(clip.name);for(const s of clip.samplers){h.update(accessor(asset,s.input));h.update(accessor(asset,s.output));}}
  return h.digest('hex');
}
export async function loadGuide(path){const a=glb(path);const g=await new GLTFLoader().parseAsync(a.bytes.buffer.slice(a.bytes.byteOffset,a.bytes.byteOffset+a.bytes.length),'');return{...a,gltf:g};}
export function footReferences(scene){
  scene.updateMatrixWorld(true);const feet={L:{points:[]},R:{points:[]}};
  scene.traverse(o=>{if(!(o instanceof SkinnedMesh))return;
    const p=o.geometry.getAttribute('position'),ids=o.geometry.getAttribute('skinIndex'),w=o.geometry.getAttribute('skinWeight');
    for(let i=0;i<p.count;i++)for(const tag of ['L','R']){
      let weight=0,bone;for(let k=0;k<4;k++){const b=o.skeleton.bones[ids.getComponent(i,k)];if(new RegExp(`^foot[._]?${tag}$`).test(b?.name??'')){weight+=w.getComponent(i,k);bone=b;}}
      if(weight<.98)continue;const bind=new Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);
      feet[tag].points.push({mesh:o,index:i,bind});feet[tag].bone=bone;
    }
  });
  for(const f of Object.values(feet)){
    f.bindQuaternion=f.bone.getWorldQuaternion(new Quaternion());
  }
  return feet;
}
if(process.argv[1]?.endsWith('/boot-analysis.mjs')){
  const loaded=await loadGuide(process.argv[2]),production=glb(process.argv[3]);
  console.log(JSON.stringify({motionMatch:motionDigest(loaded)===motionDigest(production),companionMotion:motionDigest(loaded),productionMotion:motionDigest(production)}));
}
