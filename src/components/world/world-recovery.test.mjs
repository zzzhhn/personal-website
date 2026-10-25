import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { CAMP_SPAWN } from './layout.ts';
import { useWorldStore, requestCampReturn, handleWorldEscape } from './store.ts';
import { useAlphaMineStore, mineActor, mineVisualSockets } from './alpha-mine-state.ts';
import { useMineOnline } from './alpha-mine-online.ts';
import { returnPlayerToCamp } from './world-recovery.ts';
await RAPIER.init();
const initialWorld=structuredClone(useWorldStore.getState()),initialMine=structuredClone(useAlphaMineStore.getState());
const id='REVERSAL_5';
const atCamp=body=>Object.values(body.translation()).every((v,i)=>Math.abs(v-CAMP_SPAWN[i])<1e-5);
function scene(){
  useWorldStore.setState(structuredClone(initialWorld),true);useAlphaMineStore.setState(structuredClone(initialMine),true);
  const world=new RAPIER.World({x:0,y:0,z:0});
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(-100,-6,-80).lockRotations());
  world.createCollider(RAPIER.ColliderDesc.capsule(.48,.34),body);
  return {world,body};
}
test('Escape closes pool inspection before the map, closes cards, and toggles the pause menu',()=>{
  useWorldStore.setState(structuredClone(initialWorld),true);
  useWorldStore.setState({poolInspect:true});handleWorldEscape();
  assert.equal(useWorldStore.getState().poolInspect,false);assert.equal(useWorldStore.getState().paused,false);
  useWorldStore.setState({card:{kind:'note',id:'qa'}});handleWorldEscape();
  assert.equal(useWorldStore.getState().card,null);assert.equal(useWorldStore.getState().paused,false);
  handleWorldEscape();assert.equal(useWorldStore.getState().paused,true);
  handleWorldEscape();assert.equal(useWorldStore.getState().paused,false);
});
test('return request synchronously recovers from a pit while paused, clearing seat, card and focus',()=>{
  const {world,body}=scene();let transient=0,camera=0;
  try {
    body.setEnabled(false);body.setLinvel({x:8,y:-12,z:3},true);body.addForce({x:100,y:0,z:20},true);
    useWorldStore.setState({paused:true,poolInspect:true,seat:{id:'bench',position:[-100,-6,-80],yaw:1},card:{kind:'note',id:'qa'},nearbyVehicle:'coupe',canRecover:true});
    const unsubscribe=useWorldStore.subscribe((s,p)=>{
      if(s.campReturnRequest!==p.campReturnRequest)returnPlayerToCamp(body,undefined,()=>{transient++;},()=>{camera++;});
    });
    requestCampReturn();unsubscribe(); // No world.step or render was required to service the request.
    assert.ok(atCamp(body));assert.equal(body.isEnabled(),true);
    assert.deepEqual(Object.values(body.linvel()),[0,0,0]);assert.deepEqual(Object.values(body.angvel()),[0,0,0]);
    const s=useWorldStore.getState();
    assert.equal(s.paused,false);assert.equal(s.poolInspect,false);assert.equal(s.seat,null);assert.equal(s.card,null);
    assert.equal(s.activeVehicle,null);assert.equal(s.nearbyVehicle,null);assert.equal(s.canRecover,false);
    assert.equal(s.zone,'camp');assert.equal(s.speed,0);assert.equal(transient,1);assert.equal(camera,1);
    for(let i=0;i<10;i++)world.step();assert.ok(atCamp(body),'old forces cannot resume');
  }finally{world.free();}
});
test('carried ore, seam progress, shelf ore, pool selections and accepted online results survive return',()=>{
  const {world,body}=scene();
  try {
    const veins={...initialMine.veins,[id]:{revealed:true,hits:3,collected:true}};
    const result={fixture:'previously accepted result'};
    useMineOnline.setState(s=>({factors:{...s.factors,[id]:{...s.factors[id],status:'ready',result}}}));
    useAlphaMineStore.setState({equipped:true,carried:id,veins,bays:[id,'ROC20_RANK'],dropped:{factorId:'LOW_STD_20',position:[1,.7,1]},recovered:['ROC20_RANK']});
    const before=structuredClone(useAlphaMineStore.getState());
    Object.assign(mineActor,{moving:true,available:true,grounded:true,restTarget:[1,2,3]});mineVisualSockets.valid=true;
    returnPlayerToCamp(body,undefined,()=>{},()=>{});
    assert.deepEqual(useAlphaMineStore.getState(),before);
    assert.equal(useMineOnline.getState().factors[id].result,result);
    assert.equal(mineActor.moving,false);assert.equal(mineActor.restTarget,null);assert.equal(mineVisualSockets.valid,false);
  }finally{world.free();}
});
for(const kind of ['strike','pickup','deposit'])test(`return during ${kind} cancels only the transient action without losing ore`,()=>{
  const {world,body}=scene();
  try {
    useAlphaMineStore.setState({equipped:true,carried:kind==='pickup'?id:null,
      action:{kind,elapsed:.6,duration:1.4,target:[1,.7,0],origin:[0,1,0],factorId:id,contact:true,bay:0}});
    returnPlayerToCamp(body,undefined,()=>{},()=>{});
    assert.equal(useAlphaMineStore.getState().action,null);
    assert.equal(useAlphaMineStore.getState().carried,kind==='strike'?null:id);
  }finally{world.free();}
});
test('return exits a disabled driver capsule and stops the driven car without relocating it',()=>{
  const {world,body}=scene();
  try {
    const car=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(1,2,3));
    world.createCollider(RAPIER.ColliderDesc.cuboid(.5,.5,.5).setMass(1000),car);
    car.setLinvel({x:20,y:2,z:4},true);car.setAngvel({x:0,y:5,z:0},true);car.addForce({x:300,y:0,z:20},true);
    body.setEnabled(false);useWorldStore.setState({activeVehicle:'coupe',paused:true});
    returnPlayerToCamp(body,car,()=>{},()=>{});
    assert.equal(useWorldStore.getState().activeVehicle,null);assert.equal(body.isEnabled(),true);
    assert.deepEqual(Object.values(car.translation()),[1,2,3]);assert.deepEqual(Object.values(car.linvel()),[0,0,0]);
    assert.deepEqual(Object.values(car.angvel()),[0,0,0]);world.step();assert.deepEqual(Object.values(car.translation()),[1,2,3]);
  }finally{world.free();}
});
