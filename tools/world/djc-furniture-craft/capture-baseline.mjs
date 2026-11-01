/** Execute exact frozen source and capture three existing objects, never reconstruct before. */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const out=resolve(repo,'docs/world/phase-2-playground/djc-furniture-craft-20261101');
const original=readFileSync(resolve(here,'baseline-WorldDjcClubGeometry.ts'),'utf8');
const hashes=JSON.parse(readFileSync(resolve(here,'baseline-source-hashes.json'),'utf8'));
if(createHash('sha256').update(original).digest('hex')!==hashes.files['WorldDjcClubGeometry.ts'])throw Error('Frozen source changed');
let injected=original.replace('export function buildDjcClubGeometry(',"export const __furnitureCapture: Record<string,any[]>={lounger:[],console:[],speaker:[]};\nlet __captureFurniture='';\nexport function buildDjcClubGeometry(");
const add=/  const add = \(kind: ClubBatch, g: BufferGeometry, color: string, wind = 0\) => (.+)\[kind\]\.add\(g, color, wind\);/;
if(!add.test(injected))throw Error('Source add site changed');
injected=injected.replace(add,(_,destination)=>`  const add = (kind: ClubBatch,g: BufferGeometry,color:string,wind=0)=>{if(__captureFurniture){const m=g.index?g.toNonIndexed():g;__furnitureCapture[__captureFurniture].push({kind,color,positions:Array.from(m.getAttribute('position').array),normals:Array.from(m.getAttribute('normal').array)});if(m!==g)m.dispose();}${destination}[kind].add(g,color,wind);};`);
const replace=(a,b)=>{if(!injected.includes(a))throw Error('Missing capture marker '+a);injected=injected.replace(a,b);};
replace("  slab('wood',rect(32.12,33.48,52.5,57.5,2.72)","  __captureFurniture='console';\n  slab('wood',rect(32.12,33.48,52.5,57.5,2.72)");
replace('  // The face points +X.',"  __captureFurniture='';\n  // The face points +X.");
replace('  for(const z of [49.1,60.9]) {',"  for(const z of [49.1,60.9]) {\n    __captureFurniture=z===49.1?'speaker':'';");
replace('  yOffset=0;\n  // Main FINNS',"  __captureFurniture='';\n  yOffset=0;\n  // Main FINNS");
replace("    box('wood',[74,1.42,z]", "    __captureFurniture=z===47?'lounger':'';\n    box('wood',[74,1.42,z]");
replace("[1.12,.19,2.3],'#43827e',0,true);", "[1.12,.19,2.3],'#43827e',0,true);\n    __captureFurniture='';");
replace('  // Pool water has its own',"  __captureFurniture='';\n  // Pool water has its own");
const temp=resolve(here,'.capture.mjs');
try{
  await build({stdin:{contents:injected,loader:'ts',sourcefile:'FrozenFurniture.ts',resolveDir:resolve(repo,'src/components/world')},bundle:true,platform:'node',format:'esm',outfile:temp,packages:'external',logLevel:'silent',plugins:[{name:'frozen-layout',setup(b){b.onResolve({filter:/^\.\/djc-club-layout$/},()=>({path:resolve(here,'baseline-djc-club-layout.ts')}));}}]});
  const module=await import(temp),built=module.buildDjcClubGeometry(),families=module.__furnitureCapture;
  if(families.lounger.length!==2||families.console.length<30||families.speaker.length!==5)throw Error('Captured unexpected family parts '+JSON.stringify(Object.fromEntries(Object.entries(families).map(([k,v])=>[k,v.length]))));
  const originWorld={lounger:[74,1.4,47],console:[32.8,2,55],speaker:[35.1,2,49.1]};
  const stats=Object.fromEntries(Object.entries(families).map(([name,pieces])=>{const values=pieces.flatMap(p=>p.positions);return [name,{pieces:pieces.length,triangles:values.length/9,bounds:[0,1,2].map(axis=>{let lo=Infinity,hi=-Infinity;for(let i=axis;i<values.length;i+=3){lo=Math.min(lo,values[i]);hi=Math.max(hi,values[i]);}return [lo,hi];})}];}));
  writeFileSync(resolve(out,'baseline-captured.json'),JSON.stringify({revision:'0118dfc',description:'Exact source captured offline, not a browser screenshot.',sourceHashes:hashes,originWorld,families,stats}));
  for(const key of ['batches','daybeds','poolLanterns','umbrellas'])for(const g of Object.values(built[key]))g.dispose();built.pool.dispose();
  console.log(JSON.stringify(stats));
}finally{try{unlinkSync(temp);}catch{}}
