import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCoasterStructure } from '../../../src/components/world/attractions/coaster-geometry.ts';
import { unpackCoasterStructure } from '../../../src/components/world/attractions/coaster-structure-transfer.ts';

// Invoke the production message handler and exercise transferable ownership.
// This checks the default in the actual Worker module, without timing a browser.
let reply;
globalThis.self = {
  postMessage(message, options) { reply = structuredClone(message, options); },
};
await import('../../../src/components/world/attractions/coaster-structure.worker.ts');
const bytes = array => Buffer.from(array.buffer,array.byteOffset,array.byteLength);
const summary = geometry => Object.fromEntries(Object.entries(geometry.attributes).map(([name,attribute]) => [
  name, {count:attribute.count,itemSize:attribute.itemSize,normalized:attribute.normalized,
    sha256:createHash('sha256').update(bytes(attribute.array)).digest('hex')},
]));
for (const detailed of [false,true]) {
  const sync = createCoasterStructure(detailed);
  self.onmessage({data:detailed});
  assert.ok(reply?.packet, reply?.error ?? 'Worker sent no packet');
  const cold = unpackCoasterStructure(reply.packet);
  const steel = summary(cold.steel), glow = summary(cold.glow);
  assert.deepEqual(steel, summary(sync.steel));
  assert.deepEqual(glow, summary(sync.glow));
  for (const key of ['track','colliders','relief','art']) assert.deepEqual(cold[key],sync[key]);
  const counts = {};
  for (const role of cold.steel.getAttribute('intentCraftSurface').array) counts[role] = (counts[role] ?? 0) + 1;
  for (const role of [12,13,14,15]) assert.ok(counts[role] > 1000);
  console.log(JSON.stringify({lod:detailed?'near':'far',steel,glow,roleCounts:counts,colliders:cold.colliders.length}));
  for (const state of [cold,sync]) {state.steel.dispose();state.glow.dispose();}
}
