import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegionPassage } from '../region-passage.ts';
import { worldPassageRegions } from '../world-actor-sites.ts';
import { rideSegmentReady, rideDestinationReady } from './ride-passage.ts';
import { TransportDriver } from './transport-driver.ts';
import { transportWorld } from './transport-route.ts';
import { ALPHA_TRANSPORT_ROUTES, alphaFerryRoute } from '../alpha-island/transports/alpha-routes.ts';
import { advanceReadyCoaster, coasterTravelReady, coasterStationReady } from '../attractions/coaster-passage.ts';
import { COASTER_DURATION, COASTER_LENGTH, coasterFrame, coasterRidePose } from '../attractions/coaster-track.ts';
import { COASTER_BOARDING, createCoasterTransition, captureCoasterStart, requestCoasterSkip } from '../attractions/coaster-transition.ts';
import { attractionRide, beginDrivenAttractionRide, captureAttractionStart, endAttractionRide } from '../attractions/attraction-ride.ts';
const open={at:()=>true,allows:()=>true},closed={at:()=>false,allows:()=>false},dt=1/60;
function until(d,phase){for(let i=0;i<14000&&d.phase!==phase;i++)d.step(dt,false);assert.equal(d.phase,phase,d.id);}
function board(route,source=0){const d=new TransportDriver(route,source);d.setPassage(open);d.capture(transportWorld(route.terminals[source].boarding[0],route.transform),0);until(d,'riding');return d;}
const route={id:'boundary',kind:'ferry',transform:{origin:[0,0,0],yaw:0},path:[[0,0,0],[60,0,0]],duration:3,
  terminals:[0,60].map(x=>({id:String(x),vehicle:[x,0,0],yaw:0,boarding:[[x,0,3],[x,0,0]],egress:[[x,0,0],[x,0,3]],safeExit:[x,0,3],seat:[0,.48,0],clearance:[3,3,4]}))};

test('curved travel checks the actual arc, including bends outside the endpoint chord',()=>{
  const point=u=>[10*Math.cos(u*Math.PI),0,10*Math.sin(u*Math.PI)];
  const gate=createRegionPassage([{id:'bend',requirements:[{name:'bend'}],contains:(p,r)=>p[2]>=8-r}],r=>!r.length);
  assert.equal(gate.allows(point(0),point(1),.3),true,'the endpoint chord misses the cold bend');
  assert.equal(rideSegmentReady(gate,point,0,1,Math.PI*10,.3),false);
  assert.equal(rideSegmentReady(gate,point,1,0,Math.PI*10,.3),false);
  assert.equal(rideSegmentReady(open,point,0,1,Math.PI*10,.3),true);
  assert.equal(rideSegmentReady(open,point,NaN,1,10,.3),false);
  assert.equal(rideSegmentReady(open,point,0,1,5000,.3),false,'bounded work on invalid clock jumps');
});

test('destination admission checks vehicle footprint and the full egress, without checking the skipped corridor',()=>{
  const gate=createRegionPassage([{id:'gap',requirements:[{name:'gap'}],contains:(p,r)=>Math.abs(p[0]-30)<=1+r}],r=>!r.length);
  assert.equal(rideDestinationReady(gate,[60,0,0],3,[[60,0,0],[60,0,3]],.34),true);
  assert.equal(rideDestinationReady(gate,[30,0,0],3,[[30,0,0],[30,0,3]],.34),false);
  assert.equal(rideDestinationReady(gate,[60,0,0],3,[[60,0,0],[40,0,0],[20,0,0]],.34),false);
});

test('all shipped terminals admit through production footprint/path rules once their colliders are ready',()=>{
  const gate=createRegionPassage(worldPassageRegions(true),()=>true);
  for(const r of [...ALPHA_TRANSPORT_ROUTES,alphaFerryRoute()])for(const source of r.kind==='sled'?[0]:[0,1]) {
    const d=board(r,source);d.setPassage(gate);d.requestSkip();d.step(dt,false);
    assert.equal(d.phase,'stand',`${r.id}/${source}`);until(d,'complete');d.dispose('complete');
  }
  assert.equal(coasterStationReady(gate),true);
});

test('real ferry/cable/sled routes retain queued skips and unchanged poses until their destination admits them',()=>{
  for(const r of [...ALPHA_TRANSPORT_ROUTES,alphaFerryRoute()])for(const source of r.kind==='sled'?[0]:[0,1]) {
    const d=board(r,source);for(let i=0;i<30;i++)d.step(dt,false);
    d.setPassage(closed);d.requestSkip();
    const u=d.u,frame=structuredClone(d.frame),sample=d.sample();
    for(let i=0;i<120;i++)assert.deepEqual(d.step(dt,false),sample);
    assert.equal(d.u,u);assert.deepEqual(d.frame,frame);assert.equal(d.phase,'riding');
    assert.equal(d.skipRequested,true);assert.equal(d.blockedMotion,true);
    d.setPassage(open);d.step(dt,false);assert.equal(d.phase,'stand');assert.equal(d.skipRequested,false);
    until(d,'complete');assert.deepEqual(d.frame.root,d.safeExit);d.dispose('complete');
  }
});

test('normal transport stops before a cold region, retains a coherent sample and resumes without a time jump',()=>{
  let ready=false;
  const gate=createRegionPassage([{id:'arrival',requirements:[{name:'arrival'}],contains:(p,r)=>p[0]>=40-r}],r=>!r.length||ready);
  const d=board(route);d.setPassage(gate);
  for(let i=0;i<900;i++)d.step(dt,false);
  assert.equal(d.phase,'riding');assert.equal(d.blockedMotion,true);
  assert.ok(d.sample().vehicle[0]+Math.hypot(...route.terminals[0].clearance)/2<40,'whole vehicle stays before the cold boundary');
  const u=d.u,sample=d.sample(),frame=structuredClone(d.frame);
  for(let i=0;i<60;i++)assert.deepEqual(d.step(dt,false),sample);
  assert.deepEqual(d.frame,frame);assert.equal(d.u,u);assert.equal(d.velocity,0);
  ready=true;d.step(dt,false);assert.ok(d.u>u&&d.u-u<.01);
  until(d,'complete');d.dispose('complete');
});

test('a blocked skip can be cancelled toward a different, ready terminal',()=>{
  const d=board(route);for(let i=0;i<60;i++)d.step(dt,false);
  const gate=createRegionPassage([{id:'arrival',requirements:[{name:'arrival'}],contains:(p,r)=>p[0]>=40-r}],r=>!r.length);
  d.setPassage(gate);d.requestSkip();d.step(dt,false);assert.equal(d.blockedMotion,true);
  d.requestExit();d.step(dt,false);assert.equal(d.destination,0);assert.equal(d.phase,'stand');assert.equal(d.u,0);
  until(d,'complete');d.dispose('complete');
});

function coaster(){const t=createCoasterTransition(COASTER_BOARDING.approach,0,coasterRidePose(0,'chase'));captureCoasterStart(t,COASTER_BOARDING.approach,0);t.phase='riding';return t;}
test('coaster checks all three carriages, not just the passenger/head carriage',()=>{
  const tail=coasterFrame(-2*3.55/COASTER_LENGTH).point.toArray();
  const gate={at:p=>Math.hypot(...p.map((v,i)=>v-tail[i]))>.001,allows:()=>true};
  assert.equal(gate.at(coasterFrame(0).point.toArray()),true);
  assert.equal(coasterTravelReady(gate,0,0),false);assert.equal(coasterStationReady(gate),false);
  assert.equal(coasterStationReady(null),false);
});

test('coaster clock and queued skip do not advance on denial, including the last arrival frame',()=>{
  let clock={elapsed:40,riding:true,revision:7};const t=coaster();
  const before=structuredClone(t),blocked=advanceReadyCoaster(clock,t,closed,dt,true,false,false,true,7);
  assert.equal(blocked.clock,clock);assert.equal(blocked.blocked,true);assert.deepEqual(t,before);
  requestCoasterSkip(t);const queued=structuredClone(t);
  for(let i=0;i<60;i++){const result=advanceReadyCoaster(clock,t,closed,dt,true,false,false,true,7);assert.equal(result.clock,clock);assert.deepEqual(t,queued);}
  for(const [delta,frozen,hidden] of [[1,false,false],[NaN,false,false],[dt,true,false],[dt,false,true]]) {
    const result=advanceReadyCoaster(clock,t,open,delta,true,frozen,hidden,true,7);assert.equal(result.clock,clock);assert.deepEqual(t,queued);
  }
  const done=advanceReadyCoaster(clock,t,open,dt,true,false,false,true,7);
  assert.equal(done.skipped,true);assert.equal(done.clock.elapsed,COASTER_DURATION);assert.equal(t.phase,'stand');
  const last=coaster();clock={elapsed:COASTER_DURATION-.001,riding:true,revision:7};
  assert.equal(advanceReadyCoaster(clock,last,closed,dt,true,false,false,true,7).clock,clock);assert.equal(last.phase,'riding');
  assert.equal(advanceReadyCoaster(clock,last,open,dt,true,false,false,true,7).clock.riding,false);assert.equal(last.phase,'stand');
});

test('ride ownership installs admission before capture and clears it when a ride ends',()=>{
  endAttractionRide();const d=new TransportDriver(route,0);
  try {
    assert.equal(beginDrivenAttractionRide(d,d.sample().pose,[0,0,3]),true);
    assert.equal(attractionRide.passage,null);
    captureAttractionStart([0,0,3],0,closed);until(d,'riding');
    const u=d.u;d.step(dt,false);assert.equal(d.u,u);assert.equal(d.blockedMotion,true);
    endAttractionRide();assert.equal(attractionRide.passage,null);assert.equal(d.disposed,true);
    const fresh=new TransportDriver(route,0);assert.equal(beginDrivenAttractionRide(fresh,fresh.sample().pose,[0,0,3]),true);
    assert.equal(attractionRide.passage,null,'old readiness closure does not survive a new ride');
  } finally {endAttractionRide();}
});
