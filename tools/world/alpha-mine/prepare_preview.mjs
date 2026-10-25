// Reuse the runtime plant banks and exact seven-instance anchor expansion.
import {readFileSync,writeFileSync} from 'node:fs';
import {quarryFloraBanks,quarryFloraKind} from '../../../src/components/world/alpha-mine-flora.ts';
import {mineLocalToWorld} from '../../../src/components/world/alpha-mine-layout.ts';
const layout=JSON.parse(readFileSync('public/world/alpha-mine/layout.json','utf8')),instances=[];
for(const [j,v] of layout.vegetation.entries())for(let i=0;i<7;i++){
 const a=i*2.399+j,r=i===0?0:.12+.16*(i%3)/2;
 const position=[v.position[0]+Math.cos(a)*r,v.position[1],v.position[2]+Math.sin(a)*r];
 const world=mineLocalToWorld(position),phase=Math.max(0,Math.min(1,(v.scale-.7)/.75))*(.65+.35*(i%3)/2);
 const scale=(.7+phase*.75)*(.82+.3*Math.abs(Math.sin(world[0]*5.7+world[2]*3.9)));
 instances.push({position,scale,yaw:v.yaw+a,kind:quarryFloraKind(world[0],world[2])});
}
writeFileSync('tools/world/alpha-mine/evidence/flora-banks.json',JSON.stringify(quarryFloraBanks()));
writeFileSync('tools/world/alpha-mine/evidence/flora-preview-instances.json',JSON.stringify({anchors:layout.vegetation,instances}));
console.log(`Preview plants: ${instances.length}, ${instances.filter(v=>v.kind===1).length} rosettes, ${instances.filter(v=>v.kind===2).length} flowers; unchanged runtime cap.`);
