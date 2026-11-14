import test from 'node:test';
import assert from 'node:assert/strict';
import {nextFactoryStation,factoryExperimentRoutes} from './factory-guidance.ts';
import {createFactoryGame,requestFactoryAction,finishFactoryAction,appendFactoryTrialSample,FACTORY_MODULES} from './factory-game.ts';
function commit(s,a){const n=requestFactoryAction(s,a);assert.ok(n.pending);return finishFactoryAction(n,n.pending);}
function testRun(s,mode){
  let n=requestFactoryAction(s,{type:'test',mode,conditions:{testKind:'slope',loadKg:0,courseVersion:'factory-course-v1',seed:1,durationLimitS:60}});
  const ticket=n.pending;
  for(const progress of [0,1]){const measurement={progress,speedMps:1,tiltDeg:0,loadKg:0};
    n=appendFactoryTrialSample(n,ticket,{elapsedS:progress*20,player:measurement,...(mode==='comparison'?{reference:measurement}:{})});}
  return finishFactoryAction(n,ticket,{outcome:'completed'});
}
test('guidance leaves completed intake, routes the unfinished module, and requires new tests after rework',()=>{
  let s=createFactoryGame('guide');assert.equal(nextFactoryStation(s),'raw');
  for(const module of FACTORY_MODULES)s=commit(s,{type:'extract',module});
  assert.equal(nextFactoryStation(s),'batch');s=commit(s,{type:'group',config:'nimble'});
  for(const module of FACTORY_MODULES){
    assert.equal(nextFactoryStation(s),'routing');s=commit(s,{type:'route',module,line:module});
    assert.equal(nextFactoryStation(s),module);s=commit(s,{type:'process',module});
  }
  assert.equal(nextFactoryStation(s),'assembly');s=commit(s,{type:'trial-assemble'});
  assert.equal(nextFactoryStation(s),'test');s=testRun(s,'single');
  assert.equal(nextFactoryStation(s),'compare');s=testRun(s,'comparison');
  assert.equal(nextFactoryStation(s),'finish');s=commit(s,{type:'rework',module:'wheels',config:'steady'});
  assert.equal(nextFactoryStation(s),'routing');s=commit(s,{type:'route',module:'wheels',line:'wheels'});
  assert.equal(nextFactoryStation(s),'wheels');s=commit(s,{type:'process',module:'wheels'});
  assert.equal(nextFactoryStation(s),'assembly');s=commit(s,{type:'trial-assemble'});
  assert.equal(nextFactoryStation(s),'test','old completed trials cannot direct a new configuration to finishing');
});
test('prototype offers alternative experiments and rework without skipping final QA',()=>{
  let s=createFactoryGame('choices');assert.deepEqual(factoryExperimentRoutes(s,'raw'),[]);
  for(const module of FACTORY_MODULES)s=commit(s,{type:'extract',module});
  s=commit(s,{type:'group',config:'nimble'});
  for(const module of FACTORY_MODULES){s=commit(s,{type:'route',module,line:module});s=commit(s,{type:'process',module});}
  s=commit(s,{type:'trial-assemble'});
  assert.deepEqual(factoryExperimentRoutes(s,'assembly'),['test','compare','rework']);
  s=testRun(s,'single');s=testRun(s,'comparison');
  assert.deepEqual(factoryExperimentRoutes(s,'test'),['compare','rework','finish']);
  const before=JSON.stringify(s);factoryExperimentRoutes(s,'compare');assert.equal(JSON.stringify(s),before);
  s=commit(s,{type:'rework',module:'wheels',config:'steady'});
  assert.deepEqual(factoryExperimentRoutes(s,'rework'),[],'unfinished new configuration cannot be sent to testing or finishing');
});
