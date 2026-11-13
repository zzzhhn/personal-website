import test from 'node:test';
import assert from 'node:assert/strict';
import { DataTexture } from 'three';
import { createDjcEnvironmentRadiance } from './djc-environment-radiance.ts';

test('unflipped equirectangular radiance places sky and warm key above the horizon',()=>{
  const w=256,h=128,sun={x:-90,y:40,z:65},p=createDjcEnvironmentRadiance(w,h,sun);
  assert.equal(new DataTexture().flipY,false);
  // Sample a world direction through the same spherical UV convention as Three.
  const radiance=([x,y,z])=>{
    const u=Math.atan2(z,x)/(Math.PI*2)+.5,v=Math.asin(y)/Math.PI+.5;
    const i=(Math.min(h-1,Math.floor(v*h))*w+Math.min(w-1,Math.floor(u*w)))*4;
    return p.slice(i,i+3);
  };
  const top=radiance([0,1,0]),bottom=radiance([0,-1,0]);
  assert.ok(top[2]>top[0],'sky must retain a cool blue component');
  assert.ok(bottom[0]>bottom[2],'ground bounce must remain warm');
  assert.ok(top.every((v,i)=>v>bottom[i]*2),'upward normal must receive more ambient radiance than downward normal');
  let max=-Infinity,row=-1,col=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,l=.2126*p[i]+.7152*p[i+1]+.0722*p[i+2];
    assert.ok(Number.isFinite(l)&&l>=0);
    if(l>max){max=l;row=y;col=x;}
  }
  assert.ok(row>h/2,'strongest environment source must sit above the horizon');
  const theta=((col+.5)/w-.5)*Math.PI*2,phi=((row+.5)/h-.5)*Math.PI;
  const direction=[Math.cos(theta)*Math.cos(phi),Math.sin(phi),Math.sin(theta)*Math.cos(phi)];
  const agreement=(direction[0]*sun.x+direction[1]*sun.y+direction[2]*sun.z)/Math.hypot(sun.x,sun.y,sun.z);
  assert.ok(agreement>.995,'environment highlight must agree with the world sun direction');
});
