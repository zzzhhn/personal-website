import { writeFileSync } from 'node:fs';
import { CoasterBatch } from '../../../src/components/world/attractions/coaster-geometry.ts';
import { addIntakeRollerSupports, createWorkshopGeometry } from '../../../src/components/world/attractions/intent-workshop-geometry.ts';
import { INTENT_CRAFT, INTENT_CRAFT_ATTRIBUTE } from '../../../src/components/world/attractions/intent-craft-surface.ts';
import { coasterWorld } from '../../../src/components/world/attractions/coaster-track.ts';
import { WORKSHOP_INTAKE } from '../../../src/components/world/attractions/intent-workshop-layout.ts';

const output = process.argv[2];
if (!output) throw new Error('Supply a JSON output path');
const origin = coasterWorld(WORKSHOP_INTAKE);
const { body, glow } = createWorkshopGeometry();
const supports = new CoasterBatch();
addIntakeRollerSupports(supports);
const parts = [];
function addPart(name, material, geometry, indices) {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const vertices = [], normals = [];
  for (const index of indices) {
    vertices.push(position.getX(index) - origin[0], origin[2] - position.getZ(index), position.getY(index) - origin[1]);
    normals.push(normal.getX(index), -normal.getZ(index), normal.getY(index));
  }
  parts.push({ name, material, vertices, normals });
}
const position = body.getAttribute('position');
const role = body.getAttribute(INTENT_CRAFT_ATTRIBUTE);
const rollers = Array.from({ length: 9 }, () => []);
for (let i = 0; i < position.count; i++) {
  if (role.getX(i) === INTENT_CRAFT.roller) {
    rollers[Math.round((position.getZ(i) - origin[2] + .6) / .15)].push(i);
  }
}
rollers.forEach((indices, i) => addPart(`Roller ${i + 1}`, 'Steel', body, indices));
supports.parts.forEach((part, i) => {
  const side = i < 19 ? 'Left' : 'Right';
  const slot = i % 19;
  const index = Math.ceil(slot / 2);
  const kind = slot === 0 ? 'Folded channel' : slot % 2 ? 'Shaft' : 'Bearing seat';
  const material = slot === 0 ? 'Copper coat' : slot % 2 ? 'Shaft steel' : 'Bearing steel';
  addPart(`${side} ${kind}${slot ? ` ${index}` : ''}`, material, part,
    Array.from({ length: part.getAttribute('position').count }, (_, index) => index));
});
writeFileSync(output, JSON.stringify({ units: 'm', worldOrigin: origin, parts }));
for (const part of [body, glow, ...supports.parts]) part.dispose();
