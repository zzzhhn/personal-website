import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { Box3, BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Raycaster, Vector3 } from 'three';
import { buildIbdPack, buildIbdPackShell } from './ibd-pack-geometry.ts';
import { createIbdCratePart, IBD_CRATE_LID_PIVOT, ibdCrateLegacy } from './ibd-crate-visual.ts';
import { IBD_PACK_SLOTS } from './ibd-pack-layout.ts';
import { buildIbdLid } from './ibd-yard-geometry.ts';
import { readWorldCraftGltf, disposeWorldCraftGltf } from '../world-craft-gltf-test.mjs';

test('cargo decomposition preserves every quantity/specification sample without a second shell',()=>{
  const shell=buildIbdPackShell();
  try{for(const spec of ['M6','M8'])for(const quantity of [0,1,3,4]){
    const full=buildIbdPack(quantity,spec),samples=buildIbdPack(quantity,spec,{includeShell:false});
    try{
      assert.equal(full.index.count,shell.index.count+samples.index.count);
      for(const key of Object.keys(full.attributes)){
        const before=full.attributes[key].array,offset=shell.attributes[key].array.length;
        assert.deepEqual(before.slice(offset),samples.attributes[key].array,`${spec}/${quantity} ${key} samples must remain byte-identical`);
      }
      if(quantity===0)assert.equal(samples.attributes.position.count,0);
    }finally{full.dispose();samples.dispose();}
  }}finally{shell.dispose();}
});

test('each dynamic placement owns only nodes while borrowing immutable source PBR resources',()=>{
  assert.deepEqual(IBD_CRATE_LID_PIVOT,[0,1.08,-1.25]);
  const source=new Group(),shell=new Group(),lid=new Group(),geometry=new BoxGeometry(1,1,1),material=new MeshStandardMaterial({roughness:.61,metalness:.24});
  shell.name='Shell';lid.name='Lid';source.add(shell,lid);shell.add(new Mesh(geometry,material));lid.add(new Mesh(geometry,material));
  const a=createIbdCratePart(source,'Shell'),b=createIbdCratePart(source,'Shell'),cover=createIbdCratePart(source,'Lid');
  assert.notEqual(a,b);assert.notEqual(a.children[0],shell.children[0]);
  assert.equal(a.children[0].geometry,geometry);assert.equal(b.children[0].material,material);assert.equal(cover.children[0].material,material);
  a.position.x=8;cover.rotation.x=-2;assert.equal(shell.position.x,0);assert.equal(lid.rotation.x,0);
  assert.equal(material.roughness,.61);assert.equal(material.metalness,.24);assert.equal(material.emissive.getHex(),0);
  assert.equal(shell.children[0].castShadow,false);assert.equal(a.children[0].castShadow,true);
  lid.position.z=1;assert.throws(()=>createIbdCratePart(source,'Shell'),/mechanism-local origin/);
  lid.position.z=0;source.remove(lid);assert.throws(()=>createIbdCratePart(source,'Shell'),/top-level Lid/);
  geometry.dispose();material.dispose();
});

test('legacy crate comparison requires explicit QA opt-in',()=>{
  assert.equal(ibdCrateLegacy('?ibdCrates=legacy'),false);
  assert.equal(ibdCrateLegacy('?qa=1&ibdCrates=legacy'),true);
  assert.equal(ibdCrateLegacy('?qa=1'),false);
});

test('the actual crate wrapper mounts only one visual branch for distance, legacy, loading and error states',()=>{
  const js=ts.transpileModule(readFileSync(new URL('./WorldIbdCratePart.tsx',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const ast=ts.createSourceFile('crate.js',js,ts.ScriptTarget.Latest,true),fn=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='WorldIbdCratePart');
  const boundary=ast.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text==='CrateBoundary');
  const marker=()=>{},effect=[],env={useState:initial=>[initial,()=>{}],useEffect:fn=>effect.push(fn),CrateBoundary:marker,Suspense:marker,CrateAsset:marker,_jsx:(type,props)=>({type,props})};
  const component=new Function(...Object.keys(env),`return (${fn.getText(ast).replace(/^export default /,'')});`)(...Object.values(env));
  const fallback={type:'legacy-shell'};
  assert.equal(component({part:'Shell',fallback,active:false,legacy:false}),fallback);
  assert.equal(component({part:'Shell',fallback,active:true,legacy:true}),fallback);
  const candidate=component({part:'Shell',fallback,active:true,legacy:false});
  assert.equal(candidate.props.fallback,fallback);assert.equal(candidate.props.children.props.fallback,fallback);
  assert.equal(candidate.props.children.props.children.props.part,'Shell');
  const Boundary=new Function('Component',`return (${boundary.getText(ast)});`)(class{constructor(props){this.props=props;}});
  const instance=new Boundary({fallback,children:'candidate'});assert.equal(instance.render(),'candidate');
  instance.state=Boundary.getDerivedStateFromError();assert.equal(instance.render(),fallback);
});

test('actual crate keeps all fork channels, support pads and the existing lid sweep envelope',async t=>{
  const gltf=await readWorldCraftGltf(['public/assets/world/ibd/crate/crate-v1.glb','docs/world/phase-2-playground/ibd-crate-craft-20261101/crate.glb']);
  if(!gltf){t.skip('crate export has not been delivered yet');return;}
  const legacy=buildIbdLid();
  try{
    const shell=createIbdCratePart(gltf.scene,'Shell'),lid=createIbdCratePart(gltf.scene,'Lid'),hinge=new Group();
    hinge.position.set(...IBD_CRATE_LID_PIVOT);hinge.add(lid);
    const bounds=new Box3().setFromObject(shell);
    assert.ok(bounds.min.x>=-1.501&&bounds.max.x<=1.501&&bounds.min.z>=-1.351&&bounds.max.z<=1.351);
    assert.ok(bounds.min.y>=-1.011&&bounds.max.y<=1.046);
    shell.updateMatrixWorld(true);
    const down=(x,z)=>new Raycaster(new Vector3(x,2,z),new Vector3(0,-1,0)).intersectObject(shell,true)[0];
    for(const slot of IBD_PACK_SLOTS){
      const fork=down(slot.at[0]-.08,slot.at[2]);assert.ok(fork);assert.ok(Math.abs(fork.point.y-.33)<.001,'the actual fork channel must remain open down to the floor');
      for(const side of [-1,1]){const pad=down(slot.at[0]+side*.28,slot.at[2]+.05);assert.ok(pad);assert.ok(Math.abs(pad.point.y-.42)<.001,'sample rests retain the real support height');}
    }
    legacy.computeBoundingBox();
    for(let i=0;i<=80;i++){
      const angle=-2*i/80;hinge.rotation.x=angle;hinge.updateMatrixWorld(true);
      const expected=legacy.boundingBox.clone().applyMatrix4(new Matrix4().makeRotationX(angle).setPosition(new Vector3(...IBD_CRATE_LID_PIVOT)));
      const actual=new Box3().setFromObject(lid);expected.expandByScalar(.002);
      assert.ok(expected.containsBox(actual),`lid angle ${angle} exceeds the original mechanism envelope`);
    }
  }finally{legacy.dispose();disposeWorldCraftGltf(gltf.scene);}
});
