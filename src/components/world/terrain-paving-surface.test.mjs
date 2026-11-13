import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPavingSurfaceVisual, pavingMesh, PAVE_STRIDE, PAVE_MODE } from './WorldTerrainPaving.ts';

const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const area=p=>Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-a[1]*b[0];},0))/2;
function intersection(subject,triangle){
  let polygon=subject;if(cross(...triangle)<0)triangle=[triangle[0],triangle[2],triangle[1]];
  for(let edge=0;edge<3&&polygon.length;edge++){
    const a=triangle[edge],b=triangle[(edge+1)%3],out=[];
    for(let i=0;i<polygon.length;i++){
      const p=polygon[i],q=polygon[(i+1)%polygon.length],dp=cross(a,b,p),dq=cross(a,b,q);
      if(dp>=0)out.push(p);
      if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
    }polygon=out;
  }
  return polygon.length>=3?area(polygon):0;
}
const triangles=v=>Array.from({length:v.length/(PAVE_STRIDE*3)},(_,i)=>[0,1,2].map(k=>v.slice((i*3+k)*PAVE_STRIDE,(i*3+k+1)*PAVE_STRIDE)));
const planar=t=>t.map(p=>[p[0],p[2]]);
const interior=v=>triangles(v).filter(t=>t.every(p=>Math.abs(p[1]-1.138)<1e-9)&&t[0][6]===PAVE_MODE.asphalt);
const areaOf=tris=>tris.reduce((sum,t)=>sum+area(planar(t)),0);
const chunk=key=>({key,v:[],top:[],walls:[],fv:[],ftop:[],fwalls:[],parkSpurTriangles:[],interiorTriangles:[],asphaltStripTriangles:[]});
function add(c,points,y,role){
  const start=c.v.length/PAVE_STRIDE;
  for(const [x,z]of points)c.v.push(x,y,z,0,1,0,PAVE_MODE.asphalt,2*x-z,x+3*z,x-z);
  c.top.push(start,start+1,start+2);
  if(role==='interior')c.interiorTriangles.push(start);if(role==='strip')c.asphaltStripTriangles.push(start);
}
function rectangle(c,x0,x1,z0,z1,y,role){add(c,[[x0,z0],[x0,z1],[x1,z1]],y,role);add(c,[[x0,z0],[x1,z1],[x1,z0]],y,role);}
function covers(chunks){return chunks.flatMap(c=>c.asphaltStripTriangles.map(start=>[0,1,2].map(k=>[c.v[(start+k)*PAVE_STRIDE],c.v[(start+k)*PAVE_STRIDE+2]])));}

test('fixture: strip/interior share an exclusive boundary across different chunks without changing physics',()=>{
  const a=chunk(0),b=chunk(1);rectangle(a,0,4,0,2,1.138,'interior');rectangle(b,3.5,4.2,-.5,2.5,1.14,'strip');
  const before=structuredClone([a,b]),visual=createPavingSurfaceVisual([a,b]),renderA=visual(a),renderB=visual(b),flat=interior(renderA);
  assert.ok(Math.abs(areaOf(flat)-7)<1e-10,'8 m² interior loses exactly its covered 1 m²');
  assert.deepEqual(renderB,b.v,'entire outer strip and its silhouette remain exact');
  for(const t of flat)for(const cover of covers([a,b]))assert.ok(intersection(planar(t),cover)<1e-10);
  for(const t of flat)for(const p of t){assert.equal(p[1],1.138);assert.ok(Math.abs(p[7]-(2*p[0]-p[2]))<1e-10);assert.ok(Math.abs(p[8]-(p[0]+3*p[2]))<1e-10);}
  assert.deepEqual([a,b],before,'original vertices, top/wall indices and handover metadata never mutate');
});

test('fixture: oblique or duplicated strips preserve union area and do not over-cut',()=>{
  const c=chunk(0);rectangle(c,0,4,0,2,1.138,'interior');
  add(c,[[1,0],[2,-1],[4,1]],1.14,'strip');add(c,[[1,0],[4,1],[3,2]],1.14,'strip');
  const source=interior(c.v),cover=covers([c]),covered=source.reduce((sum,t)=>sum+cover.reduce((s,b)=>s+intersection(planar(t),b),0),0);
  const render=createPavingSurfaceVisual([c])(c),remaining=interior(render);
  assert.ok(Math.abs(areaOf(remaining)+covered-areaOf(source))<1e-9);
  for(const t of remaining)for(const b of cover)assert.ok(intersection(planar(t),b)<1e-9);
  const duplicated=structuredClone(c);duplicated.asphaltStripTriangles.push(...duplicated.asphaltStripTriangles);
  assert.ok(Math.abs(areaOf(interior(createPavingSurfaceVisual([duplicated])(duplicated)))-areaOf(remaining))<1e-9);
});

test('fixture: a disjoint triangle in the same spatial cell cannot fragment the interior along infinite edge lines',()=>{
  const a=chunk(0),b=chunk(1);rectangle(a,0,1,0,1,1.138,'interior');
  // The first edge's infinite line z=x+.25 crosses a, but the finite triangle is wholly outside it.
  add(b,[[2,2.25],[3,3.25],[2,3.25]],1.14,'strip');
  const visual=createPavingSurfaceVisual([a,b]);assert.deepEqual(visual(a),a.v,'no artificial diagonal or extra render triangle');
});

test('fixture: park-ready clipping composes with the surface ownership and retains original arrays',()=>{
  const c=chunk(0);rectangle(c,43,44,0,1,1.14);c.parkSpurTriangles=[0,3];
  const before=structuredClone(c),visual=createPavingSurfaceVisual([c]);assert.deepEqual(visual(c),c.v);
  const ready=visual(c,true);assert.ok(Math.abs(areaOf(triangles(ready))-.6)<1e-10);assert.ok(triangles(ready).flat().every(p=>p[0]<=43.6));assert.deepEqual(c,before);
});

/** Primary runs this serially. Importing the file and selecting fixture tests does not build the field. */
test('actual generated paving: interior no longer overlaps the original inner-strip footprint and all physics is unchanged',t=>{
  const mesh=pavingMesh(),chunks=mesh.chunks;
  const fingerprint=()=>{const hash=createHash('sha256');for(const c of chunks)for(const key of ['v','top','walls','fv','ftop','fwalls','parkSpurTriangles'])hash.update(JSON.stringify(c[key]));return hash.digest('hex');};
  const before=fingerprint(),source=chunks.flatMap(c=>c.interiorTriangles.map(start=>[0,1,2].map(k=>c.v.slice((start+k)*PAVE_STRIDE,(start+k+1)*PAVE_STRIDE))));
  const cover=covers(chunks),grid=new Map(),cell=4,key=(x,z)=>`${Math.floor(x/cell)},${Math.floor(z/cell)}`;
  const cells=(points,visit)=>{const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);for(let x=Math.floor(Math.min(...xs)/cell);x<=Math.floor(Math.max(...xs)/cell);x++)for(let z=Math.floor(Math.min(...zs)/cell);z<=Math.floor(Math.max(...zs)/cell);z++)visit(`${x},${z}`);};
  for(const tri of cover)cells(tri,k=>{const list=grid.get(k)??[];list.push(tri);grid.set(k,list);});
  const start=performance.now(),visual=createPavingSurfaceVisual(chunks),render=chunks.map(c=>visual(c)),renderMs=performance.now()-start,remaining=render.flatMap(interior);
  let maxOverlap=0,totalOverlap=0;
  for(const tri of remaining){const candidates=new Set();cells(planar(tri),k=>grid.get(k)?.forEach(b=>candidates.add(b)));for(const b of candidates){const a=intersection(planar(tri),b);maxOverlap=Math.max(maxOverlap,a);totalOverlap+=a;}}
  assert.ok(maxOverlap<1e-7&&totalOverlap<1e-5,JSON.stringify({maxOverlap,totalOverlap}));
  const sourceArea=areaOf(source),remainingArea=areaOf(remaining);assert.ok(remainingArea>sourceArea*.8&&sourceArea-remainingArea>1,'remove genuine overlapping strips, retain the road interior');
  assert.ok(remaining.length<=source.length*2,JSON.stringify({triangleBudget:source.length*2,actual:remaining.length}));
  // A source centroid outside every strip must still be covered after partitioning.
  const keepGrid=new Map();for(const tri of remaining)cells(planar(tri),k=>{const list=keepGrid.get(k)??[];list.push(planar(tri));keepGrid.set(k,list);});
  const inside=(p,tri)=>{const signs=tri.map((a,i)=>cross(a,tri[(i+1)%3],p));return Math.min(...signs)>=-1e-7||Math.max(...signs)<=1e-7;};
  let checked=0;for(const tri of source){const p=[tri.reduce((sum,v)=>sum+v[0]/3,0),tri.reduce((sum,v)=>sum+v[2]/3,0)],k=key(...p);if((grid.get(k)??[]).some(b=>inside(p,b)))continue;
    assert.ok((keepGrid.get(k)??[]).some(b=>inside(p,b)),JSON.stringify({lostUncoveredCentroid:p}));checked++;}
  for(const c of chunks)visual(c,true);assert.equal(fingerprint(),before);
  t.diagnostic(JSON.stringify({sourceInteriorTriangles:source.length,remainingInteriorTriangles:remaining.length,stripTriangles:cover.length,
    sourceAreaM2:+sourceArea.toFixed(4),remainingAreaM2:+remainingArea.toFixed(4),removedAreaM2:+(sourceArea-remainingArea).toFixed(4),
    maxOverlapM2:maxOverlap,totalOverlapM2:totalOverlap,checkedUncoveredCentroids:checked,renderMs:+renderMs.toFixed(2),physicsSha256:before}));
});
