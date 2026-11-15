import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { createCaveState, cancelCaveState, tickCaveState, startCaveEcho, caveEchoSequence, caveRingPulse, caveNear, CAVE_ECHO_SECONDS } from './cave-state.ts';

test('lamp requires measured hand contact; interruption and failed reach return it to hook',()=>{
  const s=createCaveState();s.lamp='reaching';tickCaveState(s,.08,Infinity);assert.equal(s.lamp,'reaching');
  tickCaveState(s,.08,.04);assert.equal(s.lamp,'carried');cancelCaveState(s);assert.equal(s.lamp,'rack');
  assert.equal(s.echoAge,CAVE_ECHO_SECONDS);s.lamp='reaching';for(let i=0;i<40;i++)tickCaveState(s,.08,Infinity);
  assert.equal(s.lamp,'rack');
});
test('echo directions differ, delayed rings agree with audio events and hit rate is bounded',()=>{
  const s=createCaveState();assert.equal(startCaveEcho(s,0),true);assert.equal(startCaveEcho(s,1),false);
  for(let i=0;i<10;i++)tickCaveState(s,.08,Infinity);assert.equal(startCaveEcho(s,2),true);
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
