import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { createCoasterRailVisualCraft } from '../../../src/components/world/attractions/coaster-rail-visual-craft.ts';
import { coasterRailSpans, coasterSpineProfile, sweepCoasterSection, COASTER_STRUCTURE_SAMPLE, inCoasterStructureSample } from '../../../src/components/world/attractions/coaster-rail-section.ts';
import { thrillFrame } from '../../../src/components/world/attractions/coaster-thrill-frame.ts';
import { THRILL_LENGTH } from '../../../src/components/world/attractions/coaster-thrill-layout.ts';
import { thrillSupports } from '../../../src/components/world/attractions/coaster-thrill-supports.ts';

const args = process.argv.slice(2), option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const sourcePath = option('--source'), centre = Number(option('--centre', '.265')), halfLength = Number(option('--half-length', '16'));
const sourceNear = option('--lod', 'near') !== 'far';
const save = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value)); };
const material = new MeshBasicMaterial({ side: DoubleSide });
const report = { generator: 'createCoasterRailVisualCraft', units: 'metres', textureTileMetres: 1, lods: [] };
const source = { units: 'metres', axes: 'Three +Y up, +X frame-forward', centre, halfLength, detailed: sourceNear, parts: [] };

function extracted(g, part, select = () => true) {
  const positions = [], normals = [], uv = [], indices = [], map = new Map();
  for (let i = part.indexStart; i < part.indexStart + part.indexCount; i += 3) {
    const tri = Array.from(g.index.array.slice(i, i + 3));
    if (!select(tri)) continue;
    for (const id of tri) {
      if (!map.has(id)) {
        map.set(id, positions.length / 3);
        positions.push(...g.attributes.position.array.slice(id * 3, id * 3 + 3));
        normals.push(...g.attributes.normal.array.slice(id * 3, id * 3 + 3));
        uv.push(...g.attributes.uv.array.slice(id * 2, id * 2 + 2));
      }
      indices.push(map.get(id));
    }
  }
  return { positions, normals, uv, indices };
}
function mesh(g, name) {
  const part = g.userData.parts.find(p => p.name === name), data = extracted(g, part), out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(new Float32Array(data.positions), 3)); out.setIndex(data.indices);
  return new Mesh(out, material);
}

for (const detailed of [false, true]) {
  const geometries = createCoasterRailVisualCraft(detailed), counts = {}, allParts = Object.values(geometries).flatMap(g => g.userData.parts);
  let minNormal = Infinity, maxNormal = 0, minimumArea = Infinity, badWinding = 0;
  for (const [key, g] of Object.entries(geometries)) {
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, a = new Vector3(), b = new Vector3(), c = new Vector3(), normal = new Vector3();
    assert(g.index && p.count === n.count && p.count === uv.count);
    for (const attribute of Object.values(g.attributes)) assert([...attribute.array].every(Number.isFinite));
    for (let i = 0; i < n.count; i++) {
      const length = normal.fromBufferAttribute(n, i).length(); minNormal = Math.min(minNormal, length); maxNormal = Math.max(maxNormal, length);
    }
    for (let i = 0; i < g.index.count; i += 3) {
      const ia = g.index.getX(i), ib = g.index.getX(i + 1), ic = g.index.getX(i + 2);
      a.fromBufferAttribute(p, ia); b.fromBufferAttribute(p, ib); c.fromBufferAttribute(p, ic);
      const cross = b.sub(a).cross(c.sub(a)), area = cross.length() / 2;
      minimumArea = Math.min(minimumArea, area);
      if (cross.dot(normal.fromBufferAttribute(n, ia)) < -1e-9) badWinding++;
    }
    counts[key] = { vertices: p.count, triangles: g.index.count / 3,
      bytes: Object.values(g.attributes).reduce((sum, a) => sum + a.array.byteLength, g.index.array.byteLength),
      groups: g.groups.length, parts: g.userData.parts.length, indexType: g.index.array.constructor.name };
    if (sourcePath && detailed === sourceNear) for (const part of g.userData.parts) {
      if (part.u !== undefined && Math.abs(part.u - centre) * THRILL_LENGTH > halfLength) continue;
      const select = part.family === 'continuous-sweep'
        ? tri => Math.abs(tri.reduce((sum, id) => sum + uv.getX(id), 0) / 3 - centre * THRILL_LENGTH) <= halfLength : () => true;
      const data = extracted(g, part, select);
      if (data.indices.length) source.parts.push({ name: `${part.name}_${key}`, material: key, family: part.family, ...data });
    }
  }
  assert(minNormal > .99999 && maxNormal < 1.00001);
  assert(minimumArea > 1e-10 && badWinding === 0, `area ${minimumArea}; reversed triangles ${badWinding}`);
  const expectedTies = [];
  const count = Math.ceil((COASTER_STRUCTURE_SAMPLE.end - COASTER_STRUCTURE_SAMPLE.start) * THRILL_LENGTH / 2.1);
  for (let i = 1; i < count; i++) expectedTies.push(COASTER_STRUCTURE_SAMPLE.start + (COASTER_STRUCTURE_SAMPLE.end - COASTER_STRUCTURE_SAMPLE.start) * i / count);
  const steps = Math.ceil(THRILL_LENGTH / (detailed ? 1.05 : 3));
  for (let i = 0; i < steps; i += 3) if (!inCoasterStructureSample(i / steps)) expectedTies.push(i / steps);
  const ties = allParts.filter(p => p.name.endsWith('_ISection'));
  assert.deepEqual(ties.map(p => p.u), expectedTies);
  const expectedBeams = thrillSupports(detailed).reduce((sum, s) => sum + s.beams.length, 0);
  assert.equal(allParts.filter(p => p.family === 'support-member' && /_Member\d+$/.test(p.name)).length, expectedBeams);
  assert.equal(allParts.filter(p => p.name.includes('_FootingCap')).length, thrillSupports(detailed).length * 2);

  // Direct position/normal continuity at the actual three legacy span boundaries.
  const rail = geometries.runningSteel, positions = rail.attributes.position, normals = rail.attributes.normal;
  const ringCount = rail.userData.sweepRingCount;
  let closurePosition = 0, closureNormal = 0;
  const railStride = detailed ? 9 : 7;
  for (let j = 0; j < railStride; j++) {
    const a = j, b = a + (ringCount - 1) * railStride;
    closurePosition = Math.max(closurePosition, new Vector3().fromBufferAttribute(positions, a).distanceTo(new Vector3().fromBufferAttribute(positions, b)));
    closureNormal = Math.max(closureNormal, new Vector3().fromBufferAttribute(normals, a).distanceTo(new Vector3().fromBufferAttribute(normals, b)));
  }
  assert(closurePosition < 1e-6 && closureNormal < 1e-6);
  assert(rail.userData.sweepSimplification.maximumErrorMetres <= (detailed ? .005 : .015));
  assert(rail.userData.sweepSimplification.maximumChordMetres <= 4);
  let maximumSeatContactError = 0, maximumTieChordError = 0;
  for (const part of geometries.jointSteel.userData.parts.filter(p => /_(Left|Right)Seat$/.test(p.name))) {
    const f = thrillFrame(part.u), centre = new Vector3(), g = geometries.jointSteel;
    for (let i = part.vertexStart; i < part.vertexStart + part.vertexCount; i++) centre.add(new Vector3().fromBufferAttribute(g.attributes.position, i));
    centre.multiplyScalar(1 / part.vertexCount).addScaledVector(f.up, .0175);
    const railPart = rail.userData.parts.find(p => p.name === (part.name.endsWith('_LeftSeat') ? 'RunningRail_Left' : 'RunningRail_Right'));
    const start = railPart.vertexStart, uv = rail.attributes.uv;
    let low = 0, high = ringCount - 1;
    while (high - low > 1) { const mid = (low + high) >> 1; if (uv.getX(start + mid * railStride) / THRILL_LENGTH < part.u) low = mid; else high = mid; }
    const lower = detailed ? 6 : 4;
    const bottom = i => new Vector3().fromBufferAttribute(positions, start + i * railStride + lower)
      .add(new Vector3().fromBufferAttribute(positions, start + i * railStride + lower + 1)).multiplyScalar(.5);
    const ua = uv.getX(start + low * railStride), ub = uv.getX(start + high * railStride);
    const expected = bottom(low).lerp(bottom(high), (part.u * THRILL_LENGTH - ua) / (ub - ua));
    maximumSeatContactError = Math.max(maximumSeatContactError, centre.distanceTo(expected));
  }
  for (const part of geometries.coatedSteel.userData.parts.filter(p => p.name.endsWith('_ISection'))) {
    const f = thrillFrame(part.u), g = geometries.coatedSteel, chord = part.u >= .75 && part.u <= .81 ? .12 : .24;
    let low = Infinity, high = -Infinity;
    for (let i = part.vertexStart; i < part.vertexStart + part.vertexCount; i++) {
      const x = new Vector3().fromBufferAttribute(g.attributes.position, i).sub(f.point).dot(f.forward);
      low = Math.min(low, x); high = Math.max(high, x);
    }
    maximumTieChordError = Math.max(maximumTieChordError, Math.abs(high - low - chord));
  }
  assert(maximumSeatContactError < .0001 && maximumTieChordError < .0001);
  let pipeSideNormalSeam = 0, sleeveEnvelopeExcess = 0, spliceEnvelopeExcess = 0, spliceInnerOffset = 0;
  for (const g of Object.values(geometries)) for (const part of g.userData.parts) {
    if (/^Bent\d+_Member\d+$/.test(part.name)) {
      const sides = part.profileSides;
      for (let j = 0; j < sides; j++) for (const top of [0, 1]) {
        const a = part.vertexStart + j * 4 + 2 + top, b = part.vertexStart + ((j + 1) % sides) * 4 + top;
        pipeSideNormalSeam = Math.max(pipeSideNormalSeam, new Vector3().fromBufferAttribute(g.attributes.normal, a).distanceTo(new Vector3().fromBufferAttribute(g.attributes.normal, b)));
      }
    }
    const sleeve = /^Bent(\d+)_WeldSleeve(\d+)_\d+$/.exec(part.name);
    if (sleeve) {
      const beam = thrillSupports(detailed)[Number(sleeve[1])].beams[Number(sleeve[2])], axis = beam.b.clone().sub(beam.a).normalize(), length = beam.a.distanceTo(beam.b);
      for (let i = part.vertexStart; i < part.vertexStart + part.vertexCount; i++) {
        const p = new Vector3().fromBufferAttribute(g.attributes.position, i).sub(beam.a), along = p.dot(axis);
        sleeveEnvelopeExcess = Math.max(sleeveEnvelopeExcess, p.addScaledVector(axis, -along).length() - beam.radius, -along, along - length);
      }
    }
    if (part.name.startsWith('SpineSplice')) for (let i = part.vertexStart; i < part.vertexStart + part.vertexCount; i++) {
      const p = new Vector3().fromBufferAttribute(g.attributes.position, i);
      // Solve only this short named band, avoiding a global nearest-route ambiguity.
      let u = part.u ?? (g.attributes.uv.getX(i) / THRILL_LENGTH);
      for (let j = 0; j < 3; j++) { const f = thrillFrame(u); u += p.clone().sub(f.point).dot(f.forward) / THRILL_LENGTH; }
      const frame = thrillFrame(u), profile = coasterSpineProfile({ u, frame }), local = p.clone().sub(frame.point), side = Math.abs(local.dot(frame.side)), up = local.dot(frame.up);
      spliceEnvelopeExcess = Math.max(spliceEnvelopeExcess, side - profile[0][0], up - profile[0][1], profile[2][1] - up);
      spliceInnerOffset = Math.max(spliceInnerOffset, profile[0][0] - side);
    }
  }
  assert(pipeSideNormalSeam < 1e-6 && sleeveEnvelopeExcess < .0001 && spliceEnvelopeExcess < .0001);
  let columnHeadPlanesChecked = 0, suppressedSleeveCapTriangles = 0;
  for (const [supportIndex, support] of thrillSupports(detailed).entries()) for (const [j, top] of [support.a, support.b].entries()) {
    const names = [`Bent${supportIndex}_Member${j}`, `Bent${supportIndex}_HeadCollar${j}`, `Bent${supportIndex}_HeadShoulder${j}`];
    const candidates = Object.values(geometries).flatMap(g => g.userData.parts.filter(p => names.includes(p.name)).map(part => ({ g, part })));
    assert.equal(candidates.length, 3);
    const collar = candidates.find(x => x.part.name.includes('_HeadCollar')).part;
    for (const plane of [top.y, top.y - .16]) {
      let coplanarTriangles = 0;
      for (const { g, part } of candidates) for (let k = part.indexStart; k < part.indexStart + part.indexCount; k += 3) {
        const ids = [g.index.getX(k), g.index.getX(k + 1), g.index.getX(k + 2)];
        if (ids.every(id => Math.abs(g.attributes.position.getY(id) - plane) < .0001)) coplanarTriangles++;
      }
      // A single collar cap fills each plane. An inherited column top cap or
      // shoulder top cap would increase this count with overlapping triangles.
      assert.equal(coplanarTriangles, collar.profileSides - 2, `overlapping column-head cap at ${supportIndex}/${j}, y=${plane}`);
      columnHeadPlanesChecked++;
    }
  }
  for (const g of Object.values(geometries)) for (const part of g.userData.parts.filter(p => p.family === 'pipe-sleeve')) {
    assert.deepEqual(part.caps, [false, false]);
    assert.equal(part.indexCount, part.profileSides * 6, 'sleeve interior caps must not survive in the real index buffer');
    suppressedSleeveCapTriangles += (part.profileSides - 2) * 2;
  }

  // Compare the retained broad running and bottom spine planes to the exact old sweep.
  const spans = coasterRailSpans(detailed), oldSpine = new Mesh(sweepCoasterSection(spans[1], coasterSpineProfile), material);
  const newSpine = mesh(geometries.coatedSteel, 'Spine_FoldedBox'), oldRail = new Mesh(sweepCoasterSection(spans[1], () => Array.from({ length: 6 }, (_, j) => [-.78 + .11 * Math.cos(j * Math.PI / 3), .11 * Math.sin(j * Math.PI / 3)])), material);
  const newRail = mesh(geometries.runningSteel, 'RunningRail_Left');
  let spineError = 0, runningError = 0;
  for (let i = 1; i < 26; i++) {
    const u = COASTER_STRUCTURE_SAMPLE.start + (COASTER_STRUCTURE_SAMPLE.end - COASTER_STRUCTURE_SAMPLE.start) * (i + .33) / 27, f = thrillFrame(u);
    for (const [old, candidate, side, key] of [[oldSpine, newSpine, 0, 'spine'], [oldRail, newRail, -.78, 'rail']]) {
      const ray = new Raycaster(f.point.clone().addScaledVector(f.side, side).addScaledVector(f.up, -2.5), f.up, 0, 4);
      const a = ray.intersectObject(old)[0], b = ray.intersectObject(candidate)[0]; assert(a && b);
      if (key === 'spine') spineError = Math.max(spineError, Math.abs(a.distance - b.distance));
      else runningError = Math.max(runningError, Math.abs(a.distance - b.distance));
    }
  }
  assert(spineError < (detailed ? .006 : .016) && runningError < (detailed ? .006 : .016), `spine error ${spineError}; running error ${runningError}`);
  for (const object of [oldSpine, newSpine, oldRail, newRail]) object.geometry.dispose();
  const families = {};
  for (const g of Object.values(geometries)) for (const part of g.userData.parts) {
    const key = part.name.startsWith('RunningRail') ? 'rail' : part.name.startsWith('Spine') ? 'spine' : part.name.startsWith('Tie') ? 'tie' : 'support';
    const old = families[key] ?? { triangles: 0, vertices: 0, attributeBytes: 0, indexBytes: 0, parts: 0 };
    old.triangles += part.indexCount / 3; old.vertices += part.vertexCount; old.attributeBytes += part.vertexCount * 32;
    old.indexBytes += part.indexCount * g.index.array.BYTES_PER_ELEMENT; old.parts++; families[key] = old;
  }
  const lod = { detailed, batches: counts, families, sweepSimplification: rail.userData.sweepSimplification,
    totalTriangles: Object.values(counts).reduce((s, c) => s + c.triangles, 0),
    totalBytes: Object.values(counts).reduce((s, c) => s + c.bytes, 0), minNormal, maxNormal, minimumTriangleArea: minimumArea,
    reversedTriangles: badWinding, ties: ties.length, supportGroups: thrillSupports(detailed).length, supportBeams: expectedBeams,
    closurePositionMetres: closurePosition, closureNormal, sampleBroadSpinePlaneErrorMetres: spineError, sampleRunningPlaneErrorMetres: runningError };
  lod.maximumSeatContactErrorMetres = maximumSeatContactError;
  lod.maximumTieChordErrorMetres = maximumTieChordError;
  lod.pipeSideNormalSeam = pipeSideNormalSeam;
  lod.sleeveEnvelopeExcessMetres = sleeveEnvelopeExcess;
  lod.spliceEnvelopeExcessMetres = spliceEnvelopeExcess;
  lod.maximumSpliceInnerOffsetMetres = spliceInnerOffset;
  lod.localSpineRecess = geometries.coatedSteel.userData.localSpineRecess;
  lod.columnHeadSingleCapPlanesChecked = columnHeadPlanesChecked;
  lod.suppressedInternalSleeveCapTriangles = suppressedSleeveCapTriangles;
  lod.increaseFromFirstCandidatePercent = detailed ? (lod.totalTriangles / 213012 - 1) * 100 : 0;
  assert(!detailed || lod.increaseFromFirstCandidatePercent <= 3);
  report.lods.push(lod);
  Object.values(geometries).forEach(g => g.dispose());
}
material.dispose();
if (sourcePath) save(sourcePath, source);
if (option('--report')) save(option('--report'), report);
console.log(JSON.stringify(report.lods.map(lod => ({ detailed: lod.detailed, triangles: lod.totalTriangles, bytes: lod.totalBytes, families: lod.families,
  increasePercent: lod.increaseFromFirstCandidatePercent, pipeNormalSeam: lod.pipeSideNormalSeam, sleeveEnvelopeExcess: lod.sleeveEnvelopeExcessMetres,
  spliceEnvelopeExcess: lod.spliceEnvelopeExcessMetres, maximumSpliceInnerOffset: lod.maximumSpliceInnerOffsetMetres })), null, 2));
