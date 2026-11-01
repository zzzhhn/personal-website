import test from 'node:test';
import assert from 'node:assert/strict';
import {POOL_WAVES,waterDispersion,samplePoolWaves} from './WorldWaterWaves.ts';

test('finite-depth propagation slows in shallow water and separates crests from wave groups',()=>{
  for(const length of [.75,2.2,6.1,9.3]){
    const shallow=waterDispersion(length,.1),pool=waterDispersion(length,.65),deep=waterDispersion(length,20);
    assert.ok(shallow.speed<pool.speed&&pool.speed<=deep.speed);
    assert.ok(pool.groupSpeed>pool.speed*.49&&pool.groupSpeed<pool.speed);
    assert.ok(Math.abs(deep.speed-Math.sqrt(9.81*length/(2*Math.PI)))<1e-4);
  }
});
test('analytical normal slopes match the moving height field rather than unrelated texture scrolling',()=>{
  const eps=1e-5;
  for(const geometryOnly of [false,true])for(const t of [0,.4,2.3,50])for(const [x,z] of [[0,0],[54.2,48.3],[68,55]]){
    const sample=(x,z)=>samplePoolWaves(x,z,t,1,geometryOnly),s=sample(x,z);
    assert.ok(Math.abs(s.dx-(sample(x+eps,z).height-sample(x-eps,z).height)/(2*eps))<1e-6);
    assert.ok(Math.abs(s.dz-(sample(x,z+eps).height-sample(x,z-eps).height)/(2*eps))<1e-6);
  }
});
test('motion is bounded, deterministic while paused, and vanishes with reduced-motion strength',()=>{
  const max=POOL_WAVES.reduce((a,w)=>a+w.amplitude,0);
  for(let i=0;i<800;i++){
    const s=samplePoolWaves(i*.41,-i*.27,i*.13);
    assert.ok(Math.abs(s.height)<=max&&Math.hypot(s.dx,s.dz)<.15);
    assert.deepEqual(s,samplePoolWaves(i*.41,-i*.27,i*.13));
  }
  assert.deepEqual(samplePoolWaves(68,55,3,0),{height:0,dx:0,dz:0});
  assert.notEqual(samplePoolWaves(68,55,3).height,samplePoolWaves(68,55,3.2).height);
});
