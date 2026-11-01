import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, NoColorSpace, SRGBColorSpace, Texture, Vector3 } from 'three';
import { buildDjcClubGeometry, DJC_DAYBED_ACCESS, DJC_DAYBED_TOP } from './WorldDjcClubGeometry.ts';
import { CLUB_DAYBEDS } from './djc-club-layout.ts';
import { createDjcDaybedVisual, djcDaybedLegacy } from './djc-daybed-visual.ts';

test('streamed furniture preserves all original approach, support, guard and sitting contracts',()=>{
  const original=buildDjcClubGeometry(),streamed=buildDjcClubGeometry({separateDaybeds:true});
  try{
    assert.deepEqual(streamed.colliders,original.colliders);
    assert.deepEqual(streamed.seats,original.seats);
    assert.deepEqual(streamed.daybedApproaches,original.daybedApproaches);
    let removed=0;
    for(const key of Object.keys(original.batches)){
      const count=original.batches[key].attributes.position.count;
      // The wood approach now has an arc-cut landing; furniture extraction still
      // conserves every vertex in the other material batches.
      if(key!=='wood')assert.equal(streamed.batches[key].attributes.position.count+streamed.daybeds[key].attributes.position.count,count);
      removed+=streamed.daybeds[key].attributes.position.count;
    }
    assert.ok(removed>0,'the original daybeds must not remain underneath the new GLB');
  }finally{for(const g of [original,streamed]){for(const m of [...Object.values(g.batches),...Object.values(g.daybeds),g.pool])m.dispose();}}
});

const area=polygon=>Math.abs(polygon.reduce((sum,p,i)=>{
  const q=polygon[(i+1)%polygon.length];return sum+p[0]*q[1]-q[0]*p[1];
},0))/2;
const mattress=Array.from({length:192},(_,i)=>[1.425*Math.cos(i*Math.PI/96),1.425*Math.sin(i*Math.PI/96)]);
const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
function intersection(subject,clip){
  let polygon=subject;
  for(let i=0;i<clip.length&&polygon.length;i++){
    const a=clip[i],b=clip[(i+1)%clip.length],next=[];
    for(let j=0;j<polygon.length;j++){
      const p=polygon[j],q=polygon[(j+1)%polygon.length],dp=cross(a,b,p),dq=cross(a,b,q);
      if(dp>=0)next.push(p);
      if((dp>=0)!==(dq>=0)){
        const t=dp/(dp-dq);next.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);
      }
    }
    polygon=next;
  }
  return polygon;
}
function flatApproachTriangles(geometry,x,z){
  const p=geometry.batches.wood.attributes.position,triangles=[],half=DJC_DAYBED_ACCESS.width/2;
  for(let i=0;i<p.count;i+=3){
    const triangle=Array.from({length:3},(_,j)=>[p.getX(i+j)-x,p.getZ(i+j)-z]);
    if(triangle.every(([px,pz],j)=>Math.abs(p.getY(i+j)-DJC_DAYBED_TOP)<1e-6&&Math.abs(px)<=half+1e-5&&pz>=DJC_DAYBED_ACCESS.landingZ-1e-5&&pz<=DJC_DAYBED_ACCESS.toZ+1e-5))triangles.push(triangle);
  }
  return triangles;
}
const contains=(triangle,p)=>{
  const values=triangle.map((a,i)=>cross(a,triangle[(i+1)%3],p));
  return values.every(v=>v>=-1e-6)||values.every(v=>v<=1e-6);
};
function frontRimAt(x){
  for(let i=96;i<192;i++){
    const a=mattress[i],b=mattress[(i+1)%192];
    if(x>=a[0]&&x<=b[0])return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);
  }
  throw new Error(`No front rim at ${x}`);
}
test('arc-cut landings meet every mattress edge without coplanar overlap or corner gaps',()=>{
  const original=buildDjcClubGeometry(),streamed=buildDjcClubGeometry({separateDaybeds:true});
  try{
    const half=DJC_DAYBED_ACCESS.width/2,landing=DJC_DAYBED_ACCESS.landingZ,end=DJC_DAYBED_ACCESS.toZ;
    const rectangle=[[-half,landing],[half,landing],[half,end],[-half,end]];
    const expectedArea=area(rectangle)-area(intersection(rectangle,mattress));
    for(const [x,z]of CLUB_DAYBEDS){
      const oldTriangles=flatApproachTriangles(original,x,z),triangles=flatApproachTriangles(streamed,x,z);
      assert.ok(oldTriangles.reduce((sum,t)=>sum+area(intersection(t,mattress)),0)>.2,'regression fixture must reproduce the original positive-area overlap');
      const overlap=triangles.reduce((sum,t)=>sum+area(intersection(t,mattress)),0);
      assert.ok(overlap<1e-5,`landing at ${x},${z} overlaps mattress by ${overlap} m²`);
      assert.ok(Math.abs(triangles.reduce((sum,t)=>sum+area(t),0)-expectedArea)<1e-5,'landing must cover the entire original rectangle outside the mattress');
      for(let i=0;i<=64;i++){
        // Include both outside corners and the centre. Float32 world positions
        // have micrometre rounding; probe 0.5 mm either side of the shared rim.
        const px=-half+2*half*i/64,rim=frontRimAt(px);
        assert.ok(triangles.some(t=>contains(t,[px,rim-.0005])),`gap before rim at x=${px}`);
        assert.ok(!triangles.some(t=>contains(t,[px,rim+.0005])),`wood extends through mattress at x=${px}`);
      }
    }
  }finally{for(const g of [original,streamed]){for(const m of [...Object.values(g.batches),...Object.values(g.daybeds),g.pool])m.dispose();}}
});
test('four placements share geometry and borrowed environment while owning only cloned materials',()=>{
  const source=new Group(),nested=new Group(),geometry=new BoxGeometry(.4,.2,.3),material=new MeshStandardMaterial({color:'#298488',emissive:'#ffb060',emissiveIntensity:2});
  const environment=new Texture();let environmentDisposals=0;
  environment.addEventListener('dispose',()=>environmentDisposals++);
  nested.position.set(.2,.3,.4);source.add(nested);
  const mesh=new Mesh(geometry,material);mesh.position.set(.1,.2,.3);nested.add(mesh);
  let geometryDisposals=0,sourceMaterialDisposals=0,ownedMaterialDisposals=0;
  geometry.addEventListener('dispose',()=>geometryDisposals++);material.addEventListener('dispose',()=>sourceMaterialDisposals++);
  const visual=createDjcDaybedVisual(source,environment),instance=visual.instances[0],matrix=new Matrix4(),p=new Vector3();
  assert.equal(instance.geometry,geometry);assert.equal(instance.count,4);assert.equal(visual.materials.length,1);
  assert.notEqual(instance.material,material);
  assert.equal(instance.material.envMap,environment);assert.equal(material.envMap,null);
  visual.setNight(0);assert.equal(instance.material.envMapIntensity,1.5);
  assert.equal(instance.material.emissiveIntensity,.3);
  visual.setNight(.5);assert.equal(instance.material.envMapIntensity,1);
  visual.setNight(1);assert.equal(instance.material.envMapIntensity,.5);
  assert.equal(instance.material.emissiveIntensity,2);assert.equal(material.emissiveIntensity,2);
  CLUB_DAYBEDS.forEach(([x,z],i)=>{instance.getMatrixAt(i,matrix);p.setFromMatrixPosition(matrix);assert.ok(p.distanceTo(new Vector3(x+.3,2,z+.7))<1e-5);});
  visual.materials[0].addEventListener('dispose',()=>ownedMaterialDisposals++);
  visual.dispose();assert.equal(geometryDisposals,0);assert.equal(sourceMaterialDisposals,0);assert.equal(ownedMaterialDisposals,1);assert.equal(environmentDisposals,0);
  geometry.dispose();material.dispose();environment.dispose();
});
test('oblique texture sampling retains source PBR data and shares owned samplers across materials',()=>{
  const source=new Group(),geometry=new BoxGeometry(1,1,1);
  const color=new Texture(),normal=new Texture(),roughness=new Texture();
  color.colorSpace=SRGBColorSpace;normal.colorSpace=NoColorSpace;roughness.colorSpace=NoColorSpace;
  color.repeat.set(3,4);color.offset.set(.2,.3);color.rotation=.4;color.updateMatrix();
  const wood=new MeshStandardMaterial({color:'#956a43',map:color,normalMap:normal,roughnessMap:roughness,metalnessMap:roughness,roughness:.64,metalness:0});
  wood.normalScale.set(.30,.30);
  const cloth=wood.clone();cloth.color.set('#3e8582');cloth.normalScale.set(.75,.75);cloth.roughness=.93;
  source.add(new Mesh(geometry,wood),new Mesh(geometry,cloth));
  const sourceTextures=[color,normal,roughness];let sourceDisposals=0,ownedDisposals=0;
  sourceTextures.forEach(t=>t.addEventListener('dispose',()=>sourceDisposals++));
  const limited=createDjcDaybedVisual(source);
  assert.equal(limited.materials[0].map,color,'unknown renderer capabilities must retain the supported source sampler');limited.dispose();
  const capped=createDjcDaybedVisual(source,null,2);
  assert.equal(capped.materials[0].map.anisotropy,2,'sampling must respect the renderer capability');capped.dispose();
  const visual=createDjcDaybedVisual(source,null,16),[copiedWood,copiedCloth]=visual.materials;
  for(const [original,copied]of [[wood,copiedWood],[cloth,copiedCloth]]){
    assert.deepEqual(copied.color,original.color);assert.deepEqual(copied.normalScale,original.normalScale);
    assert.equal(copied.roughness,original.roughness);assert.equal(copied.metalness,original.metalness);
    assert.equal(copied.emissive.getHex(),0,'cloth and timber must remain non-emissive');
    for(const key of ['map','normalMap','roughnessMap','metalnessMap']){
      assert.notEqual(copied[key],original[key]);assert.equal(copied[key].source,original[key].source);
      assert.equal(copied[key].colorSpace,original[key].colorSpace);assert.deepEqual(copied[key].matrix,original[key].matrix);
      assert.equal(copied[key].anisotropy,4);assert.equal(original[key].anisotropy,1);
      assert.equal(copied[key],copiedWood[key],'one sampler per source texture across the furniture group');
    }
  }
  const owned=new Set([copiedWood.map,copiedWood.normalMap,copiedWood.roughnessMap,copiedWood.metalnessMap]);
  assert.equal(owned.size,3);owned.forEach(t=>t.addEventListener('dispose',()=>ownedDisposals++));
  visual.dispose();assert.equal(ownedDisposals,3);assert.equal(sourceDisposals,0);
  geometry.dispose();wood.dispose();cloth.dispose();sourceTextures.forEach(t=>t.dispose());
});
test('legacy comparison requires explicit QA and does not alter normal play',()=>{
  assert.equal(djcDaybedLegacy('?djcDaybeds=legacy'),false);
  assert.equal(djcDaybedLegacy('?qa=1&djcDaybeds=legacy'),true);
  assert.equal(djcDaybedLegacy('?qa=1'),false);
});
