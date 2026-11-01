// Reuse the runtime plant banks and exact seven-instance anchor expansion.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const sourceRoot=resolve(process.env.QUARRY_FLORA_SOURCE_ROOT??'.');
const floraPath=resolve(sourceRoot,'src/components/world/alpha-mine-flora.ts');
const {quarryFloraBanks,quarryFloraKind,quarryFloraStyle}=await import(pathToFileURL(floraPath).href);
const {mineLocalToWorld}=await import(pathToFileURL(resolve(sourceRoot,'src/components/world/alpha-mine-layout.ts')).href);
const layout=JSON.parse(readFileSync(process.argv[2]??'public/world/alpha-mine/layout.json','utf8')),instances=[];
for(const [j,v] of layout.vegetation.entries())for(let i=0;i<7;i++){
 const a=i*2.399+j,r=i===0?0:.12+.16*(i%3)/2;
 const position=[v.position[0]+Math.cos(a)*r,v.position[1],v.position[2]+Math.sin(a)*r];
 const world=mineLocalToWorld(position),phase=Math.max(0,Math.min(1,(v.scale-.7)/.75))*(.65+.35*(i%3)/2);
 const scale=(.7+phase*.75)*(.82+.3*Math.abs(Math.sin(world[0]*5.7+world[2]*3.9)));
 const kind=quarryFloraKind(world[0],world[2]),style=quarryFloraStyle?.(world[0],world[2])??kind;
 instances.push({position,scale,yaw:v.yaw+a,kind,style});
}
writeFileSync('tools/world/alpha-mine/evidence/flora-banks.json',JSON.stringify(quarryFloraBanks()));
writeFileSync('tools/world/alpha-mine/evidence/flora-preview-instances.json',JSON.stringify({anchors:layout.vegetation,instances,floraSourceSha256:createHash('sha256').update(readFileSync(floraPath)).digest('hex')}));
console.log(`Preview plants: ${instances.length}, ${instances.filter(v=>v.kind===1).length} rosettes, ${instances.filter(v=>v.kind===2).length} flowers; unchanged runtime cap.`);
