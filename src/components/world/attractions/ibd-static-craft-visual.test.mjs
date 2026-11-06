import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { Box3,BoxGeometry,Group,Mesh,MeshStandardMaterial,Raycaster,Texture,Vector3 } from 'three';
import { buildIbdStatic } from './ibd-yard-geometry.ts';
import { createIbdStaticCraft,ibdStaticCraftLegacy,IBD_STATIC_CRAFT_ROOTS } from './ibd-static-craft-visual.ts';
import { readWorldCraftGltf,disposeWorldCraftGltf } from '../world-craft-gltf-test.mjs';

const digest=array=>createHash('sha256').update(Buffer.from(array.buffer,array.byteOffset,array.byteLength)).digest('hex');
test('shell separation preserves colliders, roller contact and every non-shell visual vertex',()=>{
  const full=buildIbdStatic(),split=buildIbdStatic({separateCraftShells:true});
  try{
    assert.deepEqual(split.solids,full.solids);
    for(const key of ['vertices','indices'])for(const surface of ['walkSurface','groundSurface'])assert.equal(digest(split[surface][key]),digest(full[surface][key]),surface+'/'+key);
    assert.equal(full.geometry.index.count,split.geometry.index.count+split.craftShellGeometry.index.count);
    // Compare complete records, including UV/material attributes, independent of
    // builder vertex indices. Controls/rollers are required to survive exactly.
    const records=g=>{const keys=Object.keys(g.attributes).filter(k=>k!=='aIbdBake').sort();const out=new Map();for(let i=0;i<g.attributes.position.count;i++){
      const r=keys.map(k=>Array.from(g.attributes[k].array.subarray(i*g.attributes[k].itemSize,(i+1)*g.attributes[k].itemSize)).join(',')).join('|');out.set(r,(out.get(r)||0)+1);
    }return out;};
    const expected=records(full.geometry),actual=records(split.geometry);
    for(const [r,n]of records(split.craftShellGeometry))actual.set(r,(actual.get(r)||0)+n);
    assert.deepEqual(actual,expected);
  }finally{full.geometry.dispose();split.geometry.dispose();split.craftShellGeometry.dispose();}
});
test('static equipment QA flag requires explicit opt-in',()=>{
  assert.equal(ibdStaticCraftLegacy('?ibdStatic=legacy'),false);assert.equal(ibdStaticCraftLegacy('?qa=1&ibdStatic=legacy'),true);assert.equal(ibdStaticCraftLegacy('?qa=1'),false);
});
test('all 14 placements batch by borrowed physical material and cleanup is idempotent',()=>{
  const source=new Group(),geometry=new BoxGeometry(.5,.5,.5),texture=new Texture(),material=new MeshStandardMaterial({map:texture,roughness:.47,metalness:.76});
  for(const name of IBD_STATIC_CRAFT_ROOTS){
    const root=new Group();root.name=name;source.add(root);
    if(name==='InspectionBench')root.add(new Mesh(geometry,material));
    else for(const variant of name==='UtilityBench'?['Receiving','Tools']:['Standard','Crane']){const child=new Group();child.name=variant;child.add(new Mesh(geometry,material));root.add(child);}
  }
  const before=digest(geometry.attributes.position.array),data=createIbdStaticCraft(source,{value:0});
  assert.equal(data.group.children.length,1);const batch=data.group.children[0];assert.equal(batch.geometry.index.count,geometry.index.count*14);
  const bounds=new Box3().setFromObject(data.group);assert.equal(bounds.min.x,-8.25);assert.equal(bounds.max.x,21.25);assert.equal(bounds.min.z,-12.25);assert.equal(bounds.max.z,26.25);
  assert.equal(batch.material.map,texture);assert.equal(batch.material.roughness,.47);assert.equal(batch.material.metalness,.76);assert.equal(digest(geometry.attributes.position.array),before);
  let own=0,borrowed=0;batch.geometry.addEventListener('dispose',()=>own++);for(const value of [geometry,material,texture])value.addEventListener('dispose',()=>borrowed++);
  data.dispose();data.dispose();assert.equal(own,1);assert.equal(borrowed,0);geometry.dispose();material.dispose();texture.dispose();
});
test('actual StaticAsset effect survives StrictMode cleanup/replay and disposes after final release',async()=>{
  const js=ts.transpileModule(readFileSync(new URL('./WorldIbdStaticCraft.tsx',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const ast=ts.createSourceFile('static.js',js,ts.ScriptTarget.Latest,true),fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='StaticAsset');
  let effect,disposals=0;const data={users:0,group:{},dispose(){disposals++;}};
  const env={useLoader:()=>({scene:{}}),GLTFLoader:()=>{},IBD_STATIC_CRAFT_ASSET:'asset',withWorldAssetDecoder:()=>{},useMemo:fn=>fn(),createIbdStaticCraft:()=>data,useDjcFurnitureEnvironment:()=>null,useRef:value=>({current:value}),updateIbdCraftEnvironment:()=>{},useFrame:()=>{},useEffect:fn=>{effect=fn;},_jsx:(type,props)=>({type,props})};
  const component=new Function(...Object.keys(env),`return (${fn.getText(ast)});`)(...Object.values(env));component({uniform:{value:0}});
  const firstCleanup=effect();firstCleanup();const finalCleanup=effect();await Promise.resolve();assert.equal(data.users,1);assert.equal(disposals,0);
  finalCleanup();await Promise.resolve();assert.equal(data.users,0);assert.equal(disposals,1);
});
test('actual portable three-family pack preserves original inspection/utility/control envelopes and owns batching resources',async t=>{
  const gltf=await readWorldCraftGltf(['public/assets/world/ibd/static-craft/static-craft-v1.glb']);
  if(!gltf){t.skip('pack pending authorized Blender slot');return;}
  let crafted;
  try{
    assert.deepEqual(gltf.scene.children.map(x=>x.name).sort(),[...IBD_STATIC_CRAFT_ROOTS].sort());
    const roots=Object.fromEntries(gltf.scene.children.map(root=>[root.name,root]));
    for(const [name,width,depth,top]of [['InspectionBench',3.6,3.2,1]]){
      const b=new Box3().setFromObject(roots[name]);assert.ok(b.min.x>=-width/2-.002&&b.max.x<=width/2+.002);assert.ok(b.min.z>=-depth/2-.002&&b.max.z<=depth/2+.002);assert.ok(Math.abs(b.max.y-top)<.002);
    }
    roots.InspectionBench.updateMatrixWorld(true);
    for(const x of [-1.3,0,1.3])for(const z of [-1.2,0,1.2]){const hit=new Raycaster(new Vector3(x,2,z),new Vector3(0,-1,0)).intersectObject(roots.InspectionBench,true)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-1)<.002);}
    for(const [name,top]of [['Receiving',.88],['Tools',1.18]]){
      const variant=roots.UtilityBench.getObjectByName(name);assert.ok(variant);variant.updateMatrixWorld(true);
      const hit=new Raycaster(new Vector3(0,2,0),new Vector3(0,-1,0)).intersectObject(variant,true)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-top)<.002);
      const b=new Box3().setFromObject(variant);assert.ok(b.min.x>=-1.102&&b.max.x<=1.102);assert.ok(b.min.z>=-.602&&b.max.z<=.602);
    }
    for(const [name,top]of [['Standard',1.33],['Crane',.93]]){const root=roots.ControlPedestal.getObjectByName(name);assert.ok(root);const b=new Box3().setFromObject(root);assert.ok(Math.abs(b.max.y-top)<.002);assert.ok(b.min.x>=-.502&&b.max.x<=.502&&b.min.z>=-.452&&b.max.z<=.452);}
    const sources=[];gltf.scene.traverse(o=>{if(o.isMesh)sources.push(o);});
    const timber=sources.find(o=>o.material.name==='IBD static | wood')?.material;assert.ok(timber?.map);assert.equal(timber.color.getHex(),0xffffff,'the photographed base color must not be double tinted');assert.equal(timber.metalness,0);
    crafted=createIbdStaticCraft(gltf.scene,{value:0});assert.ok(crafted.group.children.length<=6,'one runtime batch for each shared physical material');
    for(const mesh of crafted.group.children){assert.ok(!sources.some(s=>s.geometry===mesh.geometry||s.material===mesh.material));assert.ok(mesh.geometry.getAttribute('aIbdBake'));for(const k of ['position','normal','uv'])assert.ok(mesh.geometry.getAttribute(k));}
    const first=sources[0],geometry=first.geometry,material=first.material;let disposed=false;geometry.addEventListener('dispose',()=>disposed=true);
    let ownDisposals=0;crafted.group.children[0].geometry.addEventListener('dispose',()=>ownDisposals++);
    crafted.dispose();crafted.dispose();crafted=null;assert.equal(ownDisposals,1);assert.equal(disposed,false);assert.equal(first.material,material);
  }finally{crafted?.dispose();disposeWorldCraftGltf(gltf.scene);}
});
