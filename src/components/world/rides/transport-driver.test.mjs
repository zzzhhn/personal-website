import test from 'node:test';
import assert from 'node:assert/strict';
import { TransportDriver } from './transport-driver.ts';
import { RideEnvironment } from './ride-environment.ts';
import { sampleTransport,transportWorld } from './transport-route.ts';
const make=(kind='cable')=>({id:kind,kind,transform:{origin:[50,2,-80],yaw:.7},path:[[0,0,0],[10,5,0],[20,0,0]],duration:8,terminals:[0,20].map((x,i)=>({id:String(i),vehicle:[x,0,0],yaw:0,boarding:[[x,0,-3],[x+.6,0,0]],safeExit:[x,0,-4],seat:[0,.48,0],clearance:[3,3,4]}))});
function run(d,until){for(let i=0;i<10000&&d.phase!==until;i++)d.step(1/60,false);assert.equal(d.phase,until);}
test('shared sampled seat follows vehicle through a transformed route; every phase reaches its own safe terminal',()=>{
 for(const kind of ['cable','ferry','sled'])for(const source of [0,1]){
 const route=make(kind),d=new TransportDriver(route,source);d.capture(transportWorld(route.terminals[source].boarding[0],route.transform),0);run(d,'riding');
 for(let i=0;i<200;i++){const p=d.step(1/60,false);assert.deepEqual(d.frame.seat,p.pose.seat);assert.ok(p.pose.cameraPosition.every(Number.isFinite));}
 run(d,'complete');assert.deepEqual(d.frame.root,transportWorld(route.terminals[source===0?1:0].safeExit,route.transform));
 }
});
test('uncaptured, paused, hidden and stale frames freeze both actor and vehicle without catch-up',()=>{
 const d=new TransportDriver(make(),0);d.step(.1,false);assert.equal(d.elapsed,0);d.capture([50,2,-80],0);
 for(const [dt,frozen] of [[.1,true],[1,false],[NaN,false],[-1,false]]){const before=JSON.stringify(d);d.step(dt,frozen);assert.equal(JSON.stringify(d),before);}
});
test('cancel before dispatch walks back; moving ferry/cable physically reverse, sled reaches lower station',()=>{
 for(const kind of ['cable','ferry','sled']){
 let d=new TransportDriver(make(kind),0);d.capture([50,2,-80],0);d.requestExit();run(d,'complete');assert.equal(d.u,0);assert.equal(d.destination,0);
 d=new TransportDriver(make(kind),0);d.capture([50,2,-80],0);run(d,'riding');for(let i=0;i<120;i++)d.step(1/60,false);const before=d.u;d.requestExit();d.step(1/60,false);assert.ok(Math.abs(d.u-before)<.003);run(d,'complete');assert.equal(d.destination,kind==='sled'?1:0);
 }
});
test('weather lease suspends and yields permanently to player edit; stale owner cannot release a new owner',()=>{
 const e=new RideEnvironment(),release=e.acquire('a','clear');e.publish('a',{rain:.5,snow:.5});assert.deepEqual(e.sample('clear',false),{rain:.5,snow:.5});assert.equal(e.sample('clear',true),null);assert.equal(e.sample('rain',false),null);assert.equal(e.sample('clear',false),null);e.acquire('b','snow');release();assert.ok(e.active);
});
