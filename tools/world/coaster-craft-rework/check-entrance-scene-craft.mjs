import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { unlinkSync, writeFileSync } from 'node:fs';
import { packCoasterStructure, unpackCoasterStructure } from '../../../src/components/world/attractions/coaster-structure-transfer.ts';
import { createCoasterStructure } from '../../../src/components/world/attractions/coaster-geometry.ts';
import { createWorkshopGeometry } from '../../../src/components/world/attractions/intent-workshop-geometry.ts';

const baseline = 'ef731cb';
const sourceDir = 'src/components/world/attractions/';
const temporary = [];
async function frozen(file) {
  const url = new URL(`../../../${sourceDir}.entrance-freeze-${randomUUID()}.ts`, import.meta.url);
  writeFileSync(url, execFileSync('git', ['show', `${baseline}:${sourceDir}${file}`]), { flag: 'wx' });
  temporary.push(url);
  return import(url.href);
}
const stats = mesh => {
  const roles = {};
  for (const role of mesh.getAttribute('intentCraftSurface').array) roles[role] = (roles[role] ?? 0) + 1;
  return {
    triangles: mesh.getAttribute('position').count / 3,
    bytes: Object.values(mesh.attributes).reduce((total, attr) => total + attr.array.byteLength, 0),
    groups: mesh.groups.length,
    roles,
  };
};
const sameGeometry = (before, after) => {
  assert.deepEqual(Object.keys(before.attributes), Object.keys(after.attributes));
  for (const [key, attr] of Object.entries(before.attributes)) assert.deepEqual(attr.array, after.getAttribute(key).array);
  assert.deepEqual(before.index?.array, after.index?.array);
};
try {
  const oldCoaster = await frozen('coaster-geometry.ts');
  const oldWorkshop = await frozen('intent-workshop-geometry.ts');
  const receipt = { baseline, trackAndContactsExact: true };
  for (const detailed of [false, true]) {
    const before = oldCoaster.createCoasterStructure(detailed);
    const after = createCoasterStructure(detailed);
    for (const key of ['track', 'colliders', 'relief']) assert.deepEqual(after[key], before[key]);
    sameGeometry(before.glow, after.glow);
    receipt[detailed ? 'near' : 'far'] = { before: stats(before.steel), after: stats(after.steel) };
    assert.ok(receipt[detailed ? 'near' : 'far'].after.roles[17] > 0);
    const roleBytes = after.steel.getAttribute('intentCraftSurface').array.slice();
    const { packet, transfer } = packCoasterStructure(after);
    const received = unpackCoasterStructure(structuredClone(packet, { transfer }));
    const roles = received.steel.getAttribute('intentCraftSurface');
    assert.ok(roles.array instanceof Uint8Array);
    assert.equal(roles.normalized, false);
    assert.deepEqual(roles.array, roleBytes);
    for (const result of [before, after, received]) { result.steel.dispose(); result.glow.dispose(); }
  }
  const before = oldWorkshop.createWorkshopGeometry();
  const after = createWorkshopGeometry();
  assert.deepEqual(before.contactSurface, after.contactSurface);
  sameGeometry(before.glow, after.glow);
  receipt.workshop = { before: stats(before.body), after: stats(after.body) };
  assert.equal(receipt.workshop.before.roles[3], receipt.workshop.after.roles[3]);
  for (const role of [12, 13, 16]) assert.ok(receipt.workshop.after.roles[role] > 0, `Missing workshop role ${role}`);
  for (const result of [before, after]) { result.body.dispose(); result.glow.dispose(); }
  console.log(JSON.stringify(receipt));
} finally {
  temporary.forEach(url => unlinkSync(url));
}
