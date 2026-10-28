import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import R from '@dimforge/rapier3d-compat';
import { Euler, Quaternion } from 'three';
import { buildIbdStatic } from './attractions/ibd-yard-geometry.ts';
import { cameraOverlapsGuide, cameraShoulderPivot, sweepCamera } from './camera-collision.ts';
import { orbitDirection } from './actor-physics.ts';
await R.init();
const radius=.22,solid=c=>!c.isSensor(),identity={x:0,y:0,z:0,w:1};
const end=(p,dir,d)=>({x:p.x+dir[0]*d,y:p.y+dir[1]*d,z:p.z+dir[2]*d});
const sweep=(w,a,b)=>sweepCamera(w,R,a,b,radius,undefined,solid);
function overlaps(w,p) {let hit=false;w.intersectionsWithShape(p,identity,new R.Ball(radius),()=>{hit=true;return false;});return hit;}
function fixture() {
  const data=buildIbdStatic(),world=new R.World({x:0,y:0,z:0});
  for(const s of data.solids)world.createCollider(R.ColliderDesc.cuboid(...s.size.map(v=>v/2)).setTranslation(...s.at)
    .setRotation(new Quaternion().setFromEuler(new Euler(...(s.rotation??[0,0,0])))));
  world.createCollider(R.ColliderDesc.trimesh(data.walkSurface.vertices,data.walkSurface.indices));world.step();
  return {world,dispose(){world.free();data.geometry.dispose();}};
}
function frames(world,pivot,dir,previous={offset:0,actual:12,position:null},count=150) {
  let state=previous;
  for(let frame=0;frame<count;frame++) {
    const q=cameraShoulderPivot(world,R,pivot,dir,12,radius,undefined,solid,state.offset,1/60);
    const actual=q.orbit.distance<state.actual?q.orbit.distance:state.actual+(q.orbit.distance-state.actual)*(1-Math.exp(-4/60));
    let position=end(q.position,dir,actual);
    if(state.position&&(Math.abs(q.offset)>.001||Math.abs(state.offset)>.001))position=sweep(world,state.position,position).position;
    assert.equal(overlaps(world,position),false,`frame ${frame}: near-plane overlap`);
    if(state.position&&Math.abs(q.offset)>.001) {
      const move=sweep(world,state.position,position);
      assert.ok(Math.hypot(position.x-move.position.x,position.y-move.position.y,position.z-move.position.z)<.001,'continuous safe detour');
    }
    state={offset:q.offset,actual,position};
  }
  return state;
}
test('actual IBD shed post no longer keeps the player hidden; camera returns to centre in open space',t=>{
  const f=fixture(),pivot={x:3,y:1.553823,z:2.100006},dir=orbitDirection(Math.PI/2,Math.PI/4);
  try {
    const old=sweep(f.world,pivot,end(pivot,dir,12));
    assert.ok(old.distance>.50&&old.distance<.55,'exact reported post must reproduce');
    assert.equal(cameraOverlapsGuide(old.position,{x:3,y:.0865,z:2.100006},radius),true);
    const after=frames(f.world,pivot,dir);
    assert.ok(after.actual>1.9,'a close third-person view restores the character rather than looking past the post');
    assert.equal(sweep(f.world,pivot,after.position).hit,null,'the post must not sit across the character sightline');
    assert.equal(cameraOverlapsGuide(after.position,{x:3,y:.0865,z:2.100006},radius,true),false);
    assert.ok(Math.abs(after.offset)<=1.35);
    // Walk sideways from the post in 5 cm steps, then hold still.
    let state=after;
    for(let i=1;i<=80;i++)state=frames(f.world,{...pivot,x:3+i*.05},dir,state,1);
    state=frames(f.world,{...pivot,x:7},dir,state,150);
    assert.equal(state.offset,0,'no persistent shoulder shift after obstruction ends');
    t.diagnostic(JSON.stringify({before:old.distance,after:after.actual,shoulder:after.offset,restored:state.actual}));
  }finally{f.dispose();}
});
test('broad walls and low roofs cannot be escaped by the shoulder probe',()=>{
  for(const kind of ['wall','roof']) {
    const world=new R.World({x:0,y:0,z:0});
    try {
      world.createCollider(kind==='wall'?R.ColliderDesc.cuboid(8,8,.04).setTranslation(0,2,.7):R.ColliderDesc.cuboid(8,.04,8).setTranslation(0,2.2,0));world.step();
      const state=frames(world,{x:0,y:1.5,z:0},orbitDirection(Math.PI/2,Math.PI/4));
      assert.equal(state.offset,0);assert.ok(state.actual<1);
      assert.ok(kind==='wall'?state.position.z<.7-radius:state.position.y<2.2-radius);
    }finally{world.free();}
  }
});
test('actual shed corner and manual orbit changes keep the near plane clear during shoulder activation',()=>{
  const f=fixture();
  try {
    for(const pivot of [{x:3,y:1.553823,z:2.100006},{x:3.45,y:1.55,z:2.1},{x:2.55,y:1.55,z:2.1}]) {
      let state={offset:0,actual:12,position:null};
      for(let i=0;i<240;i++) {
        const yaw=Math.PI/2+Math.sin(i/28)*.7,pitch=.785+Math.sin(i/37)*.3;
        state=frames(f.world,pivot,orbitDirection(yaw,pitch),state,1);
      }
    }
  }finally{f.dispose();}
});

test('shoulder corrections remain below real quarry roofs and clear of real gallery walls',t=>{
  const root=new URL('../../../public/world/alpha-mine/',import.meta.url);
  const layout=JSON.parse(readFileSync(new URL('layout.json',root),'utf8'));
  const proxies=JSON.parse(readFileSync(new URL('colliders.json',root),'utf8'));
  const world=new R.World({x:0,y:0,z:0});let samples=0;
  try {
    for(const part of Object.values(proxies))world.createCollider(R.ColliderDesc.trimesh(new Float32Array(part.vertices),new Uint32Array(part.indices)));
    world.step();
    for(const [i,p] of [...layout.route.points,...layout.gallery.route].entries()) {
      if(i%2)continue;
      const body={x:p[0],y:p[1]+.88,z:p[2]},pivot=sweep(world,body,{...body,y:body.y+.65}).position;
      for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(const pitch of [-.2,.45,1.2]) {
        frames(world,pivot,orbitDirection(yaw,pitch),undefined,24);samples+=24;
      }
    }
    t.diagnostic(`${samples} quarry shoulder-camera frames, including all lateral and temporal sweeps`);
  }finally{world.free();}
});
