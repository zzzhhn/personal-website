import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUB_POOL } from './djc-club-layout.ts';
import { clubBasinMasksGround, clubBasinMaskUniforms } from './club-basin-mask.ts';

function polygonContains(x,z){
  let inside=false;const points=CLUB_POOL.outline;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i],b=points[j];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
test('constant-time mask follows the rendered basin polygon, including concave bays',()=>{
  const [cx,,cz]=CLUB_POOL.center,[rx,rz]=CLUB_POOL.radii;
  for(let x=cx-rx*1.2;x<cx+rx*1.2;x+=.193)for(let z=cz-rz*1.2;z<cz+rz*1.2;z+=.197)
    assert.equal(clubBasinMasksGround(x,z),polygonContains(x,z),`${x},${z}`);
  for(let i=0;i<CLUB_POOL.segments;i++){
    const a=CLUB_POOL.outline[i],b=CLUB_POOL.outline[(i+1)%CLUB_POOL.segments];
    const mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2;
    for(const scale of [.999,1.001])assert.equal(clubBasinMasksGround(cx+(mx-cx)*scale,cz+(mz-cz)*scale),scale<1);
  }
});
test('basin mask starts inactive, retaining fallback terrain until the basin mounts',()=>{
  const uniforms=clubBasinMaskUniforms();assert.equal(uniforms.uClubBasinMounted.value,0);
  assert.equal(uniforms.uClubBasinOutline.value.length,CLUB_POOL.segments);
});
