import test from 'node:test';
import assert from 'node:assert/strict';
import { ALPHA_MINE_ORIGIN, ALPHA_MINE_FOOTPRINT, ALPHA_MINE_FOOTPRINT_POINTS, ALPHA_MINE_CONNECTOR, isOnAlphaMineBase, mineLocalToWorld, mineEdgeDistance } from './alpha-mine-layout.ts';
import {readFileSync} from 'node:fs';
import { ALL_HUTS, HUTS } from './WorldParkLayout.ts';
import { BOOTHS } from './layout.ts';
import { OUTLINE_V4, insidePolygon } from './layout-v4-flag.ts';
import { terrainHeight, groundSample } from './WorldLandform.ts';

test('model, biome and map share the eroded outline and retain grassy corners',()=>{
 const layout=JSON.parse(readFileSync(new URL('../../../public/world/alpha-mine/layout.json',import.meta.url),'utf8'));
 assert.equal(layout.footprint.outline.length,ALPHA_MINE_FOOTPRINT_POINTS.length);
 layout.footprint.outline.forEach((p,i)=>assert.ok(Math.hypot(p[0]+ALPHA_MINE_ORIGIN[0]-ALPHA_MINE_FOOTPRINT_POINTS[i][0],p[1]+ALPHA_MINE_ORIGIN[2]-ALPHA_MINE_FOOTPRINT_POINTS[i][1])<1e-4));
 assert.equal(isOnAlphaMineBase(-109,-108),false);assert.equal(isOnAlphaMineBase(-84,-70),true);
 assert.ok(mineEdgeDistance(-109,-108)>2);
 assert.ok(groundSample(-109,-108).grass>.25,'old square corner should recover native vegetation');
 assert.equal(groundSample(-84,-70).grass,0);
 const a=ALPHA_MINE_FOOTPRINT_POINTS[0],b=ALPHA_MINE_FOOTPRINT_POINTS.at(-1),x=(a[0]+b[0])/2,z=(a[1]+b[1])/2;
 assert.ok(Math.abs(mineEdgeDistance(x,z))<.01);
});

test('quarry footprint and complete walking approach are supported by continuous mainland',()=>{
  const b=ALPHA_MINE_FOOTPRINT;
  for(let x=b.minX;x<=b.maxX;x+=5)for(let z=b.minZ;z<=b.maxZ;z+=4){
    assert.ok(insidePolygon([x,z],OUTLINE_V4),`mainland ${x},${z}`);
    assert.ok(terrainHeight(x,z)>=.98,`ground under quarry ${x},${z}`);
  }
  for(let i=1;i<ALPHA_MINE_CONNECTOR.length;i++)for(let j=0;j<=30;j++){
    const a=ALPHA_MINE_CONNECTOR[i-1],b=ALPHA_MINE_CONNECTOR[i],t=j/30;
    assert.ok(terrainHeight(a[0]+(b[0]-a[0])*t,a[2]+(b[2]-a[2])*t)>=.98);
  }
  assert.deepEqual(ALPHA_MINE_CONNECTOR.at(-1),ALPHA_MINE_ORIGIN);
  assert.deepEqual(mineLocalToWorld([0,0,0]),[-84,1.14,-55]);
  assert.equal(isOnAlphaMineBase(60,-70),false);
});
test('expanded coast stays convex for the shared shoreline distance algorithm',()=>{
  let sign=0;
  for(let i=0;i<OUTLINE_V4.length;i++){
    const a=OUTLINE_V4[i],b=OUTLINE_V4[(i+1)%OUTLINE_V4.length],c=OUTLINE_V4[(i+2)%OUTLINE_V4.length];
    const cross=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
    if(cross){sign||=Math.sign(cross);assert.equal(Math.sign(cross),sign);}
  }
});
test('Alpha retains separate project directory identity and the other five huts',()=>{
  assert.deepEqual(ALL_HUTS.map(h=>h.id),BOOTHS.map(b=>b.id));
  assert.deepEqual(HUTS.map(h=>h.id),BOOTHS.filter(b=>b.id!=='alpha-agent').map(b=>b.id));
});
