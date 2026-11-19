import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { createCaveState, startCaveLamp, cancelCaveState, tickCaveState, canStartCaveEcho, startCaveEcho, caveEchoSequence, caveRingPulse, caveNear, CAVE_ECHO_SECONDS } from './cave-state.ts';

test('an accepted lamp pickup completes after its short animation; a lost safe stance cancels',()=>{
  const s=createCaveState(),p=[1,2,3];assert.equal(startCaveLamp(s,p),true);assert.equal(startCaveLamp(s,p),false);
  tickCaveState(s,.08,p);assert.equal(s.lamp,'reaching');
  for(let i=0;i<4;i++)tickCaveState(s,.08,p);
  assert.equal(s.lamp,'carried');cancelCaveState(s);assert.equal(s.lamp,'rack');
  assert.equal(s.echoAge,CAVE_ECHO_SECONDS);startCaveLamp(s,p);tickCaveState(s,.08,null);
  for(let i=0;i<40;i++)tickCaveState(s,.08,p);
  assert.equal(s.lamp,'rack','no delayed pickup after leaving the rack');
  startCaveLamp(s,p);p[0]+=.4;tickCaveState(s,.08,p);
  assert.equal(s.lamp,'rack','walking out cancels even when the actor reuses its position array');
});
test('echo directions differ, delayed rings agree with audio events and hit rate is bounded',()=>{
  const s=createCaveState();
  assert.equal(canStartCaveEcho(s),true);assert.equal(startCaveEcho(s,0),true);
  assert.equal(canStartCaveEcho(s),false);assert.equal(startCaveEcho(s,1),false);assert.equal(s.chime,0);
  for(let i=0;i<8;i++)tickCaveState(s,.08);
  assert.equal(canStartCaveEcho(s),false);tickCaveState(s,.02);
  assert.equal(canStartCaveEcho(s),true);assert.equal(startCaveEcho(s,2),true);
  const through=caveEchoSequence(0),dull=caveEchoSequence(2);assert.equal(through.length,4);assert.equal(dull.length,4);
  assert.deepEqual(through.at(-1).position,[10,33.7,-56]);assert.deepEqual(dull.at(-1).position,[-19,29.2,-49]);
  for(const echo of [...through,...dull]){assert.equal(caveRingPulse(echo.delay-.01,echo.delay),null);assert.ok(caveRingPulse(echo.delay,echo.delay));assert.equal(caveRingPulse(echo.delay+1.11,echo.delay),null);}
  assert.ok(dull[1].strength<through[1].strength);
});
test('cave local bounds keep entrance, fork, culdesac and exit active, never summit or ocean',()=>{
  for(const p of [[-15,25,-35],[-10,27,-42],[-19,28.5,-49],[10,33,-56]])assert.equal(caveNear(p),true);
  for(const p of [[-15,3,-35],[-10,84,-42],[0,30,0],[-80,1,-44]])assert.equal(caveNear(p),false);
});
test('fork floor has one vertical surface across the two-route overlap',async()=>{
  const hook=registerHooks({resolve(specifier,context,next){
    if(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)){
      const url=new URL(specifier+'.ts',context.parentURL);if(existsSync(url))return next(url.href,context);
    }
    return next(specifier,context);
  }});
  let geometry,material;
  try{
    const [{createCaveFloorGeometry},{Mesh,MeshBasicMaterial,DoubleSide,Raycaster,Vector3},{alphaHeight}]=await Promise.all([
      import('./cave-art.ts'),import('three'),import('../alpha-terrain.ts')]);
    geometry=createCaveFloorGeometry();material=new MeshBasicMaterial({side:DoubleSide});
    const mesh=new Mesh(geometry,material),ray=new Raycaster();mesh.updateMatrixWorld();
    // Off-grid probes avoid counting both triangles on their shared diagonal.
    for(let j=0;j<13;j++)for(let i=0;i<13;i++){
      const x=-12.91+i*.47,z=-44.87+j*.43;
      ray.set(new Vector3(x,40,z),new Vector3(0,-1,0));
      const heights=ray.intersectObject(mesh).map(hit=>hit.point.y);
      const distinct=heights.filter((y,index)=>heights.findIndex(other=>Math.abs(other-y)<1e-5)===index);
      assert.equal(distinct.length,1,`fork (${x},${z}) has ${distinct.length} floor heights: ${distinct}`);
      assert.ok(alphaHeight(x,z)<distinct[0]-.04,`terrain penetrates fork floor at (${x},${z})`);
    }
    const positions=geometry.getAttribute('position');
    for(const [x,y,z] of [[-15,24,-35],[-10,26,-42],[0,29,-48],[10,32,-56],[-14,27,-48],[-19,27.5,-49]]){
      let found=false;for(let i=0;i<positions.count;i++)if(positions.getX(i)===x&&positions.getZ(i)===z){assert.ok(Math.abs(positions.getY(i)-y-.12)<2e-6);found=true;break;}
      assert.ok(found,`authored datum (${x},${z}) must be a shared floor vertex`);
    }
  }finally{geometry?.dispose();material?.dispose();hook.deregister();}
});

test('cancelling exploration restores lamp and active route without erasing prior experience',()=>{
  const state=createCaveState();startCaveEcho(state,2);state.lamp='carried';
  assert.equal(state.exploration.route,'mural');assert.equal(state.exploration.completed,false);
  cancelCaveState(state);
  assert.equal(state.lamp,'rack');assert.equal(state.exploration.route,null);assert.equal(state.exploration.completed,false);
  state.exploration.completed=true;startCaveEcho(state,0);cancelCaveState(state);
  assert.equal(state.exploration.completed,true);assert.equal(state.exploration.visited,true);
});
