import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Box3, Matrix4, Quaternion, Raycaster, Scene, Vector3 } from 'three';
import { readWorldCraftGltf, disposeWorldCraftGltf } from '../world-craft-gltf-test.mjs';
import { collisionInventory } from '../world-collision-inventory.ts';
import { createWorkshopCraftRuntime, WORKSHOP_CONTACT_ID, WORKSHOP_LEVERS } from './coaster-workshop-craft-runtime.ts';
import { createCoasterChestRuntime, CHEST_BODY_CONTACT, CHEST_LID_CONTACT, CHEST_OPEN_LID } from './coaster-chest-runtime.ts';
import { WORKSHOP_INTAKE, WORKSHOP_TOOLS, workshopTarget } from './intent-workshop-layout.ts';
import { coasterWorld } from './coaster-track.ts';
import { PLAYER_RADIUS, PLAYER_HALF_HEIGHT } from '../actor-physics.ts';

await R.init();
const zero={x:0,y:0,z:0}, up=new Vector3(0,1,0), down=new Vector3(0,-1,0), rotation=new Quaternion();
function sourceDraw(root) {
  const meshes=[];
  root.traverse(object=>{ if(object.isMesh&&object.userData.worldCollisionSources)meshes.push(object); });
  return meshes;
}
function colliderNode(scene, id) {
  const object=new Scene();object.name=id;scene.add(object);return object;
}
function fitted(world, mesh, origin, direction, collider) {
  const visual=new Raycaster(origin,direction,0,10).intersectObjects(mesh,false)[0];
  const physical=world.castRay(new R.Ray(origin,direction),10,true,undefined,undefined,undefined,undefined,c=>c===collider);
  assert.ok(visual&&physical,`draw and contact must both hit from ${origin.toArray()}`);
  return Math.abs(visual.distance-physical.timeOfImpact);
}
test('the active workshop publishes its installed machines and seven actual lever positions while leaving user stations clear',async t=>{
  const {scene:asset}=await readWorldCraftGltf(['docs/world/phase-2-playground/coaster-workshop-craft-20261105/coaster-workshop.glb']);
  const model=createWorkshopCraftRuntime(asset),scene=new Scene(),world=new R.World(zero);
  t.after(()=>{world.free();model.dispose();disposeWorldCraftGltf(asset);});
  scene.name='workshop';scene.add(model.root);
  const body=model.root.getObjectByName('StaticWorkshop');
  const staticShape=world.createCollider(R.ColliderDesc.trimesh(model.contact.vertices,model.contact.indices).setTranslation(...coasterWorld([0,0,0])));
  const colliders=[colliderNode(scene,WORKSHOP_CONTACT_ID)];
  const levers=WORKSHOP_LEVERS.map(({id,position})=>{
    const installed=world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(...position));
    const collider=world.createCollider(R.ColliderDesc.convexHull(model.leverContact),installed);
    colliders.push(colliderNode(scene,id));
    return {installed,collider,position};
  });
  world.step();scene.updateMatrixWorld(true);
  const draw=sourceDraw(body), fits=[WORKSHOP_INTAKE,...WORKSHOP_TOOLS.map(tool=>tool.at)].flatMap(([x,,z])=>
    [-.78,.55].map(dx=>fitted(world,draw,new Vector3(...coasterWorld([x+dx,5,z+.86])),down,staticShape)));
  assert.ok(Math.max(...fits)<.001);
  const avatar=new R.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS);
  for(const id of ['intake','bell',...WORKSHOP_TOOLS.map(tool=>tool.id)]){
    const [x,y,z]=workshopTarget(id);
    assert.ok(!world.intersectionWithShape({x,y:y-.47,z},rotation,avatar),`normal operator ${id} remains clear`);
  }
  for(const tilt of [0,.42,.85,0]){
    const q=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),tilt);
    levers.forEach(({installed,position},i)=>{
      installed.setNextKinematicRotation(q);
      model.setLeverAt(i,new Matrix4().makeRotationFromQuaternion(q).setPosition(...position));
    });
    model.updateLevers();world.step();scene.updateMatrixWorld(true);
    for(const {installed,collider} of levers){
      assert.ok(1-Math.abs(q.dot(new Quaternion().copy(installed.rotation())))<1e-6);
      const bounds=new Box3().setFromBufferAttribute({count:model.leverContact.length/3,
        getX:i=>model.leverContact[i*3],getY:i=>model.leverContact[i*3+1],getZ:i=>model.leverContact[i*3+2]});
      const expected=bounds.getCenter(new Vector3()).applyQuaternion(q).add(installed.translation());
      assert.ok(collider.containsPoint(expected),'tilted grip region is physical');
    }
    const result=collisionInventory(scene,draw,colliders,['workshop']);
    assert.deepEqual(result.errors,[]);
    assert.equal(result.mounted.unclassified,0);
    assert.equal(result.registrations.workshop,8);
  }
  t.diagnostic(JSON.stringify({workshopTriangles:model.contact.indices.length/3,leverCount:levers.length,probes:fits.length,maxErrorMm:Math.max(...fits)*1000}));
});
test('the actual chest shell leaves its open cavity and the hinged lid follows the displayed pose',async t=>{
  const {scene:asset}=await readWorldCraftGltf(['docs/world/phase-2-playground/coaster-chest-transfer-20261104/coaster-chest.glb']);
  const model=createCoasterChestRuntime(asset),scene=new Scene(),world=new R.World(zero);
  t.after(()=>{world.free();model.dispose();disposeWorldCraftGltf(asset);});
  scene.name='chest';scene.add(model.root);
  const shell=model.body.output;
  const p=shell.position;
  const body=world.createCollider(R.ColliderDesc.trimesh(model.body.contact.vertices,model.body.contact.indices)
    .setTranslation(p.x,p.y,p.z).setRotation(shell.quaternion));
  const pivot=model.lid.position;
  const moving=world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(pivot.x,pivot.y,pivot.z));
  const lid=world.createCollider(R.ColliderDesc.convexHull(model.lidContact.vertices),moving);
  const nodes=[colliderNode(scene,CHEST_BODY_CONTACT),colliderNode(scene,CHEST_LID_CONTACT)];
  const draw=sourceDraw(shell), lidDraw=sourceDraw(model.lid);
  world.step();scene.updateMatrixWorld(true);
  const wall=fitted(world,draw,new Vector3(0,.75,3),new Vector3(0,0,-1),body);
  assert.ok(wall<.001);
  const heights=[], cavity=[];
  for(const angle of [0,-.64,CHEST_OPEN_LID]){
    model.lid.rotation.x=angle;
    moving.setNextKinematicRotation(model.lid.quaternion);
    world.step();scene.updateMatrixWorld(true);
    const maxY=new Box3().setFromObject(model.lid).max.y;
    const point=new Vector3(0,.08,1).applyMatrix4(model.lid.matrixWorld);
    const axis=up.clone().applyQuaternion(model.lid.quaternion);
    const origin=point.addScaledVector(axis,2);
    const difference=fitted(world,lidDraw,origin,axis.negate(),lid);
    assert.ok(difference<.035,`lid surface delta ${difference}`);
    const report=collisionInventory(scene,[...draw,...lidDraw],nodes,['chest']);
    assert.equal(report.registrations.chest,2);
    assert.deepEqual(report.errors,[]);
    assert.equal(report.mounted.unclassified,0);
    heights.push(maxY);
    const floor=world.castRay(new R.Ray({x:0,y:5,z:.45},down),6,true);
    assert.ok(floor,'the closed lid or the open cavity has a real surface');
    cavity.push({y:5-floor.timeOfImpact,lid:floor.collider===lid});
  }
  assert.ok(heights[2]-heights[0]>1);
  t.diagnostic(JSON.stringify({wallDelta:wall,lidMaximumY:heights,cavity}));
  assert.ok(cavity[0].lid&&!cavity[2].lid&&cavity[2].y<cavity[0].y-.25);
});
