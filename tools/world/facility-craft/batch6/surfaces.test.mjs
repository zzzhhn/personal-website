import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute, Group, Matrix4, Mesh, MeshStandardMaterial, ShaderLib, PerspectiveCamera, Vector4 } from 'three';
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
    assert.match(shader.fragmentShader,/detail.xy \*= .18/);
    assert.match(shader.fragmentShader,/step\(.5, vFacilityKind\) \* \(1.0 - .90 \* uFacilityNight\)/);
    assert.ok(shader.uniforms.uFacilityNight);
  }
  assert.match(shaders[0].fragmentShader,/streetBayer/);assert.match(shaders[0].fragmentShader,/texture2D\(uAtlas, vSuv\)/);
  assert.match(shaders[1].fragmentShader,/uParkNight/);assert.match(shaders[1].vertexShader,/vEmit = aEmit/);
});

test('shelter glass splits exactly once, leaves frozen proxy and has no transmission pass', () => {
  const A=loadWorldModule(), G=loadWorldModule('WorldFacilityGlazing.ts');
  const builder=A.shelterGeometry(0,[0,0,1,1]), geometry=builder.build();
  const split=G.splitShelterGlazing(geometry), material=G.createShelterGlazingMaterial();
  try {
    assert.equal(split.opaque.index.count+split.glass.index.count,geometry.index.count);
    assert.ok(split.glass.index.count>0);
    const slots=(g)=>Array.from(g.index.array,i=>g.attributes.aMat.getW(i));
    assert.ok(slots(split.glass).every(slot=>slot===-4));assert.ok(slots(split.opaque).every(slot=>slot!==-4));
    assert.equal(material.transparent,true);assert.equal(material.depthWrite,false);
    assert.equal(material.opacity,.45);assert.ok(!material.transmission);
    const xs=Array.from(split.glass.index.array,i=>split.glass.attributes.position.getX(i));
    assert.ok(Math.abs(Math.max(...xs)-Math.min(...xs)-.012)<1e-6);
  } finally {geometry.dispose();split.opaque.dispose();split.glass.dispose();material.dispose();}
});

test('glazing uses street LOD/fade/hide and releases both private geometries', () => {
  const A=loadWorldModule(), G=loadWorldModule('WorldFacilityGlazing.ts'), {StreetBatch}=loadWorldModule('WorldStreetBatch.ts');
  const source=[0,1].map(lod=>A.shelterGeometry(lod,[0,0,1,1]).build());
  const split=source.map(g=>G.splitShelterGlazing(g));
  const material=G.createShelterGlazingMaterial(), camera=new PerspectiveCamera(), color=new Vector4();
  let disposed=0;for(const p of split)p.glass.addEventListener('dispose',()=>disposed++);
  const batch=new StreetBatch('shelter-glass-test',[{id:'shelter',L0:split[0].glass,L1:split[1].glass,lodNear:40,far:160}],[1],material);
  batch.add(0,new Matrix4());batch.finish(1);
  camera.position.set(0,0,10);assert.ok(batch.update(camera).l0>0);
  camera.position.set(0,0,50);assert.ok(batch.update(camera).l1>0);
  camera.position.set(0,0,154);batch.update(camera);batch.mesh.getColorAt(0,color);assert.ok(Math.abs(color.w-.5)<1e-6);
  batch.setHidden(0,true);batch.update(camera);assert.equal(batch.mesh.getVisibleAt(0),false);
  batch.setHidden(0,false);camera.position.set(0,0,10);batch.update(camera);assert.equal(batch.mesh.getVisibleAt(0),true);
  camera.position.set(0,0,180);batch.update(camera);assert.equal(batch.mesh.getVisibleAt(0),false);
  batch.dispose();assert.equal(disposed,2);material.dispose();
  source.forEach(g=>g.dispose());split.forEach(p=>p.opaque.dispose());
});
