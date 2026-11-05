import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BoxGeometry, Mesh } from 'three';
import { createCoasterStructure } from './coaster-geometry.ts';
import { packCoasterStructure } from './coaster-structure-transfer.ts';
import { CoasterStructureCache } from './coaster-structure-cache.ts';
import { buildCoasterInWorker, coasterStructureJobs } from './coaster-structure-job.ts';
import { coasterFrame, coasterSupports } from './coaster-track.ts';
import { shadowOnlyRange } from './coaster-shadow-range.ts';
import { shadowChunkSourceKey } from '../shadow-chunk-builder.ts';

const baseline = JSON.parse(readFileSync(new URL('../../../../docs/world/phase-2-playground/coaster-rail-craft-20261105/production-baseline.json', import.meta.url), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const bytes = array => hash(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
const json = value => hash(JSON.stringify(value));
const geometryShape = g => ({
  attributes: Object.fromEntries(Object.entries(g.attributes).map(([name, a]) => [name,
    { count: a.count, itemSize: a.itemSize, normalized: a.normalized, hash: bytes(a.array) }])),
  index: g.index ? bytes(g.index.array) : null,
  sphere: g.boundingSphere && { center: g.boundingSphere.center.toArray(), radius: g.boundingSphere.radius },
});
const resources = value => [value.steel, value.glow, ...Object.values(value.railCraft), value.railShadow].filter(Boolean);
const transferShape = g => ({ ...geometryShape(g), box: g.boundingBox && { min: g.boundingBox.min.toArray(), max: g.boundingBox.max.toArray() } });
const contactShape = d => ({
  track: { vertices: bytes(d.track.vertices), indices: bytes(d.track.indices), vertexBytes: d.track.vertices.byteLength, indexBytes: d.track.indices.byteLength },
  colliders: { count: d.colliders.length, hash: json(d.colliders.map(c => ({ ...c, ...(c.hull ? { hull: bytes(c.hull) } : {}) }))) },
  relief: { vertices: bytes(d.relief.vertices), indices: bytes(d.relief.indices) },
  glow: geometryShape(d.glow), art: json(d.art),
});
const port = () => ({ onmessage: null, onerror: null, onmessageerror: null, sent: [], terminated: 0,
  postMessage(value) { this.sent.push(value); }, terminate() { this.terminated++; } });
const closestVertex = (g, point) => {
  const p = g.getAttribute('position'); let closest = Infinity;
  for (let i = 0; i < p.count; i++) closest = Math.min(closest,
    Math.hypot(p.getX(i) - point.x, p.getY(i) - point.y, p.getZ(i) - point.z));
  return closest;
};

test('production near/far preserve baseline contacts, old projection and worker transfer ownership', async t => {
  for (const near of [false, true]) {
    const label = near ? 'near' : 'far', original = createCoasterStructure(near), expected = baseline.variants[label];
    const { steel: oldSteel, ...expectedContacts } = expected;
    assert.deepEqual(contactShape(original), expectedContacts, `${label}: physical/glow/art bytes changed`);
    assert.ok(original.railShadow?.attributes.position.count > 0, `${label}: old projection carrier missing`);
    assert.deepEqual(Object.keys(original.railCraft).sort(), ['coatedSteel', 'concrete', 'jointSteel', 'runningSteel']);
    for (const [role, g] of Object.entries(original.railCraft)) {
      assert.ok(g.getAttribute('position').count > 0, `${label}: ${role} empty`);
      assert.ok(g.getAttribute('position').array.every(Number.isFinite), `${label}: ${role} has invalid coordinates`);
      assert.ok(g.getAttribute('normal') && g.getAttribute('uv'), `${label}: ${role} lacks PBR surface attributes`);
    }
    // Probe the unchanged production route well outside the former short craft bay.
    // Far rings may be up to four metres apart, so this is a coverage gate only.
    for (const u of [0, .05, .15, .35, .5, .65, .85, .95]) {
      const frame = coasterFrame(u);
      for (const side of [-.78, .78]) {
        const point = frame.point.clone().addScaledVector(frame.side, side);
        assert.ok(closestVertex(original.railCraft.runningSteel, point) < 2.5, `${label}: running rail missing near ${u}/${side}`);
      }
    }
    for (const support of coasterSupports(near)) for (const foot of support.beams.slice(0, 2).map(beam => beam.a))
      assert.ok(closestVertex(original.railCraft.concrete, foot) < 2, `${label}: support foundation missing near ${support.u}`);
    // Production originally places all three families before architecture. Restoring
    // that ordered prefix must exactly reproduce every old steel vertex attribute.
    for (const [name, expectedAttribute] of Object.entries(oldSteel.attributes)) {
      const shadow = original.railShadow.getAttribute(name), remaining = original.steel.getAttribute(name);
      assert.ok(shadow && remaining, `${label}: old ${name} projection attribute lost`);
      assert.equal(shadow.itemSize, expectedAttribute.itemSize);
      assert.equal(remaining.itemSize, expectedAttribute.itemSize);
      const ordered = createHash('sha256');
      for (const a of [shadow, remaining]) ordered.update(new Uint8Array(a.array.buffer, a.array.byteOffset, a.array.byteLength));
      assert.equal(ordered.digest('hex'), expectedAttribute.hash, `${label}: ${name} old geometry was changed, lost or duplicated`);
      assert.equal(shadow.count + remaining.count, expectedAttribute.count);
    }
    resources(original).forEach(g => g.computeBoundingBox());
    const before = resources(original).map(transferShape);
    const { packet, transfer } = packCoasterStructure(original);
    assert.equal(transfer.length, new Set(transfer).size);
    const received = structuredClone(packet, { transfer });
    assert.ok(transfer.every(buffer => buffer.byteLength === 0), 'sender retains geometry ownership');
    const worker = port(), controller = new AbortController(), active = coasterStructureJobs.active;
    const pending = buildCoasterInWorker(near, controller.signal, () => worker);
    assert.deepEqual(worker.sent, [near]);
    worker.onmessage({ data: { packet: received, workerMs: 1 } });
    const restored = await pending;
    try {
      assert.equal(worker.terminated, 1); assert.equal(coasterStructureJobs.active, active);
      assert.deepEqual(resources(restored).map(transferShape), before);
      assert.deepEqual(contactShape(restored), expectedContacts);
      for (const [role, g] of Object.entries(restored.railCraft)) for (const [name, a] of Object.entries(g.attributes))
        assert.equal(a.array, received.railCraft[role].attributes[name].array, `${role}/${name} hydration copied arrays`);
      assert.equal(restored.railShadow.attributes.position.array, received.railShadow.attributes.position.array);
      assert.equal(restored.track.vertices, received.track.vertices);
      t.diagnostic(JSON.stringify({ lod: label, craftRoles: Object.keys(restored.railCraft),
        oldProjectionVertices: restored.railShadow.attributes.position.count, retainedSteelVertices: restored.steel.attributes.position.count }));
    } finally { resources(restored).forEach(g => g.dispose()); }
  }
});

test('cache counts and releases crafted and old projection resources on switch and late worker replies', async () => {
  const make = () => ({ steel: new BoxGeometry(), glow: new BoxGeometry(),
    railCraft: { runningSteel: new BoxGeometry(), tieCoat: new BoxGeometry(), supportCoat: new BoxGeometry() }, railShadow: new BoxGeometry() });
  const value = make(), counts = resources(value).map(() => 0);
  resources(value).forEach((g, i) => g.addEventListener('dispose', () => counts[i]++));
  const cache = new CoasterStructureCache(() => value);
  cache.get(false);
  const expectedBytes = resources(value).reduce((sum, g) => sum + Object.values(g.attributes).reduce((n, a) => n + a.array.byteLength, 0) + (g.index?.array.byteLength ?? 0), 0);
  assert.deepEqual(cache.snapshot(), { variants: 1, attributeBytes: expectedBytes });
  cache.releaseGpu(false); assert.ok(counts.every(n => n === 1));
  cache.dispose(); assert.ok(counts.every(n => n === 2));
  assert.deepEqual(cache.snapshot(), { variants: 0, attributeBytes: 0 });
  let complete, signal;
  const pendingCache = new CoasterStructureCache(() => make(), (_, s) => { signal = s; return new Promise(resolve => { complete = resolve; }); });
  const pending = pendingCache.load(true); pendingCache.dispose(); assert.equal(signal.aborted, true);
  const late = make(), lateCounts = resources(late).map(() => 0);
  resources(late).forEach((g, i) => g.addEventListener('dispose', () => lateCounts[i]++));
  complete(late); await assert.rejects(pending, /disposed/);
  assert.ok(lateCounts.every(n => n === 1));
  assert.deepEqual(pendingCache.snapshot(), { variants: 0, attributeBytes: 0 });
});

test('shadow carrier suppresses only colour range and restores shadow/cleanup range without changing caster inputs', () => {
  for (const indexed of [true, false]) for (const range of [{ start: 0, count: Infinity }, { start: 3, count: 12 }]) {
    const source = new BoxGeometry(), geometry = indexed ? source : source.toNonIndexed();
    if (!indexed) source.dispose();
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometry.setDrawRange(range.start, range.count);
    const mesh = new Mesh(geometry); mesh.castShadow = true;
    const gate = shadowOnlyRange(geometry);
    // Mirror the consumer's public Mesh callback bindings, with Three's colour
    // callbacks distinct from its raw-shadow callback.
    mesh.onBeforeRender = gate.beforeColour;
    mesh.onAfterRender = gate.restore;
    mesh.onBeforeShadow = gate.restore;
    const shape = transferShape(geometry), index = geometry.index, box = geometry.boundingBox, sphere = geometry.boundingSphere;
    const attributes = { ...geometry.attributes }, key = shadowChunkSourceKey(mesh, 0);
    const assertCasterInputs = () => {
      assert.deepEqual(transferShape(geometry), shape, 'suppression changed geometry bytes or bounds');
      assert.equal(geometry.index, index); assert.equal(geometry.boundingBox, box); assert.equal(geometry.boundingSphere, sphere);
      for (const [name, attribute] of Object.entries(attributes)) assert.equal(geometry.getAttribute(name), attribute);
      assert.equal(shadowChunkSourceKey(mesh, 0), key, 'suppression invalidated the published shadow source');
      assert.equal(mesh.castShadow, true); assert.equal(mesh.visible, true); assert.equal(mesh.material.visible, true);
    };
    try {
      gate.restore(); assert.deepEqual(geometry.drawRange, range, 'idle restore changed the original range');
      mesh.onBeforeRender();
      assert.deepEqual(geometry.drawRange, { start: 0, count: 0 }); assertCasterInputs();
      mesh.onAfterRender(); assert.deepEqual(geometry.drawRange, range, 'normal colour completion did not restore');

      mesh.onBeforeRender(); mesh.onBeforeRender();
      assert.deepEqual(geometry.drawRange, { start: 0, count: 0 }); assertCasterInputs();
      mesh.onBeforeShadow();
      assert.deepEqual(geometry.drawRange, range, 'repeated beforeColour lost the original shadow range');
      mesh.onBeforeShadow(); assert.deepEqual(geometry.drawRange, range, 'defensive shadow restore is not idempotent');

      // An interrupted colour pass may never call onAfterRender. Cleanup uses
      // the same restore callback and must repair the cached geometry anyway.
      mesh.onBeforeRender(); gate.restore();
      assert.deepEqual(geometry.drawRange, range, 'cleanup left the cached carrier suppressed');
      const nextRange = { start: 6, count: 9 };
      geometry.setDrawRange(nextRange.start, nextRange.count);
      mesh.onBeforeRender(); mesh.onAfterRender();
      assert.deepEqual(geometry.drawRange, nextRange, 'later colour pass restored a stale range');
      assertCasterInputs();
    } finally { gate.restore(); geometry.dispose(); mesh.material.dispose(); }
  }
});
