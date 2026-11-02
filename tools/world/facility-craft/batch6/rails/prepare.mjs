/** Light-only current baseline fixtures. No build, browser, native service or visual verdict. */
import{readFileSync,mkdirSync,writeFileSync}from'node:fs';
import{createHash}from'node:crypto';
import path from'node:path';
import vm from'node:vm';
import ts from'typescript';
import{execFileSync}from'node:child_process';
import{Matrix4,Quaternion,Vector3}from'three';
import{loadWorldModule,ROOT,families}from'../../street/runtime.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const layout=loadWorldModule('layout-v4.ts'),A=loadWorldModule('WorldStreetAssets.ts','?railCraft=baseline');
const adapter='src/components/world/WorldStreetRails.tsx',raw=readFileSync(path.join(ROOT,adapter),'utf8');
const start=raw.indexOf('const yawQ ='),end=raw.indexOf('export default function StreetRails');
if(start<0||end<0)throw new Error('Pure layout source boundary changed');
const exports={},module={exports};vm.runInNewContext(ts.transpileModule(raw.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,
 {module,exports,Matrix4,Quaternion,Vector3,solidsV4:layout.solidsV4,TRAIL_V4:layout.TRAIL_V4,console},{timeout:2000});
const actual=module.exports.railLayout(),solids=layout.solidsV4(),sea=actual.placements.filter(p=>p.kind==='seawallBay'),posts=actual.placements.filter(p=>p.kind==='timberPost');
const timber=actual.beams.find(b=>b.kind==='beam');if(!sea.length||!timber)throw new Error('Actual representative absent');
const seaIndex=Math.floor(sea.length*.6),seaRoot=new Vector3().setFromMatrixPosition(sea[seaIndex].matrix);
const seaYaw=solids.find(s=>s.kind==='rail'&&Math.abs(s.position[0]-31)<.01).yaw;
const seaStep=sea.length>1?new Vector3().setFromMatrixPosition(sea[1].matrix).distanceTo(new Vector3().setFromMatrixPosition(sea[0].matrix)):0;
const beamMatrix=new Matrix4().compose(new Vector3(...timber.position),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),timber.yaw)
 .multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),timber.pitch??0)),new Vector3(1,1,1));
const nearest=p=>posts.map(post=>({post,d:new Vector3().setFromMatrixPosition(post.matrix).distanceTo(p)})).sort((a,b)=>a.d-b.d)[0].post;
const ends=[-1,1].map(sign=>new Vector3(sign*(timber.len+.2)/2,-.57,0).applyMatrix4(beamMatrix));
const timberPosts=ends.map(nearest),timberRoot=new Vector3().setFromMatrixPosition(timberPosts[0].matrix);
const ridge=layout.RIDGE_V4.center,normal=[Math.sin(timber.yaw),Math.cos(timber.yaw)];
const roadSign=normal[0]*(ridge[0]-timberRoot.x)+normal[1]*(ridge[1]-timberRoot.z)>0?1:-1;
const world=(root,yaw,p)=>[root.x+Math.cos(yaw)*p[0]+Math.sin(yaw)*p[2],root.y+p[1],root.z-Math.sin(yaw)*p[0]+Math.cos(yaw)*p[2]].map(x=>+x.toFixed(6));
const views=[{id:'seawall-normal',eye:world(seaRoot,seaYaw,[1.1,1.6,-3.4]),target:world(seaRoot,seaYaw,[.9,.62,0]),representative:'seawall bay '+seaIndex},
 {id:'timber-normal',eye:world(timberRoot,timber.yaw,[1.2,1.6,roadSign*3.4]),target:world(timberRoot,timber.yaw,[.65,.62,0]),representative:timber.id}];
const current=families(A),contract=b=>hash([b.pos,b.nrm,b.col,b.mat,b.suv,b.idx,b.parts,b.cell,b.hulls().map(h=>[...h])]);
const sources={};for(const file of[adapter,'src/components/world/layout-v4.ts','src/components/world/WorldStreetFacilityCraft.ts','src/components/world/WorldStreetAssets.ts',
 'src/components/world/WorldStreetStatic.tsx','src/components/world/WorldStreetKnock.tsx','src/components/world/WorldStreetBatch.ts','src/components/world/WorldFacilitySurface.ts','src/components/world/WorldStreetMaterial.ts',
 'src/components/world/WorldPark.tsx','src/components/world/WorldBinConstruction.ts','src/components/world/WorldBenchBinSurface.ts'])sources[file]=createHash('sha256').update(execFileSync('git',['show','97c9546:'+file],{cwd:ROOT})).digest('hex');
const data={status:'current-source baseline only; cameras planned, not browser-verified',baselineCommit:'97c95467bb0a4e9ac68bf33f2beaca4138aeb0fe',sources,
 contracts:Object.fromEntries(Object.entries(current).map(([name,pair])=>[name,pair.map(contract)])),
 actual:{seaBayCount:sea.length,seaNominalGeometryLength:2,seaStep,selectedSea:seaIndex,
 timberBeamCount:actual.beams.filter(b=>b.kind==='beam').length,timberPostCount:posts.length,
 selectedTimber:timber,selectedTimberPosts:timberPosts.map(p=>p.matrix.toArray()),beamMatrix:beamMatrix.toArray(),
 placementSHA256:hash(actual.placements.map(p=>[p.kind,p.matrix.toArray()])),beamLayoutSHA256:hash(actual.beams)},views};
const out=path.join(ROOT,'tools/world/facility-craft/batch6/rails/baseline');mkdirSync(out,{recursive:true});writeFileSync(path.join(out,'manifest.json'),JSON.stringify(data,null,2)+'\n');
writeFileSync(path.join(out,'views.json'),JSON.stringify(views,null,2)+'\n');
console.log(JSON.stringify({status:data.status,actual:data.actual,views,nearbySeaBenches:solids.filter(s=>s.kind==='bench'&&Math.hypot(s.position[0]-seaRoot.x,s.position[2]-seaRoot.z)<4).map(s=>s.position)}));
