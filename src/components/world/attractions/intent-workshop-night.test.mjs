import test from 'node:test';
import assert from 'node:assert/strict';
import { Color, ShaderLib } from 'three';
import WorldIntentSurface from './WorldIntentSurface.tsx';
import { COASTER_PALETTE } from './coaster-geometry.ts';
import { coasterWorld } from './coaster-track.ts';
import { INTENT_CRAFT, INTENT_CRAFT_ATTRIBUTE } from './intent-craft-surface.ts';
import { createWorkshopGeometry } from './intent-workshop-geometry.ts';
import { WORKSHOP_INTAKE } from './intent-workshop-layout.ts';

test('only the nine intake rollers carry the role and source pigment used to recover baked light', () => {
  const { body, glow } = createWorkshopGeometry();
  try {
    const [x, y, z] = coasterWorld(WORKSHOP_INTAKE);
    const roles = body.getAttribute(INTENT_CRAFT_ATTRIBUTE);
    const positions = body.getAttribute('position');
    const colors = body.getAttribute('color');
    const radiance = body.getAttribute('nightRadiance');
    const steel = new Color(COASTER_PALETTE.steel).toArray().map(Math.fround);
    const counts = Array(9).fill(0);
    for (let i = 0; i < roles.count; i++) {
      if (roles.getX(i) !== INTENT_CRAFT.roller) continue;
      const roller = Math.round((positions.getZ(i) - z + .6) / .15);
      assert.ok(roller >= 0 && roller < counts.length);
      assert.ok(Math.abs(positions.getZ(i) - (z - .6 + roller * .15)) < .071);
      assert.ok(Math.abs(positions.getY(i) - (y + 1.42)) < .071);
      assert.ok(positions.getX(i) >= x - .851 && positions.getX(i) <= x + .401);
      assert.deepEqual([colors.getX(i), colors.getY(i), colors.getZ(i)], steel);
      assert.ok([radiance.getX(i), radiance.getY(i), radiance.getZ(i)].every(channel => channel > 0));
      counts[roller]++;
    }
    assert.deepEqual(counts, Array(9).fill(96));
  } finally {
    body.dispose();
    glow.dispose();
  }
});

test('the Three standard material hook applies the new diffuse response only to the roller role', () => {
  const shaderFor = craft => {
    const shader = { ...ShaderLib.standard, uniforms: {} };
    WorldIntentSurface({ craft }).props.onBeforeCompile(shader);
    return shader;
  };
  const baseline = shaderFor(false);
  const craft = shaderFor(true);
  assert.equal(craft.uniforms.uIntentNight, baseline.uniforms.uIntentNight);
  assert.match(baseline.fragmentShader, /totalEmissiveRadiance \+= vIntentNight \* uIntentNight;/);
  assert.doesNotMatch(baseline.fragmentShader, /bakedPigment|steelDiffuse/);
  assert.match(craft.fragmentShader, /vec3 bakedPigment = diffuseColor\.rgb;\s+IntentFinish finish = intentFinish\(bakedPigment, roughness, metalness\);/);
  assert.match(craft.fragmentShader, /vec3 nightRadiance = vIntentNight;\s+if \(vIntentCraft > 2\.5 && vIntentCraft < 3\.5\) \{[^}]*steelDiffuse = finish\.pigment \* \(1\.0 - finish\.metalness\);\s+nightRadiance = \(vIntentNight \/ bakedPigment\) \* steelDiffuse;\s+\}\s+totalEmissiveRadiance \+= nightRadiance \* uIntentNight;/);
});
