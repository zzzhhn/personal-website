/** Only the existing 2,680-triangle cave floor is constructed. No rock shell,
 * island terrain, decoded assets, physics world, renderer or browser. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaveFloorGeometry } from './cave-art.ts';
import { caveRoutePoints, caveAtWaypoint } from './cave-exploration.ts';
import { PLAYER_HALF_HEIGHT, PLAYER_RADIUS, PLAYER_CENTER_HEIGHT } from '../../actor-physics.ts';

test('actual floor triangles put every route waypoint and nearby walking stance inside the height tolerance',()=>{
  const geometry=createCaveFloorGeometry(),p=geometry.attributes.position,ids=geometry.index.array;
  function heightAt(x,z){
    for(let i=0;i<ids.length;i+=3){
      const a=ids[i],b=ids[i+1],c=ids[i+2],ax=p.getX(a),az=p.getZ(a),bx=p.getX(b),bz=p.getZ(b),cx=p.getX(c),cz=p.getZ(c);
      const d=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(d)<1e-12)continue;
      const u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/d,v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/d;
      if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7)return u*p.getY(a)+v*p.getY(b)+(1-u-v)*p.getY(c);
    }
    return null;
  }
  try{
    assert.ok(ids.length/3<3000,'this check constructs only the small production cave floor');
    let samples=0,maxHeightError=0;const nodes=[];
    for(const route of ['through','mural','return'])for(const target of caveRoutePoints(route)){
      const center=heightAt(target[0],target[2]);assert.notEqual(center,null,`missing real floor at ${route}:${target}`);
      nodes.push({route,point:target,floorY:center});
      // At the open butt-ended mouths, some outward offsets have no cave floor.
      // Every tested stance uses a triangle that actually exists.
      for(const [dx,dz] of [[0,0],[1.4,0],[-1.4,0],[0,1.4],[0,-1.4]]){
        const x=target[0]+dx,z=target[2]+dz,y=heightAt(x,z);if(y===null)continue;
        for(const lift of [PLAYER_HALF_HEIGHT+PLAYER_RADIUS,PLAYER_CENTER_HEIGHT]){
          const body=[x,y+lift,z];
          assert.equal(caveAtWaypoint(body,target),true,`actual body stance ${body} rejected at ${route}:${target}`);
          maxHeightError=Math.max(maxHeightError,Math.abs(body[1]-(target[1]+.12+PLAYER_CENTER_HEIGHT)));samples++;
        }
      }
    }
    assert.ok(samples>=48);assert.ok(maxHeightError<1.25);
    console.log(JSON.stringify({floorTriangles:ids.length/3,waypoints:nodes,standingSamples:samples,maxHeightError}));
  }finally{geometry.dispose();}
});
