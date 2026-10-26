import test from 'node:test';
import assert from 'node:assert/strict';
import { roadLandingCandidates, portalRearmed } from './world-travel.ts';
import { WORLD_PORTALS, PORTAL_THRESHOLD, portalCrossing } from './world-portals.ts';

test('recovery candidates stay on road segments and turn the car along the road',()=>{
  const roads=[[0,1,0],[0,2,20],[20,2,20]];
  const candidates=roadLandingCandidates([1,-3,9],roads);
  assert.deepEqual(candidates[0].position,[0,1.45,9]);
  assert.equal(candidates[0].yaw,-Math.PI/2);
  for(const c of candidates){
    const [x,y,z]=c.position;
    assert.ok((x===0&&z>=0&&z<=20&&Math.abs(y-1-z/20)<1e-8)||(z===20&&x>=0&&x<=20&&y===2));
    assert.ok(Math.abs(c.yaw-(x===0?-Math.PI/2:0))<1e-8);
  }
});
const world=(g,x,y,z)=>[g.position[0]+Math.cos(g.yaw)*x+Math.sin(g.yaw)*z,g.position[1]+y,g.position[2]-Math.sin(g.yaw)*x+Math.cos(g.yaw)*z];
for(const g of WORLD_PORTALS){
  test(`${g.id} accepts both walking directions and a fast swept crossing only within its opening`,()=>{
    const y=PORTAL_THRESHOLD.top+.82;
    const a=world(g,0,y,.1),b=world(g,0,y,-.1);
    assert.ok(portalCrossing(g,a,b)); assert.ok(portalCrossing(g,b,a));
    assert.ok(portalCrossing(g,world(g,0,y,2),world(g,0,y,-2)));
    assert.equal(portalCrossing(g,a,world(g,0,y,.02)),false);
    assert.equal(portalCrossing(g,world(g,1.1,y,.1),world(g,1.1,y,-.1)),false);
    assert.equal(portalCrossing(g,world(g,0,3,.1),world(g,0,3,-.1)),false);
    assert.equal(portalCrossing(g,[NaN,0,0],b),false);
  });
}
test('arrival cooldown alone cannot bounce a player through the same gate',()=>{
  for(const g of WORLD_PORTALS){
    const arrival=g.arrivalCandidates[0];
    assert.equal(portalRearmed(0,arrival,WORLD_PORTALS),false);
    const away=world(g,0,.82,4);
    assert.equal(portalRearmed(1,away,WORLD_PORTALS),false);
    assert.equal(portalRearmed(0,away,WORLD_PORTALS),true);
  }
});
