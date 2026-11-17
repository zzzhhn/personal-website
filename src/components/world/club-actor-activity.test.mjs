import test from 'node:test';
import assert from 'node:assert/strict';
import { createActorActivities } from './actor-activities.ts';
import { registerClubActivity } from './club-actor-activity.ts';
import { registerMineActivity } from './alpha-mine-activity.ts';
import { mineActor, resetMineSession } from './alpha-mine-state.ts';
import { useWorldStore } from './store.ts';
import { CLUB } from './djc-club-layout.ts';

function fixture() {
  useWorldStore.setState({clubMode:null,danceStep:0,nearbyInteract:null});
  const registry=createActorActivities();
  let enabled=0,energy=1,beat=8;
  const dispose=registerClubActivity(registry,{
    enable(){enabled++;return Promise.resolve();},energy:()=>energy,beat:()=>beat,
  });
  return {registry,dispose,enabled:()=>enabled,setEnergy:v=>energy=v,setBeat:v=>beat=v,
    key:(code,repeat=false)=>registry.keyboard({code,repeat}),
    mode:v=>useWorldStore.setState({clubMode:v})};
}

test('audio unlock happens in the input call, only for a fresh Club activation key',()=>{
  const f=fixture();
  try {
    for(const id of ['djc-club-dance','djc-club-decks']) {
      useWorldStore.setState({nearbyInteract:{id}});
      const before=f.enabled();
      assert.equal(f.key('KeyE'),undefined);assert.equal(f.enabled(),before+1);
      f.key('KeyE',true);f.key('KeyW');assert.equal(f.enabled(),before+1);
    }
    useWorldStore.setState({nearbyInteract:{id:'another-venue'}});
    f.key('KeyE');assert.equal(f.enabled(),2);
    assert.equal(f.registry.interact(),false);
  } finally {f.dispose();}
});

test('dance keeps walking available, changes steps, and follows the live audible beat',()=>{
  const f=fixture();
  try {
    const idle=f.registry.inputContext();f.mode('dance');
    assert.notEqual(f.registry.inputContext(),idle);
    assert.equal(f.registry.inputOwner(),null);assert.equal(f.registry.movementLocked(),false);
    assert.equal(f.registry.blocksOffers(),true);
    assert.deepEqual(f.registry.animation(),{dance:0,danceBeat:8});
    assert.equal(f.key('Digit2'),'handled');f.setBeat(12.25);
    assert.deepEqual(f.registry.animation(),{dance:1,danceBeat:12.25});
    f.setEnergy(0);assert.deepEqual(f.registry.animation(),{dance:null,danceBeat:12.25});
    f.key('Digit1');assert.equal(useWorldStore.getState().danceStep,0);
    assert.equal(f.key('KeyW'),undefined);assert.equal(useWorldStore.getState().clubMode,null);
    assert.equal(f.registry.inputContext(),idle);assert.equal(f.registry.blocksOffers(),false);
    assert.deepEqual(f.registry.animation(),{dance:null,danceBeat:0});
  } finally {f.dispose();}
});

test('dance can leave through keyboard movement, jump, gamepad movement or interaction',()=>{
  const f=fixture();
  try {
    for(const code of ['KeyW','KeyA','KeyS','KeyD','Space']) {
      f.mode('dance');f.key(code);assert.equal(useWorldStore.getState().clubMode,null,code);
    }
    for(const [moving,jumping] of [[true,false],[false,true]]) {
      f.mode('dance');f.registry.input(moving,jumping);assert.equal(useWorldStore.getState().clubMode,null);
    }
    f.mode('dance');f.registry.input(false,false);assert.equal(useWorldStore.getState().clubMode,'dance');
    assert.equal(f.registry.interact(),true);assert.equal(f.registry.interact(),false);
  } finally {f.dispose();}
});

test('DJ input ownership blocks movement but never traps the player out of E or gamepad exit',()=>{
  const f=fixture();
  try {
    f.mode('dj');
    assert.equal(f.registry.inputOwner(),'club:decks');assert.equal(f.registry.movementLocked(),true);
    assert.deepEqual(f.registry.facing(),CLUB.console);assert.equal(f.registry.blocksOffers(),true);
    f.registry.sync({available:true});assert.equal(useWorldStore.getState().clubMode,'dj');
    for(const code of ['KeyW','Space','Digit1','KeyF','KeyV']) assert.equal(f.key(code),'blocked');
    f.registry.input(true,true);f.registry.clearInput();assert.equal(useWorldStore.getState().clubMode,'dj');
    assert.equal(f.key('KeyE',true),'handled');assert.equal(useWorldStore.getState().clubMode,'dj');
    assert.equal(f.key('KeyE'),'handled');assert.equal(f.registry.inputOwner(),null);
    f.mode('dj');assert.equal(f.registry.interact(),true);assert.equal(f.registry.facing(),null);
  } finally {f.dispose();}
});

test('Club occupation excludes other venues without cancelling its own valid pose',()=>{
  const f=fixture();resetMineSession();const removeMine=registerMineActivity(f.registry);
  try {
    for(const mode of ['dance','dj']) {
      f.mode(mode);f.registry.sync({available:true});
      assert.equal(useWorldStore.getState().clubMode,mode);assert.equal(mineActor.available,false);
      f.registry.interact();f.registry.sync({available:true});assert.equal(mineActor.available,true);
    }
    f.mode('dance');f.registry.sync({available:false});assert.equal(useWorldStore.getState().clubMode,null);
    for(const reason of ['motion','recovery','blocked']) {
      f.mode('dj');f.registry.interrupt(reason);assert.equal(f.registry.inputOwner(),null);
    }
  } finally {removeMine();f.dispose();}
});

test('foreign input owners cannot unlock Club audio or have their interaction stolen',()=>{
  const f=fixture();let exits=0;
  const remove=f.registry.register({id:'console',read:()=>({busy:true,carrying:false,inputOwner:'panel'}),
    sync(){},input(){},advance(){},command(){return false;},interrupt(){},dispose(){},
    keyboard:()=> 'blocked',interact:()=>{exits++;return true;}});
  try {
    useWorldStore.setState({nearbyInteract:{id:'djc-club-decks'}});
    assert.equal(f.key('KeyE'),'blocked');assert.equal(f.enabled(),0);
    assert.equal(f.registry.interact(),true);assert.equal(exits,1);
    f.mode('dance');f.registry.sync({available:true});assert.equal(useWorldStore.getState().clubMode,null);
  } finally {remove();f.dispose();}
});

test('unmount releases live Club state and every registered control hook',()=>{
  const f=fixture();f.mode('dj');f.dispose();f.dispose();
  assert.equal(useWorldStore.getState().clubMode,null);
  assert.equal(f.registry.inputOwner(),null);assert.equal(f.registry.blocksOffers(),false);
  assert.equal(f.key('KeyE'),undefined);assert.equal(f.registry.interact(),false);
  assert.deepEqual(f.registry.animation(),{dance:null,danceBeat:0});
});
