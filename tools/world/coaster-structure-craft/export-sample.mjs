import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CoasterBatch, COASTER_PALETTE } from '../../../src/components/world/attractions/coaster-geometry.ts';
import { addCoasterRailSections, addCoasterSampleNodes } from '../../../src/components/world/attractions/coaster-rail-section.ts';
import { createSupportMemberDetail } from '../../../src/components/world/attractions/coaster-detailing.ts';
import { coasterSupportBase } from '../../../src/components/world/attractions/coaster-thrill-supports.ts';
import { coasterSupports } from '../../../src/components/world/attractions/coaster-track.ts';
import { attachIntentCraftBatch, markIntentCraft, INTENT_CRAFT_ATTRIBUTE } from '../../../src/components/world/attractions/intent-craft-surface.ts';

// Archive PBR approximations. Runtime role values are injected by the scene author.
const surfaces = {
  runningSteel: [.32,.65], spineCoat: [.55,.20], tieCoat: [.56,.16],
  railSeat: [.42,.52], supportCoat: [.57,.17], connectionSteel: [.43,.47], grout: [.87,0],
};
const ids = Object.fromEntries(Object.keys(surfaces).map((name,i)=>[name,i+1]));
const full = process.argv.includes('--full'), detailed = !process.argv.includes('--far');
const batch = new CoasterBatch();
const craft = { ...(full ? { scope:'full', detailed } : {}),
  mark(geometry, surface) { markIntentCraft(geometry, ids[surface]); } };
const contact = addCoasterRailSections(batch,detailed,undefined,craft);
const supports = coasterSupports(detailed);
addCoasterSampleNodes(batch,supports,contact,craft);
if (full) for (const support of supports) {
  for (const beam of support.beams) batch.parts.push(createSupportMemberDetail(beam,craft));
  for (const p of [support.a,support.b]) {
    batch.housing([p.x,coasterSupportBase(p.x,p.z)+.5,p.z],[2.5,1,2.5],COASTER_PALETTE.concrete);
    const foundation=batch.parts.at(-1);
    foundation.userData.intentStructureRole='grout';
    craft.mark(foundation,'grout');
  }
}
attachIntentCraftBatch(batch.parts);

const groups = new Map();
for (const g of batch.parts) {
  const name = g.userData.intentStructureRole;
  const marks = g.getAttribute(INTENT_CRAFT_ATTRIBUTE);
  if (!name) {
    assert(marks.array.every(role=>role===0));
    continue;
  }
  assert(marks.array.every(role=>role===ids[name]));
  if (!groups.has(name)) groups.set(name,{part:name,role:ids[name],roughness:surfaces[name][0],metalness:surfaces[name][1],
    position:[],normal:[],color:[],index:[]});
  const part=groups.get(name), offset=part.position.length/3;
  for (const key of ['position','normal','color']) for (const value of g.getAttribute(key).array) part[key].push(value);
  for(let i=0;i<g.attributes.position.count;i++)part.index.push(offset+i);
}
assert.equal(groups.size,Object.keys(surfaces).length-(full&&!detailed?1:0));
const out=resolve(process.argv[2]);
mkdirSync(out,{recursive:true});
const stem=full?`coaster-full-structure-${detailed?'near':'far'}`:'coaster-short-bay';
writeFileSync(resolve(out,`${stem}.source.json`),JSON.stringify({units:'metres',up:'Y',parts:[...groups.values()]})+'\n');
console.log(JSON.stringify({groups:groups.size,triangles:[...groups.values()].reduce((n,p)=>n+p.index.length/3,0)}));
for (const g of batch.parts) g.dispose();
