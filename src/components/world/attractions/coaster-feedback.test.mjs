import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { coasterFrame, coasterRidePose, coasterDistanceAt, COASTER_DURATION } from './coaster-track.ts';
import { COASTER_BOARDING as B, coasterAtBoardingEntrance, coasterBoardingGround,
  createCoasterTransition, captureCoasterStart, advanceCoasterTransition } from './coaster-transition.ts';
import { COASTER_CAR_PANELS } from './coaster-access.ts';
import { THRILL_LENGTH } from './coaster-thrill-layout.ts';
import { THRILL_BASE_DURATION, THRILL_DURATION, THRILL_SPEED_WINDOW as W, thrillBaseDistanceAt,
  thrillDistanceAt, thrillRideTimeAt, thrillSourceTimeAt, thrillSpeedMultiplierAt } from './coaster-thrill-motion.ts';
import { AttractionCameraOrientation, attractionCameraPose, attractionLook } from './attraction-camera.ts';

test('boarding treads, doorway, entrance and exit all use train-right with matching foot probes',()=>{
  const f=coasterFrame(0),inside=new Vector3(...B.inside),right=new Vector3(Math.sin(B.yaw),0,Math.cos(B.yaw));
  assert.ok(right.dot(f.side)>.99);
  for(const p of [B.approach,B.exit,B.threshold.position,...B.stairs.map(s=>s.position)])
    assert.ok(new Vector3(...p).sub(inside).dot(right)>.9);
  assert.ok(coasterAtBoardingEntrance(B.approach));
  const mirrored=inside.clone().multiplyScalar(2).sub(new Vector3(...B.approach));mirrored.y=B.platformY;
  assert.equal(coasterAtBoardingEntrance(mirrored.toArray()),false);
  for(const s of B.stairs)assert.equal(coasterBoardingGround(s.position[0],s.position[2]),s.top);
  const wallAt=(z)=>COASTER_CAR_PANELS.some(p=>Math.abs(p.at[0]-.82)<p.size[0]/2&&Math.abs(p.at[1]-.75)<p.size[1]/2&&Math.abs(p.at[2]-z)<p.size[2]/2);
  assert.equal(wallAt(.85),false);assert.equal(wallAt(-.85),true);
  for(const phase of ['turn-in','turn-out']){
    const pose=coasterRidePose(0,'chase'),t=createCoasterTransition(B.approach,0,pose);
    captureCoasterStart(t,B.approach,0);t.phase=phase;
    assert.equal(advanceCoasterTransition(t,.1,false,pose).clip,'TurnR');
  }
});

test('the post-drop plateau is exactly 1.25x with one-second bounded ramps outside the original brake',t=>{
  assert.ok(W.start>29&&W.sourceEnd>W.start&&W.sourceEnd<THRILL_BASE_DURATION);
  assert.ok(W.sourcePlateauEnd>W.sourcePlateauStart);
  assert.equal(W.transitionSeconds,1);
  assert.ok(W.transitionSeconds>=.8&&W.transitionSeconds<=1.2);
  assert.ok(Math.abs(W.plateauStart-W.start-W.transitionSeconds)<1e-10);
  assert.ok(Math.abs(W.end-W.plateauEnd-W.transitionSeconds)<1e-10);
  assert.ok(Math.abs(THRILL_DURATION-(THRILL_BASE_DURATION-W.sourceEnd+W.end))<1e-10);
  const epsilon=1e-5;
  for(const [a,b,factor] of [[.1,26.9,1],[29.1,W.start-.01,1],[W.sourcePlateauStart+.01,W.sourcePlateauEnd-.01,1.25],[W.sourceEnd+.01,THRILL_BASE_DURATION-.1,1]]){
    assert.ok(b>a);
    for(let i=0;i<=40;i++){
      const source=a+(b-a)*i/40,ride=thrillRideTimeAt(source);
      assert.ok(Math.abs(thrillSourceTimeAt(ride)-source)<1e-10);
      assert.ok(Math.abs(thrillDistanceAt(ride)-thrillBaseDistanceAt(source))<1e-12);
      const old=(thrillBaseDistanceAt(source+epsilon)-thrillBaseDistanceAt(source-epsilon))*THRILL_LENGTH/(2*epsilon);
      const actual=(thrillDistanceAt(ride+epsilon)-thrillDistanceAt(ride-epsilon))*THRILL_LENGTH/(2*epsilon);
      assert.ok(Math.abs(actual-old*factor)<1e-4,`speed ratio at source ${source}`);
    }
  }
  for(const [from,to,direction] of [[W.start,W.plateauStart,1],[W.plateauEnd,W.end,-1]]){
    let previous=thrillSpeedMultiplierAt(from);
    for(let i=0;i<=100;i++){
      const ride=from+(to-from)*i/100,rate=thrillSpeedMultiplierAt(ride),source=thrillSourceTimeAt(ride);
      assert.ok(rate>=1&&rate<=1.25);
      assert.ok(direction*(rate-previous)>=-1e-12);previous=rate;
      assert.ok(Math.abs(thrillRideTimeAt(source)-ride)<1e-10);
      const measured=(thrillSourceTimeAt(ride+epsilon)-thrillSourceTimeAt(ride-epsilon))/(2*epsilon);
      assert.ok(Math.abs(measured-rate)<1e-8);
      const derivative=(thrillSpeedMultiplierAt(ride+epsilon)-thrillSpeedMultiplierAt(ride-epsilon))/(2*epsilon);
      assert.ok(Math.abs(derivative)<=(W.factor-1)*1.5/W.transitionSeconds+1e-8);
    }
  }
  for(const ride of [W.start,W.plateauStart,W.plateauEnd,W.end]){
    assert.ok(Math.abs(thrillDistanceAt(ride-1e-7)-thrillDistanceAt(ride+1e-7))<1e-7);
    assert.ok(Math.abs(thrillSpeedMultiplierAt(ride-epsilon)-thrillSpeedMultiplierAt(ride+epsilon))<1e-8);
    const derivative=(thrillSpeedMultiplierAt(ride+epsilon)-thrillSpeedMultiplierAt(ride-epsilon))/(2*epsilon);
    assert.ok(Math.abs(derivative)<1e-5,'added acceleration vanishes at every ramp endpoint');
  }
  assert.ok(Math.abs(thrillDistanceAt(W.end)-W.brakeStartU)<1e-12);
  assert.equal(thrillDistanceAt(THRILL_DURATION),1);
  t.diagnostic(JSON.stringify({window:W,baseDuration:THRILL_BASE_DURATION,rideDuration:THRILL_DURATION}));
});

test('render orientation crosses world vertical without the world-up lookAt half-turn',()=>{
  // Exact-pole sampling invokes Three.lookAt's z perturbation and splits the
  // half-turn into two quarter-turns. A half-frame offset crosses in one step.
  for(const offset of [0,.5]){
  const stabilizer=new AttractionCameraOrientation(),pose=coasterRidePose(0,'chase'),target=new Vector3();
  let oldPrevious,newPrevious,oldJump=0,newJump=0,poleRotation=0;
  for(let i=0;i<=240;i++){
    const position=new Vector3(1-(i+offset)/120,10,0),saved=position.clone();
    const up=stabilizer.step(pose,position,target,1/60,'ride-1');
    const old=new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(position,target,new Vector3(0,1,0)));
    const fixed=new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(position,target,up));
    if(oldPrevious){const angle=old.angleTo(oldPrevious);oldJump=Math.max(oldJump,angle);newJump=Math.max(newJump,fixed.angleTo(newPrevious));if(Math.abs(position.x)<.02)poleRotation+=angle;}
    assert.ok(Math.abs(up.dot(target.clone().sub(position).normalize()))<1e-9);
    assert.ok(Math.abs(up.length()-1)<1e-9);assert.deepEqual(position,saved);assert.deepEqual(target,new Vector3());
    oldPrevious=old;newPrevious=fixed;
  }
  assert.ok(poleRotation>3,'both sampling phases reproduce the total uncorrected half-turn');
  if(offset===0)assert.ok(oldJump>1.5&&oldJump<1.7,'exact singularity splits the turn across two frames');
  else assert.ok(oldJump>3,'off-grid singularity flips in one frame');
  assert.ok(newJump<.02);
  }
});

test('orientation stabilization leaves manual orbit, zoom, rider and full-roll head look intact',()=>{
  const stabilizer=new AttractionCameraOrientation(),look={yaw:1.2,pitch:.6,zoom:.8},saved={...attractionLook};
  for(const view of ['chase','comfort','first-person'])for(let i=0;i<100;i++){
    const pose=attractionCameraPose(coasterRidePose(i/100,view),look),before=structuredClone(pose);
    const up=stabilizer.step(pose,new Vector3(...pose.cameraPosition),new Vector3(...pose.cameraTarget),1/60,'ride-2');
    assert.deepEqual(pose,before);assert.deepEqual(attractionLook,saved);
    if(view==='first-person')assert.deepEqual(up.toArray(),pose.cameraUp);
  }
  stabilizer.clear();
});

test('actual post-drop orbits have no half-turn orientation cut at rolling camera poles',t=>{
  for(const look of [{yaw:0,pitch:0,zoom:1},{yaw:1.43,pitch:.6,zoom:.8}]){
    const stabilizer=new AttractionCameraOrientation();let previous,maxStep=0;
    for(let seconds=29;seconds<COASTER_DURATION;seconds+=1/60){
      const pose=attractionCameraPose(coasterRidePose(coasterDistanceAt(seconds),'chase'),look);
      const position=new Vector3(...pose.cameraPosition),target=new Vector3(...pose.cameraTarget);
      const up=stabilizer.step(pose,position,target,1/60,'ride-3');
      const q=new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(position,target,up));
      if(previous)maxStep=Math.max(maxStep,previous.angleTo(q));previous=q;
      assert.ok(up.distanceTo(stabilizer.step(pose,position,target,0,'ride-3'))<1e-9,'zero-delta resume must retain the horizon state');
    }
    assert.ok(maxStep<Math.PI/2,'camera orientation makes a sudden half-turn');
    t.diagnostic(JSON.stringify({look,maxFrameAngleRadians:maxStep}));
  }
});
