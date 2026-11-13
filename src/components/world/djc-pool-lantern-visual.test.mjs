import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, SRGBColorSpace, Texture, Vector3 } from 'three';
import { buildDjcClubGeometry } from './WorldDjcClubGeometry.ts';
import { CLUB, CLUB_POOL } from './djc-club-layout.ts';
import { DJC_POOL_LANTERN_ENABLED, DJC_POOL_LANTERN_POSITIONS, createDjcPoolLanternVisual, djcPoolLanternCandidate } from './djc-pool-lantern-visual.ts';

const disposeGeometry=g=>{for(const geometry of [...Object.values(g.batches),...Object.values(g.daybeds),...Object.values(g.poolLanterns),g.pool])geometry.dispose();};
test('candidate extracts exactly ten old lanterns while retaining every original collider and seat',()=>{
  const original=buildDjcClubGeometry({separateDaybeds:true}),candidate=buildDjcClubGeometry({separateDaybeds:true,separatePoolLanterns:true});
  try{
    assert.equal(DJC_POOL_LANTERN_POSITIONS.length,10);
    assert.deepEqual(candidate.colliders,original.colliders);
    assert.deepEqual(candidate.seats,original.seats);assert.deepEqual(candidate.daybedApproaches,original.daybedApproaches);
    let removedVertices=0;
    for(const key of Object.keys(original.batches)){
      assert.equal(original.batches[key].attributes.position.count,candidate.batches[key].attributes.position.count+candidate.poolLanterns[key].attributes.position.count);
      assert.deepEqual(original.daybeds[key].attributes.position.array,candidate.daybeds[key].attributes.position.array);
      assert.equal(original.poolLanterns[key].attributes.position.count,0);
      removedVertices+=candidate.poolLanterns[key].attributes.position.count;
    }
    assert.equal(removedVertices/3,164*10,'fallback is the ten real seven-part source lanterns, without extra furniture');
    const actualPositions=[];
    for(let i=0;i<12;i++){
      const angle=i*Math.PI*2/12+.15;if(Math.abs(Math.cos(angle))<.2)continue;
      const [x,z]=CLUB_POOL.boundary(angle,2.25);actualPositions.push([x,1.4,z]);
      const vertices=candidate.colliders.solid.vertices;let baseFaces=0;
      for(let j=0;j<vertices.length;j+=9){
        let inside=true;
        for(let k=0;k<9;k+=3)inside&&=Math.abs(vertices[j+k]-x)<=.15001&&vertices[j+k+1]>=1.39999&&vertices[j+k+1]<=1.80001&&Math.abs(vertices[j+k+2]-z)<=.15001;
        if(inside)baseFaces++;
      }
      assert.equal(baseFaces,12,`original solid box at ${x},${z} must remain complete`);
    }
    assert.deepEqual(DJC_POOL_LANTERN_POSITIONS,actualPositions);
  }finally{disposeGeometry(original);disposeGeometry(candidate);}
});

test('four material batches share ten placements, authored UV1 AO, owned samplers and night roles',()=>{
  const source=new Group(),nested=new Group(),geometry=new BoxGeometry(.3,.77,.3);
  nested.position.set(.1,.2,.3);source.add(nested);
  const map=new Texture(),normal=new Texture(),ao=new Texture(),environment=new Texture();
  map.colorSpace=SRGBColorSpace;ao.channel=1;ao.offset.set(.1,.2);ao.updateMatrix();
  const originals=Array.from({length:4},(_,i)=>new MeshStandardMaterial({color:i===1?'#f7edd5':'#956a43',map,normalMap:normal,aoMap:ao,aoMapIntensity:.65,roughness:.6+i*.1,metalness:i===2?.6:0}));
  originals[1].userData={djcRole:'emissive-diffuser',dayEmissiveIntensity:0,nightEmissiveColor:'#ffc478',nightEmissiveIntensity:1.4};
  originals.forEach((material,i)=>{const mesh=new Mesh(geometry,material);mesh.name=`native-batch-${i}`;nested.add(mesh);});
  let sourceGeometryDisposals=0,sourceMaterialDisposals=0,sourceTextureDisposals=0,environmentDisposals=0,ownedMaterialDisposals=0,ownedSamplerDisposals=0,instanceDisposals=0;
  geometry.addEventListener('dispose',()=>sourceGeometryDisposals++);
  originals.forEach(m=>m.addEventListener('dispose',()=>sourceMaterialDisposals++));
  [map,normal,ao].forEach(t=>t.addEventListener('dispose',()=>sourceTextureDisposals++));
  environment.addEventListener('dispose',()=>environmentDisposals++);
  const visual=createDjcPoolLanternVisual(source,environment,16),matrix=new Matrix4(),position=new Vector3();
  assert.equal(visual.instances.length,4);assert.equal(visual.materials.length,4);
  assert.equal(visual.root.children.some(o=>o.isLight),false);
  for(let j=0;j<visual.instances.length;j++){
    const instance=visual.instances[j],material=visual.materials[j];
    assert.equal(instance.geometry,geometry);assert.equal(instance.count,10);
    assert.equal(instance.material,material);assert.notEqual(material,originals[j]);
    assert.equal(instance.castShadow,true);assert.equal(instance.receiveShadow,true);
    assert.equal(material.envMap,environment);assert.deepEqual(material.color,originals[j].color);
    assert.equal(material.roughness,originals[j].roughness);assert.equal(material.aoMapIntensity,.65);
    assert.equal(material.aoMap.channel,1);assert.deepEqual(material.aoMap.matrix,ao.matrix);
    for(const key of ['map','normalMap','aoMap']){
      assert.equal(material[key],visual.materials[0][key]);assert.notEqual(material[key],originals[j][key]);
      assert.equal(material[key].source,originals[j][key].source);assert.equal(material[key].anisotropy,4);
    }
    DJC_POOL_LANTERN_POSITIONS.forEach(([x,y,z],i)=>{instance.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);assert.ok(position.distanceTo(new Vector3(x+.1,y+.2,z+.3))<1e-5);});
    material.addEventListener('dispose',()=>ownedMaterialDisposals++);instance.addEventListener('dispose',()=>instanceDisposals++);
  }
  const versions=visual.instances.map(i=>i.instanceMatrix.version);
  visual.setNight(0);assert.equal(visual.materials[1].emissiveIntensity,0);
  visual.setNight(.5);assert.equal(visual.materials[1].emissiveIntensity,.7);
  visual.setNight(1);assert.equal(visual.materials[1].emissiveIntensity,1.4);
  assert.equal(visual.materials[1].emissive.getHexString(),'ffc478');assert.equal(visual.materials[1].emissiveMap,visual.materials[1].map);
  visual.materials.forEach((m,i)=>{assert.ok(Math.abs(m.envMapIntensity-.35)<1e-12);if(i!==1)assert.equal(m.emissive.getHex(),0);});
  assert.deepEqual(visual.instances.map(i=>i.instanceMatrix.version),versions,'night response must not upload placement matrices');
  assert.equal(originals[1].emissive.getHex(),0);assert.equal(originals[1].emissiveMap,null);assert.equal(ao.channel,1);assert.equal(ao.anisotropy,1);
  const ownedSamplers=new Set([visual.materials[0].map,visual.materials[0].normalMap,visual.materials[0].aoMap]);
  ownedSamplers.forEach(t=>t.addEventListener('dispose',()=>ownedSamplerDisposals++));
  visual.dispose();
  assert.equal(ownedMaterialDisposals,4);assert.equal(ownedSamplerDisposals,3);assert.equal(instanceDisposals,4);
  assert.equal(sourceGeometryDisposals,0);assert.equal(sourceMaterialDisposals,0);assert.equal(sourceTextureDisposals,0);assert.equal(environmentDisposals,0);
  geometry.dispose();originals.forEach(m=>m.dispose());[map,normal,ao,environment].forEach(t=>t.dispose());
});

test('renderer sampler limit and legacy diffuser naming remain supported',()=>{
  const source=new Group(),map=new Texture(),material=new MeshStandardMaterial({map}),geometry=new BoxGeometry();
  material.name='Ivory woven light diffuser';source.add(new Mesh(geometry,material));
  const visual=createDjcPoolLanternVisual(source,null,2);
  assert.equal(visual.materials[0].map.anisotropy,2);visual.setNight(1);assert.equal(visual.materials[0].emissiveIntensity,1.4);visual.dispose();
  const baseline=createDjcPoolLanternVisual(source);assert.equal(baseline.materials[0].map,map);baseline.dispose();
  geometry.dispose();material.dispose();map.dispose();
});

test('normal play uses the refined lanterns and only explicit QA enables the legacy comparison',()=>{
  assert.equal(DJC_POOL_LANTERN_ENABLED,true);
  assert.equal(djcPoolLanternCandidate(''),true);assert.equal(djcPoolLanternCandidate('?djcLanterns=legacy'),true);
  assert.equal(djcPoolLanternCandidate('?qa=1'),true);assert.equal(djcPoolLanternCandidate('?qa=1&djcLanterns=candidate'),true);
  assert.equal(djcPoolLanternCandidate('?qa=1&djcLanterns=legacy'),false);
});

test('distant candidate mounts only the fallback and first approach activates its asset once',()=>{
  const js=ts.transpileModule(readFileSync(new URL('./WorldDjcClubLanterns.tsx',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const ast=ts.createSourceFile('lantern.js',js,ts.ScriptTarget.Latest,true);
  const declaration=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='WorldDjcClubLanterns');
  assert.ok(declaration);
  const text=declaration.getText(ast),camera={position:new Vector3(CLUB.pool[0]+110,2,CLUB.pool[2])},frames=[],writes=[],refs=[];
  const marker=()=>null,env={CLUB,useThree:select=>select({camera}),useRef:v=>{const r={current:v};refs.push(r);return r;},useState:init=>[init(),v=>writes.push(v)],useFrame:fn=>frames.push(fn),PoolLanternBoundary:marker,Suspense:marker,PoolLanternAsset:marker,_jsx:(type,props)=>({type,props})};
  const component=new Function(...Object.keys(env),`return (${text.slice(text.indexOf('function'))});`)(...Object.values(env));
  const tree=component({fallback:'original-lanterns'});
  assert.equal(tree.props.children,'original-lanterns','no GLB or private environment component mounts remotely');
  const group={visible:true};refs[0].current=group;
  camera.position.x=CLUB.pool[0]+89;frames.forEach(fn=>fn());assert.deepEqual(writes,[true]);
  camera.position.x=CLUB.pool[0]+85;frames.forEach(fn=>fn());assert.deepEqual(writes,[true]);
  camera.position.x=CLUB.pool[0]+181;frames.forEach(fn=>fn());assert.equal(group.visible,false);
});
