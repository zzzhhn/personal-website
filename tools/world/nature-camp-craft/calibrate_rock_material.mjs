/** One G21 material calibration. Never regenerates or exports geometry. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const cfg=JSON.parse(fs.readFileSync(path.join(here,'G21-material-r10.json')));
const target=path.join(root,'public/assets/world/nature-camp-craft/G21.glb');
const report=path.join(root,'docs/world/phase-2-playground/asset-batch6-20261103/nature-camp');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const raw=fs.readFileSync(target),frozen=JSON.parse(fs.readFileSync(path.join(report,'G21-geometry-freeze-r9.json')));
assert.equal(sha(raw),frozen.sourceGLBSHA,'Calibrate only the archived R9 GLB once');
const source=path.resolve(root,cfg.sourceTexture);
const licenseManifest=JSON.parse(fs.readFileSync(path.join(path.dirname(source),'SOURCES.json')));
const stone=licenseManifest.assets.find(a=>a.family==='stone');
assert.equal(sha(fs.readFileSync(source)),stone.maps.find(m=>m.file==='stone-color.jpg').sha256,'Changed licensed source photograph');
const {data,info}=await sharp(source).resize(cfg.texture.size,cfg.texture.size).removeAlpha().raw().toBuffer({resolveWithObject:true});
const decode=x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
const encode=x=>x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055;
const luma=c=>.2126*c[0]+.7152*c[1]+.0722*c[2],clamp=(a,b,v)=>Math.max(a,Math.min(b,v));
const pixels=Array.from({length:info.width*info.height},(_,i)=>[0,1,2].map(k=>decode(data[i*info.channels+k]/255)));
const sourceMean=[0,1,2].map(k=>pixels.reduce((s,p)=>s+p[k],0)/pixels.length),meanL=luma(sourceMean);
const derived=pixels.map(p=>{const L=luma(p),ratio=clamp(...cfg.texture.ratioClamp,L/meanL)**cfg.texture.luminancePower;return p.map((v,k)=>cfg.texture.linearMeanRGB[k]*ratio*((v/Math.max(L,1e-6))/(sourceMean[k]/meanL))**cfg.texture.localChromaPower);});
// Normalize each channel to its declared reflectance mean, never to white.
const actualMean=[0,1,2].map(k=>derived.reduce((s,p)=>s+p[k],0)/derived.length);
const encoded=Buffer.from(derived.flatMap(p=>p.map((v,k)=>Math.round(255*encode(clamp(0,1,v*cfg.texture.linearMeanRGB[k]/actualMean[k]))))));
const png=await sharp(encoded,{raw:{width:info.width,height:info.height,channels:3}}).png().toBuffer();
const uri='textures/'+sha(png).slice(0,24)+'.png',imagePath=path.join(path.dirname(target),uri);fs.writeFileSync(imagePath,png);
const n=raw.readUInt32LE(12),doc=JSON.parse(raw.subarray(20,20+n)),bin=Buffer.from(raw.subarray(28+n));
const before=Buffer.from(bin),allowed=new Uint8Array(bin.length),pc=cfg.pigment;
const smooth=(a,b,x)=>{const t=clamp(0,1,(x-a)/(b-a));return t*t*(3-2*t);};
function pigment([x,y,z],role){
  const dx=x-pc.centerXY[0],dy=y-pc.centerXY[1],fault=smooth(pc.fault[0],pc.fault[1],dx+pc.fault[2]*dy);
  const q=(z-pc.bottom+pc.bedDip[0]*dx+pc.bedDip[1]*dy)/pc.height-pc.fault[3]*fault;
  const thickness=pc.thickness*clamp(0,1,(dx-dy+.6)/1.2),e=pc.bedEdges;
  const bed=smooth(e[0],e[1],q)*(1-smooth(e[2]+thickness,e[3]+thickness,q));
  const host=role===1?pc.friableHost:role===2?pc.cleavedHost:pc.host,mineral=role===1?pc.friableMineral:role===2?pc.cleavedMineral:pc.mineral;
  const foot=(1-smooth(...pc.footDepth,(z-pc.bottom)/pc.height))*pc.footMix;
  return host.map((v,k)=>(v*(1-bed)+mineral[k]*bed)*(1-foot)+pc.foot[k]*foot);
}
for(const mesh of doc.meshes)for(const p of mesh.primitives){
  const position=doc.accessors[p.attributes.POSITION],pv=doc.bufferViews[position.bufferView],color=doc.accessors[p.attributes.COLOR_0],cv=doc.bufferViews[color.bufferView];
  assert.equal(color.componentType,5123);assert.equal(color.normalized,true);assert.equal(position.componentType,5126);
  for(let i=0;i<color.count;i++){
    const po=(pv.byteOffset||0)+(position.byteOffset||0)+i*(pv.byteStride||12),co=(cv.byteOffset||0)+(color.byteOffset||0)+i*(cv.byteStride||8);
    // glTF +Y up -> native Blender +Z up. The frozen nodes are identity.
    const native=[bin.readFloatLE(po),-bin.readFloatLE(po+8),bin.readFloatLE(po+4)],rgb=pigment(native,p.material);
    for(let k=0;k<3;k++){bin.writeUInt16LE(Math.round(clamp(0,1,rgb[k])*65535),co+2*k);allowed[co+2*k]=allowed[co+2*k+1]=1;}
  }
}
for(let i=0;i<bin.length;i++)assert.ok(allowed[i]||bin[i]===before[i],'Touched a non-COLOR_0 byte');
const textures=new Set(doc.materials.map(m=>m.pbrMetallicRoughness.baseColorTexture.index));assert.equal(textures.size,1);
const image=doc.images[doc.textures[[...textures][0]].source];image.uri=uri;image.name='B6 | linear-calibrated CC0 mineral photograph 512';
doc.nodes.find(n=>n.name==='G21').extras.batch6Material=cfg.revision;
let js=Buffer.from(JSON.stringify(doc));js=Buffer.concat([js,Buffer.alloc((4-js.length%4)%4,32)]);
const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+js.length+bin.length,8);header.writeUInt32LE(js.length,12);header.writeUInt32LE(0x4e4f534a,16);
const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);
const output=Buffer.concat([header,js,bh,bin]);fs.writeFileSync(target,output);
const record={revision:cfg.revision,source:{file:cfg.sourceTexture,sha256:sha(fs.readFileSync(source)),asset:stone.source,authors:stone.authors,license:licenseManifest.license,licenseUrl:licenseManifest.license_url},beforeGLBSHA:sha(raw),afterGLBSHA:sha(output),image:{uri,sha256:sha(png),size:[info.width,info.height]},geometryPolicy:'Only existing COLOR_0 RGB component bytes changed in BIN; material baseColor image URI and descriptive extras changed in JSON. Normals, positions, UVs, index topology, AO, roughness, normal maps, alpha, transforms and all other material fields preserved.',nativePending:true,runtimePending:true,recipe:cfg};
fs.writeFileSync(path.join(report,'G21-material-r10.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({before:record.beforeGLBSHA,after:record.afterGLBSHA,image:record.image,nativePending:true}));
