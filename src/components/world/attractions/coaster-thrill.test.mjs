import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Mesh, MeshBasicMaterial, DoubleSide, Raycaster } from 'three';
import { THRILL_ELEMENTS, THRILL_LENGTH, THRILL_CREST, THRILL_DROP_END, thrillCurve } from './coaster-thrill-layout.ts';
import { thrillFrame, thrillSeat, thrillRidePose } from './coaster-thrill-frame.ts';
import { THRILL_DURATION, THRILL_RUN, thrillDistanceAt, thrillSpeedAt } from './coaster-thrill-motion.ts';
import { buildThrillTrack, pointSegmentDistance } from './coaster-thrill-geometry.ts';
import { coasterFrame, COASTER_LENGTH } from './coaster-track.ts';

test('the apparatus expands in three dimensions and its first drop passes vertical',()=>{
  const p=Array.from({length:2400},(_,i)=>thrillFrame(i/2400).point);
  const span=axis=>Math.max(...p.map(v=>v[axis]))-Math.min(...p.map(v=>v[axis]));
  assert.ok(span('x')>200&&span('z')>240);
  assert.ok(Math.max(...p.map(v=>v.y))>84&&Math.max(...p.map(v=>v.y))<87);
  assert.ok(Math.min(...p.map(v=>v.y))>1.6);
  assert.ok(THRILL_LENGTH>950*1.7, 'more than 1.7 times the approximately 950 m v3 route');
  let drop=0;
  for(let i=0;i<=1000;i++){const f=thrillFrame(THRILL_CREST+(THRILL_DROP_END-THRILL_CREST)*i/1000);drop=Math.max(drop,Math.atan2(-f.forward.y,f.forward.x)*180/Math.PI);}
  assert.ok(drop>104&&drop<112,`drop angle ${drop}`);
  assert.ok(thrillCurve.getPointAt(0).distanceTo(thrillCurve.getPointAt(1))<1e-8);
  assert.ok(thrillFrame(0).point.distanceTo(coasterFrame(0).point)<1e-8);
  assert.ok(thrillFrame(0).forward.dot(coasterFrame(0).forward)>.99999);
});

test('rails and seats have continuous full orientations through every vertical tangent',()=>{
  let previous=thrillFrame(0);
  for(let i=1;i<=7200;i++) {
    const u=i/7200,f=thrillFrame(u),seat=thrillSeat(u);
    assert.ok([...f.point,...f.rotation].every(Number.isFinite));
    assert.ok(f.rotation.angleTo(previous.rotation)<.1,`orientation jumps at ${u}`);
    assert.ok(Math.abs(f.forward.dot(f.up))<1e-9);
    assert.ok(Math.abs(f.rotation.length()-1)<1e-9);
    assert.ok(seat.position.distanceTo(f.point.clone().addScaledVector(f.up,.72))<1e-9);
    assert.ok(seat.rotation.angleTo(f.rotation)<1e-7);
    previous=f;
  }
});

test('eight real inverted seat episodes occur across distinct authored elements',()=>{
  let total=0;
  for(const e of THRILL_ELEMENTS) {
    let episodes=0,was=false,lowest=1;
    for(let i=0;i<=600;i++) {
      const f=thrillFrame(e.start+(e.end-e.start)*i/600),up=new Vector3(0,1,0).applyQuaternion(f.rotation);
      const inverted=up.y<-.25;if(inverted&&!was)episodes++;was=inverted;lowest=Math.min(lowest,up.y);
    }
    assert.equal(episodes,e.id==='double-corkscrew'?2:1,e.id);assert.ok(lowest<-.75,e.id);total+=episodes;
  }
  assert.equal(total,8);
  const stall=THRILL_ELEMENTS.find(e=>e.kind==='stall');
  for(let t=.32;t<.68;t+=.02)assert.ok(thrillFrame(stall.start+(stall.end-stall.start)*t).up.y<-.9);
});

test('track crossings clear the car and inverted rider, not just the centre lines',()=>{
  const n=1600,frames=Array.from({length:n},(_,i)=>thrillFrame(i/n));
  let min=Infinity;
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++) {
    if(Math.min(j-i,n-j+i)*THRILL_LENGTH/n<15)continue;
    const a=frames[i],b=frames[j];
    min=Math.min(min,a.point.distanceTo(b.point));
    for(const f of [a,b]) {
      const other=f===a?b:a,head=f.point.clone().addScaledVector(f.up,2.2);
      assert.ok(head.distanceTo(other.point)>5,`rider/rail at ${i},${j}`);
    }
  }
  assert.ok(min>8,`track clearance ${min}`);
});

test('timing preserves drop momentum and does not time-compress the expanded track',()=>{
  // The separated eastern loop needs a grade-separated approach. Keep the ~2 km
  // sample below two minutes, while preserving the user's fast first-drop run.
  assert.ok(THRILL_DURATION>80&&THRILL_DURATION<120);
  assert.equal(thrillDistanceAt(0),0);assert.equal(thrillDistanceAt(THRILL_DURATION),1);
  assert.equal(thrillDistanceAt(27.5),thrillDistanceAt(28.5));
  assert.ok(thrillSpeedAt(THRILL_DURATION)<.01);
  const low=THRILL_RUN.filter(p=>p.u>=THRILL_DROP_END&&p.u<=THRILL_ELEMENTS[0].start);
  assert.ok(Math.min(...low.map(p=>p.speed))>7.64*3);
  for(let i=1;i<THRILL_RUN.length;i++) {
    const a=THRILL_RUN[i-1],b=THRILL_RUN[i],acc=(b.speed-a.speed)/(b.time-a.time);
    assert.ok(acc<=7.501&&acc>=-5.501);assert.ok(b.time>a.time);
  }
  let previous=0;
  for(let t=0;t<THRILL_DURATION;t+=.01){const u=thrillDistanceAt(t);assert.ok(u>=previous-1e-10&&u<=1);previous=u;}
});

test('sample supports clear actual train corners and geometry remains bounded',()=>{
  const {geometry,supportSegments}=buildThrillTrack();
  try {
    assert.ok(geometry.attributes.position.count/3<150000);
    assert.ok(supportSegments.length>60&&supportSegments.length<300);
    for(let i=0;i<3600;i++) {
      const f=thrillFrame(i/3600);
      for(const corner of [[-1.5,.3,-.95],[1.5,.3,.95],[-.6,1.5,-.95],[1.5,1.5,.95],[0,2.2,0]]) {
        const p=new Vector3(...corner).applyQuaternion(f.rotation).add(f.point);
        for(const s of supportSegments)assert.ok(pointSegmentDistance(p,s.a,s.b)>s.radius+.1,`support contact at ${i/3600}`);
      }
    }
  } finally {geometry.dispose();}
});

test('default chase shows the inverted rider and first-person near field stays clear',()=>{
  const {geometry}=buildThrillTrack(),material=new MeshBasicMaterial({side:DoubleSide});
  const mesh=new Mesh(geometry,material),ray=new Raycaster();mesh.updateMatrixWorld();
  try {
    for(let t=0;t<THRILL_DURATION;t+=.2)for(const first of [false,true]) {
      const u=thrillDistanceAt(t),pose=thrillRidePose(u,first),f=thrillFrame(u),camera=new Vector3(...pose.cameraPosition);
      const target=first?new Vector3(...pose.cameraTarget):f.point.clone().addScaledVector(f.up,1.8),direction=target.sub(camera);
      ray.set(camera,direction.clone().normalize());ray.near=.05;ray.far=first?2:direction.length();
      assert.equal(ray.intersectObject(mesh,false).length,0,`${first?'eye':'chase'} occluded at ${t}`);
      if(!first)assert.deepEqual(pose.cameraUp,[0,1,0]);
    }
  } finally {geometry.dispose();material.dispose();}
});
