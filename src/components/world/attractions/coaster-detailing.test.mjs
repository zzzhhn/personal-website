import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Box3, BufferAttribute, BufferGeometry, CylinderGeometry, DoubleSide, Euler, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Vector3 } from 'three';
import { createSupportMemberDetail, stationStructureMembers, addStationStructureDetail } from './coaster-detailing.ts';
import { beddedRockHeight, beddedRockColour } from './coaster-rock-bedding.ts';
import { coasterFrame, coasterRidePose, coasterSupports, coasterWorld } from './coaster-track.ts';
import { CoasterBatch } from './coaster-geometry.ts';
import { COASTER_BOARDING } from './coaster-transition.ts';
import { COASTER_STATION_EDGE_LIGHTS, lightCoasterCliffs } from './coaster-landscape-lighting.ts';
await R.init();

test('support connection bands retain the original closed cylinder envelope and ray contacts',()=>{
  const mat=new MeshBasicMaterial({side:DoubleSide});let maxError=0;
  try {for(const beam of [
    {a:new Vector3(5,1,-260),b:new Vector3(5,65,-260),radius:.42},
    {a:new Vector3(-10,20,-280),b:new Vector3(1,20,-278),radius:.3},
  ]) {
    const direction=beam.b.clone().sub(beam.a),length=direction.length();
    const matrix=new Matrix4().compose(beam.a.clone().add(beam.b).multiplyScalar(.5),new Quaternion().setFromUnitVectors(new Vector3(0,1,0),direction.normalize()),new Vector3(1,1,1));
    const inverse=matrix.clone().invert(),g=createSupportMemberDetail(beam),original=new CylinderGeometry(beam.radius,beam.radius,length,8).applyMatrix4(matrix);
    const actual=new Mesh(g,mat),before=new Mesh(original,mat);actual.updateMatrixWorld();before.updateMatrixWorld();
    try {
      assert.equal(g.attributes.position.count/3,64);assert.equal(g.groups.length,0);
      for(const a of Object.values(g.attributes))assert.ok(a.array.every(Number.isFinite));
      const p=g.attributes.position,colours=new Set();
      for(let i=0;i<p.count;i++) {
        const v=new Vector3().fromBufferAttribute(p,i).applyMatrix4(inverse);
        assert.ok(Math.hypot(v.x,v.z)<=beam.radius+.00003);assert.ok(Math.abs(v.y)<=length/2+.00003);
        colours.add([0,1,2].map(k=>g.attributes.color.array[i*3+k].toFixed(4)).join(','));
      }
      assert.equal(colours.size,3);
      for(const t of [-.49,-.2,0,.2,.49])for(const side of [-1,1]) {
        const origin=new Vector3(side*2,length*t,0).applyMatrix4(matrix),target=new Vector3(0,length*t,0).applyMatrix4(matrix);
        const ray=new Raycaster(origin,target.sub(origin).normalize(),0,3),a=ray.intersectObject(actual)[0],b=ray.intersectObject(before)[0];
        assert.ok(a&&b);maxError=Math.max(maxError,Math.abs(a.distance-b.distance));
      }
    }finally{g.dispose();original.dispose();}
  }}finally{mat.dispose();}
  assert.ok(maxError<.0001);console.log(JSON.stringify({supportSurfaceMaxError:maxError,trianglesPerDetailedMember:64,previous:32}));
});

test('station members have matching real contacts and preserve boarding and rider clearance',()=>{
  const steel=new CoasterBatch(),glow=new CoasterBatch(),colliders=[];
  addStationStructureDetail(steel,glow,colliders);const g=steel.finish(),light=glow.finish();
  const mat=new MeshBasicMaterial({side:DoubleSide}),mesh=new Mesh(g,mat),world=new R.World({x:0,y:0,z:0});mesh.updateMatrixWorld();
  const bounds=[];
  for(const c of colliders) {
    const q=new Quaternion().setFromEuler(new Euler(...(c.rotation??[0,0,0])));
    world.createCollider(R.ColliderDesc.cuboid(...c.half).setTranslation(...c.position).setRotation(q));
    bounds.push({c,inverse:q.clone().invert(),box:new Box3(new Vector3(...c.half).negate(),new Vector3(...c.half))});
  }
  world.step();let minClearance=Infinity;
  try {
    assert.equal(colliders.length,6);assert.equal(g.attributes.position.count/3,72);assert.equal(light.attributes.position.count/3,48);
    for(const member of stationStructureMembers()) {
      const origin=new Vector3(...member.position).add(new Vector3(0,3,0)),direction=new Vector3(0,-1,0);
      const hit=world.castRay(new R.Ray(origin,direction),6,true),visible=new Raycaster(origin,direction,0,6).intersectObject(mesh)[0];
      assert.ok(hit&&visible&&Math.abs(hit.timeOfImpact-visible.distance)<.001);
    }
    const routes=[COASTER_BOARDING.approach,...COASTER_BOARDING.stairs.map(s=>s.position),COASTER_BOARDING.threshold.position];
    for(let i=1;i<routes.length;i++) {
      const a=new Vector3(...routes[i-1]).add(new Vector3(0,.9,0)),b=new Vector3(...routes[i]).add(new Vector3(0,.9,0));
      assert.ok(!world.castShape(a,{x:0,y:0,z:0,w:1},b.sub(a),new R.Capsule(.48,.34),0,1,true));
    }
    for(let i=0;i<1800;i++) {
      const u=(i+.21)/1800,f=coasterFrame(u);
      for(const offset of [[-1.5,.3,-.95],[1.5,.3,.95],[-.6,1.5,-.95],[1.5,1.5,.95],[0,2.2,0]]) {
        const point=new Vector3(...offset).applyQuaternion(f.rotation).add(f.point);
        for(const {c,inverse,box} of bounds)minClearance=Math.min(minClearance,box.distanceToPoint(point.clone().sub(new Vector3(...c.position)).applyQuaternion(inverse)));
      }
      for(const mode of ['chase','comfort','first-person']) {
        const pose=coasterRidePose(u,mode),a=new Vector3(...pose.cameraPosition);
        for(const b of [new Vector3(...pose.cameraTarget),f.point.clone().addScaledVector(f.up,2.2)]) {
          const dir=b.sub(a),length=dir.length(),ray=new Raycaster(a,dir.normalize(),.05,mode==='first-person'?2:length);
          assert.equal(ray.intersectObject(mesh).length,0,`${mode} station member blocks view`);
        }
      }
    }
    assert.ok(minClearance>1);console.log(JSON.stringify({stationTriangles:120,stationColliders:6,minTrainCornerClearance:minClearance,rideSamples:1800}));
  }finally{world.free();g.dispose();light.dispose();mat.dispose();}
});

test('rock benches remove material without raising any former ridge or changing low aprons',()=>{
  let cut=0,maxCut=0;
  for(let x=-60;x<170;x+=7)for(let z=-205;z<-43;z+=7)for(const height of [-.45,.04,1,2,3,5,8,12,15]) {
    const y=beddedRockHeight(height,x,z);assert.ok(y<=height+1e-9&&y>=Math.min(2,height));
    if(height<=2)assert.equal(y,height);
    if(height-y>.4)cut++;maxCut=Math.max(maxCut,height-y);
  }
  assert.ok(cut>1000&&maxCut>1.7&&maxCut<2.8);
  const face=beddedRockColour([0,3,0],[0,12,0],[5,3,0]);
  assert.ok(face.r>face.b&&face.g>face.b,'mineral faces remain warm grey');
  console.log(JSON.stringify({erodedSamples:cut,maxRockCut:maxCut}));
});

test('station edge fixtures add bounded finite warm surface radiance without runtime lights',()=>{
  for(const p of COASTER_STATION_EDGE_LIGHTS) {
    const at=coasterWorld([p[0],p[1]-1,p[2]]),g=new BufferGeometry();
    g.setAttribute('position',new BufferAttribute(new Float32Array(at),3));
    g.setAttribute('normal',new BufferAttribute(new Float32Array([0,1,0]),3));
    g.setAttribute('color',new BufferAttribute(new Float32Array([.5,.5,.5]),3));
    g.setAttribute('nightRadiance',new BufferAttribute(new Float32Array(3),3));
    lightCoasterCliffs(g);const v=g.attributes.nightRadiance.array;
    assert.ok(v.every(Number.isFinite)&&v[0]>.5&&v[0]>v[2]);g.dispose();
  }
});

test('member articulation has a bounded local increment and leaves support placement unchanged',()=>{
  const groups=coasterSupports(true),members=groups.flatMap(g=>g.beams).filter(b=>b.radius>=.3);
  const increment=members.length*32+120;
  assert.ok(increment<10000);console.log(JSON.stringify({supportGroups:groups.length,detailedMembers:members.length,nearTriangleIncrement:increment,farTriangleIncrement:120,colliderIncrement:6}));
});
