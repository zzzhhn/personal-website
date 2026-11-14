import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute, ShaderLib } from 'three';
import { bakeFactoryLight, createFactoryMaterial, factoryRoomLightWeight, FACTORY_ROOM_FILL,
  factoryTaskLightWeight, FACTORY_TASK_LIGHTS } from './factory-lighting.ts';
import { buildFactoryGeometry } from './factory-geometry.ts';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
function sample(points, normals) {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(points.flat(), 3));
  g.setAttribute('normal', new Float32BufferAttribute(normals.flat(), 3));
  g.setAttribute('aMat', new Float32BufferAttribute(points.flatMap(() => [.94, 0, 0, 0]), 4));
  g.setAttribute('color', new Float32BufferAttribute(points.flatMap(() => [.4, .4, .4]), 3));
  g.setIndex(points.map((_, i) => i)); return g;
}
const at = (g, i) => {
  const a = g.getAttribute('aFactoryBake'); return [a.getX(i), a.getY(i), a.getZ(i)];
};

test('static fill follows lamp range and surface orientation, with restrained warm contribution', () => {
  const g = sample([[0, 0, 0], [0, 0, 0], [0, 0, 0], [8, 0, 0], [0, 5, 0], [0, 0, 0]],
    [[0, 1, 0], [0, -1, 0], [1, 0, 0], [0, 1, 0], [0, 1, 0], [0, 3, 0]]);
  const lamps = Object.freeze([Object.freeze({ at: Object.freeze([0, 3, 0]), reach: 6, strength: 1 })]);
  try {
    assert.equal(bakeFactoryLight(g, lamps), g);
    const warm = at(g, 0), far = at(g, 3);
    near(warm[0] - far[0], .45); near(warm[1] - far[1], .45 * .76); near(warm[2] - far[2], .45 * .44);
    assert.ok(warm[0] > warm[1] && warm[1] > warm[2]);
    assert.ok(at(g, 1)[0] < far[0] && at(g, 2)[0] < far[0], 'unlit sides retain only a small sky fill');
    at(g, 4).forEach((v, i) => near(v, far[i]));
    at(g, 5).forEach((v, i) => near(v, warm[i]));
  } finally { g.dispose(); }
});

test('baking changes only its owned attribute, is numerically repeatable and never mutates lamps', () => {
  const g = sample([[0, 0, 0], [1, 0, 0], [0, 0, 1]], [[0, 1, 0], [0, 1, 0], [0, 1, 0]]);
  const before = Object.fromEntries(Object.entries(g.attributes).map(([k, a]) => [k, { attribute: a, values: [...a.array] }]));
  const index = g.index, indices = [...g.index.array], lamps = [{ at: [0, 3, 0], reach: 5, strength: .8 }];
  const originalLamps = structuredClone(lamps);
  try {
    bakeFactoryLight(g, lamps); const first = [...g.attributes.aFactoryBake.array];
    bakeFactoryLight(g, lamps); assert.deepEqual([...g.attributes.aFactoryBake.array], first);
    for (const [name, entry] of Object.entries(before)) {
      assert.equal(g.attributes[name], entry.attribute); assert.deepEqual([...g.attributes[name].array], entry.values);
    }
    assert.equal(g.index, index); assert.deepEqual([...g.index.array], indices); assert.deepEqual(lamps, originalLamps);
  } finally { g.dispose(); }
});

test('overlapping strong lamps remain bounded and degenerate distances never produce NaN', () => {
  const g = sample([[0, 0, 0], [0, 3, 0], [0, 4, 0]], [[0, 1, 0], [0, 1, 0], [0, 1, 0]]);
  try {
    bakeFactoryLight(g, Array.from({ length: 20 }, () => ({ at: [0, 3, 0], reach: 6, strength: 1000 })));
    for (const value of g.attributes.aFactoryBake.array) assert.ok(Number.isFinite(value) && value >= 0 && value <= .908);
    near(at(g, 0)[0], .9076); near(at(g, 1)[0], .0576); near(at(g, 2)[0], .0576);
    bakeFactoryLight(g, []); near(at(g, 0)[0], .0576);
  } finally { g.dispose(); }
});

test('invalid attributes and lamp records fail before installing a partial bake', () => {
  const empty = new BufferGeometry(), g = sample([[0, 0, 0]], [[0, 1, 0]]);
  try {
    assert.throws(() => bakeFactoryLight(empty, []), TypeError);
    for (const lamp of [{ at: [0, 3, 0], reach: 0, strength: 1 }, { at: [0, 3, 0], reach: 5, strength: NaN },
      { at: [0, 3], reach: 5, strength: 1 }]) assert.throws(() => bakeFactoryLight(g, [lamp]), RangeError);
    assert.equal(g.getAttribute('aFactoryBake'), undefined);
    g.attributes.position.setX(0, NaN); assert.throws(() => bakeFactoryLight(g, []), RangeError);
  } finally { empty.dispose(); g.dispose(); }
});

test('both shader variants patch the current Three standard material and share the caller’s night uniform', () => {
  const night = { value: 0 }, materials = [createFactoryMaterial(true, night), createFactoryMaterial(false, night)];
  try {
    assert.notEqual(materials[0].customProgramCacheKey(), materials[1].customProgramCacheKey());
    for (let i = 0; i < materials.length; i++) {
      const material = materials[i], shader = { uniforms: {}, vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader };
      material.onBeforeCompile(shader);
      assert.equal(shader.uniforms.uFactoryNight, night); night.value = .75; assert.equal(shader.uniforms.uFactoryNight.value, .75);
      assert.equal(shader.vertexShader.includes('attribute vec3 aFactoryBake;'), i === 0);
      assert.match(shader.vertexShader, /vFactorySurface = aMat/);
      assert.match(shader.fragmentShader, /roughnessFactor = clamp\(vFactorySurface.x/);
      assert.match(shader.fragmentShader, /metalnessFactor = clamp\(vFactorySurface.y/);
      assert.match(shader.fragmentShader, /clamp\(uFactoryNight, 0.0, 1.0\)/);
      assert.match(shader.fragmentShader, /factoryDetail = 1.0 - smoothstep/);
      assert.ok(shader.fragmentShader.includes('* factoryRoomLightWeight(vFactoryLocal, vFactoryUp)'));
      assert.match(shader.vertexShader, /factoryPoint = instanceMatrix \* factoryPoint/);
      assert.match(shader.vertexShader, /\(modelMatrix \* factoryPoint\).xyz - vec3\(-197.500, 1.000, 12.500\)/);
      assert.ok(shader.vertexShader.indexOf('factoryPoint = vec4(transformed') < shader.vertexShader.indexOf('#include <project_vertex>'));
      assert.match(shader.fragmentShader, /factoryTaskFill = vec3\(1.0, .84, .62\) \* factoryTaskLightWeight/);
      assert.ok(shader.fragmentShader.indexOf('float factoryConcrete') < shader.fragmentShader.indexOf('roughnessFactor = clamp'));
      assert.doesNotMatch(shader.vertexShader + shader.fragmentShader, /Ibd|Truck|GroundVisibility/);
      assert.equal(material.map, null); assert.equal(material.envMap, null); assert.equal(material.normalMap, null);
      assert.equal(material.vertexColors, true);
    }
  } finally { materials.forEach(m => m.dispose()); }
});

test('actual factory structure, roofs and walking surface accept the same local lamp contract', () => {
  const factory = buildFactoryGeometry(), geometries = [factory.geometry, factory.roofs, factory.surface];
  try {
    assert.ok(factory.lamps.length > 0);
    for (const g of geometries) {
      const position = g.attributes.position, surface = g.attributes.aMat, index = g.index;
      bakeFactoryLight(g, factory.lamps);
      assert.equal(g.attributes.aFactoryBake.count, position.count);
      assert.equal(g.attributes.position, position); assert.equal(g.attributes.aMat, surface); assert.equal(g.index, index);
      for (const value of g.attributes.aFactoryBake.array) assert.ok(Number.isFinite(value) && value >= 0 && value <= .908);
    }
    console.log(JSON.stringify({ lamps: factory.lamps.length, bakedVertices: geometries.map(g => g.attributes.position.count) }));
  } finally { geometries.forEach(g => g.dispose()); }
});

test('disposing a material leaves caller geometry and the reusable uniform intact', () => {
  const g = sample([[0, 0, 0]], [[0, 1, 0]]), night = { value: .5 };
  const a = createFactoryMaterial(true, night), b = createFactoryMaterial(true, night);
  let geometryDisposals = 0, otherDisposals = 0;
  g.addEventListener('dispose', () => geometryDisposals++); b.addEventListener('dispose', () => otherDisposals++);
  try {
    bakeFactoryLight(g, []); a.dispose(); assert.equal(geometryDisposals, 0); assert.equal(otherDisposals, 0);
    assert.deepEqual(night, { value: .5 }); night.value = 1;
    const shader = { uniforms: {}, vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader };
    b.onBeforeCompile(shader); assert.equal(shader.uniforms.uFactoryNight.value, 1);
  } finally { b.dispose(); g.dispose(); }
});

test('room fill reaches coarse floor interiors but excludes the courtyard and the top of the roof', () => {
  near(factoryRoomLightWeight(0, .12, 0), 1);
  near(factoryRoomLightWeight(0, 2, 0, 0), .65);
  near(factoryRoomLightWeight(56, .12, 0), 0);
  near(factoryRoomLightWeight(22.5, 18, 0), 0);
  near(factoryRoomLightWeight(0, -.3, 0), 0);
  const triangle = [[-80, .12, -60], [80, .12, -60], [0, .12, 80]];
  triangle.forEach(p => near(factoryRoomLightWeight(...p), 0));
  const centre = triangle[0].map((_, i) => triangle.reduce((n, p) => n + p[i], 0) / 3);
  near(factoryRoomLightWeight(...centre), 1);
  assert.ok(FACTORY_ROOM_FILL.every(v => v > .08 && v <= .2), 'room bounce is bounded, independent of coarse vertex samples');
});

test('local task fixtures light all three press volumes without changing the courtyard or island exposure', () => {
  assert.equal(FACTORY_TASK_LIGHTS.length, 7);
  for (const z of [-11, 2, 15]) {
    const press = factoryTaskLightWeight(-27, 2.2, z);
    assert.ok(press > .5 && press <= .95, `${z}: press working faces need local fill`);
  }
  for (const p of [[60, 1, -9], [80, 1, 20], [0, 1, -50], [-60, 1, -16]]) near(factoryTaskLightWeight(...p), 0);
  assert.ok(factoryTaskLightWeight(-38.8, 1.4, -16) > .05, 'source stock receives the suspended fixture');
  for (const lamp of FACTORY_TASK_LIGHTS) assert.ok(factoryTaskLightWeight(...lamp.at) <= .95);
});

test('ordinary moving press and raw geometries can share work lighting without synthetic vertex attributes', () => {
  const surface = { color: '#667875', rough: .58, metal: .4 };
  const material = createFactoryMaterial(false, { value: 1 }, surface);
  try {
    assert.equal(material.vertexColors, false); assert.equal(material.color.getHexString(), '667875');
    const shader = { uniforms: {}, vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader };
    material.onBeforeCompile(shader);
    assert.doesNotMatch(shader.vertexShader, /attribute vec4 aMat|attribute vec3 aFactoryBake/);
    assert.match(shader.vertexShader, /vFactorySurface = vec4\(0.5800, 0.4000, 0.0000, 0.0000\)/);
    assert.match(shader.vertexShader, /modelMatrix \* factoryPoint/);
    assert.match(shader.fragmentShader, /factoryTaskFill/);
    assert.equal(material.map, null);
  } finally { material.dispose(); }
});
