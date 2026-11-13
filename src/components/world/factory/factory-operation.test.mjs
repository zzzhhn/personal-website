import test from 'node:test';
import assert from 'node:assert/strict';
import {createFactoryOperation,stepFactoryOperation,factoryAssemblyModules,FACTORY_RAW_PICK,FACTORY_RAW_DROP,FACTORY_RAW_HALF_HEIGHT,FACTORY_MAGNET_HALF_HEIGHT,FACTORY_RAW_IDLE,factoryRawDrop,
  FACTORY_ASSEMBLY_PICK,FACTORY_ASSEMBLY_PICK_HEIGHT,FACTORY_ASSEMBLY_CONTACT,FACTORY_ASSEMBLY_IDLE,FACTORY_ASSEMBLY_BOUNDS} from './factory-operation.ts';
import {createFactoryInspection,advanceFactoryInspection} from './factory-inspection.ts';
import {useWorldStore,handleWorldEscape,requestCampReturn} from '../store.ts';
import {useFactoryStore,factoryControl,factoryActor,openFactoryStation,startFactoryOperation,closeFactoryStation,connectFactoryWorld,tickFactoryOperation} from './factory-store.ts';
import {createFactoryGame} from './factory-game.ts';
import {factoryWorld,factoryStation} from './factory-layout.ts';
const neutral={x:0,z:0,held:false,confirm:false},dt=1/60;
function run(op,seconds,input=neutral){for(let i=0;i<seconds*60;i++)stepFactoryOperation(op,input,dt);}
function move(op,target){for(let i=0;i<1200;i++){
  const x=target[0]-op.tool[0],z=target[2]-op.tool[2];if(Math.hypot(x,z)<.06)return;
  stepFactoryOperation(op,{...neutral,x:Math.max(-1,Math.min(1,x*4)),z:Math.max(-1,Math.min(1,z*4))},dt);
}throw Error('Hoist failed to reach target');}
function until(op,phase){for(let i=0;i<6000&&op.phase!==phase;i++)stepFactoryOperation(op,neutral,dt);assert.equal(op.phase,phase);}
function driveAssembly(op,observe=()=>{}){
  for(let i=0;i<12000&&op.phase!=='done';i++){
    let input=neutral;
    if(op.phase==='aim')input={...neutral,confirm:true};
    if(op.phase==='carry'){
      const x=op.target[0]-op.tool[0],z=op.target[2]-op.tool[2];
      input={...neutral,x:Math.max(-1,Math.min(1,x*4)),z:Math.max(-1,Math.min(1,z*4)),confirm:Math.hypot(x,z)<.06};
    }
    const before=structuredClone(op);stepFactoryOperation(op,input,dt);observe(before,op);
  }
  assert.equal(op.phase,'done');
}
test('raw material needs actual alignment, pickup, carry and drop; idle time cannot complete it',()=>{
  const op=createFactoryOperation({type:'extract',module:'frame'});run(op,20,{...neutral,confirm:true});assert.equal(op.phase,'aim');
  move(op,FACTORY_RAW_PICK.frame);stepFactoryOperation(op,{...neutral,confirm:true},dt);run(op,1.5);
  assert.equal(op.phase,'carry');assert.equal(op.attached,true);
  run(op,5,{...neutral,confirm:true});assert.equal(op.phase,'carry','cannot drop over the wrong bin');
  move(op,FACTORY_RAW_DROP);stepFactoryOperation(op,{...neutral,confirm:true},dt);run(op,1.2);
  assert.equal(op.phase,'outfeed');assert.equal(op.attached,false);
  assert.ok(op.progress<1,'blank must travel to staging before the transaction commits');
  run(op,6);assert.equal(op.phase,'done');assert.deepEqual(op.tool,FACTORY_RAW_IDLE);
});
test('magnet underside reaches each raw top without pulling its centre through the pickup plane',()=>{
  for(const module of ['frame','wheels','shell']){
    const op=createFactoryOperation({type:'extract',module});move(op,op.target);
    stepFactoryOperation(op,{...neutral,confirm:true},dt);
    let attached=false;
    for(let i=0;i<90;i++){
      stepFactoryOperation(op,neutral,dt);
      const bottom=op.tool[1]-FACTORY_MAGNET_HALF_HEIGHT;
      assert.ok(bottom>=FACTORY_RAW_PICK[module][1]+FACTORY_RAW_HALF_HEIGHT[module]-.001);
      if(op.attached&&!attached){
        assert.ok(Math.abs(bottom-FACTORY_RAW_HALF_HEIGHT[module]-FACTORY_RAW_PICK[module][1])<.004);
        attached=true;
      }
    }
    assert.equal(attached,true);
  }
});
test('press interlock requires a held lever; early release safely retracts and output travels before committing',()=>{
  const op=createFactoryOperation({type:'process',module:'frame'});run(op,20);assert.equal(op.phase,'ready');
  run(op,1,{...neutral,held:true});assert.ok(op.stroke>0);run(op,1);assert.equal(op.stroke,0);assert.equal(op.guard,0);
  run(op,3,{...neutral,held:true});assert.equal(op.phase,'outfeed');assert.ok(op.progress<1);
  run(op,7);assert.equal(op.phase,'done');
});
test('assembly fetches real outfeeds and waits for pickup confirmation before attaching any part',()=>{
  for(const module of ['frame','wheels','shell']){
    const op=createFactoryOperation({type:module==='shell'?'final-assemble':'trial-assemble'},[module]);
    assert.deepEqual(op.tool,FACTORY_ASSEMBLY_IDLE);assert.equal(op.attached,false);assert.equal(op.phase,'fetch');
    assert.deepEqual(op.target,FACTORY_ASSEMBLY_PICK[module]);assert.equal(op.target[1],FACTORY_ASSEMBLY_PICK_HEIGHT);
    until(op,'aim');run(op,5);assert.equal(op.phase,'aim');assert.equal(op.attached,false);
    assert.equal(op.tool[0],op.target[0]);assert.equal(op.tool[2],op.target[2]);
    run(op,.5,{...neutral,x:1});stepFactoryOperation(op,{...neutral,confirm:true},dt);assert.equal(op.phase,'aim');assert.equal(op.attached,false);
    move(op,op.target);stepFactoryOperation(op,{...neutral,confirm:true},dt);assert.equal(op.phase,'pickup');assert.equal(op.attached,false);
    until(op,'lift');assert.equal(op.attached,true);assert.deepEqual(op.tool,FACTORY_ASSEMBLY_PICK[module]);
    until(op,'carry');const before=structuredClone(op);run(op,1);assert.deepEqual(op,before,'carry requires player movement');
    stepFactoryOperation(op,{...neutral,confirm:true},dt);assert.equal(op.phase,'carry','cannot seat over the outfeed');
  }
});
test('assembly samples continuous tool and module contact through every pickup, seating and idle return',()=>{
  for(const [action,modules] of [[{type:'trial-assemble'},['frame','wheels']],[{type:'final-assemble'},['shell']]]){
    const op=createFactoryOperation(action,modules),phases=new Set([op.phase]),pickups=[],seats=[];
    const positions=Object.fromEntries(modules.map(module=>[module,[...FACTORY_ASSEMBLY_PICK[module]]]));
    driveAssembly(op,(before,after)=>{
      phases.add(after.phase);
      assert.ok(Math.hypot(...after.tool.map((value,i)=>value-before.tool[i]))<=4*dt+.000001,'tool cannot teleport');
      assert.ok(after.tool[0]>=FACTORY_ASSEMBLY_BOUNDS.x[0]&&after.tool[0]<=FACTORY_ASSEMBLY_BOUNDS.x[1]);
      assert.ok(after.tool[2]>=FACTORY_ASSEMBLY_BOUNDS.z[0]&&after.tool[2]<=FACTORY_ASSEMBLY_BOUNDS.z[1]);
      if(after.attached&&!before.attached){
        pickups.push(after.assemblyModule);assert.deepEqual(after.tool,FACTORY_ASSEMBLY_PICK[after.assemblyModule]);
        assert.deepEqual(positions[after.assemblyModule],after.tool,'attachment first touches the stationary part');
      }
      if(after.seated>before.seated){
        seats.push(before.assemblyModule);assert.deepEqual(after.tool,FACTORY_ASSEMBLY_CONTACT);assert.equal(after.attached,false);
        assert.equal(after.assemblyModule,before.assemblyModule,'release keeps the same gripper through retract');
      }
      for(const module of modules){
        const index=modules.indexOf(module),previous=positions[module];
        const next=index<after.seated?FACTORY_ASSEMBLY_CONTACT:after.attached&&module===after.assemblyModule?after.tool:FACTORY_ASSEMBLY_PICK[module];
        assert.ok(Math.hypot(...next.map((value,i)=>value-previous[i]))<=4*dt+.000001,'part cannot teleport');
        positions[module]=[...next];
      }
    });
    assert.deepEqual(pickups,modules);assert.deepEqual(seats,modules);assert.equal(op.seated,modules.length);
    assert.deepEqual(op.tool,FACTORY_ASSEMBLY_IDLE);assert.equal(op.attached,false);
    for(const phase of ['fetch','aim','pickup','lift','carry','seat','retract','home','done'])assert.ok(phases.has(phase),phase);
    const next=createFactoryOperation({type:'final-assemble'});assert.deepEqual(next.tool,op.tool,'next operation begins without snapping');
  }
});
test('assembly pause freezes mid-fetch and retract; long frames remain bounded',()=>{
  const op=createFactoryOperation({type:'trial-assemble'},['wheels']);run(op,.5);assert.equal(op.phase,'fetch');
  const pausedFetch=structuredClone(op);stepFactoryOperation(op,{...neutral,x:1,confirm:true},20,true);assert.deepEqual(op,pausedFetch);
  const bounded=structuredClone(op),normal=structuredClone(op);stepFactoryOperation(bounded,neutral,20);stepFactoryOperation(normal,neutral,.05);assert.deepEqual(bounded,normal);
  until(op,'aim');stepFactoryOperation(op,{...neutral,confirm:true},dt);until(op,'carry');
  move(op,op.target);stepFactoryOperation(op,{...neutral,confirm:true},dt);until(op,'retract');run(op,.2);
  const pausedRetract=structuredClone(op);for(let i=0;i<100;i++)stepFactoryOperation(op,{...neutral,x:1,confirm:true},dt,true);assert.deepEqual(op,pausedRetract);
  assert.equal(op.assemblyModule,'wheels');assert.equal(op.attached,false);assert.equal(op.seated,1);
  until(op,'done');assert.deepEqual(op.tool,FACTORY_ASSEMBLY_IDLE);
});
test('inspection rejects gapped mounts, missing wheels, a never-running motor and wrong serial plate',()=>{
  const s=createFactoryInspection({id:'c1',kind:'nimble',revision:1,parts:{frame:'f1',wheels:'w1',shell:'s1'}});
  const p={frameGap:.2,wheelGap:0,shellGap:0,wheelCount:4,wheelSpeed:0,labelId:'c1'};
  advanceFactoryInspection(s,p,true,dt);assert.equal(s.step,0);
  p.frameGap=0;advanceFactoryInspection(s,p,true,dt);assert.equal(s.step,1);
  p.wheelCount=3;advanceFactoryInspection(s,p,true,dt);assert.equal(s.step,1);
  p.wheelCount=4;advanceFactoryInspection(s,p,true,dt);advanceFactoryInspection(s,p,true,dt);assert.equal(s.step,3);
  advanceFactoryInspection(s,p,true,dt);assert.equal(s.motor,true);
  for(let i=0;i<50;i++)advanceFactoryInspection(s,p,true,dt);assert.equal(s.step,3);
  p.wheelSpeed=8;advanceFactoryInspection(s,p,false,dt);advanceFactoryInspection(s,p,true,dt);assert.equal(s.step,4);
  p.wheelSpeed=0;for(let i=0;i<25;i++)advanceFactoryInspection(s,p,false,dt);assert.equal(s.step,5);
  p.labelId='wrong';advanceFactoryInspection(s,p,true,dt);assert.equal(s.step,5);
  p.labelId='c1';advanceFactoryInspection(s,p,true,dt);assert.equal(s.step,6);assert.ok(Object.values(s.evidence.checks).every(Boolean));
});
test('reworking wheels does not lift the retained chassis again',()=>{
  const game=createFactoryGame('retained-parts');
  game.configurations=[{id:'before',revision:1,kind:'nimble',parts:{frame:'frame-original',wheels:'wheel-old',shell:'shell-original'}}];
  game.parts={frame:{id:'frame-original'},wheels:{id:'wheel-new'},shell:{id:'shell-original'}};
  assert.deepEqual(factoryAssemblyModules(game),['wheels']);
  const op=createFactoryOperation({type:'trial-assemble'},factoryAssemblyModules(game));
  assert.deepEqual(op.assemblyModules,['wheels']);
  const lifted=[];driveAssembly(op,(before,after)=>{
    if(after.attached&&!before.attached)lifted.push(after.assemblyModule);
    assert.equal(after.assemblyModule,'wheels');
  });
  assert.deepEqual(lifted,['wheels']);assert.deepEqual(op.tool,FACTORY_ASSEMBLY_IDLE);
  assert.equal(op.phase,'done');assert.equal(op.seated,1);
  game.parts.wheels.id='wheel-old';
  const noMove=createFactoryOperation({type:'trial-assemble'},factoryAssemblyModules(game));
  assert.equal(noMove.phase,'done');assert.equal(noMove.attached,false);
});
test('world console rejects remote use; pause clears held controls, Esc and camp recovery return pending material',()=>{
  const disconnect=connectFactoryWorld();
  try{
    useWorldStore.setState({paused:false,poolInspect:false,seat:null,card:null,clubMode:null,activeVehicle:null,factoryStation:null});
    useFactoryStore.setState({active:true,game:createFactoryGame('operation-test')});Object.assign(factoryActor,{available:true,grounded:true,position:[0,1,0]});
    assert.equal(openFactoryStation('raw'),false);
    factoryActor.position=factoryWorld(factoryStation('raw').at);assert.equal(openFactoryStation('raw'),true);
    assert.equal(startFactoryOperation({type:'extract',module:'frame'}),true);
    factoryControl.input.held=true;factoryControl.input.confirm=true;useWorldStore.setState({paused:true});
    assert.equal(factoryControl.input.held,false);assert.equal(factoryControl.input.confirm,false);
    const before=structuredClone(factoryControl.operation);tickFactoryOperation(10);assert.deepEqual(factoryControl.operation,before);
    useWorldStore.setState({paused:false});handleWorldEscape();assert.equal(useWorldStore.getState().factoryStation,null);
    assert.equal(useFactoryStore.getState().game.pending,null);assert.equal(useFactoryStore.getState().game.materials.frame.status,'source');
    assert.equal(openFactoryStation('raw'),true);startFactoryOperation({type:'extract',module:'wheels'});requestCampReturn();
    assert.equal(useFactoryStore.getState().game.pending,null);assert.equal(factoryControl.operation,null);
  }finally{closeFactoryStation();disconnect();}
});
