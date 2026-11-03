import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Ray, Vector3 } from 'three';
import { loadWorldModule } from '../../street/runtime.mjs';
import { snapshot } from './contracts.mjs';

const old = JSON.parse(readFileSync(new URL('./baseline.json', import.meta.url))).families;
const next = snapshot();
assert.deepEqual(snapshot('?streetRework=baseline'), old);
for (const name of Object.keys(old)) {
  for (const key of ['home','placements']) assert.equal(next[name][key], old[name][key]);
  for (const key of ['hulls','emit']) assert.equal(next[name].lods[0][key], old[name].lods[0][key]);
  assert.deepEqual(next[name].lods[1], old[name].lods[1]);
}

function inside(builder, name, point) {
  const p = builder.parts.find(part => part.name === name);
  assert.ok(p, name);
  const end = p.end < 0 ? builder.pos.length / 3 : p.end;
  const ray = new Ray(new Vector3(...point), new Vector3(1,.001,.002).normalize());
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), hit = new Vector3();
  const hits = [];
  for (let t = 0; t < builder.idx.length; t += 3) {
    const [i,j,k] = builder.idx.slice(t,t+3);
    if ([i,j,k].some(v => v < p.start || v >= end)) continue;
    if (ray.intersectTriangle(a.fromArray(builder.pos,i*3), b.fromArray(builder.pos,j*3),
      c.fromArray(builder.pos,k*3), false, hit)) {
      const distance = hit.distanceTo(ray.origin);
      if (!hits.some(v => Math.abs(v - distance) < 1e-6)) hits.push(distance);
    }
  }
  return hits.length % 2 === 1;
}

const A = loadWorldModule('WorldStreetAssets.ts');
const barrier = A.roadblock().L0;
let contacts = 0;
function contact(builder, a, b, point) {
  assert.ok(inside(builder,a,point) && inside(builder,b,point), JSON.stringify({a,b,point}));
  contacts++;
}
for (const x of [-.56,.56]) for (const side of [-1,1]) {
  const leg = 'frame.splayed-legs-' + x;
  const z = y => side * (y <= .30 ? .30 - .145 * (y-.02)/.28
    : y <= .62 ? .155 - .113 * (y-.30)/.32 : .042);
  for (const [part,y] of [['shoes',.031],['hinge',.93],['lock-brace',.347]]) {
    contact(barrier,leg,'frame.'+part+'-'+x,[x,y,z(y)]);
  }
  for (const y of [.48,.77]) {
    const saddle = 'boards.saddles-' + x + '-' + y;
    contact(barrier,leg,saddle,[x,y,z(y)]);
    contact(barrier,saddle,'boards',[x,y,side*(.3*(1-y)+.035)]);
  }
}
// Clip every leg triangle against each board's true vertical extent in board coordinates.
let minimumFaceClearance = Infinity;
for (const side of [-1,1]) for (const [center,height] of [[.48,.20],[.77,.22]]) {
  const angle = side * Math.atan2(.3,1), cos = Math.cos(angle), sin = Math.sin(angle);
  const z0 = side * (.3*(1-center)+.045);
  const half = height/2;
  for (const part of barrier.parts.filter(p=>p.name.startsWith('frame.splayed-legs'))) {
    const end = part.end < 0 ? barrier.pos.length/3 : part.end;
    for (let t=0;t<barrier.idx.length;t+=3) {
      const ids = barrier.idx.slice(t,t+3);
      if (ids.some(i=>i<part.start || i>=end)) continue;
      const tri = ids.map(i=>{
        const y=barrier.pos[i*3+1]-center, z=barrier.pos[i*3+2]-z0;
        return [cos*y+sin*z,side*(-sin*y+cos*z)];
      });
      const samples = tri.filter(([y])=>Math.abs(y)<=half);
      for (let j=0;j<3;j++) for (const edge of [-half,half]) {
        const a=tri[j], b=tri[(j+1)%3];
        if ((a[0]-edge)*(b[0]-edge)<0) samples.push([edge,a[1]+(b[1]-a[1])*(edge-a[0])/(b[0]-a[0])]);
      }
      for (const [,depth] of samples) minimumFaceClearance = Math.min(minimumFaceClearance,-.012-depth);
    }
  }
}
assert.ok(minimumFaceClearance > 0.002, 'Leg reaches a board face: '+minimumFaceClearance);
const lamp = A.lamp().L0;
contact(lamp,'base','base.anchor-sleeve',[.160,.082,0]);
contact(lamp,'shaft','arm.shaft-sleeve',[.058,4.27,0]);
contact(lamp,'arm','arm.root-coupling',[0,4.4896,-.2052]);
contact(lamp,'arm','head.arm-socket',[0,4.7464,-.9936]);
// Confirm the socket enters the housing wall near the aft shoulder.
const socketCandidates = [];
for (let y=4.70;y<4.79;y+=.005) for (let z=-1.18;z< -1.02;z+=.005) {
  socketCandidates.push([.016,y,z]);
}
const socketContact = socketCandidates.find(p=>inside(lamp,'head',p)&&inside(lamp,'head.arm-socket',p));
assert.ok(socketContact,'Socket must meet actual housing');
contacts++;
const signal = A.signal().L0;
contact(signal,'mast','mount.overhead-saddle',[.021,5.317,-3.05]);
contact(signal,'head','mount.overhead-saddle',[.063,5.392,-3.05]);
for (const y of [1.8,2.4]) {
  contact(signal,'shaft','mount.pole-brackets',[.03,y,.022]);
  contact(signal,'near-head','mount.pole-brackets',[-.085,y,.025]);
}
for (const side of [-1,1]) {
  contact(signal,'head','head.folded-side-rails',[.06,4.98,-3.05+side*.145]);
  contact(signal,'near-head','near-head.folded-side-rails',[-.10,2.1,side*.145]);
}
console.log(JSON.stringify({contacts,minimumFaceClearance,cost:Object.fromEntries(Object.keys(old).map(k=>[k,{
  placements:next[k].placements,triangles:[old[k].lods[0].triangles,next[k].lods[0].triangles],
  sourceBytes:[old[k].lods[0].bytes,next[k].lods[0].bytes],far:next[k].lods[1].triangles,
}]))},null,2));
