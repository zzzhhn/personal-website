import test from 'node:test';
import assert from 'node:assert/strict';
import { ShaderLib } from 'three';
import { buildIbdStatic } from './ibd-yard-geometry.ts';
import { createIbdMaterial, nearestIbdFixtures, IBD_FIXTURES } from './ibd-yard-lighting.ts';

test('night bake is finite, nonuniform and lights working floors as well as lamp lenses', () => {
  const { geometry } = buildIbdStatic();
  try {
    const p = geometry.getAttribute('position'), bake = geometry.getAttribute('aIbdBake');
    assert.equal(bake.count, p.count);
    assert.ok([...bake.array].every(v => Number.isFinite(v) && v >= 0 && v < 1.6));
    let lo = Infinity, hi = 0, lit = 0;
    for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i) - .085) < .001) {
      lo = Math.min(lo, bake.getX(i)); hi = Math.max(hi, bake.getX(i));
      if (bake.getX(i) > .3) lit++;
    }
    assert.ok(hi - lo > .25, `actual spatial lighting variation: ${lo}..${hi}`);
    assert.ok(lit > 500, `${lit} floor vertices receive warm fill`);
  } finally { geometry.dispose(); }
});
test('both material variants patch the installed Three shader and share the world night uniform', () => {
  const uniform = { value: .75 };
  for (const baked of [false, true]) {
    const material = createIbdMaterial(baked, uniform);
    const shader = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader, uniforms: {} };
    material.onBeforeCompile(shader, null);
    assert.equal(shader.uniforms.uIbdNight, uniform);
    assert.match(shader.vertexShader, /vIbdSurface = aMat/);
    assert.equal(shader.vertexShader.includes('attribute vec3 aIbdBake;'), baked);
    assert.match(shader.fragmentShader, /roughnessFactor = vIbdSurface.x/);
    assert.match(shader.fragmentShader, /metalnessFactor = vIbdSurface.y/);
    assert.match(shader.fragmentShader, /totalEmissiveRadiance \+= uIbdNight/);
    material.dispose();
  }
});
test('nearby fixture selection never duplicates lights or activates more than two, and shuts off outside the yard', () => {
  const pair = [-1, -1];
  for (let x = -40; x <= 40; x += 4) for (let z = -35; z <= 40; z += 4) {
    nearestIbdFixtures(x, z, pair);
    const selected = pair.filter(i => i >= 0);
    assert.ok(selected.length <= 2); assert.equal(new Set(selected).size, selected.length);
    for (const i of selected) {
      const f = IBD_FIXTURES[i]; assert.ok(Math.hypot(f.at[0] - x, f.at[2] - z) <= f.reach + 1e-6);
    }
  }
  nearestIbdFixtures(100, 100, pair); assert.deepEqual(pair, [-1, -1]);
});
