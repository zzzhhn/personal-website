/** Preserve the shared near/far bar structure while leaving trim and loose decor in the draw meshes. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { Vector3 } from 'three';
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js';
import { readWorldCraftGltf, disposeWorldCraftGltf } from '../../../src/components/world/world-craft-gltf-test.mjs';

const sources={
  near:'public/assets/world/club/bar/djc-north-bar-v1.glb',
  far:'public/assets/world/club/bar/djc-north-bar-lod1-v1.glb',
};
const stoolCenters=[-3.55,-1.25,1.05,3.35], scale=.0002;
const stoolMaterial=/^(Oiled teak|Blackened steel|Split rattan|Brushed brass)/;
const structureMaterial=/^(Oiled teak|Blackened steel|Dry palm thatch|Honed limestone|Potting soil)/;
const point=new Vector3(), variants={};
const shapes={surface:{vertices:[],indices:[],lookup:new Map()},solid:{vertices:[],indices:[],lookup:new Map()}};
const structure=[];
await MeshoptSimplifier.ready;

function contactName(material,points){
  if(stoolMaterial.test(material)){
    const index=stoolCenters.findIndex(cx=>points.every(([x,y,z])=>Math.abs(x-cx)<.37&&Math.abs(z-.25)<.37&&y>=-.005&&y<.84)
      &&!points.every(([,y])=>y<=.003));
    if(index>=0)return `stool-${index}`;
  }
  if(structureMaterial.test(material)){
    const [a,b,c]=points, ab=new Vector3(...b).sub(new Vector3(...a)),ac=new Vector3(...c).sub(new Vector3(...a));
    return points.every(([,y])=>y<=1.17) && ab.cross(ac).normalize().y>.7 ? 'surface' : 'solid';
  }
  return material==='Palm leaf'?'soft':'none';
}

function collectStructure(material,kind,faces){
  const points=[],lookup=new Map(),triangles=[];
  for(const face of faces){
    const triangle=face.map(position=>{
      const q=position.map(v=>Math.round(v/scale)), key=q.join(',');
      if(!lookup.has(key)){lookup.set(key,points.length/3);points.push(...q);}
      return lookup.get(key);
    });
    if(new Set(triangle).size===3)triangles.push(...triangle);
  }
  const wanted = Math.round(triangles.length*.025/3)*3;
  const thatch=material.startsWith('Dry palm thatch');
  const maximumError = thatch ? .024 : material.startsWith('Honed limestone') ? .0014 : .005;
  const [simple,error]=MeshoptSimplifier.simplify(Uint32Array.from(triangles),Float32Array.from(points,n=>n*scale),3,
    wanted,maximumError,thatch?['ErrorAbsolute','Prune']:['ErrorAbsolute','LockBorder']);
  if(!simple.length||error>maximumError)throw new Error(`Could not preserve ${material} structure`);
  const {vertices,indices,lookup:contactPoints}=shapes[kind];
  for(const i of simple){
    const q=points.slice(i*3,i*3+3), key=q.join(',');
    if(!contactPoints.has(key)){contactPoints.set(key,vertices.length/3);vertices.push(...q);}
    indices.push(contactPoints.get(key));
  }
  structure.push({material,kind,sourceTriangles:triangles.length/3,contactTriangles:simple.length/3,error});
}

for(const [lod,url] of Object.entries(sources)){
  const {scene}=await readWorldCraftGltf([url]), groups={};
  const sha256=createHash('sha256').update(await readFile(new URL(`../../../${url}`,import.meta.url))).digest('hex');
  try{
    scene.updateMatrixWorld(true);
    scene.traverse(mesh=>{
      if(!mesh.isMesh)return;
      if(Array.isArray(mesh.material)||groups[mesh.material.name])throw new Error(`Unexpected bar draw primitive ${mesh.name}`);
      const material=mesh.material.name, position=mesh.geometry.attributes.position, index=mesh.geometry.index;
      const length=index?.count??position.count, runs=[], structuralFaces={surface:[],solid:[]};
      for(let i=0;i<length;i+=3){
        const points=[i,i+1,i+2].map(n=>point.fromBufferAttribute(position,index?.getX(n)??n).applyMatrix4(mesh.matrixWorld).toArray());
        const kind=contactName(material,points);
        if(Object.hasOwn(structuralFaces,kind)&&lod==='near')structuralFaces[kind].push(points);
        const prior=runs.at(-1);
        if(prior?.[0]===kind)prior[1]+=3;
        else runs.push([kind,3]);
      }
      for(const [kind,faces] of Object.entries(structuralFaces))if(faces.length)collectStructure(material,kind,faces);
      groups[material]=runs;
    });
    variants[lod]={url,sha256,groups};
  }finally{disposeWorldCraftGltf(scene);}
}

function encode(words,signed){
  const buffer=Buffer.alloc(words.length*2);
  words.forEach((value,i)=>signed ? buffer.writeInt16LE(value,i*2) : buffer.writeUInt16LE(value,i*2));
  return buffer.toString('base64');
}
const encoded=Object.fromEntries(Object.entries(shapes).map(([kind,{vertices,indices}])=>[kind,{
  vertices:encode(vertices,true),indices:encode(indices,false),
}]));
await writeFile(new URL('../../../src/components/world/club-north-bar-contact.generated.json',import.meta.url),
  JSON.stringify({scale,shapes:encoded,structure,variants})+'\n');
console.log(structure, `${structure.reduce((n,part)=>n+part.contactTriangles,0)} shared structural triangles`);
