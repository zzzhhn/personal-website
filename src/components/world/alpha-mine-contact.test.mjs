import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DoubleSide, Group, Object3D, Raycaster, Scene, Vector3 } from 'three';
import { PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from './actor-physics.ts';
import { mineLocalToWorld, ALPHA_MINE_ORIGIN } from './alpha-mine-layout.ts';
import { installMineContacts, mineRackToolPose, MINE_RACK_ROOT, MINE_WEST_RAMP_ROOT } from './alpha-mine-contact.ts';
import { collisionInventory } from './world-collision-inventory.ts';
import { minePickupApproach } from './mine-pickup-approach.ts';
import { findPickupStand } from './pickup-approach.ts';
import { disposeWorldCraftGltf, readWorldCraftGltf } from './world-craft-gltf-test.mjs';
import { readMineStaticVisual } from '../../../tools/world/alpha-mine-tests/static-visual.mjs';
import { RAPIER as R, quarryWalkCases, quarryWorld, walkQuarry } from '../../../tools/world/alpha-mine-tests/quarry-walk.mjs';

const ship = name=>JSON.parse(readFileSync(new URL('../../../public/world/alpha-mine/'+name,import.meta.url),'utf8'));
const old=ship('colliders.json'), layout=ship('layout.json');
const asset=await readMineStaticVisual();
const result=installMineContacts(asset.root.clone(true),old);
test.after(()=>{result.dispose();asset.dispose();});
const part = id => result.colliders.find(part=>part.id==='alpha-mine-'+id);
const cast = (collider,p,d,distance) => collider.castRay(new R.Ray(new Vector3(...p),new Vector3(...d)),distance,false);

function mount(world, kind, buffers, translation=[0,0,0]) {
  const body=world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...translation));
  body.userData={kind};
  const vertices=Float32Array.from(buffers.vertices), indices=Uint32Array.from(buffers.indices);
  return world.createCollider(R.ColliderDesc.trimesh(vertices,indices).setFriction(.9).setRestitution(0),body);
}
function candidateWorld(translation=[0,0,0]) {
  const world=new R.World({x:0,y:-12.5,z:0});world.timestep=1/60;
  for(const [kind,buffers] of Object.entries(result.legacy)) mount(world,kind,buffers,translation);
  for(const {kind,buffers} of result.colliders) mount(world,kind,buffers,translation);
  world.step();
  return world;
}

test('the shipping visual is split exactly once and audited scopes require four distinct physical shapes',()=>{
  const restored=installMineContacts(asset.root.clone(true),old);
  const scene=new Scene(), frame=[];
  try {
    for(const [name,source,registrations] of [[MINE_RACK_ROOT,restored.rack,2],[MINE_WEST_RAMP_ROOT,restored.westRamp,2]]) {
      const scope=new Group(); scope.name=name; scene.add(scope);
      scope.add(source);
      source.traverse(node=>{if(node.isMesh)frame.push(node);});
      assert.equal(restored.colliders.filter(part=>part.root===name).length,registrations);
    }
    const handles=restored.colliders.map(part=>{
      const collider=new Object3D(); collider.name=part.id; scene.getObjectByName(part.root).add(collider);
      return collider;
    });
    const report=collisionInventory(scene,frame,handles,[MINE_RACK_ROOT,MINE_WEST_RAMP_ROOT]);
    assert.deepEqual(report.errors,[]);
    assert.deepEqual(report.registrations,{[MINE_RACK_ROOT]:2,[MINE_WEST_RAMP_ROOT]:2});
    assert.ok(collisionInventory(scene,frame,handles.slice(1),[MINE_RACK_ROOT,MINE_WEST_RAMP_ROOT]).errors.length>0);
    assert.equal(old.surface.indices.length-restored.legacy.surface.indices.length,6,'remove the obsolete west deck support before mounting its real planks');
    assert.equal(old.solid.indices.length-restored.legacy.solid.indices.length,1656,'remove 34 former ramp and 12 former rack boxes');
    assert.deepEqual([...restored.rack.children,...restored.westRamp.children].map(m=>[m.name,m.geometry.index.count/3]).sort(),
      [['alpha-mine-rack-frame-visible',528],['alpha-mine-rack-hooks-visible',88],['alpha-mine-west-deck-visible',2024],
       ['alpha-mine-west-fasteners-visible',672],['alpha-mine-west-structure-visible',1496]]);
  } finally {restored.dispose();}
});

test('both visible rack hooks block their real front faces and the working tools can still be approached',async t=>{
  const baseline=quarryWorld(), upgraded=candidateWorld();
  const detector=await readWorldCraftGltf(['public/world/alpha-mine/detector.glb']);
  const pickaxe=await readWorldCraftGltf(['public/world/alpha-mine/pickaxe.glb']);
  const world=candidateWorld(ALPHA_MINE_ORIGIN);
  try {
    const hit=(physics,x)=>physics.castRay(new R.Ray({x,y:1.5,z:-2.95},{x:0,y:0,z:-1}),.38,false);
    const results=[-9.35,-8.2].map(x=>[hit(baseline,x)?.timeOfImpact??null,hit(upgraded,x)?.timeOfImpact??null]);
    assert.ok(results.every(([oldDistance,newDistance])=>oldDistance===null && newDistance>.26 && newDistance<.31),JSON.stringify(results));
    const targetPose=mineRackToolPose(asset.root,detector.scene.getObjectByName('detector'),'detector');
    const axePose=mineRackToolPose(asset.root,pickaxe.scene.getObjectByName('pickaxe'),'pickaxe');
    const socket=asset.root.getObjectByName('rack_detector').getWorldPosition(new Vector3()).toArray();
    assert.ok(socket.every((v,i)=>Math.abs(v-layout.toolRack.detectorSocket[i])<.00001));
    assert.deepEqual(axePose.matrix.elements.slice(12,15),asset.root.getObjectByName('rack_pickaxe').getWorldPosition(new Vector3()).toArray());
    const target=mineLocalToWorld(targetPose.target), from=mineLocalToWorld([-9.05,PLAYER_HALF_HEIGHT+PLAYER_RADIUS+.002,-1.88]);
    const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...from).lockRotations());
    world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),body); world.step();
    const pickup=minePickupApproach(()=>target,'tools'), stand=findPickupStand(world,R,body,from,pickup);
    assert.ok(stand && pickup.ready(stand),JSON.stringify({target,from,stand}));
    t.diagnostic(JSON.stringify({hookRaysOldNew:results,placedDetectorTarget:target,validGripStand:stand}));
  } finally {baseline.free();upgraded.free();world.free();disposeWorldCraftGltf(detector.scene);disposeWorldCraftGltf(pickaxe.scene);}
});

test('placed west ramp triangles track the actual plank tops, reveals and rails',async t=>{
  const source=asset.root.clone(true), fitted=installMineContacts(source,old), world=new R.World({x:0,y:0,z:0});
  const ray = new Raycaster(), deck=mount(world,'surface',part('west-deck').buffers), rail=mount(world,'solid',part('west-structure').buffers);
  const former = mount(world,'surface',old.surface);
  let plankHits=0, reveals=0, structureHits=0, maxError=0;
  try {
    fitted.westRamp.updateMatrixWorld(true);
    const timber = fitted.westRamp.children.filter(m=>m.userData.worldCollision==='solid');
    for(const mesh of timber) mesh.material.side=DoubleSide;
    const run=(mesh,shape,origin,dir,distance)=>{
      ray.set(new Vector3(...origin),new Vector3(...dir));ray.far=distance;
      const visual=ray.intersectObject(mesh)[0],actual=cast(shape,origin,dir,distance);
      assert.equal(actual>=0,Boolean(visual),JSON.stringify({mesh:mesh.name,origin,actual}));
      if (visual) maxError=Math.max(maxError,Math.abs(actual-visual.distance));
      return Boolean(visual);
    };
    const [deckMesh,structure] = timber;
    for(let z=-9.017;z>-21;z-=.047)for(const x of [-12.65,-11.814,-10.95]){
      const y=-(z+9)/4, point=[x,y+.14,z],vertical=[0,-1,0];
      if(run(deckMesh,deck,point,vertical,.158)) plankHits++;
      else if (cast(former,point,vertical,.158)>=0) reveals++;
    }
    for(let z=-9.015;z>-21;z-=.12)for(const y of [.40,.47,.51,.89,.99,1.03,1.09]) {
      if(run(structure,rail,[-11.8,-(z+9)/4+y,z],[1,0,0],1.7)) structureHits++;
    }
    assert.ok(plankHits>680 && reveals>12 && structureHits>150 && maxError<.00005,JSON.stringify({plankHits,reveals,structureHits,maxError}));
    t.diagnostic(JSON.stringify({plankHits,reveals,structureHits,maxError}));
  } finally {fitted.dispose();world.free();}
});

for(const name of ['core-west-ramp','crate-east-approach','west-support-to-entrance','west-support-to-entrance-reverse','ravine-to-forecourt']){
  test('real collision still supports continuous controlled walking through '+name,t=>{
    const route=quarryWalkCases()[name], result=walkQuarry(route,{createWorld:candidateWorld});
    t.diagnostic(JSON.stringify(result));
    assert.ok(result.passed,JSON.stringify(result));
  });
}
