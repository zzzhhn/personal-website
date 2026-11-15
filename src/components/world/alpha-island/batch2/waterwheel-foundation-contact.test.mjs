import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { waterwheelFoundationContacts, waterwheelFoundationExtensions, buildWaterwheelFrame } from './waterwheel-art.ts';
import { ALPHA_WATERWHEEL } from '../alpha-batch2-layout.ts';
import { alphaGroundHeight, alphaTerrainData } from '../alpha-terrain.ts';

test('eight foundations sample their full footprints and retain their surveyed upper surfaces',()=>{
  const calls=[],foundations=waterwheelFoundationContacts((x,z)=>{calls.push([x,z]);return 23.5+x*.01-z*.02;});
  assert.equal(foundations.length,8);assert.equal(calls.length,72);
  for(const [i,f]of foundations.entries()){
    const samples=calls.slice(i*9,(i+1)*9);
    assert.equal(new Set(samples.map(p=>p[0])).size,3);
    assert.equal(new Set(samples.map(p=>p[1])).size,3);
    assert.equal(Math.min(...samples.map(p=>p[0])),ALPHA_WATERWHEEL.center[0]+f.x-f.width/2);
    assert.equal(Math.max(...samples.map(p=>p[1])),ALPHA_WATERWHEEL.center[2]+f.z+f.depth/2);
    assert.equal(f.top,f.id.startsWith('headrace')?.56:.65);
    assert.ok(f.bottom<f.originalBottom);
    const extension=waterwheelFoundationExtensions([f])[0];
    assert.ok(Math.abs(extension.position[1]-extension.half[1]-f.bottom)<1e-10);
    assert.equal(extension.position[1]+extension.half[1],0,'new contact meets the existing y=0 proxy');
    assert.deepEqual([extension.half[0]*2,extension.half[2]*2],[f.width,f.depth]);
  }
  assert.equal(waterwheelFoundationExtensions(waterwheelFoundationContacts(()=>24)).length,0,'supported originals need no added proxy');
});

test('downward foundation extension preserves all non-stone geometry and upper masonry vertices',()=>{
  const before=buildWaterwheelFrame(waterwheelFoundationContacts(()=>24));
  const after=buildWaterwheelFrame(waterwheelFoundationContacts(()=>23.5));
  const hash=a=>createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
  try {for(const old of before){
    const current=after.find(p=>p.finish===old.finish);assert.ok(current);
    assert.equal(current.geometry.attributes.position.count,old.geometry.attributes.position.count,'no extra render topology');
    if(old.finish!=='stone'){
      for(const [name,attribute]of Object.entries(old.geometry.attributes))assert.equal(hash(current.geometry.attributes[name].array),hash(attribute.array),`${old.finish}/${name} changed`);
    }else{
      const a=old.geometry.attributes.position,b=current.geometry.attributes.position;
      for(let i=0;i<a.count;i++)if(a.getY(i)>=.5)assert.ok(Math.hypot(a.getX(i)-b.getX(i),a.getY(i)-b.getY(i),a.getZ(i)-b.getZ(i))<1e-6,'upper stonework moved');
    }
  }}finally{for(const p of [...before,...after])p.geometry.dispose();}
});

test('current shared Alpha terrain seats all four headrace feet and four lowest arch stones',()=>{
  const terrain=alphaTerrainData(),foundations=waterwheelFoundationContacts(),evidence=[];
  assert.equal(alphaTerrainData(),terrain,'placement must reuse the cached physical triangles');
  for(const f of foundations){
    let min=Infinity,max=-Infinity;
    for(let ix=0;ix<=4;ix++)for(let iz=0;iz<=4;iz++){
      const y=alphaGroundHeight(ALPHA_WATERWHEEL.center[0]+f.x-f.width/2+f.width*ix/4,ALPHA_WATERWHEEL.center[2]+f.z-f.depth/2+f.depth*iz/4);
      min=Math.min(min,y);max=Math.max(max,y);
    }
    const bottom=24+f.bottom;
    assert.ok(bottom<=min+1e-6,`${f.id}: floating lower surface`);
    if(f.bottom<f.originalBottom)assert.ok(bottom+f.bevel<=min+1e-6,`${f.id}: exposed lower round-over`);
    assert.equal(24+f.top,f.id.startsWith('headrace')?24.56:24.65);
    evidence.push({id:f.id,minGround:+min.toFixed(6),maxGround:+max.toFixed(6),bottom:+bottom.toFixed(6),top:24+f.top});
  }
  assert.ok(foundations.find(f=>f.x===-8.15&&f.z===-2.8).bottom<-.13,'known outer west gap must extend downward');
  console.log(JSON.stringify({foundations:evidence,newLowerProxies:waterwheelFoundationExtensions(foundations).length}));
});
