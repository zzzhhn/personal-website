import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Triangle, Vector3 } from 'three';
import { createCoasterTerrainRelief } from './coaster-terrain-relief.ts';
import { createDropRock, dropSurfaceColours, DROP_ROCK_BEDS } from './coaster-drop-landscape.ts';
import { coasterFrame, coasterRidePose, coasterSupports } from './coaster-track.ts';

await R.init();
const relief=createCoasterTerrainRelief(),north=relief.formations.find(f=>f.id==='thrill-north-escarpment');
const world=new R.World({x:0,y:0,z:0});
world.createCollider(R.ColliderDesc.trimesh(relief.vertices,relief.indices.slice(north.firstTriangle*3,(north.firstTriangle+north.triangleCount)*3)));
world.step();
test.after(()=>{world.free();relief.geometry.dispose();});

test('local scarp and soil aprons keep their footprint with no static replacement foliage',t=>{
  const {rocks,detailTriangles,savedApronTriangles}=relief.dropSample;
  assert.equal(rocks,4);
  assert.equal(north.triangleCount,north.terrainTriangleCount,'foliage must live in the shared wind/LOD pipeline');
  assert.equal(detailTriangles,560,'material and flake shaping must not add triangles');assert.ok(savedApronTriangles>=300);
  assert.ok(relief.triangleCount<=25226,'local additions may not consume the far scene budget');
  const p=relief.geometry.attributes.position,c=relief.geometry.attributes.color;let soilArea=0;
  for(let i=north.firstTriangle;i<north.firstTriangle+north.triangleCount;i++) {
    const a=new Vector3().fromBufferAttribute(p,i*3),b=new Vector3().fromBufferAttribute(p,i*3+1),d=new Vector3().fromBufferAttribute(p,i*3+2),triangle=new Triangle(a,b,d);
    for(const v of [a,b,d])assert.ok(v.x>=-15.01&&v.x<=98.01&&v.z>=-385.01&&v.z<=-312.99,'sample expanded outside north escarpment');
    if(Math.max(a.y,b.y,d.y)<1.2&&Math.max(a.y,b.y,d.y)-Math.min(a.y,b.y,d.y)<.0001&&triangle.getNormal(new Vector3()).y>.99) {
      assert.ok(c.getY(i*3)>c.getX(i*3)+.005,'a low apron remains bare mineral grey');soilArea+=triangle.getArea();
    }
  }
  assert.ok(soilArea>500);
  t.diagnostic(JSON.stringify({rocks,detailTriangles,savedApronTriangles,soilApronArea:soilArea,totalTerrainTriangles:relief.triangleCount}));
});

test('a representative bed has closed skewed scarps and a few low detached flakes instead of concentric bands',()=>{
  const bed=DROP_ROCK_BEDS[0],rock=createDropRock(bed,0,()=>.3,()=>50);assert.ok(rock);
  const adjacency=rock.points.map(()=>new Set()),edges=new Map();
  for(const [a,b,c] of rock.faces){
    assert.ok(new Triangle(...[a,b,c].map(i=>new Vector3(...rock.points[i]))).getArea()>.00001);
    for(const [u,v] of [[a,b],[b,c],[c,a]]){adjacency[u].add(v);adjacency[v].add(u);const key=[Math.min(u,v),Math.max(u,v)].join(':');const e=edges.get(key)??[0,0];e[0]++;e[1]+=u<v?1:-1;edges.set(key,e);}
  }
  for(const [count,orientation] of edges.values())assert.deepEqual([count,orientation],[2,0]);
  const seen=new Set(),components=[];
  for(let i=0;i<rock.points.length;i++)if(!seen.has(i)){
    const ids=[],todo=[i];seen.add(i);while(todo.length){const at=todo.pop();ids.push(at);for(const next of adjacency[at])if(!seen.has(next)){seen.add(next);todo.push(next);}}
    components.push(ids);
  }
  assert.equal(components.length,4,'one main mass and three purposeful toe flakes');
  const main=components[0].map(i=>rock.points[i]);
  const wallHeights=main.filter(p=>p[1]>1&&p[1]<bed[4]-1).map(p=>p[1]);
  assert.ok(Math.max(...wallHeights)-Math.min(...wallHeights)>3,'scarp joints still make one horizontal band');
  for(const ids of components.slice(1)){
    const points=ids.map(i=>rock.points[i]),ys=points.map(p=>p[1]);
    assert.ok(Math.min(...ys)<.3&&Math.max(...ys)<1,'flakes must be embedded at the toe');
    assert.ok(new Set(ys.map(y=>y.toFixed(3))).size>=3,'flake roof must be inclined');
    const ordered=[...ids].sort((a,b)=>a-b).map(i=>rock.points[i]),lower=ordered.slice(0,5),upper=ordered.slice(5);
    const area=ring=>Math.abs(ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[2]-q[0]*p[2];},0))/2;
    assert.ok(area(upper)<area(lower)*.55,'parallel caps still read as cut stone blocks');
    assert.ok(Math.min(...upper.map(p=>p[1]))<.36,'one end must die into the ground');
  }
  assert.ok(Math.max(...main.map(p=>p[1]))<=bed[4]+.151,'scarp exceeds the retained height envelope');
  const ground=(x,z)=>.3+(x-bed[0])*.015+(z-bed[1])*.02,sloped=createDropRock(bed,0,ground,()=>50);
  assert.equal(sloped.points.length,rock.points.length);
  for(const ids of components.slice(1)){
    const ordered=[...ids].sort((a,b)=>a-b).map(i=>sloped.points[i]);
    ordered.forEach(([x,y,z],i)=>{
      const gap=y-ground(x,z);
      assert.ok(i<5?Math.abs(gap+.16)<1e-9:gap>0&&gap<.65,'a flake corner floats above or cuts through its sloped support');
    });
  }
});

test('north material colours cross shared edges continuously while rock facets remain',t=>{
  const c=relief.geometry.attributes.color,n=relief.geometry.attributes.normal,seen=new Map();let shared=0,creased=0;
  for(let i=north.firstTriangle*3;i<(north.firstTriangle+north.triangleCount)*3;i++){
    const id=relief.indices[i],colour=[c.getX(i),c.getY(i),c.getZ(i)],normal=[n.getX(i),n.getY(i),n.getZ(i)],before=seen.get(id);
    assert.ok(colour.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
    if(relief.vertices[id*3+1]<.151)continue; // Retained buried closure uses the original global palette.
    if(before){
      assert.deepEqual(colour,before.colour,'triangle-local material seam');shared++;
      if(normal.some((value,j)=>Math.abs(value-before.normal[j])>.05))creased++;
    }else seen.set(id,{colour,normal});
  }
  assert.ok(shared>1000&&creased>100,'keep geometric facets, not face-by-face paint');
  const p=[[0,2,0],[4,2,0],[4,2,4],[0,2,4]],a=dropSurfaceColours(p,[[0,2,1],[0,3,2]]),b=dropSurfaceColours(p,[[0,3,1],[1,3,2]]);
  a.forEach((colour,i)=>assert.ok(colour.toArray().every((v,j)=>Math.abs(v-b[i].toArray()[j])<1e-10),'a different diagonal changed the mineral field'));
  t.diagnostic(JSON.stringify({sharedCorners:shared,facetedCorners:creased}));
});

test('gentle north ground shares continuous unit normals while steep cuts and rock beds stay flat',t=>{
  const p=relief.geometry.attributes.position,n=relief.geometry.attributes.normal,night=relief.geometry.attributes.nightRadiance;
  const rocksBegin=north.firstTriangle+north.triangleCount-relief.dropSample.detailTriangles,seen=new Map();
  let shared=0,smoothedCorners=0,steepFaces=0,rockFaces=0;
  for(let face=north.firstTriangle;face<north.firstTriangle+north.triangleCount;face++){
    const at=face*3,points=[0,1,2].map(j=>new Vector3().fromBufferAttribute(p,at+j));
    const flat=new Triangle(...points).getNormal(new Vector3());
    const gentle=face<rocksBegin&&flat.y>=Math.SQRT1_2;
    if(!gentle){if(face>=rocksBegin)rockFaces++;else if(flat.y>0)steepFaces++;}
    for(let j=0;j<3;j++){
      const v=new Vector3().fromBufferAttribute(n,at+j);
      assert.ok(Math.abs(v.length()-1)<1e-6);
      if(!gentle){assert.ok(v.distanceTo(flat)<1e-5,'a cliff or rock face was rounded');continue;}
      assert.ok(v.y>=Math.SQRT1_2-1e-6,'ground normal no longer follows its gentle slopes');
      if(v.distanceTo(flat)>.01)smoothedCorners++;
      const id=relief.indices[at+j],value=[...v.toArray(),night.getX(at+j),night.getY(at+j),night.getZ(at+j)],before=seen.get(id);
      if(before){assert.deepEqual(value,before,'ground normal or existing night response splits at a shared corner');shared++;}else seen.set(id,value);
    }
  }
  assert.ok(shared>1000&&smoothedCorners>500&&steepFaces>20);
  assert.equal(rockFaces,560);
  t.diagnostic(JSON.stringify({sharedGentleCorners:shared,smoothedCorners,steepFaces,flatRockFaces:rockFaces}));
});

test('actual scarp contacts match visible surfaces and preserve both support aprons',t=>{
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

test('full train envelope, seated head and preset sight lines clear the actual local terrain meshes',()=>{
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
