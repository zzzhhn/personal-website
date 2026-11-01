import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { AnimationMixer, BufferAttribute, BufferGeometry, DoubleSide, Euler, Group, LoopOnce, Mesh, MeshBasicMaterial, Quaternion, Raycaster, SkinnedMesh, Vector3 } from 'three';
import { GuideSeatContact } from './WorldGuideSeat.ts';
import { GUIDE_VEHICLE_TRANSITION_S, GuideDrivingPose, GuideVehicleContacts, GuideVehicleUpperBody, GuideVehicleSitPose, guideVehicleApproach, guideVehicleRoot, guideVehicleSample, guideVehicleOrientation, guideVehicleCrouchDepth, guideVehicleBendScale, guideVehicleSeatBlend, guideVehicleDrivingBlend, settleGuideVehicle } from './WorldGuideVehicle.ts';
import { VEHICLE_AUTHORED_DOORS, VEHICLE_DOORS, VEHICLE_PASSAGE, vehicleDoorUpright } from './WorldVehicleDoors.ts';
import { VEHICLES } from './layout.ts';
import { adaptVehicleSeats, vehicleHulls } from './WorldVehicleAssets.ts';
import { wheelGeometry } from './actor-physics.ts';
import { refineGuideBoots } from './WorldGuideShape.ts';
import { calibrateGuideBootClips } from './WorldGuideBoots.ts';
import { skinnedWorldPoint } from './WorldGuideStop.ts';
import { glb, loadGuide, motionDigest } from '../../../tools/world/guide/boot-analysis.mjs';

test('vehicle windows open, cross a foot and body, then sit inside; exit reverses the chain', () => {
  assert.equal(GUIDE_VEHICLE_TRANSITION_S, 5.2);
  assert.equal(guideVehicleSample('enter', .20).stage, 'approach');
  assert.equal(guideVehicleSample('enter', .33).stage, 'reach');
  assert.equal(guideVehicleSample('enter', .40).stage, 'open');
  assert.equal(guideVehicleSample('enter', .54).stage, 'threshold');
  assert.equal(guideVehicleSample('enter', .63).stage, 'step');
  assert.equal(guideVehicleSample('enter', .74).stage, 'cross');
  assert.equal(guideVehicleSample('enter', .85).stage, 'settle');
  for(let t=0;t<=.80;t+=.005)assert.equal(guideVehicleSample('enter',t).sit,0,'no sitting before entering');
  const base = new Vector3(3, 1, 3), door = [3, 1, 1.2], cabin = [2.6, 1.57, .38], contact = new Vector3(-.46, .355, .007);
  let previous = null, maxStep = 0;
  for (let i = 0; i <= 240; i++) {
    const t = i / 240, enter = guideVehicleSample('enter', t), exit = guideVehicleSample('exit', 1 - t);
    for (const key of ['q', 'approach', 'turn', 'sit', 'transfer', 'opacity', 'duck']) assert.ok(Math.abs(exit[key] - enter[key]) < 1e-12);
    if (t <= .79) assert.equal(enter.opacity, 1, 'walk, measured pivot and flex remain fully visible');
    const a = guideVehicleRoot(base, door, cabin, 0, contact, enter, new Vector3());
    const b = guideVehicleRoot(base, door, cabin, 0, contact, exit, new Vector3());
    assert.ok(a.distanceTo(b) < 1e-10);
    if (previous) maxStep = Math.max(maxStep, a.distanceTo(previous)); previous = a;
    assert.ok(a.toArray().every(Number.isFinite));
  }
  assert.ok(maxStep < .12, `bounded reversible root path: ${maxStep}`);
  assert.equal(guideVehicleSample('enter', 1).opacity, 1); assert.equal(guideVehicleSample('exit', 1).opacity, 1);
});

test('actual G24 vehicle flex reaches three cabin targets at eight headings and restores the canopy layer', async () => {
  const asset = await loadGuide(new URL('../../../tools/world/guide/out/G24_uncompressed.glb', import.meta.url));
  assert.equal(motionDigest(asset), motionDigest(glb(new URL('../../../public/assets/world/guide/G24.glb', import.meta.url))));
  const { scene, animations } = asset.gltf, contact = new GuideSeatContact(scene, animations), upper = new GuideVehicleUpperBody(scene);
  const root = new Group(); root.add(scene); const mixer = new AnimationMixer(scene), clip = animations.find(c => c.name === 'SitDown');
  const action = mixer.clipAction(clip).setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play(); mixer.update(clip.duration);
  const chest = scene.getObjectByName('chest'), baseChest = chest.quaternion.clone();
  const pelvis = scene.getObjectByName('pelvis'), basePelvis = pelvis.quaternion.clone();
  upper.apply(1); assert.ok(chest.quaternion.clone().normalize().angleTo(baseChest.clone().normalize()) > .1);
  assert.deepEqual(pelvis.quaternion.toArray(), basePelvis.toArray()); upper.restore(); assert.deepEqual(chest.quaternion.toArray(), baseChest.toArray());
  const targets = [[.05, 1.02, .42], [-.40, .57, .38], [1.18, 1.15, .45]];
  let error = 0;
  for (const target of targets) for (let k = 0; k < 8; k++) {
    root.rotation.y = k * Math.PI / 4; root.position.set(0, 0, 0); root.updateWorldMatrix(true, true);
    const offsetWorld = contact.sample(new Vector3()).sub(root.getWorldPosition(new Vector3()));
    const localContact = offsetWorld.clone().applyAxisAngle(new Vector3(0, 1, 0), -root.rotation.y);
    guideVehicleRoot(new Vector3(2, 0, 2), [0, 0, 1.2], target, root.rotation.y, localContact, guideVehicleSample('enter', 1), root.position);
    root.updateWorldMatrix(true, true); error = Math.max(error, contact.sample(new Vector3()).distanceTo(new Vector3(...target)));
  }
  assert.ok(error < 1e-6); console.log(JSON.stringify({ cabinTargets: targets.length, headings: 8, maxPosteriorTargetErrorM: error }));
  mixer.stopAllAction(); mixer.uncacheRoot(scene);
});

test('actual G24 follows the safe approach without early cabin pull or outdoor sitting', async () => {
  const { gltf: { scene, animations } } = await loadGuide(new URL('../../../tools/world/guide/out/G24_uncompressed.glb', import.meta.url));
  const root = new Group(); root.add(scene);
  const mixer = new AnimationMixer(scene), contact = new GuideSeatContact(scene, animations), upper = new GuideVehicleUpperBody(scene);
  const meshes = []; scene.traverse(o => { if (o instanceof SkinnedMesh) meshes.push(o); });
  const origin = new Vector3(7, 1, -4), axis = new Vector3(0, 1, 0), point = new Vector3(), expected = new Vector3();
  let rootError = 0, shellVertices = 0, samples = 0, hipBefore = 0, hipAfter = 0;
  for (const side of [-1, 1]) for (let direction = 0; direction < 8; direction++) {
    const yaw = direction * Math.PI / 4;
    const world = p => new Vector3(...p).applyAxisAngle(axis, yaw).add(origin);
    const base = world([-3.3, 0, 0]), door = world([-.4, 0, side * 1.5]).toArray();
    const waypoints = [world([-3.3, 0, side * 1.5]).toArray()], cabin = world([-.4, .57, side * .38]).toArray();
    for (const q of [0, .06, .12, .18, .24, .30, .38, .46, .52, .60, .68]) {
      const sample = guideVehicleSample('enter', q); assert.equal(sample.transfer, 0, 'cabin target cannot act through q=0.68');
      const path = guideVehicleApproach(base, door, waypoints, sample.approach, expected);
      const heading = Math.atan2(-path.dz, path.dx), angle = Math.atan2(Math.sin(yaw - heading), Math.cos(yaw - heading));
      root.rotation.y = heading + angle * sample.turn;
      const name = sample.stage === 'approach' ? 'Walk' : sample.stage === 'turn' ? 'TurnL' : 'SitDown';
      const clip = animations.find(c => c.name === name), a = mixer.clipAction(clip);
      upper.restore(); mixer.stopAllAction(); a.reset().setLoop(LoopOnce, 1).play(); a.clampWhenFinished = true; a.paused = true;
      a.time = (name === 'Walk' ? (q / .3 * 3) % 1 : name === 'TurnL' ? sample.turn : sample.sit) * clip.duration;
      mixer.update(0); upper.apply(sample.duck);
      guideVehicleRoot(base, door, cabin, yaw, contact.reference, sample, root.position, waypoints); root.updateWorldMatrix(true, true);
      rootError = Math.max(rootError, root.getWorldPosition(point).distanceTo(expected), scene.getObjectByName('root').getWorldPosition(point).distanceTo(expected));
      for (const mesh of meshes) for (let i = 0; i < mesh.geometry.getAttribute('position').count; i++) {
        skinnedWorldPoint(mesh, i, point).sub(origin).applyAxisAngle(axis, -yaw);
        if (Math.abs(point.x) < 2.15 && Math.abs(point.z) < .95) shellVertices++;
      }
      if (side === 1 && direction === 0 && (q === .52 || q === .68)) {
        const height = scene.getObjectByName('pelvis').getWorldPosition(point).y - root.position.y;
        if (q === .52) hipBefore = height; else hipAfter = height;
      }
      samples++;
    }
  }
  assert.ok(rootError < 1e-7); assert.equal(shellVertices, 0, 'actual visible skin stays outside the coupe envelope before transfer');
  assert.ok(Math.abs(hipBefore - hipAfter) < .01, 'source hips no longer sit down outside the shell');
  console.log(JSON.stringify({ preTransferSamples: samples, maxActualRootErrorM: rootError, earlyShellVertices: shellVertices, preTransferHipDescentM: hipBefore - hipAfter }));
  upper.restore(); mixer.stopAllAction(); mixer.uncacheRoot(scene);
});

test('actual seated G24 stays rigidly in all three cabins through pitch, side roll and full inversion', async () => {
  const {gltf:{scene,animations}}=await loadGuide(new URL('../../../tools/world/guide/out/G24_uncompressed.glb',import.meta.url));
  const root=new Group();root.add(scene);const mixer=new AnimationMixer(scene),contact=new GuideSeatContact(scene,animations),pose=new GuideDrivingPose(scene);
  const clip=animations.find(c=>c.name==='SitDown'),action=mixer.clipAction(clip).setLoop(LoopOnce,1);action.clampWhenFinished=true;action.play();mixer.update(clip.duration);
  const meshes=[];scene.traverse(o=>{if(o instanceof SkinnedMesh)meshes.push(o);});
  let maxSeatError=0,maxLocalSkinError=0,count=0;
  for(const id of Object.keys(VEHICLE_DOORS))for(const side of [-1,1]){
    pose.restore();root.position.set(0,0,0);root.quaternion.identity();mixer.update(0);pose.apply(id,1);
    const modelPosterior=contact.sample(new Vector3());
    const reference=meshes.flatMap(m=>Array.from({length:m.geometry.attributes.position.count},(_,i)=>skinnedWorldPoint(m,i,new Vector3()).sub(modelPosterior)));
    for(const angles of [[0,0,0],[.28,.7,0],[0,.8,Math.PI/2],[0,1.2,Math.PI],[-.22,-.5,-1.4]]){
      const rotation=new Quaternion().setFromEuler(new Euler(...angles,'YXZ'));
      const frame={id,side,position:[7,3,-4],rotation:rotation.toArray()},seat=VEHICLE_DOORS[id].seat;
      const cabin=new Vector3(seat[0],seat[1],seat[2]*side).applyQuaternion(rotation).add(new Vector3(...frame.position));
      const sample=guideVehicleSample('enter',1);
      root.quaternion.copy(guideVehicleOrientation(frame,sample,0,new Quaternion()));
      guideVehicleRoot(new Vector3(),[0,0,0],cabin.toArray(),0,contact.reference,sample,root.position,undefined,frame);root.updateWorldMatrix(true,true);
      const offset=contact.sample(new Vector3()).sub(root.getWorldPosition(new Vector3()));
      root.position.copy(cabin).sub(offset);root.updateWorldMatrix(true,true);
      maxSeatError=Math.max(maxSeatError,contact.sample(new Vector3()).distanceTo(cabin));
      const up=new Vector3(0,1,0).applyQuaternion(root.quaternion),carUp=new Vector3(0,1,0).applyQuaternion(rotation);
      assert.ok(up.dot(carUp)>.9999999,'driver must roll/pitch with the rigid car, not stay world-upright');
      if(angles[2]===Math.PI){assert.ok(up.y<-.9999);assert.equal(vehicleDoorUpright(rotation),false);}
      const inverse=rotation.clone().invert();let k=0;
      for(const m of meshes)for(let i=0;i<m.geometry.attributes.position.count;i++){
        const actual=skinnedWorldPoint(m,i,new Vector3()).sub(cabin).applyQuaternion(inverse);
        maxLocalSkinError=Math.max(maxLocalSkinError,actual.distanceTo(reference[k++]));
      }
      count++;
    }
    // Return the sampled source to its identity world frame before undoing the additive pose.
    root.position.set(0,0,0);root.quaternion.identity();root.updateWorldMatrix(true,true);
  }
  assert.ok(maxSeatError<1e-6);assert.ok(maxLocalSkinError<1e-5);
  console.log(JSON.stringify({actualSkinRigidCabinSamples:count,maxSeatErrorM:maxSeatError,maxLocalSkinErrorM:maxLocalSkinError}));
  pose.restore();mixer.stopAllAction();mixer.uncacheRoot(scene);
});

test('actual limbs cross the open sill before source sitting and restore all procedural contacts', async () => {
  const {gltf:{scene,animations}}=await loadGuide(new URL('../../../tools/world/guide/out/G24_uncompressed.glb',import.meta.url));
  const root=new Group();root.add(scene);const mixer=new AnimationMixer(scene),contact=new GuideSeatContact(scene,animations),upper=new GuideVehicleUpperBody(scene),contacts=new GuideVehicleContacts(scene),driving=new GuideDrivingPose(scene),sitPose=new GuideVehicleSitPose(scene,animations);
  const helmet=[];scene.traverse(m=>{if(!m.isSkinnedMesh)return;const ids=m.geometry.attributes.skinIndex,w=m.geometry.attributes.skinWeight;for(let i=0;i<ids.count;i++){let n=0;for(let k=0;k<4;k++)if(m.skeleton.bones[ids.getComponent(i,k)].name==='head')n+=w.getComponent(i,k);if(n>.9)helmet.push([m,i]);}});
  let maxHand=0,maxLead=0,maxTrail=0,maxStep=0,handWorst=null,footWorst=null,canopyAbove=0,canopyWorst=null;
  for(const id of Object.keys(VEHICLE_DOORS))for(const side of [-1,1]){
    const spec=VEHICLE_DOORS[id],originY=wheelGeometry(VEHICLES.find(v=>v.id===id).size).height+vehicleHulls(id).bodyY;
    const frame={id,side,position:[0,originY,0],rotation:[0,0,0,1],groundY:0},cabin=[spec.seat[0],originY+spec.seat[1],spec.seat[2]*side];
    const base=new Vector3(spec.standingX,0,side*2.25),door=base.toArray();let previous;
    for(let i=0;i<=200;i++){
      contacts.restore();driving.restore();upper.restore();sitPose.restore();mixer.stopAllAction();
      const sample=guideVehicleSample('enter',i/200),name=sample.sit>0?'SitDown':'Idle',clip=animations.find(c=>c.name===name),action=mixer.clipAction(clip).reset().setLoop(LoopOnce,1).play();action.paused=true;action.time=sample.sit*clip.duration;mixer.update(0);
      const before=[];scene.traverse(o=>{if(o.isBone)before.push([o,o.quaternion.clone()]);});
      const smooth=v=>{v=Math.min(1,Math.max(0,v));return v*v*(3-2*v);};
      const closeReach=id!=='coupe'?smooth((sample.q-.92)/.025)*(1-smooth((sample.q-.98)/.02)):0;
      sitPose.apply(id,sample);upper.applyEntry(id,sample,closeReach,side);
      driving.apply(id,guideVehicleDrivingBlend(id,sample));
      root.quaternion.copy(guideVehicleOrientation(frame,sample,side*Math.PI/2,new Quaternion()));
      guideVehicleRoot(base,door,cabin,0,contact.reference,sample,root.position,undefined,frame);root.updateWorldMatrix(true,true);
      const actual=contact.sample(new Vector3()).sub(root.getWorldPosition(new Vector3())),ref=contact.reference.clone().applyQuaternion(root.quaternion);
      root.position.add(ref.sub(actual).multiplyScalar(guideVehicleSeatBlend(id,sample)));root.updateWorldMatrix(true,true);
      contacts.apply(frame,sample);
      settleGuideVehicle(root,contact,contacts,frame,sample);
      if(i===136){
        const leading=scene.getObjectByName(`foot${side===1?'L':'R'}`).getWorldPosition(new Vector3());
        const pelvis=scene.getObjectByName('pelvis').getWorldPosition(new Vector3());
        assert.ok(Math.abs(leading.z)<spec.hinge[2],'leading ankle crosses the sill first');
        assert.ok(Math.abs(pelvis.z)>spec.hinge[2],'pelvis remains outside until the leading foot has landed');
      }
      const ceiling={offroad:1.735,coupe:1.225,van:1.955}[id];
      if(sample.q>=.58&&sample.q<=.92)for(const [mesh,index]of helmet){const p=skinnedWorldPoint(mesh,index,new Vector3());p.y-=originY;if(Math.abs(p.z)<spec.hinge[2]-.08&&p.x>spec.seat[0]-.4&&p.x<spec.hinge[0]&&p.y-ceiling>canopyAbove){canopyAbove=p.y-ceiling;canopyWorst={id,side,q:sample.q,point:p.toArray()};}}
      if((sample.q>=.36&&sample.q<=.49||sample.q>=.945&&sample.q<=.98)&&contacts.errors.hand>maxHand){maxHand=contacts.errors.hand;handWorst={id,side,q:sample.q,root:root.position.toArray(),hand:scene.getObjectByName(`hand${side===-1?'L':'R'}`).getWorldPosition(new Vector3()).toArray(),shoulder:scene.getObjectByName(`upperarm${side===-1?'L':'R'}`).getWorldPosition(new Vector3()).toArray()};}
      if(sample.q>=.60&&sample.q<=.80){if(contacts.errors.leadFoot>maxLead){maxLead=contacts.errors.leadFoot;footWorst={id,side,q:sample.q};}maxTrail=Math.max(maxTrail,contacts.errors.trailFoot);}
      if(previous)maxStep=Math.max(maxStep,previous.distanceTo(root.position));previous=root.position.clone();
      if(sample.sit>0){assert.equal(sample.transfer,1);assert.ok(Math.abs(root.position.z)<spec.hinge[2],'pelvis is inside before sitting');}
      contacts.restore();driving.restore();upper.restore();sitPose.restore();for(const [b,q]of before)assert.deepEqual(b.quaternion.toArray(),q.toArray(),'procedural contact cannot accumulate into the next source pose');
      assert.ok(root.position.toArray().every(Number.isFinite));
    }
  }
  console.log(JSON.stringify({doorHandErrorM:maxHand,handWorst,leadingFootErrorM:maxLead,footWorst,trailingFootErrorM:maxTrail,maxRootStepM:maxStep,canopyAbove,canopyWorst}));
  assert.ok(maxStep<.2,'no discontinuous cabin teleport');
  assert.ok(maxHand<.02,`moving door/switch is reachable: ${maxHand}`);
  assert.ok(maxLead<.02&&maxTrail<.02,`real non-stretched legs reach the step: ${maxLead}/${maxTrail}`);
  assert.equal(canopyAbove,0,'sampled helmet vertices clear the cabin ceiling through crossing');
  mixer.stopAllAction();mixer.uncacheRoot(scene);
});

test('reported live coupe height keeps the dynamic G24 above exterior ground and below the real cabin profile',async()=>{
  const {gltf:{scene,animations:sourceAnimations}}=await loadGuide(new URL('../../../tools/world/guide/out/G24_uncompressed.glb',import.meta.url));
  const disposeBoots=refineGuideBoots(scene),animations=calibrateGuideBootClips(scene,sourceAnimations);
  const parent=new Group(),root=new Group();parent.add(root);root.add(scene);
  const mixer=new AnimationMixer(scene),support=new GuideSeatContact(scene,animations),upper=new GuideVehicleUpperBody(scene),contacts=new GuideVehicleContacts(scene);
  const feet=[],head=[],skin=[];
  scene.traverse(m=>{if(!m.isSkinnedMesh)return;const ids=m.geometry.attributes.skinIndex,w=m.geometry.attributes.skinWeight;for(let i=0;i<ids.count;i++){
    let foot=0,helmet=0;for(let k=0;k<4;k++){const n=m.skeleton.bones[ids.getComponent(i,k)].name;if(/^foot[LR]$/.test(n))foot+=w.getComponent(i,k);if(n==='head')helmet+=w.getComponent(i,k);}
    skin.push([m,i]);if(foot>.98)feet.push([m,i]);if(helmet>.9)head.push([m,i]);
  }});
  const bodyY=vehicleHulls('coupe').bodyY,ground=1.076919,dt=1/60,summary=[];
  const roofAt=x=>x<-.52?1.07+(x+1.06)/.54*.155:x<.04?1.225+(x+.52)/.56*.01:1.235-(x-.04)/.51*.44;
  for(const heightDelta of [0,-.04,.04])for(const side of [-1,1]){
    upper.restore();contacts.restore();mixer.stopAllAction();
    const carRotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI/2),carPosition=new Vector3(26.1993,2.13744+heightDelta,1.95626);
    const origin=new Vector3(0,bodyY,0).applyQuaternion(carRotation).add(carPosition),frame={id:'coupe',side,position:origin.toArray(),rotation:carRotation.toArray(),groundY:ground};
    const spec=VEHICLE_DOORS.coupe,cabin=new Vector3(spec.seat[0],spec.seat[1],side*spec.seat[2]).applyQuaternion(carRotation).add(origin).toArray();
    const door=new Vector3(spec.standingX,0,side*2.25).applyQuaternion(carRotation).add(carPosition);door.y=ground;
    parent.position.copy(door).add(new Vector3(-.5,0,.3));const base=parent.position.clone();parent.updateWorldMatrix(true,true);
    const walk=mixer.clipAction(animations.find(c=>c.name==='Walk')).reset().play(),idle=mixer.clipAction(animations.find(c=>c.name==='Idle'));let stopped=false;
    let minRoot=Infinity,minFeet=Infinity,minSkin=Infinity,roofExcess=-Infinity,profileWorst=null,root66=null;
    const phases=[];for(let t=.3;t<=.8+1e-8;t+=dt/GUIDE_VEHICLE_TRANSITION_S){phases.push(t);if(t<.66&&t+dt/GUIDE_VEHICLE_TRANSITION_S>=.66)for(let k=0;k<30;k++)phases.push(.66);}
    phases.push(.8);
    for(const q of phases){
      contacts.restore();upper.restore();
      if(q>=.63&&!stopped){walk.fadeOut(.12);idle.reset().fadeIn(.12).play();stopped=true;}
      mixer.update(dt);const sample=guideVehicleSample('enter',q),pelvis=scene.getObjectByName('pelvis'),pelvisSource=pelvis.position.clone();
      upper.apply(sample.duck,true,0,side,guideVehicleCrouchDepth('coupe',sample),guideVehicleBendScale('coupe',sample));
      root.quaternion.copy(guideVehicleOrientation(frame,sample,Math.PI/2+side*Math.PI/2,new Quaternion()));
      const target=guideVehicleRoot(base,door.toArray(),cabin,Math.PI/2,support.reference,sample,new Vector3(),undefined,frame);
      root.position.copy(target).sub(parent.position);parent.updateWorldMatrix(true,true);contacts.apply(frame,sample);
      const inverse=carRotation.clone().invert(),rootWorld=root.getWorldPosition(new Vector3());minRoot=Math.min(minRoot,rootWorld.y-ground);
      if(q===.66)root66=rootWorld.toArray();
      for(const [mesh,index]of feet){const p=skinnedWorldPoint(mesh,index,new Vector3());minFeet=Math.min(minFeet,p.y-ground);}
      for(const [mesh,index]of skin){const p=skinnedWorldPoint(mesh,index,new Vector3());minSkin=Math.min(minSkin,p.y-ground);}
      for(const [mesh,index]of head){const p=skinnedWorldPoint(mesh,index,new Vector3()).sub(origin).applyQuaternion(inverse);if(Math.abs(p.z)<.76&&p.x>=-1.06&&p.x<=.55){const excess=p.y-roofAt(p.x);if(excess>roofExcess){roofExcess=excess;profileWorst={q,point:p.toArray()};}}}
      contacts.restore();upper.restore();assert.deepEqual(pelvis.position.toArray(),pelvisSource.toArray(),'pelvis crouch restores the actual animated translation');
    }
    summary.push({heightDelta,side,root66,minRoot,minFeet,minSkin,roofExcess,profileWorst});
  }
  console.log('Live coupe passage:',JSON.stringify({cases:summary.length,bodyHeights:[2.09744,2.13744,2.17744],root66:summary.filter(r=>r.heightDelta===0).map(r=>({side:r.side,position:r.root66})),minRootClearanceM:Math.min(...summary.map(r=>r.minRoot)),minFootClearanceM:Math.min(...summary.map(r=>r.minFeet)),minSkinClearanceM:Math.min(...summary.map(r=>r.minSkin)),minRoofClearanceM:-Math.max(...summary.map(r=>r.roofExcess))}));
  for(const row of summary){assert.ok(row.minRoot>=-1e-7,'root cannot sink below actual exterior ground');assert.ok(row.minFeet>=-.003,`actual boots cannot tunnel below ground: ${JSON.stringify(row)}`);assert.ok(row.minSkin>=-.003,'no part of actual skin may be buried under ground');assert.ok(row.roofExcess<=-.005,`helmet needs positive clearance under actual sloped cabin roof: ${JSON.stringify(row)}`);}
  mixer.stopAllAction();mixer.uncacheRoot(scene);disposeBoots?.();
});

test('live high-door entry keeps steps upright and clears the entire actual helmet, sill and ground envelopes',async()=>{
  const {gltf:{scene,animations:source}}=await loadGuide(new URL('../../../tools/world/guide/out/G24_uncompressed.glb',import.meta.url));
  const disposeBoots=refineGuideBoots(scene),animations=calibrateGuideBootClips(scene,source);
  const parent=new Group(),root=new Group();parent.add(root);root.add(scene);
  const mixer=new AnimationMixer(scene),support=new GuideSeatContact(scene,animations),upper=new GuideVehicleUpperBody(scene),contacts=new GuideVehicleContacts(scene),driving=new GuideDrivingPose(scene),sitPose=new GuideVehicleSitPose(scene,animations);
  const head=[],feet=[],skin=[];
  scene.traverse(m=>{if(!m.isSkinnedMesh)return;const ids=m.geometry.attributes.skinIndex,w=m.geometry.attributes.skinWeight;
    for(let i=0;i<ids.count;i++){let h=0,f=0;for(let k=0;k<4;k++){const name=m.skeleton.bones[ids.getComponent(i,k)].name;if(name==='head')h+=w.getComponent(i,k);if(/^foot[LR]$/.test(name))f+=w.getComponent(i,k);}skin.push([m,i]);if(h>.9)head.push([m,i]);if(f>.98)feet.push([m,i]);}
  });
  // Exact body-frame cabin/door profiles from tools/world/vehicles/build_doors.py CONFIG.
  const cabins={offroad:{inner:.875,band:.70,roof:[[-.68,1.735],[.435,1.735],[.53,1.24]],opening:[[-.43,1.775],[.495,1.775],[.605,1.23]]},
    coupe:{inner:.78,band:.50,roof:[[-1.06,1.07],[-.52,1.225],[.04,1.235],[.55,.795]],opening:[[-.81,1.16],[-.53,1.235],[.075,1.255],[.625,.79]]},
    van:{inner:.985,band:.80,roof:[[.95,1.955],[1.54,1.955],[2.04,1.16]],opening:[[.995,1.975],[1.565,1.975],[1.985,1.20]]}};
  const top=(profile,x)=>{for(let i=1;i<profile.length;i++){const a=profile[i-1],b=profile[i];if(x>=a[0]&&x<=b[0])return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);}return null;};
  const ground={offroad:4.778827781677246,coupe:1.076919,van:1.076919};
  const positions={offroad:[-26.000205432260007,4.839963363841255,34],coupe:[26.1993,2.13744+vehicleHulls('coupe').bodyY,1.95626],van:[45.9924545288,2.4649796486+vehicleHulls('van').bodyY,-45]};
  const rows=[];
  for(const id of ['offroad','van'])for(const side of [-1,1]){
    contacts.restore();driving.restore();upper.restore();sitPose.restore();mixer.stopAllAction();
    const rotation=id==='offroad'?new Quaternion(0,0,.00271435733884573,.9999963045120239).normalize():new Quaternion().setFromAxisAngle(new Vector3(0,1,0),id==='coupe'?Math.PI/2:0);
    const origin=new Vector3(...positions[id]),inverse=rotation.clone().invert(),spec=VEHICLE_DOORS[id],frame={id,side,position:origin.toArray(),rotation:rotation.toArray(),groundY:ground[id]};
    const cabin=new Vector3(spec.seat[0],spec.seat[1],side*spec.seat[2]).applyQuaternion(rotation).add(origin).toArray();
    const door=new Vector3(spec.standingX,0,side*2.25).applyQuaternion(rotation).add(origin);door.y=ground[id];
    parent.position.copy(door);const base=door.clone();parent.updateWorldMatrix(true,true);
    const idle=mixer.clipAction(animations.find(c=>c.name==='Idle')).reset().play();
    let minFoot=Infinity,minSkin=Infinity,roofClearance=Infinity,sillClearance=Infinity,maxTorso=0,torso66=null,head66=null,pelvis66=null,root66=null,previous=null,maxStep=0,roofWorst=null,sillWorst=null,torsoWorst=null,minPelvisFloor=Infinity,minKneeFloor=Infinity,minInteriorSkin=Infinity,interiorWorst=null,settled=null;
    const phases=[];for(let q=.3;q<=.92;q+=1/60/GUIDE_VEHICLE_TRANSITION_S){phases.push(q);if(q<.66&&q+1/60/GUIDE_VEHICLE_TRANSITION_S>=.66)for(let k=0;k<30;k++)phases.push(.66);}phases.push(.8,.92,1);
    phases.sort((a,b)=>a-b);
    for(const q of phases){
      contacts.restore();driving.restore();upper.restore();sitPose.restore();
      const sample=guideVehicleSample('enter',q);
      if(sample.sit>0){idle.enabled=false;const clip=animations.find(c=>c.name==='SitDown'),a=mixer.clipAction(clip).reset().setLoop(LoopOnce,1).play();a.paused=true;a.time=sample.sit*clip.duration;}
      mixer.update(1/60);
      const beforePelvis=scene.getObjectByName('pelvis').position.clone();
      sitPose.apply(id,sample);upper.applyEntry(id,sample,0,side);driving.apply(id,guideVehicleDrivingBlend(id,sample));
      root.quaternion.copy(guideVehicleOrientation(frame,sample,side*Math.PI/2,new Quaternion()));
      const target=guideVehicleRoot(base,door.toArray(),cabin,0,support.reference,sample,new Vector3(),undefined,frame);
      root.position.copy(target).sub(parent.position);parent.updateWorldMatrix(true,true);
      const actual=support.sample(new Vector3()).sub(root.getWorldPosition(new Vector3())),reference=support.reference.clone().applyQuaternion(root.quaternion);
      root.position.add(reference.sub(actual).multiplyScalar(guideVehicleSeatBlend(id,sample)));parent.updateWorldMatrix(true,true);contacts.apply(frame,sample);settleGuideVehicle(root,support,contacts,frame,sample);
      const pelvis=scene.getObjectByName('pelvis').getWorldPosition(new Vector3()),neck=scene.getObjectByName('head').getWorldPosition(new Vector3()),chest=scene.getObjectByName('chest').getWorldPosition(new Vector3());
      const torso=Math.acos(Math.max(-1,Math.min(1,neck.clone().sub(chest).normalize().dot(new Vector3(0,1,0).applyQuaternion(rotation)))))*180/Math.PI;
      if(q>=.63&&q<=.86&&torso>maxTorso){maxTorso=torso;torsoWorst={q,torso};}
      if(q===.66){torso66=torso;head66=neck.y-ground[id];pelvis66=pelvis.y-ground[id];root66=root.getWorldPosition(new Vector3()).toArray();}
      const localPelvis=pelvis.clone().sub(origin).applyQuaternion(inverse),knees=['shinL','shinR'].map(n=>scene.getObjectByName(n).getWorldPosition(new Vector3()).sub(origin).applyQuaternion(inverse));
      if(q>=.68&&Math.abs(localPelvis.z)<cabins[id].inner)minPelvisFloor=Math.min(minPelvisFloor,localPelvis.y-VEHICLE_PASSAGE[id].floor);
      if(q>=.8)for(const knee of knees)minKneeFloor=Math.min(minKneeFloor,knee.y-VEHICLE_PASSAGE[id].floor);
      if(q===1)settled={pelvis:localPelvis.toArray(),knees:knees.map(p=>p.toArray()),chest:chest.clone().sub(origin).applyQuaternion(inverse).toArray(),posterior:support.sample(new Vector3()).sub(origin).applyQuaternion(inverse).toArray(),torsoDeg:torso};
      for(const[mesh,index]of skin){const p=skinnedWorldPoint(mesh,index,new Vector3());minSkin=Math.min(minSkin,p.y-ground[id]);p.sub(origin).applyQuaternion(inverse);if(q>=.68&&Math.abs(p.z)<cabins[id].inner&&p.x>cabins[id].roof[0][0]&&p.x<cabins[id].roof.at(-1)[0]&&p.y-VEHICLE_PASSAGE[id].floor<minInteriorSkin){minInteriorSkin=p.y-VEHICLE_PASSAGE[id].floor;const ids=mesh.geometry.attributes.skinIndex,w=mesh.geometry.attributes.skinWeight;let k=0;for(let j=1;j<4;j++)if(w.getComponent(index,j)>w.getComponent(index,k))k=j;interiorWorst={q,p:p.toArray(),bone:mesh.skeleton.bones[ids.getComponent(index,k)].name};}}
      for(const[mesh,index]of feet){const p=skinnedWorldPoint(mesh,index,new Vector3());minFoot=Math.min(minFoot,p.y-ground[id]);p.sub(origin).applyQuaternion(inverse);
        if(id!=='coupe'&&Math.abs(p.z)<spec.hinge[2]-.015&&p.x>cabins[id].opening[0][0]&&p.x<spec.hinge[0]&&p.y-VEHICLE_PASSAGE[id].sill<sillClearance){sillClearance=p.y-VEHICLE_PASSAGE[id].sill;sillWorst={q,p:p.toArray()};}
      }
      for(const[mesh,index]of head){const p=skinnedWorldPoint(mesh,index,new Vector3()).sub(origin).applyQuaternion(inverse),abs=Math.abs(p.z);
        const profiles=[abs<cabins[id].inner?cabins[id].roof:null,abs>=cabins[id].band&&abs<spec.hinge[2]+.02?cabins[id].opening:null].filter(Boolean);
        if(profiles.length){
          // The actual Boolean cabin and side doorway overlap: test their union.
          const clearances=profiles.map(profile=>{const lo=profile[0][0],hi=profile.at(-1)[0],ceiling=top(profile,Math.min(hi,Math.max(lo,p.x)));return Math.min(ceiling-p.y,p.x-lo,hi-p.x);});
          const clearance=Math.max(...clearances);
          if(clearance<roofClearance){roofClearance=clearance;roofWorst={q,p:p.toArray()};}
        }
      }
      const now=root.getWorldPosition(new Vector3());if(previous)maxStep=Math.max(maxStep,now.distanceTo(previous));previous=now;
      contacts.restore();driving.restore();upper.restore();sitPose.restore();assert.deepEqual(scene.getObjectByName('pelvis').position.toArray(),beforePelvis.toArray());
    }
    rows.push({id,side,torso66,head66,pelvis66,root66,maxTorso,minFoot,minSkin,roofClearance,sillClearance,maxStep,roofWorst,sillWorst,torsoWorst,minPelvisFloor,minKneeFloor,minInteriorSkin,interiorWorst,settled});
  }
  console.log('Live entry posture:',JSON.stringify(rows));
  for(const row of rows){
    assert.ok(row.minFoot>=-.003&&row.minSkin>=-.003,`no ground burial: ${JSON.stringify(row)}`);
    assert.ok(row.roofClearance>=.005,`actual roof/header profile: ${JSON.stringify(row)}`);
    assert.ok(row.minPelvisFloor>.03&&row.minKneeFloor>.03,'pelvis and knee joints remain above the actual interior floor');
    assert.ok(new Vector3(...row.settled.posterior).distanceTo(new Vector3(VEHICLE_DOORS[row.id].seat[0],VEHICLE_DOORS[row.id].seat[1],row.side*VEHICLE_DOORS[row.id].seat[2]))<.002,'final actual posterior skin contacts the visible cushion');
    assert.ok(row.settled.torsoDeg<31,'final driver reclines with the actual backrest');
    if(row.id!=='coupe'){
      assert.ok(row.torso66<20,`ordinary threshold must not inherit a coupe's canopy fold: ${JSON.stringify(row)}`);
      assert.ok(row.head66>row.pelvis66+.3,'helmet remains clearly above the pelvis while stepping');
      assert.ok(row.maxTorso<70,`ordinary crossing/sit trunk remains controlled: ${JSON.stringify(row)}`);
      assert.ok(row.sillClearance>=-.012,`boots clear the real raised sill: ${JSON.stringify(row)}`);
    }
  }
  mixer.stopAllAction();mixer.uncacheRoot(scene);disposeBoots?.();
});

test('measured neutral seated G24 reports the missing headroom with the existing posterior anchors held fixed',async t=>{
  const {gltf:{scene,animations}}=await loadGuide(new URL('../../../tools/world/guide/out/G24_uncompressed.glb',import.meta.url));
  const root=new Group();root.add(scene);scene.updateWorldMatrix(true,true);
  const helmet=scene.getObjectByName('head'),neutral=helmet.getWorldQuaternion(new Quaternion()),contact=new GuideSeatContact(scene,animations);
  const mixer=new AnimationMixer(scene),clip=animations.find(c=>c.name==='SitDown'),action=mixer.clipAction(clip).setLoop(LoopOnce,1);
  action.clampWhenFinished=true;action.play();mixer.update(clip.duration);
  const saved=[];scene.traverse(o=>{if(o.isBone)saved.push([o,o.quaternion.clone(),o.position.clone(),o.scale.clone()]);});
  const rows=[];
  for(const[id,angle,back,front,end,endY,roof]of [['offroad',.3,-.68,.435,.53,1.24,1.735],['van',.2,.95,1.54,2.04,1.16,1.955]]){
    for(const[b,q,p,s]of saved){b.quaternion.copy(q);b.position.copy(p);b.scale.copy(s);}root.position.set(0,0,0);scene.updateWorldMatrix(true,true);
    for(const name of ['spine','chest']){
      const bone=scene.getObjectByName(name),axis=new Vector3(0,0,1).applyQuaternion(bone.parent.getWorldQuaternion(new Quaternion()).invert());
      bone.quaternion.premultiply(new Quaternion().setFromAxisAngle(axis,angle));bone.updateWorldMatrix(false,true);
    }
    // Restore the actual bind head orientation with an 11 degree rearward nod, not a scaled helmet.
    helmet.quaternion.copy(helmet.parent.getWorldQuaternion(new Quaternion()).invert().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),.2).multiply(neutral)));
    const seat=VEHICLE_AUTHORED_DOORS[id].seat;root.position.copy(new Vector3(seat[0],seat[1],seat[2]).sub(contact.sample(new Vector3())));root.updateWorldMatrix(true,true);
    assert.ok(contact.sample(new Vector3()).distanceTo(new Vector3(...seat))<1e-6);
    let clearance=Infinity,minX=Infinity,maxX=-Infinity,maxY=-Infinity;
    scene.traverse(m=>{if(!m.isSkinnedMesh)return;const ids=m.geometry.attributes.skinIndex,w=m.geometry.attributes.skinWeight;
      for(let i=0;i<ids.count;i++){
        let n=0;for(let k=0;k<4;k++)if(m.skeleton.bones[ids.getComponent(i,k)].name==='head')n+=w.getComponent(i,k);if(n<=.9)continue;
        const p=skinnedWorldPoint(m,i,new Vector3()),ceiling=p.x<=front?roof:roof+(p.x-front)/(end-front)*(endY-roof);
        minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);clearance=Math.min(clearance,ceiling-p.y);
      }
    });
    const axis=helmet.getWorldPosition(new Vector3()).sub(scene.getObjectByName('chest').getWorldPosition(new Vector3())).normalize();
    const torso=Math.acos(axis.y)*180/Math.PI;
    assert.ok(torso<25,'candidate neutral torso is not a horizontal fold');assert.ok(minX>back&&maxX<end,'neutral head remains in the fore/aft cabin span');
    assert.ok(clearance<-.08,'the existing roof genuinely lacks neutral seated headroom');
    rows.push({id,torsoDeg:torso,helmetX:[minX,maxX],helmetTop:maxY,roof,missingHeadroom:-clearance,posterior:seat});
    for(const[b,,p,s]of saved){assert.deepEqual(b.position.toArray(),p.toArray());assert.deepEqual(b.scale.toArray(),s.toArray());}
  }
  t.diagnostic(JSON.stringify(rows));mixer.stopAllAction();mixer.uncacheRoot(scene);
});

test('both production seat LODs move real cushion/backrest triangles together without changing the shell or cached source',async t=>{
  const decoderRoot=new URL('../../../public/assets/world/draco/',import.meta.url);
  const sandbox={require:createRequire(import.meta.url),__dirname:new URL('.',decoderRoot).pathname,console,WebAssembly,TextDecoder,TextEncoder,Buffer,process};
  vm.runInNewContext(readFileSync(new URL('draco_wasm_wrapper.js',decoderRoot),'utf8'),sandbox);
  const module=await sandbox.DracoDecoderModule({wasmBinary:readFileSync(new URL('draco_decoder.wasm',decoderRoot))});
  const rows=[];
  for(const[id,asset]of [['offroad','G25'],['van','G27']])for(const lod of ['', '-lod1']){
    const data=glb(new URL(`../../../public/assets/world/vehicles/${asset}${lod}.glb`,import.meta.url)),node=data.json.nodes.find(n=>n.name===`${asset}_body`);
    const positions=[],normals=[],decoder=new module.Decoder();
    try{
      for(const primitive of data.json.meshes[node.mesh].primitives){
        const c=primitive.extensions.KHR_draco_mesh_compression,view=data.json.bufferViews[c.bufferView],bytes=data.bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
        const buffer=new module.DecoderBuffer(),mesh=new module.Mesh();buffer.Init(new Int8Array(bytes),bytes.length);
        const status=decoder.DecodeBufferToMesh(buffer,mesh);assert.equal(status.ok(),true);
        const attributes={};
        for(const key of ['POSITION','NORMAL']){const a=decoder.GetAttributeByUniqueId(mesh,c.attributes[key]),values=new module.DracoFloat32Array();decoder.GetAttributeFloatForAllPoints(mesh,a,values);attributes[key]=Float32Array.from({length:mesh.num_points()*3},(_,i)=>values.GetValue(i));module.destroy(values);}
        const face=new module.DracoInt32Array();
        for(let i=0;i<mesh.num_faces();i++){decoder.GetFaceFromMesh(mesh,i,face);for(let j=0;j<3;j++){const index=face.GetValue(j);positions.push(...attributes.POSITION.subarray(index*3,index*3+3));normals.push(...attributes.NORMAL.subarray(index*3,index*3+3));}}
        module.destroy(face);module.destroy(mesh);module.destroy(buffer);
      }
    }finally{module.destroy(decoder);}
    const source=new BufferGeometry();source.setAttribute('position',new BufferAttribute(new Float32Array(positions),3));source.setAttribute('normal',new BufferAttribute(new Float32Array(normals),3));
    const before=Array.from(source.attributes.position.array),result=adaptVehicleSeats(id,source),info=result.userData.seatAdaptation;
    assert.deepEqual(Array.from(source.attributes.position.array),before,'shared useLoader/bake source is immutable');
    assert.ok(Object.values(info.triangles).every(n=>n>0),JSON.stringify(info));
    let changed=0;
    for(let i=0;i<before.length/3;i++)if([0,1,2].some(k=>before[i*3+k]!==result.attributes.position.array[i*3+k])){
      changed++;const seat=VEHICLE_AUTHORED_DOORS[id].seat,x=before[i*3],y=before[i*3+1],z=before[i*3+2];
      assert.ok(x>=seat[0]-.311&&x<=seat[0]+.251&&y>=VEHICLE_PASSAGE[id].floor-.021&&y<=seat[1]+.491&&Math.abs(Math.abs(z)-seat[2])<=.221,'only the authored interior seat solids may change');
    }
    const material=new MeshBasicMaterial({side:DoubleSide}),mesh=new Mesh(result,material);mesh.updateMatrixWorld();
    for(const side of [-1,1]){
      const seat=VEHICLE_DOORS[id].seat,hit=new Raycaster(new Vector3(seat[0],seat[1]+.02,side*seat[2]),new Vector3(0,-1,0),0,.1).intersectObject(mesh)[0];
      assert.ok(hit);assert.ok(Math.abs(hit.point.y-seat[1])<.001,'actual visible cushion top equals the posterior contract');
      assert.ok(info.bottom>info.floor,'cushion cannot pass through its floor');
    }
    rows.push({id,lod:lod||'L0',changedVertices:changed,...info});source.dispose();result.dispose();material.dispose();
  }
  t.diagnostic(JSON.stringify(rows));
});
