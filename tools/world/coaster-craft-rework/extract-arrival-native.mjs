import { writeFileSync } from 'node:fs';
import { addTunnel, CoasterBatch, createCoasterCar, createCoasterStructure } from '../../../src/components/world/attractions/coaster-geometry.ts';
import { createIntentChestBody, createIntentChestLid, createIntentGateLeaf, createIntentKey } from '../../../src/components/world/attractions/coaster-device-geometry.ts';

const output = process.argv[2];
if (!output) throw new Error('Provide the destination JSON path');
const finishes = {
  0: [.70,.16], 12: [.30,.63], 13: [.63,.06], 14: [.46,.48], 15: [.88,0],
  16: [.93,0], 18: [.88,0], 19: [.90,0], 20: [.53,.15],
};
const structure = createCoasterStructure(true, 'legacy');
const tunnelSteel = new CoasterBatch(), tunnelLights = new CoasterBatch();
addTunnel(tunnelSteel, tunnelLights, true);
const batches = [
  { name:'Tunnel structure', geometry:tunnelSteel.finish(), offset:[-16,-1,194] },
  { name:'Tunnel light strip geometry', geometry:tunnelLights.finish(), offset:[-16,-1,194] },
  { name:'Train car', geometry:createCoasterCar(), offset:[0,0,0] },
  { name:'Gate leaf', geometry:createIntentGateLeaf(), offset:[4,0,0] },
  { name:'Chest with open locks', geometry:createIntentChestBody(['T1','T2','T3','T4','T5','T6']), offset:[12,0,0] },
  { name:'Chest lid in hinge coordinates', geometry:createIntentChestLid(), offset:[12,1.23,-1] },
  { name:'Key', geometry:createIntentKey(), offset:[12,1.4,.25] },
  { name:'Station and service surface samples', geometry:structure.steel, offset:[-31,-1,155],
    include: (role,x,y,z) => [18,19].includes(role) && x>5 && x<66 && y>0 && z>-200 && z<-133 },
];
const parts = new Map();
for (const {name,geometry,offset,include} of batches) {
  const {position,normal,color,intentCraftSurface:roles} = geometry.attributes;
  for (let i=0;i<position.count;i+=3) {
    const role = roles?.getX(i) ?? 0;
    if (include && !include(role,position.getX(i),position.getY(i),position.getZ(i))) continue;
    const rgb=[color.getX(i),color.getY(i),color.getZ(i)].map(channel=>Number(channel.toFixed(5)));
    const material = `Role ${role} · ${rgb.join(' ')}`, key = `${name} · ${material}`;
    if (!parts.has(key)) parts.set(key,{name:key,material,finish:[rgb,...finishes[role]],vertices:[],normals:[]});
    const part=parts.get(key);
    for (let k=i;k<i+3;k++) {
      part.vertices.push(position.getX(k)+offset[0],-position.getZ(k)-offset[2],position.getY(k)+offset[1]);
      part.normals.push(normal.getX(k),-normal.getZ(k),normal.getY(k));
    }
  }
  geometry.dispose();
}
structure.glow.dispose();
writeFileSync(output,JSON.stringify({name:'coaster-arrival-assemblies',parts:[...parts.values()]}));
console.log(JSON.stringify({parts:parts.size,triangles:[...parts.values()].reduce((total,p)=>total+p.vertices.length/9,0)}));
