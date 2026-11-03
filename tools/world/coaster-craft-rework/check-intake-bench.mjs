import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { CoasterBatch } from '../../../src/components/world/attractions/coaster-geometry.ts';
import { INTENT_CRAFT, INTENT_CRAFT_ATTRIBUTE } from '../../../src/components/world/attractions/intent-craft-surface.ts';
import { addIntakeBench, createWorkshopGeometry } from '../../../src/components/world/attractions/intent-workshop-geometry.ts';
import { WORKSHOP_INTAKE } from '../../../src/components/world/attractions/intent-workshop-layout.ts';
import { coasterWorld } from '../../../src/components/world/attractions/coaster-track.ts';

const baseline = '8cba9bd';
const source = 'src/components/world/attractions/intent-workshop-geometry.ts';
const sourceUrl = new URL('../../../' + source, import.meta.url);
const old = execFileSync('git', ['show', `${baseline}:${source}`], { encoding: 'utf8' });
const candidate = readFileSync(sourceUrl, 'utf8');
const fixtures = [];
function replace(text, marker, replacement) {
  assert.equal(text.split(marker).length, 2, 'Expected exactly one fixture marker');
  return text.replace(marker, replacement);
}
async function generate(text) {
  const url = new URL(`.intake-bench-${randomUUID()}.ts`, sourceUrl);
  writeFileSync(url, text, { flag: 'wx' });
  fixtures.push(url);
  return (await import(url.href)).createWorkshopGeometry();
}
const digest = array => createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
const attrDigests = mesh => Object.fromEntries(Object.entries(mesh.attributes).map(([key, attr]) => [key, digest(attr.array)]));
const cost = mesh => ({
  triangles: mesh.getAttribute('position').count / 3,
  bytes: Object.values(mesh.attributes).reduce((sum, attr) => sum + attr.array.byteLength, 0),
  groups: mesh.groups.length,
});

try {
  const frozen = await generate(old);
  const current = createWorkshopGeometry();
  assert.deepEqual(current.contactSurface, frozen.contactSurface);
  assert.deepEqual(attrDigests(current.glow), attrDigests(frozen.glow));
  for (const g of [frozen.body, current.body]) g.computeBoundingBox();
  assert.deepEqual(current.body.boundingBox, frozen.body.boundingBox);

  // Compare every existing merged channel after subtracting the specific worktop,
  // cabinets and redundant copper front plate from the frozen source.
  let oldRetained = replace(old,
    "    b.housing([x, y + 1.24, z], [2.8, .18, 2.3], P.rail);\n    if (id === 'intake') markIntentCraft(b.parts[b.parts.length - 1], INTENT_CRAFT.worktop);",
    "    if (id !== 'intake') b.housing([x, y + 1.24, z], [2.8, .18, 2.3], P.rail);");
  oldRetained = replace(oldRetained,
    "    shell([-.9, .7, 0], [.65, 1.1, 1.9], P.steel);\n    shell([.85, .7, 0], [.75, 1.1, 1.9], kind === 'debug' ? P.copper : P.steel);",
    "    if (kind !== 'intake') {\n      shell([-.9, .7, 0], [.65, 1.1, 1.9], P.steel);\n      shell([.85, .7, 0], [.75, 1.1, 1.9], kind === 'debug' ? P.copper : P.steel);\n    }");
  oldRetained = replace(oldRetained, '  box([0, 1.24, 1.13], [1.65, .09, .035], P.copper);',
    "  if (kind !== 'intake') box([0, 1.24, 1.13], [1.65, .09, .035], P.copper);");
  const currentRetained = replace(candidate, "    if (id === 'intake') addIntakeBench(b);\n    else b.housing",
    "    if (id !== 'intake') b.housing");
  const retainedBefore = await generate(oldRetained);
  const retainedAfter = await generate(currentRetained);
  assert.deepEqual(attrDigests(retainedAfter.body), attrDigests(retainedBefore.body));
  assert.deepEqual(retainedAfter.contactSurface, frozen.contactSurface);

  const batch = new CoasterBatch();
  const names = addIntakeBench(batch);
  const assembly = batch.finish();
  assembly.computeBoundingBox();
  const [x, y, z] = coasterWorld(WORKSHOP_INTAKE);
  const { min, max } = assembly.boundingBox;
  const near = (a, b) => Math.abs(a - b) < .00001;
  assert.ok(near(min.x, x - 1.4) && near(max.x, x + 1.4));
  assert.ok(near(min.y, y + .3) && near(max.y, y + 1.33));
  assert.ok(near(min.z, z - 1.15) && near(max.z, z + 1.15));
  assert.equal(names.length, 14);
  assert.equal(new Set(names).size, names.length);
  const roles = {};
  for (const role of assembly.getAttribute(INTENT_CRAFT_ATTRIBUTE).array) roles[role] = (roles[role] ?? 0) + 1;
  assert.deepEqual(Object.keys(roles).map(Number).sort(), [INTENT_CRAFT.powderCoat, INTENT_CRAFT.worktop]);
  assert.equal(cost(current.body).triangles - cost(retainedAfter.body).triangles, cost(assembly).triangles);

  console.log(JSON.stringify({ baseline, contacts: {
    vertices: digest(current.contactSurface.vertices), indices: digest(current.contactSurface.indices),
  }, retainedBody: attrDigests(retainedAfter.body), before: cost(frozen.body), after: cost(current.body), assembly: { ...cost(assembly), roles } }));
  for (const g of [frozen, current, retainedBefore, retainedAfter]) { g.body.dispose(); g.glow.dispose(); }
  assembly.dispose();
} finally {
  fixtures.forEach(url => unlinkSync(url));
}
