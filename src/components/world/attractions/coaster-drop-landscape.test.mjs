import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Triangle, Vector3 } from 'three';
import { createCoasterTerrainRelief } from './coaster-terrain-relief.ts';
import { coasterFrame, coasterRidePose, coasterSupports } from './coaster-track.ts';

await R.init();
const relief=createCoasterTerrainRelief(),north=relief.formations.find(f=>f.id==='thrill-north-escarpment');
const world=new R.World({x:0,y:0,z:0});
world.createCollider(R.ColliderDesc.trimesh(relief.vertices,relief.indices.slice(north.firstTriangle*3,(north.firstTriangle+north.triangleCount)*3)));
world.step();
test.after(()=>{world.free();relief.geometry.dispose();});

test('local scarp, rooted groves and soil aprons stay inside the existing footprint and bounded budget',t=>{
  const {rocks,trees,shrubs,detailTriangles,savedApronTriangles}=relief.dropSample;
  assert.ok(rocks>=4&&trees>=6&&shrubs>=12);
  assert.ok(detailTriangles<=1000&&savedApronTriangles>=300);
  assert.ok(relief.triangleCount<=25226,'local additions may not consume the far scene budget');
  const p=relief.geometry.attributes.position,c=relief.geometry.attributes.color;let soilArea=0;
  for(let i=north.firstTriangle;i<north.firstTriangle+north.triangleCount;i++) {
    const a=new Vector3().fromBufferAttribute(p,i*3),b=new Vector3().fromBufferAttribute(p,i*3+1),d=new Vector3().fromBufferAttribute(p,i*3+2),triangle=new Triangle(a,b,d);
    for(const v of [a,b,d])assert.ok(v.x>=-15.01&&v.x<=98.01&&v.z>=-385.01&&v.z<=-312.99,'sample expanded outside north escarpment');
    if(Math.max(a.y,b.y,d.y)<1.2&&triangle.getNormal(new Vector3()).y>.99) {
      assert.ok(c.getY(i*3)>c.getX(i*3)+.005,'a low apron remains bare mineral grey');soilArea+=triangle.getArea();
    }
  }
  assert.ok(soilArea>500);
  t.diagnostic(JSON.stringify({rocks,trees,shrubs,detailTriangles,savedApronTriangles,soilApronArea:soilArea,totalTerrainTriangles:relief.triangleCount}));
});

test('actual scarp and foliage contacts match visible surfaces and preserve both support aprons',t=>{
  const material=new MeshBasicMaterial({side:DoubleSide}),mesh=new Mesh(relief.geometry,material);mesh.updateMatrixWorld();let samples=0,maxError=0;
  try {
    for(let x=-51.37;x<30;x+=8.3)for(let z=-181.21;z<-129;z+=9.7){
      const origin=new Vector3(x+50,35,z-195),direction=new Vector3(0,-1,0),hit=world.castRay(new R.Ray(origin,direction),40,true);
      if(!hit)continue;
      const visible=new Raycaster(origin,direction,0,40).intersectObject(mesh)[0];assert.ok(visible);
      maxError=Math.max(maxError,Math.abs(hit.timeOfImpact-visible.distance));samples++;
    }
    assert.ok(samples>30&&maxError<.001);
    for(const near of [true,false])for(const {a,b} of coasterSupports(near))for(const p of [a,b])for(const [dx,dz] of [[0,0],[-1.4,0],[1.4,0],[0,-1.4],[0,1.4]]) {
      const hit=world.castRay(new R.Ray({x:p.x+dx,y:80,z:p.z+dz},{x:0,y:-1,z:0}),90,true);
      if(hit)assert.ok(80-hit.timeOfImpact<=1.051,'plant or rock buried a support apron');
    }
    t.diagnostic(JSON.stringify({surfaceSamples:samples,maxContactErrorM:maxError}));
  }finally{material.dispose();}
});

test('full train envelope, seated head and preset sight lines clear the actual local terrain and canopy meshes',()=>{
  for(let i=0;i<2400;i++) {
    const u=(i+.317)/2400,f=coasterFrame(u);
    assert.ok(!world.intersectionWithShape(f.point.clone().addScaledVector(f.up,.8),f.rotation,new R.Cuboid(1.5,.5,.95)),`train hit at ${u}`);
    for(const lift of [-.45,.8,2.2])assert.ok(!world.intersectionWithShape(f.point.clone().addScaledVector(f.up,lift),f.rotation,new R.Ball(1.7)),`ride margin lost at ${u}`);
    for(const mode of ['chase','comfort','first-person']) {
      const pose=coasterRidePose(u,mode),a=new Vector3(...pose.cameraPosition);
      const targets=[new Vector3(...pose.cameraTarget)];if(mode!=='first-person')targets.push(f.point.clone().addScaledVector(f.up,2.2));
      for(const target of targets){const d=target.sub(a),length=d.length();assert.ok(!world.castRay(new R.Ray(a,d.normalize()),mode==='first-person'?2:length,true),`${mode} view blocked at ${u}`);}
    }
  }
});
