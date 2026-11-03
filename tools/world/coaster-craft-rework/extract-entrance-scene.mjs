import { readFileSync, writeFileSync } from 'node:fs';
import { createCoasterStructure } from '../../../src/components/world/attractions/coaster-geometry.ts';
import { createWorkshopCapsule, createWorkshopGeometry } from '../../../src/components/world/attractions/intent-workshop-geometry.ts';

const [entrancePath, shortBaySource, shortBayPath] = process.argv.slice(2);
const finishes = {
  0: [.65, .2], 1: [.54, .12], 2: [.34, .52], 3: [.31, .64], 4: [.76, .02], 5: [.46, .37],
  6: [.55, .08], 12: [.3, .63], 13: [.63, .06], 14: [.46, .48], 16: [.93, 0], 17: [.91, 0],
};
const origin = [34,1,-122];
const groups = new Map();
function addAssembly(name, geometry, include = () => true, offset = [0,0,0]) {
  const { position, normal, color, intentCraftSurface: roles } = geometry.attributes;
  for (let i = 0; i < position.count; i += 3) {
    const role = roles?.getX(i) ?? 0;
    if (!include(role)) continue;
    const rgb = [color.getX(i),color.getY(i),color.getZ(i)].map(v=>Number(v.toFixed(5)));
    const material = `Role ${role} · ${rgb.join(' ')}`;
    const key = `${name} · ${material}`;
    if (!groups.has(key)) groups.set(key,{name:key,material,finish:[rgb,...finishes[role]],vertices:[],normals:[]});
    const part=groups.get(key);
    for(let k=i;k<i+3;k++) {
      part.vertices.push(position.getX(k)+offset[0]-origin[0], origin[2]-position.getZ(k)-offset[2], position.getY(k)+offset[1]-origin[1]);
      part.normals.push(normal.getX(k),-normal.getZ(k),normal.getY(k));
    }
  }
}
const workshop = createWorkshopGeometry(), carrier = createWorkshopCapsule(), structure = createCoasterStructure(true);
addAssembly('Workshop static body', workshop.body);
addAssembly('Carrier shell', carrier, undefined, [34,4.15,-128]);
addAssembly('Station roof, structure and paved forecourt', structure.steel, role => [1,2,6,13,14,17].includes(role));
writeFileSync(entrancePath, JSON.stringify({name:'coaster-entrance-workshop',parts:[...groups.values()]}));
for (const g of [workshop.body, workshop.glow, carrier, structure.steel, structure.glow]) g.dispose();

const bay = JSON.parse(readFileSync(shortBaySource, 'utf8'));
const mapAxes = (array, offset) => array.flatMap((x,i) => i%3 === 0
  ? [x-offset[0],offset[2]-array[i+2],array[i+1]-offset[1]] : []);
const parts = bay.parts.map(part => ({
  name:part.part, material:part.part,
  finish:[part.color.slice(0,3),part.roughness,part.metalness],
  vertices:mapAxes(part.position,[63.2,1,-334.1]), normals:mapAxes(part.normal,[0,0,0]),
}));
writeFileSync(shortBayPath,JSON.stringify({name:'coaster-short-bay',parts}));
