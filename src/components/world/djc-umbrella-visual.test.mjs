import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { Box3, BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Texture, Vector3 } from 'three';
import { buildDjcClubGeometry } from './WorldDjcClubGeometry.ts';
import { createDjcUmbrellaVisual, DJC_UMBRELLA_PLACEMENTS, djcUmbrellaLegacy } from './djc-umbrella-visual.ts';
import { retainDjcFurnitureEnvironment } from './WorldDjcFurnitureEnvironment.ts';
import { readWorldCraftGltf, disposeWorldCraftGltf } from './world-craft-gltf-test.mjs';

const disposeClub=g=>{for(const key of ['batches','daybeds','poolLanterns','umbrellas'])Object.values(g[key]).forEach(item=>item.dispose());g.pool.dispose();};
test('extracting only the parasols preserves exact collider arrays, seats, approaches and adjacent loungers',()=>{
  const original=buildDjcClubGeometry(),separated=buildDjcClubGeometry({separateUmbrellas:true});
  try{
    assert.deepEqual(separated.colliders,original.colliders);
    assert.deepEqual(separated.seats,original.seats);assert.deepEqual(separated.daybedApproaches,original.daybedApproaches);
    for(const key of Object.keys(original.batches)){
      const before=original.batches[key].attributes.position.count,remaining=separated.batches[key].attributes.position.count,extracted=separated.umbrellas[key].attributes.position.count;
      assert.equal(remaining+extracted,before);
      if(!['wood','fabric'].includes(key))assert.equal(extracted,0);
    }
    const p=separated.umbrellas.fabric.attributes.position;
    assert.ok(p.count>0);
    for(let i=0;i<p.count;i++)assert.ok(p.getY(i)>3.5,'no nearby low lounger fabric enters parasol fallback');
    const timber=separated.umbrellas.wood.boundingBox;
    assert.ok(timber.max.x-timber.min.x<.14,'only the narrow posts leave the main timber batch');
  }finally{disposeClub(original);disposeClub(separated);}
});

test('both placements retain hierarchy transforms and one material/sampler per source, with owned-only disposal',()=>{
  const source=new Group(),parent=new Group(),geometry=new BoxGeometry(.4,.5,.6),map=new Texture(),environment=new Texture();
  const material=new MeshStandardMaterial({color:'#bba176',roughness:.82,metalness:.12,map});
  parent.position.set(.2,.3,.4);source.add(parent);const mesh=new Mesh(geometry,material);mesh.position.set(.1,.2,.3);parent.add(mesh,new Mesh(geometry,material));
  let borrowedDisposals=0,ownedDisposals=0;
  for(const item of [geometry,material,map,environment])item.addEventListener('dispose',()=>borrowedDisposals++);
  const visual=createDjcUmbrellaVisual(source,environment,8),matrix=new Matrix4(),position=new Vector3();
  assert.equal(visual.materials.length,1);assert.equal(visual.instances.length,2);
  const copy=visual.materials[0];assert.notEqual(copy,material);assert.notEqual(copy.map,map);assert.equal(copy.map.source,map.source);assert.equal(copy.map.anisotropy,4);
  assert.equal(copy.roughness,material.roughness);assert.equal(copy.metalness,material.metalness);assert.equal(copy.envMap,environment);assert.equal(material.envMap,null);
  assert.equal(visual.instances[0].geometry,geometry);assert.equal(visual.instances[0].material,visual.instances[1].material);
  DJC_UMBRELLA_PLACEMENTS.forEach(([x,y,z],i)=>{visual.instances[0].getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);assert.ok(position.distanceTo(new Vector3(x+.3,y+.5,z+.7))<1e-5);});
  visual.setNight(1);assert.equal(copy.envMapIntensity,.5);assert.equal(copy.emissive.getHex(),0);
  copy.addEventListener('dispose',()=>ownedDisposals++);copy.map.addEventListener('dispose',()=>ownedDisposals++);
  visual.dispose();visual.dispose();assert.equal(ownedDisposals,2);assert.equal(borrowedDisposals,0);
  geometry.dispose();material.dispose();map.dispose();environment.dispose();
});

test('shared reflection target survives effect replay, then disposes once after the final consumer leaves',async()=>{
  const renderer={},texture=new Texture();let builds=0,disposals=0;
  const create=()=>{builds++;return {texture,dispose(){disposals++;}};};
  const daybed=retainDjcFurnitureEnvironment(renderer,create),umbrella=retainDjcFurnitureEnvironment(renderer,create);
  assert.equal(builds,1);assert.equal(daybed.texture,umbrella.texture);
  daybed.release();daybed.release();umbrella.release();
  const replay=retainDjcFurnitureEnvironment(renderer,create);
  await Promise.resolve();assert.equal(disposals,0);assert.equal(builds,1);
  replay.release();await Promise.resolve();assert.equal(disposals,1);
  const remount=retainDjcFurnitureEnvironment(renderer,create);assert.equal(builds,2);remount.release();await Promise.resolve();assert.equal(disposals,2);
  texture.dispose();
});

test('the actual umbrella effect retains owned GPU data across StrictMode replay and releases on final unmount',async()=>{
  const js=ts.transpileModule(readFileSync(new URL('./WorldDjcClubUmbrellas.tsx',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const ast=ts.createSourceFile('umbrella.js',js,ts.ScriptTarget.Latest,true),declaration=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='UmbrellaAsset');
  const source=new Group(),geometry=new BoxGeometry(),material=new MeshStandardMaterial();source.add(new Mesh(geometry,material));
  const effects=[],environment={useLoader:()=>({scene:source}),GLTFLoader:null,DJC_UMBRELLA_ASSET:'unused',withWorldAssetDecoder:null,useDjcFurnitureEnvironment:()=>null,
    useThree:select=>select({gl:{capabilities:{getMaxAnisotropy:()=>1}}}),useMemo:fn=>fn(),useEffect:fn=>effects.push(fn),useFrame:()=>{},
    createDjcUmbrellaVisual,night:{value:0},_jsx:(type,props)=>({type,props})};
  const component=new Function(...Object.keys(environment),`return (${declaration.getText(ast)});`)(...Object.values(environment)),tree=component();
  let disposals=0;tree.props.object.children[0].material.addEventListener('dispose',()=>disposals++);
  const firstCleanup=effects[0]();firstCleanup();const finalCleanup=effects[0]();await Promise.resolve();assert.equal(disposals,0);
  finalCleanup();await Promise.resolve();assert.equal(disposals,1);assert.equal(tree.props.dispose,null);
  geometry.dispose();material.dispose();
});

test('legacy parasols require explicit QA opt-in',()=>{
  assert.equal(djcUmbrellaLegacy('?djcUmbrellas=legacy'),false);
  assert.equal(djcUmbrellaLegacy('?qa=1&djcUmbrellas=legacy'),true);
  assert.equal(djcUmbrellaLegacy('?qa=1'),false);
});

test('actual umbrella export keeps the pole-root, fixed canopy envelope and two world placements',async t=>{
  const gltf=await readWorldCraftGltf(['public/assets/world/club/umbrella/umbrella-v1.glb','docs/world/phase-2-playground/djc-umbrella-craft-20261101/umbrella.glb']);
  if(!gltf){t.skip('umbrella export has not been delivered yet');return;}
  let visual;
  try{
    const bounds=new Box3().setFromObject(gltf.scene);
    assert.ok(bounds.min.y>=-.0001&&bounds.min.y<=.001,'pole must meet the unchanged root plane');
    assert.ok(bounds.max.y>=2.80&&bounds.max.y<=2.826);
    for(const x of [bounds.min.x,bounds.max.x,bounds.min.z,bounds.max.z])assert.ok(Math.abs(x)<=1.651);
    visual=createDjcUmbrellaVisual(gltf.scene);
    assert.ok(visual.instances.length<=8,'export should batch repeated fixed construction by material');
    for(const instance of visual.instances){
      assert.equal(instance.count,2);
      for(const attribute of Object.values(instance.geometry.attributes))for(const value of attribute.array)assert.ok(Number.isFinite(value));
    }
    const placed=new Box3().setFromObject(visual.root);
    assert.ok(Math.abs(placed.min.y-1.4)<.001&&Math.abs(placed.max.y-(bounds.max.y+1.4))<.001);
    assert.ok(Math.abs(placed.min.z-(47+bounds.min.z))<.001&&Math.abs(placed.max.z-(63+bounds.max.z))<.001);
    assert.ok(visual.materials.length>=3,'timber, fabric and metal retain separate physical responses');
    for(const material of visual.materials)assert.equal(material.emissive.getHex(),0);
  }finally{visual?.dispose();disposeWorldCraftGltf(gltf.scene);}
});
