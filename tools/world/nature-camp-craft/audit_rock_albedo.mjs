/** Surface-area weighted source albedo, independent of scene lighting/exposure.
 * UV0 mip-zero bilinear samples at four barycentric points per triangle.
 * This estimates diffuseTexture(linear) * COLOR_0(linear) * baseColorFactor;
 * it is not a rendered brightness measurement or a mip-filter simulation.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import draco from 'draco3d';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const input=process.argv.slice(2);
const files=input.length ? input : ['public/assets/world/nature-camp-craft/G21.glb','public/assets/world/nature-craft/G23.glb'];
const linear=x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
const luma=c=>.2126*c[0]+.7152*c[1]+.0722*c[2];
const quant=(values,q)=>{const sorted=[...values].sort((a,b)=>a[0]-b[0]);const total=sorted.reduce((s,a)=>s+a[1],0);let t=0;for(const [v,w]of sorted){t+=w;if(t>=total*q)return v;}return sorted.at(-1)[0];};
const weights=[[1/3,1/3,1/3],[.6,.2,.2],[.2,.6,.2],[.2,.2,.6]];
const decoderModule=await draco.createDecoderModule({});

async function audit(relative){
  const file=path.resolve(root,relative),raw=fs.readFileSync(file),jsonLength=raw.readUInt32LE(12);
  const doc=JSON.parse(raw.subarray(20,20+jsonLength)),bin=raw.subarray(28+jsonLength);
  const component={5121:[1,'readUInt8',255],5123:[2,'readUInt16LE',65535],5125:[4,'readUInt32LE',4294967295],5126:[4,'readFloatLE',1]};
  const decoded=new Map();
  for(const mesh of doc.meshes)for(const p of mesh.primitives){
    const ext=p.extensions?.KHR_draco_mesh_compression;if(!ext)continue;
    const D=decoderModule,decoder=new D.Decoder(),buffer=new D.DecoderBuffer(),view=doc.bufferViews[ext.bufferView];
    const bytes=bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);buffer.Init(bytes,bytes.length);
    const geometry=new D.Mesh(),status=decoder.DecodeBufferToMesh(buffer,geometry);
    if(!status.ok())throw Error(status.error_msg());
    for(const [semantic,unique]of Object.entries(ext.attributes)){
      const attribute=decoder.GetAttributeByUniqueId(geometry,unique),n=attribute.num_components();
      const accessor=doc.accessors[p.attributes[semantic]],integer=accessor.componentType===5123;
      const a=integer?new D.DracoUInt16Array():new D.DracoFloat32Array();
      if(integer)decoder.GetAttributeUInt16ForAllPoints(geometry,attribute,a);
      else decoder.GetAttributeFloatForAllPoints(geometry,attribute,a);
      const divisor=integer&&accessor.normalized?component[accessor.componentType][2]:1;
      decoded.set(p.attributes[semantic],Array.from({length:geometry.num_points()},(_,i)=>Array.from({length:n},(_,k)=>a.GetValue(i*n+k)/divisor)));D.destroy(a);
    }
    const face=new D.DracoInt32Array(),indices=[];
    for(let i=0;i<geometry.num_faces();i++){decoder.GetFaceFromMesh(geometry,i,face);for(let k=0;k<3;k++)indices.push([face.GetValue(k)]);}
    decoded.set(p.indices,indices);D.destroy(face);D.destroy(status);D.destroy(geometry);D.destroy(buffer);D.destroy(decoder);
  }
  function access(id,index){if(decoded.has(id))return decoded.get(id)[index];const a=doc.accessors[id],v=doc.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],[size,read,divisor]=component[a.componentType],offset=(v.byteOffset||0)+(a.byteOffset||0)+index*(v.byteStride||n*size);return Array.from({length:n},(_,k)=>bin[read](offset+k*size)/(a.normalized?divisor:1));}
  const images=await Promise.all(doc.images.map(async im=>{const v=im.bufferView===undefined?null:doc.bufferViews[im.bufferView];const bytes=v?bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength):fs.readFileSync(path.resolve(path.dirname(file),im.uri));const {data,info}=await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});return {data,info};}));
  function texture(info,uv){
    if(!info)return [1,1,1];
    if(info.extensions)throw Error('Texture transform must be implemented explicitly');
    const tex=doc.textures[info.index],im=images[tex.source],sampler=doc.samplers?.[tex.sampler]||{};
    const coordinate=(x,n,wrap)=>{if(wrap===33071)return Math.max(0,Math.min(n-1,x));return ((x%n)+n)%n;};
    const x=uv[0]*im.info.width-.5,y=uv[1]*im.info.height-.5,ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
    const pixel=(px,py,k)=>linear(im.data[(coordinate(py,im.info.height,sampler.wrapT)*im.info.width+coordinate(px,im.info.width,sampler.wrapS))*im.info.channels+k]/255);
    return [0,1,2].map(k=>(1-fy)*((1-fx)*pixel(ix,iy,k)+fx*pixel(ix+1,iy,k))+fy*((1-fx)*pixel(ix,iy+1,k)+fx*pixel(ix+1,iy+1,k)));
  }
  const buckets=new Map();let triangles=0;
  for(const mesh of doc.meshes)for(const p of mesh.primitives){
    const mat=doc.materials[p.material],pbr=mat.pbrMetallicRoughness||{},name=mat.name||String(p.material);
    if(!buckets.has(name))buckets.set(name,[]);
    const dst=buckets.get(name),count=doc.accessors[p.indices].count;
    for(let i=0;i<count;i+=3){
      const ids=[0,1,2].map(k=>access(p.indices,i+k)[0]),pos=ids.map(k=>access(p.attributes.POSITION,k));
      const a=pos[1].map((v,k)=>v-pos[0][k]),b=pos[2].map((v,k)=>v-pos[0][k]);
      const area=Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])/2;
      const uv=ids.map(k=>access(p.attributes['TEXCOORD_'+(pbr.baseColorTexture?.texCoord||0)],k));
      const colors=ids.map(k=>p.attributes.COLOR_0===undefined?[1,1,1]:access(p.attributes.COLOR_0,k));
      for(const w of weights){
        const coord=[0,1].map(k=>w.reduce((s,v,j)=>s+v*uv[j][k],0));
        const col=[0,1,2].map(k=>w.reduce((s,v,j)=>s+v*colors[j][k],0));
        const tex=texture(pbr.baseColorTexture,coord),factor=pbr.baseColorFactor||[1,1,1,1];
        const rgb=col.map((v,k)=>v*tex[k]*factor[k]);
        dst.push({area:area/weights.length,rgb,L:luma(rgb),colorL:luma(col),textureL:luma(tex)});
      }
      triangles++;
    }
  }
  const summarize=samples=>{const area=samples.reduce((s,a)=>s+a.area,0),mean=key=>samples.reduce((s,a)=>s+a[key]*a.area,0)/area,q=key=>Object.fromEntries([.1,.5,.9].map(v=>['p'+Math.round(v*100),quant(samples.map(a=>[a[key],a.area]),v)]));return {area,samples:samples.length,effectiveLinearLuminance:{mean:mean('L'),...q('L')},textureLinearLuminance:{mean:mean('textureL'),...q('textureL')},vertexLinearLuminance:{mean:mean('colorL'),...q('colorL')},effectiveLinearRGBMean:[0,1,2].map(k=>samples.reduce((s,a)=>s+a.rgb[k]*a.area,0)/area)};};
  return {file:relative,triangles,all:summarize([...buckets.values()].flat()),materials:Object.fromEntries([...buckets].map(([k,v])=>[k,summarize(v)]))};
}
console.log(JSON.stringify({method:'Four area-weighted barycentric samples per triangle, decoded sRGB mip-zero bilinear texture × interpolated linear COLOR_0 × baseColorFactor; no scene illumination, AO or environment included',assets:await Promise.all(files.map(audit))},null,2));
