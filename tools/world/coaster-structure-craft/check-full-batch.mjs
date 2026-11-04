import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createCoasterStructure as baseline } from '../../../src/components/world/attractions/coaster-geometry.ts';

// CPU integration fixture. The scene author owns these four total-assembly lines.
const original = new URL('../../../src/components/world/attractions/coaster-geometry.ts', import.meta.url);
const temporary = new URL(`./.coaster-craft-check-${randomUUID()}.ts`, original);
let source = readFileSync(original, 'utf8');
for (const [before, after] of [
  ['const craft = craftSample ? COASTER_TRACK_CRAFT : undefined;',
    "const craft = craftSample ? { ...COASTER_TRACK_CRAFT, scope:'full' as const, detailed } : undefined;"],
  ['if (!inCoasterStructureSample(i / steps) && i % 3 === 0)', 'if (!craft && !inCoasterStructureSample(i / steps) && i % 3 === 0)'],
  ['if(detailed&&radius>=.3)steel.parts.push(createSupportMemberDetail(segment));',
    'if(craft)steel.parts.push(createSupportMemberDetail(segment,craft)); else if(detailed&&radius>=.3)steel.parts.push(createSupportMemberDetail(segment));'],
  ['if (!inCoasterStructureSample(u)) steel.box([p.x,base+1.05,p.z],[1,.15,1],P.dark);',
    "if (craft) craft.mark(steel.parts[steel.parts.length - 1], 'grout'); else if (!inCoasterStructureSample(u)) steel.box([p.x,base+1.05,p.z],[1,.15,1],P.dark);"],
]) {
  assert(source.includes(before), before);
  source = source.replace(before, after);
}
writeFileSync(temporary,source,{flag:'wx'});
function metrics(structure) {
  const {steel,glow}=structure;
  const triangles = g=>(g.index?.count ?? g.attributes.position.count)/3;
  const bytes = g=>Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,g.index?.array.byteLength??0);
  const roles = {};
  for (const role of steel.getAttribute('intentCraftSurface').array) roles[role]=(roles[role]??0)+1;
  return { steelTriangles:triangles(steel), glowTriangles:triangles(glow), triangles:triangles(steel)+triangles(glow),
    steelBytes:bytes(steel), glowBytes:bytes(glow), roleBytes:steel.getAttribute('intentCraftSurface').array.byteLength, roles };
}
try {
  const { createCoasterStructure: candidate } = await import(temporary.href);
  for (const detailed of [true,false]) {
    const previous = baseline(detailed), sample = baseline(detailed,true), next = candidate(detailed,true);
    try {
      assert.deepEqual(next.track,previous.track);
      assert.deepEqual(next.colliders,previous.colliders);
      assert.deepEqual(next.relief,previous.relief);
      assert.deepEqual(next.glow.attributes.position.array,previous.glow.attributes.position.array);
      const full=metrics(next);
      const delta=prior=>Object.fromEntries(['triangles','steelBytes','roleBytes'].map(key=>[key,full[key]-prior[key]]));
      const base=metrics(previous), shortBay=metrics(sample);
      console.log(JSON.stringify({lod:detailed?'near':'far', base, shortBay, full,
        deltaFromBaseline:delta(base), deltaFromShortBay:delta(shortBay), colliderCount:next.colliders.length}));
    } finally {
      for (const s of [previous,sample,next]) { s.steel.dispose(); s.glow.dispose(); }
    }
  }
} finally { unlinkSync(temporary); }
