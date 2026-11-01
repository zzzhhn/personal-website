import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import ts from 'typescript';
import {MeshStandardMaterial,ShaderLib} from 'three';
import {quarryFloraBanks,quarryFloraKind,quarryFloraStyle} from './alpha-mine-flora.ts';
import {ALPHA_MINE_ORIGIN} from './alpha-mine-layout.ts';

// Load only the real geometry/shader factories. React/Rapier scene services are inert here;
// this is an in-memory TSX unit-test transform, not a renderer or a project build.
const grassUrl=new URL('./WorldGrass.tsx',import.meta.url).href;
const materialUrl=new URL('./WorldMineMaterial.ts',import.meta.url).href;
const moduleUrl=source=>'data:text/javascript,'+encodeURIComponent(source);
const clockUrl=moduleUrl('export const night={value:0};');
const stubs={
 '@react-three/fiber':moduleUrl('export const useFrame=()=>{},useThree=()=>{};'),
 '@react-three/rapier':moduleUrl('export const useRapier=()=>{};'),
 './layout':moduleUrl('export const VEHICLES=[];'),
 './store':moduleUrl('export const useWorldStore=()=>{};'),
 './WorldWind':moduleUrl('export const windUniforms={uWindTime:{value:0},uWindStrength:{value:1}};'),
 './WorldLandform':moduleUrl('export const GRID={nx:16,nz:16,minX:-4,minZ:-4};'),
};
const hook=registerHooks({
 resolve(specifier,context,next){
  if(context.parentURL===grassUrl){
   if(stubs[specifier])return {url:stubs[specifier],shortCircuit:true};
   if(specifier==='./alpha-mine-flora')return next(new URL('./alpha-mine-flora.ts',import.meta.url).href,context);
  }
  if(context.parentURL===materialUrl){
   if(specifier==='./WorldNight')return {url:clockUrl,shortCircuit:true};
   if(specifier==='./WorldCraftMaterials')return next(new URL('./WorldCraftMaterials.ts',import.meta.url).href,context);
  }
  return next(specifier,context);
 },
 load(url,context,next){
  if(url===grassUrl)return {format:'module',shortCircuit:true,source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{
   compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX},
  }).outputText};
  return next(url,context);
 },
});
const {grassTuftGeometry,grassMaterial,GRASS_PROFILE}=await import('./WorldGrass.tsx');
const {mineSurfaceMaterial,MINE_NIGHT_BOUNCE}=await import('./WorldMineMaterial.ts');
const {night}=await import(clockUrl);
hook.deregister();
const compile=material=>{
 const shader={uniforms:{},vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader};
 material.onBeforeCompile(shader,null);return shader;
};

test('rosettes and stemmed flowers retain the 15-triangle grass budget and finite connected roots',()=>{
 const banks=quarryFloraBanks();
 for(const name of ['tuft','leaf','bloom']){
  const p=banks[name];assert.equal(p.length,15*3*3);assert.ok(p.every(Number.isFinite));
  for(let i=0;i<p.length;i+=9){
   const a=p.slice(i,i+3),b=p.slice(i+3,i+6),c=p.slice(i+6,i+9),u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]);
   const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
   assert.ok(Math.hypot(...cross)>1e-7,`${name} degenerate ${i/9}`);
  }
 }
 const ys=name=>banks[name].filter((_,i)=>i%3===1);
 assert.ok(Math.max(...ys('leaf'))<.25);assert.ok(Math.max(...ys('bloom'))>.4);
 assert.equal(Math.min(...ys('bloom')),0);assert.equal(banks.colour.length,banks.bloom.length);
});

test('crowns have low/high tiers, folded broad leaves, and two separately rooted flower heads',()=>{
 const b=quarryFloraBanks();
 const points=name=>Array.from({length:b[name].length/3},(_,i)=>b[name].slice(i*3,i*3+3));
 const tuft=points('tuft'),leaf=points('leaf'),bloom=points('bloom');
 assert.ok(new Set(tuft.filter(p=>p[1]>.19).map(p=>p[1].toFixed(3))).size>=5,'graduated blade heights');
 assert.ok(leaf.some(p=>p[1]>.2)&&leaf.some(p=>Math.hypot(p[0],p[2])>.34),'inner crown above outer rosette');
 for(let k=0;k<7;k++){
  const [root,margin,tip]=leaf.slice(k*6,k*6+3);
  assert.ok(Math.hypot(margin[0]-root[0],margin[2]-root[2])>.12);
  assert.ok(margin[1]<(root[1]+tip[1])/2,'margin below the folded root-to-tip ridge');
 }
 for(const [start,height] of [[0,.34],[21,.43]]){
  assert.equal(bloom[start][1],0);assert.equal(bloom[start+1][1],0);
  assert.equal(bloom[start+2][1],height);
  assert.ok(bloom.slice(start+3,start+21).every(p=>p[1]>=height&&p[1]<=height+.013));
 }
});

test('detail codes fit an exact float and carry consistent phases across each connected tuft blade',()=>{
 const b=quarryFloraBanks();assert.equal(b.detail.length,45);assert.ok(b.detail.every(v=>Number.isInteger(v)&&v>=0&&v<=490));
 assert.deepEqual(Array.from(new Float32Array(b.detail)),b.detail,'lossless GPU Float32 packing');
 for(const packed of b.detail)for(const divisor of [1,4,16])assert.ok([0,.5,1].includes(Math.floor(packed/divisor)%4*.5));
 for(let blade=0;blade<8;blade++){
  const start=blade*6,count=blade===7?3:6;
  const phases=Array.from({length:count},(_,i)=>Math.floor(b.detail[start+i]/64)/8);
  assert.equal(new Set(phases).size,1);
 }
});

test('new silhouettes fit the existing one-metre culling sphere even at full wind or full press',()=>{
 const banks=quarryFloraBanks(),maxScale=(.7+.75)*(.82+.3);
 for(const name of ['tuft','leaf','bloom'])for(let i=0;i<banks[name].length;i+=3){
  const [x,y,z]=banks[name].slice(i,i+3);
  // Conservative horizontal alignment: radial reach + press + both peak gust terms.
  // Squared length is convex in bend, so the two endpoints bound all intermediate bends.
  for(const bend of [0,1]){
   const radius=Math.hypot(x,z)*maxScale+y*bend*1.15+(.06+.025)*(1-bend*.85)*y/.42;
   assert.ok(Math.hypot(radius,y*(maxScale-bend*.72))<1,`${name} exceeds conservative frustum bound`);
  }
 }
});
test('quarry plants form all three silhouettes without changing plants elsewhere',()=>{
 const kinds=new Set();const [x,,z]=ALPHA_MINE_ORIGIN;
 for(let a=-20;a<20;a+=.7)for(let b=-45;b<0;b+=.7)kinds.add(quarryFloraKind(x+a,z+b));
 assert.deepEqual([...kinds].sort(),[0,1,2]);assert.equal(quarryFloraKind(60,20),0);
});

test('runtime tuft style preserves the authoring kind contract and leaves other districts unchanged',()=>{
 const styles=new Set();const [x,,z]=ALPHA_MINE_ORIGIN;
 for(let a=-20;a<20;a+=1.3)for(let b=-45;b<0;b+=1.3){
  const style=quarryFloraStyle(x+a,z+b);styles.add(style);
  assert.equal(quarryFloraKind(x+a,z+b),style===3?0:style);
 }
 assert.deepEqual([...styles].sort(),[0,1,2,3]);
 for(const p of [[60,20],[0,0],[-10,18],[90,-30]])assert.equal(quarryFloraStyle(...p),0);
 assert.deepEqual(quarryFloraBanks(),quarryFloraBanks(),'no random per-refill flicker');
});

test('real grass geometry keeps draw/triangle/attribute budgets and the RGB shader regression fix',()=>{
 const geometry=grassTuftGeometry(),material=grassMaterial({});
 try{
  assert.equal(geometry.getAttribute('position').count,45);assert.equal(geometry.index,null);
  for(const name of ['aLeafPosition','aBloomPosition','aBloomColor']){
   assert.equal(geometry.getAttribute(name).count,45,`${name} matches the base bank`);
   assert.equal(geometry.getAttribute(name).itemSize,4);
  }
  const banks=quarryFloraBanks();
  for(let i=0;i<45;i++)for(const [axis,name] of ['aLeafPosition','aBloomPosition','aBloomColor'].entries()){
   assert.ok(Math.abs(geometry.getAttribute(name).getW(i)-banks.tuft[i*3+axis])<1e-7,'tuft position in spare W lanes');
  }
  const staticBytes=Object.entries(geometry.attributes).filter(([name])=>name!=='aFloraKind').reduce((sum,[,a])=>sum+a.array.byteLength,0);
  assert.equal(staticBytes-7*45*3*4,540,'added static bytes vs baseline seven vec3 banks');
  assert.equal(geometry.getAttribute('aFloraKind').count,GRASS_PROFILE.high.cap);
  const slots=Object.keys(geometry.attributes).length+4+1; // Instanced matrix + color.
  assert.equal(slots,13);assert.ok(slots<=16,'no additional attribute slots');
  assert.equal(GRASS_PROFILE.high.cap*45/3,36750);assert.equal(GRASS_PROFILE.balanced.cap*45/3,27000);
  const shader=compile(material);
  assert.match(shader.vertexShader,/if\(aFloraKind>2\.5\)transformed=vec3\(aLeafPosition\.w,aBloomPosition\.w,aBloomColor\.w\)/);
  assert.match(shader.vertexShader,/vColor\.rgb=aBloomColor\.rgb/);assert.doesNotMatch(shader.vertexShader,/vColor\s*=\s*aBloomColor/);
  assert.match(shader.vertexShader,/aFloraKind>\.5 \? 0\.0 : aBlade\.y/,'connected flower parts share phase');
  assert.match(shader.vertexShader,/texture2D\(uTrample/);assert.match(shader.vertexShader,/uWindTime \* 1\.9/);
 }finally{geometry.dispose();material.dispose();}
});

test('night readability uses the shared clock on local copies, preserving source finish and shader chain',()=>{
 for(const name of ['AM_ground','AM_stone','AM_wood','AM_vein_host']){
  const source=new MeshStandardMaterial({color:'#756957',roughness:.73});source.name=name;
  let priorCalls=0;source.onBeforeCompile=shader=>{priorCalls++;shader.vertexShader+='\n// authored hook';};
  const color=source.color.clone(),material=mineSurfaceMaterial(source,[2,3,4]);
  try{
   const shader=compile(material);assert.equal(priorCalls,1);assert.match(shader.vertexShader,/authored hook/);
   assert.notEqual(material,source);assert.ok(source.color.equals(color));assert.equal(source.roughness,.73);
   assert.equal(source.emissive.getHex(),0);assert.equal(material.emissive.getHex(),0);
   assert.deepEqual(shader.uniforms.uMineOrigin.value.toArray(),[2,3,4]);
   assert.equal(shader.uniforms.uMineNight,night);night.value=0;assert.equal(shader.uniforms.uMineNight.value,0);
   night.value=.5;assert.equal(shader.uniforms.uMineNight.value,.5);night.value=1;assert.equal(shader.uniforms.uMineNight.value,1);
   assert.match(shader.fragmentShader,/totalEmissiveRadiance \+= diffuseColor\.rgb/);
   assert.match(shader.fragmentShader,/\* uMineNight/);assert.match(shader.vertexShader,/normalMatrix \* normal/);
   assert.match(shader.fragmentShader,name==='AM_wood'?/craftLines/:/minePatch/);
   assert.match(material.customProgramCacheKey(),/v3-night-treads/);
  }finally{night.value=0;material.dispose();source.dispose();}
 }
});

test('night compensation stays small and differentiates treads from risers without lights or textures',()=>{
 for(const [role,[side,top]] of Object.entries(MINE_NIGHT_BOUNCE)){
  assert.ok(side>0&&top>=side&&top<=.06,role);
  if(role!=='earth')assert.ok(top>side*2,'upward tread is distinguishable from its vertical riser');
 }
 const source=new MeshStandardMaterial();source.name='AM_stone';const material=mineSurfaceMaterial(source);
 try{
  const shader=compile(material);
  assert.doesNotMatch(shader.fragmentShader,/sampler2D uMine/,'no new texture lookup');
  assert.equal(material.transparent,source.transparent);assert.equal(material.side,source.side);
 }finally{material.dispose();source.dispose();}
});
