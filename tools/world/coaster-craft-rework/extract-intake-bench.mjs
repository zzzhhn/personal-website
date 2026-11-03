import { writeFileSync } from 'node:fs';
import { CoasterBatch } from '../../../src/components/world/attractions/coaster-geometry.ts';
import { addIntakeBench } from '../../../src/components/world/attractions/intent-workshop-geometry.ts';
import { coasterWorld } from '../../../src/components/world/attractions/coaster-track.ts';
import { WORKSHOP_INTAKE } from '../../../src/components/world/attractions/intent-workshop-layout.ts';

const output = process.argv[2];
if (!output) throw new Error('Supply a JSON output path');
const [x, y, z] = coasterWorld(WORKSHOP_INTAKE);
const batch = new CoasterBatch();
const names = addIntakeBench(batch);
const parts = batch.parts.map((geometry, index) => {
  const name = names[index];
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const color = geometry.getAttribute('color');
  const vertices = [], normals = [];
  for (let i = 0; i < position.count; i++) {
    vertices.push(position.getX(i) - x, z - position.getZ(i), position.getY(i) - y);
    normals.push(normal.getX(i), -normal.getZ(i), normal.getY(i));
  }
  const steel = index < 5;
  const material = steel ? 'Folded steel' : /cabinet|panel/.test(name) ? 'Blue-gray cabinet coat' : 'Dark support coat';
  const tint = steel ? [.92,.92,.92] : [.95,1.04,1.07];
  const rgb = [color.getX(0),color.getY(0),color.getZ(0)].map((v,i)=>v*tint[i]);
  const finish = [rgb, steel ? .46 : .76, steel ? .37 : .02];
  geometry.dispose();
  return {name,material,finish,vertices,normals};
});
writeFileSync(output, JSON.stringify({units:'m',worldOrigin:[x,y,z],parts}));
