import test from 'node:test';
import assert from 'node:assert/strict';
import { Color } from 'three';
import { BUDGET, roadblockGeometry, shelterGeometry } from './WorldStreetAssets.ts';
import { S } from './WorldStreetGeometry.ts';

const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const area=p=>Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-a[1]*b[0];},0))/2;
function overlap(a,b){
  let polygon=a;if(cross(...b)<0)b=[b[0],b[2],b[1]];
  for(let edge=0;edge<3&&polygon.length;edge++){
    const u=b[edge],v=b[(edge+1)%3],next=[];
    for(let i=0;i<polygon.length;i++){
      const p=polygon[i],q=polygon[(i+1)%polygon.length],dp=cross(u,v,p),dq=cross(u,v,q);
      if(dp>=0)next.push(p);
      if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);next.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
    }
    polygon=next;
  }
  return polygon.length>=3?area(polygon):0;
}
function normal(p){
  const a=p[1].map((v,i)=>v-p[0][i]),b=p[2].map((v,i)=>v-p[0][i]);
  const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=Math.hypot(...n);
  return {direction:n.map(v=>v/length),area:length/2};
}
function triangles(builder,geometry,partName){
  const part=builder.parts.find(p=>p.name===partName),end=part.end<0?builder.pos.length/3:part.end;
  const p=geometry.attributes.position,color=geometry.attributes.color,out=[];
  for(let i=0;i<geometry.index.count;i+=3){
    const ids=[0,1,2].map(k=>geometry.index.getX(i+k));if(ids[0]<part.start||ids[0]>=end)continue;
    const points=ids.map(id=>[p.getX(id),p.getY(id),p.getZ(id)]);
    out.push({points,...normal(points),color:[color.getX(ids[0]),color.getY(ids[0]),color.getZ(ids[0])],glow:geometry.attributes.aMat.getZ(ids[0])});
  }
  return out;
}
function maxCoplanarOverlap(tris){
  let max=0;
  for(let i=0;i<tris.length;i++)for(let j=i+1;j<tris.length;j++){
    const a=tris[i],b=tris[j],dot=a.direction.reduce((sum,v,k)=>sum+v*b.direction[k],0);
    if(dot<1-1e-7||b.points.some(p=>Math.abs(a.direction.reduce((sum,v,k)=>sum+v*(p[k]-a.points[0][k]),0))>1e-6))continue;
    const axis=a.direction.map(Math.abs).indexOf(Math.max(...a.direction.map(Math.abs))),axes=[0,1,2].filter(k=>k!==axis);
    max=Math.max(max,overlap(a.points.map(p=>axes.map(k=>p[k])),b.points.map(p=>axes.map(k=>p[k]))));
  }
  return max;
}

for(const lod of [0,1])test(`shelter L${lod}: roof shell has no same-facing coplanar overlaps`,t=>{
  const builder=shelterGeometry(lod,[0,0,.1,.1]),geometry=builder.build();
  try{
    const roof=triangles(builder,geometry,'roof'),maxOverlap=maxCoplanarOverlap(roof),count=geometry.index.count/3;
    assert.ok(roof.every(triangle=>triangle.area>1e-10));assert.ok(maxOverlap<1e-7,JSON.stringify({maxOverlap}));
    assert.ok(count<=BUDGET.shelter[lod]);
    if(lod===1){
      const top=roof.filter(triangle=>triangle.direction[1]>.999999&&triangle.points.every(p=>Math.abs(p[1]-2.48)<1e-6));
      assert.ok(Math.abs(top.reduce((sum,triangle)=>sum+triangle.area,0)-1.76*3.44)<1e-6,'top covers the original union once');
      const originalBoxes=[{min:[-.95,2.38,-1.72],max:[.78,2.48,1.72]},{min:[-.98,2.3,-1.72],max:[-.92,2.48,1.72]}];
      const corners=originalBoxes.flatMap(box=>Array.from({length:8},(_,i)=>box.min.map((v,k)=>i&(1<<k)?box.max[k]:v)));
      const actual=roof.flatMap(triangle=>triangle.points);
      // Convex support stays identical to the original roof collision part, including oblique directions.
      for(const x of [-1,0,1])for(const y of [-1,0,1])for(const z of [-1,0,1]){
        if(!x&&!y&&!z)continue;const direction=[x,y,z],support=points=>Math.max(...points.map(p=>p.reduce((sum,v,k)=>sum+v*direction[k],0)));
        assert.ok(Math.abs(support(actual)-support(corners))<1e-6,'union silhouette and collision hull support remain unchanged');
      }
    }
    t.diagnostic(JSON.stringify({lod,triangles:count,roofTriangles:roof.length,maxCoplanarOverlapM2:maxOverlap}));
  }finally{geometry.dispose();}
});

for(const lod of [0,1])test(`roadblock L${lod}: white and orange partition the original board face and leave frame collision intact`,t=>{
  const builder=roadblockGeometry(lod),geometry=builder.build();
  try{
    assert.deepEqual(builder.parts.filter(p=>p.collide).map(p=>p.name),['frame']);
    assert.equal(builder.hulls()[0].length/3,lod===0?752:208,'paint changes cannot enter the physical frame hull');
    const tris=triangles(builder,geometry,'boards'),orangeColor=new Color(S.orange.color),swatch=orangeColor.toArray(),summaries=[],frames=[];
    for(const side of [-1,1])for(const [y,h] of [[.66,.22],[.38,.2]]){
      const z=side*(.3*(1-(y+h/2))+.045),tilt=Math.atan2(.3,1)*side,cos=Math.cos(tilt),sin=Math.sin(tilt),bevel=lod===0?.006:0;
      const local=p=>[p[0],cos*(p[1]-y-h/2)+sin*(p[2]-z),-sin*(p[1]-y-h/2)+cos*(p[2]-z)];
      frames.push({local,side,h,bevel});
      const front=tris.map(triangle=>({...triangle,points:triangle.points.map(local)}))
        .filter(triangle=>triangle.points.every(p=>Math.abs(p[2]-side*.012)<1e-6)&&normal(triangle.points).direction[2]*side>.99999);
      const expectedArea=(1.3-2*bevel)*(h-2*bevel),actualArea=front.reduce((sum,triangle)=>sum+normal(triangle.points).area,0);
      assert.ok(front.length>3);assert.ok(Math.abs(actualArea-expectedArea)<1e-6,JSON.stringify({side,y,actualArea,expectedArea}));
      let maxOverlap=0,orangeArea=0,whiteArea=0;
      for(let i=0;i<front.length;i++){
        const triangle=front[i],a=normal(triangle.points).area,centroid=triangle.points.reduce((sum,p)=>sum.map((v,k)=>v+p[k]/3),[0,0,0]);
        assert.ok(a>1e-10,'paint triangles are nondegenerate');
        const n=lod===0?5:3,u=(centroid[0]-.6*(centroid[1]+h/2)+.65)/(1.3/n),expectedOrange=u>=0&&u<n&&u-Math.floor(u)<.5;
        const actualOrange=triangle.glow===0&&triangle.color.every((v,k)=>Math.abs(v-swatch[k])<1e-6);
        assert.equal(actualOrange,expectedOrange,'same diagonal paint pattern on both board sides');
        if(actualOrange)orangeArea+=a;else whiteArea+=a;
        for(let j=i+1;j<front.length;j++)maxOverlap=Math.max(maxOverlap,overlap(triangle.points.map(p=>p.slice(0,2)),front[j].points.map(p=>p.slice(0,2))));
      }
      assert.ok(orangeArea>expectedArea*.3&&whiteArea>expectedArea*.3,'both swatches remain visible');
      assert.ok(maxOverlap<1e-7,JSON.stringify({side,y,maxOverlap}));
      summaries.push({side,y,areaM2:+actualArea.toFixed(6),orangeAreaM2:+orangeArea.toFixed(6),maxOverlapM2:maxOverlap});
    }
    // Every orange vertex lies on one of the four original board faces; no ±.0135 overlay survives.
    const orange=tris.filter(triangle=>triangle.glow===0&&triangle.color.every((v,k)=>Math.abs(v-swatch[k])<1e-6));
    for(const triangle of orange)assert.ok(frames.some(({local,side,h,bevel})=>triangle.points.map(local)
      .every(v=>Math.abs(v[2]-side*.012)<1e-6&&Math.abs(v[1])<=h/2-bevel+1e-6&&Math.abs(v[0])<=.65-bevel+1e-6)));
    assert.ok(geometry.index.count/3<=BUDGET.roadblock[lod]);
    assert.ok(tris.every(triangle=>Number.isFinite(triangle.area)&&triangle.area>1e-10));
    t.diagnostic(JSON.stringify({lod,triangles:geometry.index.count/3,boards:summaries}));
  }finally{geometry.dispose();}
});

test('both street props retain a meaningful cheaper distant silhouette',()=>{
  for(const build of [lod=>roadblockGeometry(lod),lod=>shelterGeometry(lod,[0,0,.1,.1])]){
    const near=build(0),far=build(1);assert.ok(far.triangles<=near.triangles*.3);
  }
});
