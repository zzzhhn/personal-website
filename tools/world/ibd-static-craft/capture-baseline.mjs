import { writeFile,mkdtemp,rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join,resolve,dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { buildIbdStatic } from '../../../src/components/world/attractions/ibd-yard-geometry.ts';

const root=resolve(import.meta.dirname,'../../..'),file='src/components/world/attractions/ibd-yard-geometry.ts',scratch=await mkdtemp(join(tmpdir(),'ibd-static-baseline-'));
const hash=a=>createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
let original,current,split;
try{
  const source=execFileSync('git',['show','0118dfc:'+file],{cwd:root,encoding:'utf8'}).replace(/from '([.][^']+)'/g,(_,relative)=>`from '${resolve(root,dirname(file),relative)}'`);
  const module=join(scratch,'frozen.ts');await writeFile(module,source);original=(await import(pathToFileURL(module).href)).buildIbdStatic();current=buildIbdStatic();split=buildIbdStatic({separateCraftShells:true});
  const fullHashes={};
  for(const [name,attribute]of Object.entries(original.geometry.attributes)){
    fullHashes[name]=hash(attribute.array);if(hash(current.geometry.attributes[name].array)!==fullHashes[name])throw new Error(`Frozen baseline differs: ${name}`);
  }
  if(hash(original.geometry.index.array)!==hash(current.geometry.index.array))throw new Error('Frozen baseline indices differ');
  fullHashes.index=hash(original.geometry.index.array);
  const definitions=[['InspectionBench',10,-12,1.8,1.6],['UtilityBench-Receiving',-3,26,1.1,.6],['UtilityBench-Tools',-6,19,1.1,.6],['ControlPedestal-Standard',-8,-4,.5,.45],['ControlPedestal-Crane',-6,0,.5,.45]];
  const captures=Object.fromEntries(definitions.map(([name])=>[name,{position:[],normal:[],color:[],surface:[]}]))
  const geometry=split.craftShellGeometry,p=geometry.attributes.position,index=geometry.index.array;
  for(let i=0;i<index.length;i+=3){
    const tri=[index[i],index[i+1],index[i+2]],cx=tri.reduce((s,id)=>s+p.getX(id),0)/3,cz=tri.reduce((s,id)=>s+p.getZ(id),0)/3;
    const definition=definitions.find(([,x,z,w,d])=>Math.abs(cx-x)<=w+.001&&Math.abs(cz-z)<=d+.001);if(!definition)continue;
    const [name,x,z]=definition,out=captures[name];
    for(const id of tri){out.position.push(p.getX(id)-x,p.getY(id),p.getZ(id)-z);for(const [key,target]of [['normal','normal'],['color','color'],['aMat','surface']]){const a=geometry.attributes[key];out[target].push(...a.array.subarray(id*a.itemSize,(id+1)*a.itemSize));}}
  }
  for(const [name,capture]of Object.entries(captures))if(!capture.position.length)throw new Error('Empty baseline '+name);
  const output={baseline_commit:execFileSync('git',['rev-parse','0118dfc'],{cwd:root,encoding:'utf8'}).trim(),capture:'Actual frozen builder output verified byte-for-byte against default current output; shell decomposition extracts the unchanged original vertices, with no re-modelling.',fullHashes,captures};
  await writeFile(join(import.meta.dirname,'baseline-equipment.json'),JSON.stringify(output));
  console.log(JSON.stringify({baseline:output.baseline_commit,triangles:Object.fromEntries(Object.entries(captures).map(([name,c])=>[name,c.position.length/9]))}));
}finally{original?.geometry.dispose();current?.geometry.dispose();split?.geometry.dispose();split?.craftShellGeometry.dispose();await rm(scratch,{recursive:true,force:true});}
