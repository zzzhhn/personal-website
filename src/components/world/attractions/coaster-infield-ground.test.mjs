import test from 'node:test';
import assert from 'node:assert/strict';
import { meshHeight, terrainHeight } from '../WorldLandform.ts';
import { coasterInfieldHeight } from './coaster-terrain-relief.ts';
import { CLUB_POOL } from '../djc-club-layout.ts';

test('shared rendered/collision island stays below the infield cutting, including its perimeter',()=>{
  let samples=0,clearance=Infinity;
  for(let x=13;x<28;x+=.37)for(let z=30;z<43;z+=.37){
    const top=coasterInfieldHeight(x,z);
    if(top===null||top>.1)continue;
    const earth=meshHeight(x+50,z-195);
    assert.ok(earth!==null,'retained earth must remain below the cutting');
    clearance=Math.min(clearance,1+top-earth);samples++;
    assert.ok(earth<1+top-.004,`earth covers relief at ${x},${z}: ${earth} / ${1+top}`);
  }
  assert.ok(samples>300);
  // Adjacent public plaza keeps its original datum and is not globally lowered.
  assert.equal(terrainHeight(50,-140),1);
  console.log(JSON.stringify({infieldContactSamples:samples,minimumClearance:clearance}));
});

test('rendered earth stays beneath the pool apron outer edge',()=>{
  let maximum=-Infinity;
  for(let i=0;i<CLUB_POOL.segments;i++){
    const a=i*Math.PI*2/CLUB_POOL.segments,b=(i+1)*Math.PI*2/CLUB_POOL.segments;
    const width=2.8+.45*Math.sin((a+b)*2+.4)+2.4;
    const p=CLUB_POOL.boundary(a,width),q=CLUB_POOL.boundary(b,width);
    for(const t of [0,.25,.5,.75,1]){
      const x=p[0]+(q[0]-p[0])*t,z=p[1]+(q[1]-p[1])*t;
      const h=meshHeight(x,z);assert.notEqual(h,null);
      maximum=Math.max(maximum,h);
      assert.ok(h<1.011,`terrain pierces apron at ${x},${z}: ${h}`);
    }
  }
  console.log(JSON.stringify({poolApronSamples:CLUB_POOL.segments*5,maximumGround:maximum,paving:1.015}));
});
