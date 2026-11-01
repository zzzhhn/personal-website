/** Capture the actual frozen two-piece umbrella, without reconstructing it. */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const out=resolve(repo,'docs/world/phase-2-playground/djc-umbrella-craft-20261101');
const original=readFileSync(resolve(here,'baseline-WorldDjcClubGeometry.ts'),'utf8');
const hashes=JSON.parse(readFileSync(resolve(here,'baseline-source-hashes.json'),'utf8'));
if(createHash('sha256').update(original).digest('hex')!==hashes['WorldDjcClubGeometry.ts'])throw Error('Frozen source changed');
const add="  const add = (kind: ClubBatch, g: BufferGeometry, color: string, wind = 0) => (separateDaybeds && collectingDaybed ? daybedBatches : separatePoolLanterns && collectingPoolLantern ? poolLanternBatches : batches)[kind].add(g, color, wind);";
let injected=original.replace('export function buildDjcClubGeometry(', 'export const __umbrellaCapture: any[] = [];\nlet __captureUmbrella=false;\nexport function buildDjcClubGeometry(');
if(!injected.includes(add))throw Error('Source add site changed');
injected=injected.replace(add,`  const add = (kind: ClubBatch, g: BufferGeometry, color: string, wind=0) => {
    if(__captureUmbrella){const m=g.index?g.toNonIndexed():g;__umbrellaCapture.push({kind,color,positions:Array.from(m.getAttribute('position').array),normals:Array.from(m.getAttribute('normal').array)});if(m!==g)m.dispose();}
    (separateDaybeds && collectingDaybed ? daybedBatches : separatePoolLanterns && collectingPoolLantern ? poolLanternBatches : batches)[kind].add(g,color,wind);
  };`);
const start='  for(const z of [47,63]) {',end="    box('wood',[74,1.42,z],[1.2,.16,2.4],C.edge,0,true);";
if(!injected.includes(start)||!injected.includes(end))throw Error('Umbrella source markers changed');
injected=injected.replace(start,start+'\n    __captureUmbrella=z===47;');
injected=injected.replace(end,'    __captureUmbrella=false;\n'+end);
const temp=resolve(here,'.capture.mjs');
try{
  await build({stdin:{contents:injected,loader:'ts',sourcefile:'FrozenUmbrella.ts',resolveDir:resolve(repo,'src/components/world')},bundle:true,platform:'node',format:'esm',outfile:temp,packages:'external',logLevel:'silent',plugins:[{name:'frozen-layout',setup(b){b.onResolve({filter:/^\.\/djc-club-layout$/},()=>({path:resolve(here,'baseline-djc-club-layout.ts')}));}}]});
  const module=await import(temp),built=module.buildDjcClubGeometry(),pieces=module.__umbrellaCapture;
  if(pieces.length!==2||pieces[0].kind!=='wood'||pieces[1].kind!=='fabric')throw Error('Capture must be pole and canopy only');
  const values=pieces.flatMap(p=>p.positions),bounds=[0,1,2].map(axis=>{let lo=Infinity,hi=-Infinity;for(let k=axis;k<values.length;k+=3){lo=Math.min(lo,values[k]);hi=Math.max(hi,values[k]);}return[lo,hi];});
  if(bounds[0][0]<72.349||bounds[0][1]>75.651||bounds[2][0]<45.349||bounds[2][1]>48.651||Math.abs(bounds[1][0]-1.4)>1e-5||Math.abs(bounds[1][1]-4.225)>1e-5)throw Error('Captured bounds differ');
  const result={description:'Actual first standalone umbrella captured from frozen 34754d2 source; pole and canopy only. Offline source comparison, not a production screenshot.',revision:'34754d28173691dc0913910474c43796ab7cc0a3',originWorld:[74,1.4,47],blenderTransform:'(x-74,47-z,y-1.4)',sourceHashes:hashes,pieces,boundsWorldAxes:bounds,triangles:values.length/9};
  writeFileSync(resolve(out,'baseline-captured.json'),JSON.stringify(result));
  for(const group of ['batches','daybeds','poolLanterns'])for(const g of Object.values(built[group]))g.dispose();
  console.log(JSON.stringify({pieces:pieces.length,triangles:result.triangles,bounds}));
}finally{try{unlinkSync(temp);}catch{}}
