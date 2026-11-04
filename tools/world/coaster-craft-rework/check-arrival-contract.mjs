import { createHash } from 'node:crypto';
import { createCoasterStructure, createCoasterCar } from '../../../src/components/world/attractions/coaster-geometry.ts';
import { createWorkshopGeometry } from '../../../src/components/world/attractions/intent-workshop-geometry.ts';
import { COASTER_CAR_PANELS, COASTER_GATE_LEAVES } from '../../../src/components/world/attractions/coaster-access.ts';
import { COASTER_BOARDING } from '../../../src/components/world/attractions/coaster-transition.ts';
const hash = a => createHash('sha256').update(ArrayBuffer.isView(a)
  ? Buffer.from(a.buffer,a.byteOffset,a.byteLength) : JSON.stringify(a)).digest('hex');
const typed = g => Object.fromEntries(Object.entries(g).map(([name, value]) => [name, hash(value)]));
const cost = g => ({ triangles:g.getAttribute('position').count/3,
  bytes:Object.values(g.attributes).reduce((sum,a)=>sum+a.array.byteLength,0) });
const contract = {access: hash([COASTER_CAR_PANELS, COASTER_GATE_LEAVES, COASTER_BOARDING])}, size = {};
for(const detailed of [false,true]) {
  const lod=detailed?'near':'far', s=createCoasterStructure(detailed);
  contract[lod] = {track:typed(s.track), relief:typed(s.relief), colliders:hash(s.colliders),
    glow:typed(Object.fromEntries(Object.entries(s.glow.attributes).map(([key,a])=>[key,a.array])))};
  size[lod] = cost(s.steel);
  s.steel.dispose();s.glow.dispose();
}
const w=createWorkshopGeometry(), train=createCoasterCar();
contract.workshop=typed(w.contactSurface);
size.workshop=cost(w.body);
size.train=cost(train);
console.log(JSON.stringify({contract,size}));
