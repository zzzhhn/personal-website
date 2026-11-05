import { registerHooks } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Euler, Quaternion } from 'three';
registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context); }
  catch (error) { if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return next(specifier + '.ts', context); throw error; }
} });
const { COASTER_BOARDING } = await import('../../../src/components/world/attractions/coaster-transition.ts');
const { INTENT_COASTER } = await import('../../../src/components/world/attractions/attraction-layout.ts');
const { stationStructureMembers } = await import('../../../src/components/world/attractions/coaster-detailing.ts');
const local = point => point.map((v, i) => v - INTENT_COASTER.center[i]);
const out = new URL('../../../docs/world/phase-2-playground/coaster-station-craft-20261105/', import.meta.url);
await mkdir(out, { recursive: true });
const files = ['coaster-geometry.ts', 'coaster-detailing.ts', 'coaster-transition.ts', 'intent-sign-layout.ts'];
const sourceHashes = {};
for (const path of files) sourceHashes[path] = createHash('sha256').update(
  await readFile(new URL('../../../src/components/world/attractions/' + path, import.meta.url))
).digest('hex');
const contract = {
  baseline: 'b75c474f73ffa186e7bbc5522e4656dcbbedf9c3', sourceHashes,
  units: 'meters; runtime X across, Y up, Z to entrance',
  worldRoot: INTENT_COASTER.center,
  roof: { profile: [[-11, 6.2], [7, 6.2], [7, 6.55], [4.7, 7.4], [-8.7, 7.4], [-11, 6.55]], z: [30, 53] },
  columns: [-10, 6].flatMap(x => [31, x < 0 ? 43 : 51].map(z => ({ at: [x, 3.1, z], size: [1.1, 6.2, 1.1] }))),
  members: stationStructureMembers().map(m => ({ ...m, position: local(m.position),
    quaternion: new Quaternion().setFromEuler(new Euler(...(m.rotation || [0, 0, 0]))).toArray() })),
  buildings: [{ name: 'EastAnnex', at: [10, 3.1, 43], size: [5.5, 6.2, 14], inset: .06 },
    { name: 'WestService', at: [-14.5, 2.7, 35], size: [5, 5.4, 8], inset: .06 }],
  eastRoofVents: Array.from({ length: 6 }, (_, i) => ({ at: [8.5+i*.6,6.9,43], size: [.25,.35,5.5] })),
  steps: [...COASTER_BOARDING.stairs, COASTER_BOARDING.threshold].map((s, i) =>
    ({ name: i < 6 ? 'Step' + (i + 1) : 'Threshold', at: local(s.position), size: s.size, yaw: s.yaw })),
  boarding: { approach: local(COASTER_BOARDING.approach), inside: local(COASTER_BOARDING.inside),
    exit: local(COASTER_BOARDING.exit), floorY: COASTER_BOARDING.floorY - INTENT_COASTER.center[1] },
  stationSign: { at: [-2, 6.7, 53.1], size: [8.5, .95], keepDynamicPlane: true },
};
await writeFile(new URL('contract.json', out), JSON.stringify(contract, null, 2) + '\n');
console.log(JSON.stringify({ worldRoot: contract.worldRoot, steps: contract.steps, members: contract.members.length }));
