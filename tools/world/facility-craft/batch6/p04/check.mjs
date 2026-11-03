import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { ShaderLib } from 'three';
import { loadWorldModule, ROOT } from '../../street/runtime.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const [lamp, walk, kit] = loadWorldModule(['WorldParkLamp.ts', 'WorldParkWalk.tsx', 'WorldParkKit.ts']);
const baseline = loadWorldModule('WorldParkLamp.ts', '?parkLampCraft=baseline').PARK_LAMP;
const candidate = lamp.PARK_LAMP;
assert.equal(walk.LAMP, candidate);
assert.equal(candidate.spec.mass, 45);
assert.deepEqual(candidate.hulls.map(hull => hull.length / 3).join('/'), '340/144/84/256');
assert.equal(hash(candidate.hulls.map(hull => [...hull])), '74e48bd9a1ce768e807f96c80735da723509120827d3585229b64e4fe07f888b');
assert.equal(hash(walk.buildWalk().lamps), 'c5e8eb1b1a3d4de4e0afcf5e45cc9ce4133f71ae2f35f9b612f08ef416494f2d');

const results = [];
for (const [key, triangles, glowTriangles, emitHash] of [
  ['geometry', 766, 48, '8787b16a85145548d14b9e589d7b61dabf63a7d67d539e974abc0c95f5fd8489'],
  ['far', 146, 18, '68a6a16869e587fdb485956971f73d3dc4d6ef342bbac70297bbf3b670f50910'],
]) {
  const g = candidate[key].clone();
  const old = baseline[key];
  for (const name of ['position', 'normal', 'color', 'aEmit']) {
    assert.deepEqual(g.getAttribute(name).array, old.getAttribute(name).array);
  }
  assert.equal(hash([...g.getAttribute('aEmit').array]), emitHash);
  const p = g.getAttribute('position'), uv = g.getAttribute('aSuv');
  const mat = g.getAttribute('aMat'), emit = g.getAttribute('aEmit');
  assert.equal(p.count / 3, triangles);
  const roles = { wood: 0, coated: 0, stone: 0, lens: 0 };
  const seamSamples = new Map();
  let maxAngularSpan = 0, seamCorners = 0;
  for (let i = 0; i < p.count; i += 3) {
    const corners = [i, i + 1, i + 2];
    const slot = -mat.getW(i);
    assert.ok(corners.every(j => -mat.getW(j) === slot));
    assert.ok(corners.every(j => Number.isFinite(uv.getX(j)) && Number.isFinite(uv.getY(j))));
    const minY = Math.min(...corners.map(j => p.getY(j)));
    const maxY = Math.max(...corners.map(j => p.getY(j)));
    if (emit.getY(i) > 0) {
      roles.lens++;
      assert.equal(slot, 0);
    } else if (mat.getX(i) > .9) {
      roles.stone++;
      assert.equal(slot, 0);
    } else if (Math.abs(mat.getX(i) - .78) < .001 && minY >= .65999 && minY < 2.59999 && maxY <= 2.60001
      && corners.every(j => Math.hypot(p.getX(j), p.getZ(j)) < .071)) {
      roles.wood++;
      assert.equal(slot, 1);
      const span = Math.max(...corners.map(j => uv.getY(j))) - Math.min(...corners.map(j => uv.getY(j)));
      maxAngularSpan = Math.max(maxAngularSpan, span);
      assert.ok(span <= 1 / 6 + 1e-6);
      for (const j of corners) {
        assert.ok(Math.abs(uv.getX(j) * .7 - p.getY(j)) < 1e-6);
        const key = [p.getX(j), p.getY(j), p.getZ(j)].join('/');
        const prior = seamSamples.get(key);
        if (prior !== undefined) {
          const diff = Math.abs(prior - uv.getY(j));
          assert.ok(Math.abs(diff - Math.round(diff)) < 1e-6);
          if (diff > .9) seamCorners++;
        } else seamSamples.set(key, uv.getY(j));
      }
    } else {
      roles.coated++;
      assert.equal(slot, 2);
    }
  }
  assert.ok(roles.wood && roles.coated && roles.stone);
  assert.equal(roles.lens, glowTriangles);
  assert.ok(seamCorners > 0, 'actual wrap seam exercised');
  results.push({ key, triangles, roles, maxAngularSpan, seamCorners,
    additionalAttributeBytes: mat.array.byteLength + uv.array.byteLength });
}

const shader = { ...ShaderLib.standard, uniforms: {} };
kit.parkMaterial().onBeforeCompile(shader);
assert.ok(shader.vertexShader.includes('vEmit = aEmit') && shader.vertexShader.includes('-aMat.w'));
assert.ok(shader.fragmentShader.includes('totalEmissiveRadiance += parkEmit') && shader.fragmentShader.includes('texture2D(uFacilityWood'));
for (const name of ['WorldStreetAssets.ts', 'WorldStreetFacilityCraft.ts', 'WorldStreetGeometry.ts',
  'WorldParkWalk.tsx', 'WorldParkKit.ts', 'WorldPark.tsx', 'WorldFacilitySurface.ts', 'WorldEnvironment.tsx']) {
  const path = 'src/components/world/' + name;
  assert.deepEqual(readFileSync(ROOT + '/' + path), execFileSync('git', ['show', '395cbbf:' + path], { cwd: ROOT }));
}
console.log(JSON.stringify({ results, placements: 9, hulls: 4, mass: 45 }, null, 2));
