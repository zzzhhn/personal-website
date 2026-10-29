import test from 'node:test';
import assert from 'node:assert/strict';
import { IBD_YARD,INTENT_COASTER,INTENT_COASTER_FOOTPRINT,ATTRACTION_ROADS,attractionCapeDistance,attractionScatterBlocked } from './attraction-layout.ts';
import { attractionRide,beginAttractionRide,updateAttractionRide,endAttractionRide } from './attraction-ride.ts';

test('both full facilities fit safely inside the connected northern headland',()=>{
  for(const site of [IBD_YARD]){
    for(const dx of [-1,1])for(const dz of [-1,1])
      assert.ok(attractionCapeDistance(site.center[0]+dx*site.size[0]/2,site.center[2]+dz*site.size[1]/2)<-5);
    assert.ok(attractionCapeDistance(site.entrance[0],site.entrance[2])<-5);
    assert.ok(attractionScatterBlocked(site.center[0],site.center[2]));
  }
  for(const p of INTENT_COASTER_FOOTPRINT) assert.ok(attractionCapeDistance(...p)<-5, `coaster boundary clearance ${p}`);
  assert.deepEqual(INTENT_COASTER.entrance,[50,1.08,-125]);
  assert.ok(attractionCapeDistance(-75,-125)<0,'new cape overlaps the original north coast');
  assert.ok(attractionCapeDistance(200,-200)>0);
});
test('facility grounds and approach roads exclude automatic dense grass',()=>{
  for(const road of ATTRACTION_ROADS)for(let i=1;i<road.length;i++){
    const a=road[i-1],b=road[i];
    for(let t=0;t<=1;t+=.1)assert.ok(attractionScatterBlocked(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t));
  }
});
test('ride bridge cannot double board or revive a cancelled ride with a late frame',()=>{
  endAttractionRide();const rev=attractionRide.revision;
  const first={seat:[50,2,-145],yaw:0,cameraPosition:[44,5,-145],cameraTarget:[50,3,-145],firstPerson:false,fov:55};
  const exit=[50,1.08,-128];
  assert.equal(beginAttractionRide(first,exit),true);exit[0]=999;
  assert.equal(attractionRide.exit[0],50,'exit is captured, not aliased to caller storage');
  assert.equal(beginAttractionRide(first,exit),false);
  const next={...first,seat:[55,25,-175]};updateAttractionRide(next);assert.equal(attractionRide.pose,next);
  endAttractionRide();assert.equal(attractionRide.active,false);assert.equal(attractionRide.revision,rev+2);
  updateAttractionRide(first);assert.equal(attractionRide.pose,next);
  endAttractionRide();assert.equal(attractionRide.revision,rev+2);
});
