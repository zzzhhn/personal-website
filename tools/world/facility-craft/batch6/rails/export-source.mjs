import{mkdirSync,writeFileSync,readFileSync}from'node:fs';import{createHash}from'node:crypto';import path from'node:path';
import{Matrix4,Matrix3,Vector3}from'three';import{ROOT}from'../../street/runtime.mjs';import{fixture}from'./fixture.mjs';
const f=fixture(),base=JSON.parse(readFileSync(new URL('./baseline/manifest.json',import.meta.url))),out=path.join(ROOT,'tools/world/facility-craft/batch6/rails/source');mkdirSync(out,{recursive:true});
const sha=x=>createHash('sha256').update(x).digest('hex');
function node(B,name,matrix=new Matrix4()){
 const n=new Matrix3().getNormalMatrix(matrix),p=new Vector3(),position=[],normal=[];
 for(let i=0;i<B.pos.length;i+=3){position.push(...p.fromArray(B.pos,i).applyMatrix4(matrix).toArray());normal.push(...p.fromArray(B.nrm,i).applyNormalMatrix(n).toArray());}
 return{name,translation:[0,0,0],position,normal,color:B.col,aMat:B.mat,aSuv:B.suv,index:B.idx,parts:B.parts.map(p=>({...p,end:p.end<0?B.pos.length/3:p.end}))};
}
const sea=f.actual.kinds.find(k=>k.id==='seawallBay'),end=f.actual.kinds.find(k=>k.id==='seawallEnd'),span=base.actual.seaStep;
const seaNodes=[node(sea.L0,'bay'),node(end.L0,'terminal-unit-fixture',new Matrix4().makeTranslation(span,0,0))];
const selected=f.timber.find(t=>t.item.id===base.actual.selectedTimber.id),post=f.actual.kinds.find(k=>k.id==='timberPost');
const first=new Matrix4().fromArray(base.actual.selectedTimberPosts[0]),inverse=first.clone().invert();
const timberNodes=[node(post.L0,'post.start'),node(post.L0,'post.end',inverse.clone().multiply(new Matrix4().fromArray(base.actual.selectedTimberPosts[1]))),
 node(selected.L0,'beam',inverse.clone().multiply(new Matrix4().fromArray(base.actual.beamMatrix)))];
const reports={};for(const[family,nodes]of[['seawall',seaNodes],['timber',timberNodes]]){
 const data={family,status:'candidate-source; runtime visual review pending',nodes,archiveBoundary:family==='seawall'?'Unit bay with terminal construction fixture; not a screenshot or full production run.':'Actual selected sloped beam and its two actual posts, normalized to first post root.'};
 const raw=JSON.stringify(data);writeFileSync(path.join(out,family+'.source.json'),raw);reports[family]={triangles:nodes.reduce((n,b)=>n+b.index.length/3,0),sourceSHA256:sha(raw)};
}
writeFileSync(path.join(out,'manifest.json'),JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports));
