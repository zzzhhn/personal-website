import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Group, Mesh, Scene, Vector3 } from 'three';
import { buildFactoryCarrier, FACTORY_CARRIER_HANDHOLDS } from './factory-carrier.ts';
import { FACTORY_PALETTE } from './factory-geometry.ts';
import { buildFactoryCompanion } from './factory-companion.ts';
import { factoryActiveContactCounts, factoryMovingContact, factoryMovingMeshContact } from './factory-live-contact.ts';
import { createFactoryGame } from './factory-game.ts';
import { createFactoryOperation } from './factory-operation.ts';
import { collisionInventory } from '../world-collision-inventory.ts';

await R.init();

function install(world, scene, visual, id) {
  const source = factoryMovingMeshContact(visual, id);
  const contact = factoryMovingContact(source.id, source.meshes);
  contact.body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
  contact.attachCollider(world.createCollider(R.ColliderDesc.trimesh(...source.args), contact.body));
  const supply = new Group(); supply.name = id; scene.add(supply);
  return { source, contact, supply };
}
const down = { x: 0, y: -1, z: 0 };
const ray = (origin, x, z) => new R.Ray({x:origin.x+x,y:origin.y+.4,z:origin.z+z},down);

test('the actual carrier follows outfeed and reset without filling its handholds or leaving a hidden obstacle', t => {
  const world = new R.World({ x: 0, y: 0, z: 0 }), scene = new Scene(); scene.name = 'factory-live-test';
  t.after(() => world.free());
  const visual = new Mesh(buildFactoryCarrier('frame', FACTORY_PALETTE).geometry);
  t.after(() => { visual.geometry.dispose(); visual.material.dispose(); });
  const factory = new Group(); factory.position.set(-197.5,1,12.5); factory.add(visual); scene.add(factory);
  const { contact, supply } = install(world, scene, visual, 'carrier-frame');
  const position = new Vector3();
  for(const x of [-27,-20,19.8]){
    visual.position.set(x,1.275,-11);
    contact.sync(visual,true); world.step(); visual.getWorldPosition(position);
    const hit = world.castRay(ray(position,0,0),.6,true);
    assert.ok(hit, 'physical carrier follows the rendered outfeed');
    assert.equal(hit.collider.handle,contact.collider.handle);
    assert.ok(Math.abs(hit.timeOfImpact-.4)<.0001);
    for(const hole of FACTORY_CARRIER_HANDHOLDS)assert.ok(!world.castRay(ray(position,hole.x,0),.6,true));
    const stock=collisionInventory(scene,[visual],[supply],[scene.name]);
    assert.deepEqual(stock.errors,[]);
    assert.equal(stock.registrations[scene.name],1);
  }
  visual.position.x=-27;
  contact.sync(visual,true,false,true);
  world.step();
  assert.ok(!world.castRay(ray(position,0,0),.6,true),'no physical trip between reset points');
  visual.getWorldPosition(position);
  assert.ok(world.castRay(ray(position,0,0),.6,true));
  contact.sync(visual,false); world.step();
  assert.ok(!world.castRay(ray(position,0,0),.6,true));
  assert.equal(visual.userData.worldCollision,'none');
  visual.position.x=20;
  contact.sync(visual,true);world.step();visual.getWorldPosition(position);
  assert.ok(world.castRay(ray(position,0,0),.6,true),'produced stock takes contact again at its real pose');
});

test('the exposed companion chassis and bumpers share one exact source through turning and temporary removal', t => {
  const world = new R.World({ x: 0, y: 0, z: 0 }), scene = new Scene(); scene.name='factory-companion-test';
  const model=buildFactoryCompanion({configuration:'nimble',shell:true});
  t.after(()=>{world.free();model.dispose();});
  model.group.remove(model.wheelModule,model.shell);scene.add(model.group);
  const {contact,source,supply}=install(world,scene,model.group,'companion-chassis');
  assert.equal(source.meshes.length,2);
  model.group.position.set(-161,1.7,40);
  model.group.rotation.set(.16,1.22,0,'YXZ');
  contact.sync(model.group,true,true);world.step();
  const p=model.group.localToWorld(new Vector3(0,.9,0));
  const facing=model.group.quaternion;
  assert.ok(Math.abs(contact.body.rotation().y-facing.y)<.00001);
  const hit=world.castRay(new R.Ray(p,down),1.1,true);
  assert.equal(hit?.collider.handle,contact.collider.handle);
  const audit=collisionInventory(scene,source.meshes,[supply],[scene.name]);
  assert.deepEqual(audit.errors,[]);
  assert.equal(audit.registrations[scene.name],1);
  contact.sync(model.group,false);world.step();
  assert.ok(!world.castRay(new R.Ray(p,down),1.1,true));
  assert.ok(source.meshes.every(m=>m.userData.worldCollision==='none'));
});

test('the venue requires live, trial and archived supplies only while their gameplay state calls for them', () => {
  const game=createFactoryGame('physical-factory-audit');
  const initial=factoryActiveContactCounts(true,game,null);
  assert.deepEqual(initial,{
    'factory-report-printer-contact':3,
    'factory-live-mechanisms':13,
    'factory-physical-trials':0,
    'factory-completed-companion':0,
  });
  const output=createFactoryOperation({type:'process',module:'frame'});
  output.phase='outfeed';
  assert.equal(factoryActiveContactCounts(true,game,output)['factory-live-mechanisms'],14);
  const assembled={...game,parts:{frame:{id:'frame'},wheels:{id:'wheels'},shell:{id:'shell'}}};
  assert.equal(factoryActiveContactCounts(true,assembled,null)['factory-live-mechanisms'],16);
  const trial={...assembled,pending:{action:{type:'test',mode:'comparison'}}};
  assert.equal(factoryActiveContactCounts(true,trial,null)['factory-live-mechanisms'],13);
  assert.equal(factoryActiveContactCounts(true,trial,null)['factory-physical-trials'],2);
  const archived={...game,archives:[{configuration:{kind:'nimble'}}]};
  assert.equal(factoryActiveContactCounts(true,archived,null)['factory-completed-companion'],2);
  assert.ok(Object.values(factoryActiveContactCounts(false,trial,null)).every(n=>n===0));

  const venue=new Scene();
  venue.userData.worldContactCounts=()=>factoryActiveContactCounts(true,trial,null);
  const missing=collisionInventory(venue,[],[],[]).errors;
  for(const required of ['factory-live-mechanisms','factory-physical-trials','factory-report-printer-contact']){
    assert.ok(missing.some(issue=>issue.includes(required)),required+' cannot disappear from the whole venue');
  }
});

test('the parked display contacts the actual envelope and leaves the ordinary floor-level gap under the chassis',t=>{
  const world=new R.World({x:0,y:0,z:0});
  const visual=buildFactoryCompanion({configuration:'steady',shell:true});
  t.after(()=>{world.free();visual.dispose();});
  const source=factoryMovingMeshContact(visual.group,'factory-archive-body-contact');
  const archived=world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(33,0,24));
  const body=world.createCollider(R.ColliderDesc.trimesh(...source.args).setTranslation(0,.24,0),archived);
  const plinth=world.createCollider(R.ColliderDesc.cuboid(.75,.06,.75).setTranslation(0,.18,0),archived);
  world.step();
  const top=world.castRay(new R.Ray({x:33,y:2,z:24},down),2,true);
  assert.equal(top?.collider.handle,body.handle);
  const floorGap=new R.Ray({x:32,y:.3,z:24},{x:1,y:0,z:0});
  assert.ok(!world.castRay(floorGap,2,true),'there is no invented box under the chassis');
  const base=world.castRay(new R.Ray({x:32.35,y:2,z:24},down),2,true);
  assert.equal(base?.collider.handle,plinth.handle);
});
