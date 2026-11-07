import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial, ShaderLib } from 'three';
import { createCampFlagWind, setCampFlagLift } from './camp-flag-wind.ts';

const glb = readFileSync(new URL('../../../public/assets/world/camp-shelter-craft/C10.glb', import.meta.url));
const jsonLength = glb.readUInt32LE(12);
const { nodes, meshes, accessors, bufferViews } = JSON.parse(glb.subarray(20, 20 + jsonLength));
const flags = nodes.filter(node => /^flag_0[1-4]$/.test(node.name));
const material = new MeshStandardMaterial();
const wind = { uWindTime: { value: 0 }, uWindStrength: { value: 1 } };
const rig = createCampFlagWind(wind);

function flagFromGLB({ name, mesh, extras }) {
  const primitive = meshes[mesh].primitives[0];
  const geometry = new BufferGeometry();
  for (const [name, key, size] of [['position', 'POSITION', 3], ['normal', 'NORMAL', 3], ['uv', 'TEXCOORD_0', 2]]) {
    const a = accessors[primitive.attributes[key]], v = bufferViews[a.bufferView];
    const start = 28 + jsonLength + (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const values = new Float32Array(a.count * size);
    for (let i = 0; i < a.count; i++) for (let j = 0; j < size; j++) {
      values[i * size + j] = glb.readFloatLE(start + i * (v.byteStride ?? size * 4) + j * 4);
    }
    geometry.setAttribute(name, new BufferAttribute(values, size));
  }
  return Object.assign(new Mesh(geometry, material), { name, userData: { ...extras } });
}

test('the authored flag hoist stays pinned on both sheets and the fly needs no subdivision', () => {
  assert.equal(flags.length, 4);
  flags.forEach((node, slot) => {
    const flag = flagFromGLB(node), source = flag.geometry;
    const geometry = rig.attach(flag, material, slot);
    const basis = geometry.getAttribute('aCampFlagBasis');
    const position = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
    assert.notEqual(geometry, source);
    assert.equal(source.getAttribute('aCampFlagBasis'), undefined);
    assert.equal(flag.customDepthMaterial, rig.depth);
    assert.deepEqual(position.array, source.getAttribute('position').array);
    assert.deepEqual(uv.array, source.getAttribute('uv').array);
    const columns = new Set();
    const hoist = [];
    for (let i = 0; i < position.count; i++) {
      columns.add(uv.getX(i));
      if (uv.getX(i) < 0.01) hoist.push(i);
      assert.equal(basis.getW(i), slot);
    }
    assert.equal(columns.size, 19);
    assert.equal(hoist.length, 14);
    for (const i of hoist) assert.equal(position.getZ(i), basis.getX(i));
    assert.ok(Math.abs(Math.min(...hoist.map(i => position.getY(i))) + node.extras.hoistHeightM) < 1e-6);
    geometry.dispose(); source.dispose();
  });
});

test('surface and actual Three depth shader use one motion field and live uniforms', () => {
  const prop = flagFromGLB(flags[0]), source = prop.geometry;
  rig.attach(prop, material, 0);
  const compile = (m, { vertexShader }) => {
    const shader = { vertexShader, uniforms: {} };
    m.onBeforeCompile(shader);
    return shader;
  };
  const surface = compile(material, ShaderLib.standard), shadow = compile(rig.depth, ShaderLib.depth);
  const field = s => s.vertexShader.match(/void campFlagField[\s\S]*?\n}/)?.[0];
  assert.ok(field(surface));
  assert.equal(field(surface), field(shadow));
  for (const s of [surface, shadow]) {
    assert.equal(s.uniforms.uWindTime, wind.uWindTime);
    assert.equal(s.uniforms.uWindStrength, wind.uWindStrength);
    assert.match(s.vertexShader, /transformed\.xy \+= campFlagOffset/);
  }
  assert.match(surface.vertexShader, /objectNormal\.y -= campFlagSlope/);
  assert.equal(surface.uniforms.uCampFlagLifts, shadow.uniforms.uCampFlagLifts);
  assert.equal(setCampFlagLift(prop, 0.42), true);
  assert.equal(shadow.uniforms.uCampFlagLifts.value.x, 0.42);
  assert.equal(prop.userData.campFlagLift, 0.42);
  assert.equal(prop.rotation.x, 0);
  assert.equal(setCampFlagLift(new Mesh(), 0.42), false);
  prop.geometry.dispose(); source.dispose(); material.dispose(); rig.depth.dispose();
});
