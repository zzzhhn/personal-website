import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute, Group, Matrix4, Mesh, MeshStandardMaterial, ShaderLib } from 'three';
import { loadWorldModule } from '../street/runtime.mjs';
const sameValues = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));

test('shelter manufacturing slots retain exact sign faces, frozen proxy and seat datum', () => {
  const A = loadWorldModule(), base = loadWorldModule('WorldStreetAssets.ts', '?craft6=baseline');
  const candidate = A.shelterGeometry(0, [.1, .2, .3, .4]), old = base.shelterGeometry(0, [.1, .2, .3, .4]);
  sameValues(A.SHELTER_SEAT_LOCAL, base.SHELTER_SEAT_LOCAL);
  sameValues(candidate.hulls().map(x => [...x]), old.hulls().map(x => [...x]));
  const sign = b => b.mat.flatMap((_, i) => i % 4 === 3 && b.mat[i] === 1
    ? [...b.pos.slice((i - 3) / 4 * 3, (i - 3) / 4 * 3 + 3), ...b.suv.slice((i - 3) / 4 * 2, (i - 3) / 4 * 2 + 2)] : []);
  sameValues(sign(candidate), sign(old));
  const woods = candidate.mat.flatMap((v, i) => i % 4 === 3 && v === -1 ? [(i - 3) / 4] : []);
  assert.ok(woods.length > 20);
  assert.ok(woods.some(i => Math.abs(candidate.suv[i * 2]) > .1));
  sameValues(A.shelterGeometry(1, [0, 0, 1, 1]).mat, base.shelterGeometry(1, [0, 0, 1, 1]).mat);
});

test('park groups preserve both material slots and source UV before world placement', () => {
  const K = loadWorldModule('WorldParkKit.ts');
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0,0,0, 1,0,0, 0,1,0, 2,0,0, 3,0,0, 2,1,0],3));
  geometry.setAttribute('uv',new Float32BufferAttribute([.1,.2,.3,.4,.5,.6,.7,.8,.9,1,.2,.3],2));
  geometry.computeVertexNormals();geometry.setIndex([0,1,2,3,4,5]);geometry.addGroup(0,3,0);geometry.addGroup(3,3,1);
  const materials=['park_wood_light','park_roof_slate'].map(name=>{const m=new MeshStandardMaterial();m.name=name;return m;});
  const root=new Group();root.name='hut_A';root.add(new Mesh(geometry,materials));
  const pieces=K.gltfPieces(root,new Matrix4().makeTranslation(10,0,0));
  try {
    assert.equal(pieces.length,2);
    assert.equal(pieces[0].attributes.aMat.getW(0),-1);assert.equal(pieces[1].attributes.aMat.getW(0),-5);
    assert.ok(Math.abs(pieces[0].attributes.aSuv.getX(0)-.1)<1e-6);
    assert.ok(Math.abs(pieces[1].attributes.aSuv.getX(0)-.7)<1e-6);
    assert.equal(pieces[0].attributes.position.getX(0),10);assert.equal(pieces[1].attributes.position.getX(0),12);
    const blank=new K.ParkGeo();blank.box([0,0,0],[1,1,1],'#fff');const fallback=blank.build();
    assert.equal(fallback.attributes.aMat.count,fallback.attributes.position.count);
    assert.ok([...fallback.attributes.aMat.array].every((v,i)=>i%4===0?Math.abs(v-.86)<1e-6:v===0));fallback.dispose();
  } finally {pieces.forEach(p=>p.dispose());geometry.dispose();materials.forEach(m=>m.dispose());}
});

test('both live shaders retain their own lighting/fade contracts and sample the shared physical pack', () => {
  const street=loadWorldModule('WorldStreetMaterial.ts'), park=loadWorldModule('WorldParkKit.ts');
  const shaders=[street.createStreetMaterial(null),park.parkMaterial()].map(material=>{
    const shader={uniforms:{},vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader};
    material.onBeforeCompile(shader);return shader;
  });
  for(const shader of shaders){
    assert.ok(shader.uniforms.uFacilityWood);assert.ok(shader.uniforms.uFacilityNormal);assert.ok(shader.uniforms.uFacilityRough);
    assert.match(shader.fragmentShader,/texture2D\(uFacilityWood, vFacilityUv\)/);
    assert.match(shader.fragmentShader,/roughnessFactor = clamp\(texture2D\(uFacilityRough/);
    assert.match(shader.fragmentShader,/detail.xy \*= .24/);
  }
  assert.match(shaders[0].fragmentShader,/streetBayer/);assert.match(shaders[0].fragmentShader,/texture2D\(uAtlas, vSuv\)/);
  assert.match(shaders[1].fragmentShader,/uParkNight/);assert.match(shaders[1].vertexShader,/vEmit = aEmit/);
});
