import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry,BufferGeometry,CylinderGeometry,Euler,Float32BufferAttribute,Matrix4,Quaternion,Vector3 } from 'three';
import { exchangeChamferBox } from './alpha-exchange-craft.ts';
import { buildExchangeGalleryCraft,EXCHANGE_GALLERY_FOOTPRINTS } from './alpha-exchange-gallery-craft.ts';

// Mirror the production sink's actual primitive tessellation and world transforms.
// Keeping individual parts also catches details escaping their physical shells.
function capture() {
  const parts=[];
  const add=(g,color,p=[0,0,0],rotation=[0,0,0],kind='solid',emit=[0,0,0],primitive='add')=>{
    const baked=g.index?g.toNonIndexed():g.clone();g.dispose();
    baked.applyMatrix4(new Matrix4().compose(new Vector3(...p),new Quaternion().setFromEuler(new Euler(...rotation)),new Vector3(1,1,1)));
    const a=baked.getAttribute('position'),vertices=Array.from(a.array);baked.dispose();
    parts.push({vertices,color,kind,emit,primitive,triangles:vertices.length/9,p});
  };
  const api={add,
    box:(p,size,color,kind,yaw=0,emit)=>add(new BoxGeometry(...size),color,p,[0,yaw,0],kind,emit,'box'),
    chamfer:(p,size,color,kind,yaw=0,bevel=.025,emit)=>add(exchangeChamferBox(size,bevel),color,p,[0,yaw,0],kind,emit,'chamfer'),
    rod:(a,b,r,color,kind='solid')=>{
      const av=new Vector3(...a),bv=new Vector3(...b),d=bv.clone().sub(av),g=new CylinderGeometry(r,r,d.length(),6);
      g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.normalize()));
      add(g,color,av.add(bv).multiplyScalar(.5).toArray(),[0,0,0],kind,undefined,'rod');
    },
    raw:(p,color,kind='solid',emit)=>{
      const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.computeVertexNormals();
      add(g,color,[0,0,0],[0,0,0],kind,emit,'raw');
    },
  };
  buildExchangeGalleryCraft(api);return parts;
}
const parts=capture(),triangles=parts.reduce((n,p)=>n+p.triangles,0);
const solidTriangles=parts.filter(p=>p.kind==='solid').reduce((n,p)=>n+p.triangles,0);
const inside=(p,f)=>p.every((v,i)=>Math.abs(v-f.center[i])<=f.size[i]/2+1e-5);
const points=p=>Array.from({length:p.vertices.length/3},(_,i)=>p.vertices.slice(i*3,i*3+3));

test('rear furniture has four explicit bounded envelopes on the real upper slab',()=>{
  assert.equal(EXCHANGE_GALLERY_FOOTPRINTS.length,4);
  for(const f of EXCHANGE_GALLERY_FOOTPRINTS) {
    assert.ok(Math.abs(f.center[1]-f.size[1]/2-5.2)<1e-10);
    assert.ok(Math.abs(f.center[0])+f.size[0]/2<=17.4);
    assert.ok(f.center[2]-f.size[2]/2>=-40);
    assert.ok(f.center[2]+f.size[2]/2<=-38.3);
    if(f.kind==='bookcase') {
      assert.equal(Math.abs(f.center[0]),11.8);assert.equal(f.size[0],4.5);
      assert.ok(f.size[2]<=.8);assert.ok(f.size[1]>=3.1&&f.size[1]<=3.4);
    }else {
      assert.equal(Math.abs(f.center[0]),7.5);assert.ok(f.size[0]/2<=.55);
    }
  }
  for(const p of parts) {
    assert.ok(p.vertices.every(Number.isFinite));
    const f=EXCHANGE_GALLERY_FOOTPRINTS.find(f=>points(p).every(q=>inside(q,f)));
    assert.ok(f,`${p.primitive} at ${p.p} remains inside one declared envelope`);
    for(let i=0;i<p.vertices.length;i+=9) {
      const a=new Vector3(...p.vertices.slice(i,i+3)),b=new Vector3(...p.vertices.slice(i+3,i+6)),c=new Vector3(...p.vertices.slice(i+6,i+9));
      assert.ok(b.sub(a).cross(c.sub(a)).length()>1e-9,'no degenerate triangles');
    }
  }
});

test('solid furniture leaves capsule clearance across the entire z > -38.3 route and central review area',()=>{
  for(const part of parts)for(const p of points(part)) {
    assert.ok(Math.abs(p[0])>5.4,'the clock, central board and review station stay clear');
    assert.ok(p[2]<=-38.3,'no decoration overhangs the protected route');
    if(part.kind==='solid')assert.ok(p[2]+.34<-38.3,'a standing capsule also clears the route boundary');
  }
  for(const x of [-11.8,11.8]) {
    const solid=parts.filter(p=>p.kind==='solid'&&points(p).some(q=>Math.abs(q[0]-x)<2.26));
    assert.equal(solid.length,13,'plinth, back, two sides, cornice, counter, two shelves, divider and four doors are physical');
    assert.equal(Math.min(...solid.flatMap(p=>points(p).map(q=>q[1]))),Math.fround(5.2));
  }
});

function closedVolume(vertices) {
  const edges=new Map(),origin=new Vector3(...vertices.slice(0,3));let volume=0;
  for(let i=0;i<vertices.length;i+=9) {
    const points=[0,1,2].map(k=>new Vector3(...vertices.slice(i+k*3,i+k*3+3)));
    // Work near the mesh origin so small leaves at world z=-39 retain precision.
    const local=points.map(p=>p.clone().sub(origin));
    volume+=local[0].dot(local[1].clone().cross(local[2]))/6;
    for(let k=0;k<3;k++) {
      const ends=[points[k],points[(k+1)%3]].map(p=>p.toArray().map(x=>x.toFixed(5)).join(','));
      const key=ends.slice().sort().join('/'),edge=edges.get(key)??{count:0,winding:0};
      edge.count++;edge.winding+=ends[0]<ends[1]?1:-1;edges.set(key,edge);
    }
  }
  assert.ok([...edges.values()].every(e=>e.count===2&&e.winding===0),'closed meshes have two oppositely wound faces at every edge');
  return volume;
}

test('vessels are hollow closed shells and leaves have folded volume rather than texture cards',()=>{
  const vessels=parts.filter(p=>p.primitive==='raw'&&p.kind==='solid');
  assert.equal(vessels.length,2);
  for(const p of vessels) {
    assert.equal(p.triangles,64);assert.ok(closedVolume(p.vertices)>.08);
    const top=points(p).filter(q=>Math.abs(q[1]-5.91)<1e-5);
    const x=top.reduce((v,q)=>v+q[0],0)/top.length;
    const radii=top.map(q=>Math.hypot(q[0]-x,q[2]+39.1));
    assert.ok(Math.min(...radii)>.37&&Math.max(...radii)<.456,'open rim has distinct inner and outer radii');
  }
  const leafColors=new Set(['#526449','#3e523d']);
  const leaves=parts.filter(p=>p.primitive==='raw'&&p.triangles===4&&leafColors.has(p.color));
  assert.equal(leaves.length,32,'two four-face halves for each of sixteen leaves');
  for(let i=0;i<leaves.length;i+=2)assert.ok(closedVolume([...leaves[i].vertices,...leaves[i+1].vertices])>1e-5);
  assert.equal(parts.filter(p=>p.primitive==='rod').length,8,'each plant branches at three different heights');
});

test(`complete furniture budgets: ${triangles} visible / ${solidTriangles} solid triangles, with two bounded night strips`,()=>{
  assert.ok(triangles>3500&&triangles<=5000,`visible triangles: ${triangles}`);
  assert.ok(solidTriangles>500&&solidTriangles<=650,`solid triangles: ${solidTriangles}`);
  const lamps=parts.filter(p=>p.emit[1]>0);
  assert.equal(lamps.length,2);
  for(const p of lamps) {
    assert.deepEqual(p.emit,[0,.55,1]);assert.equal(p.kind,'visual');
    assert.ok(points(p).every(q=>q[1]>8.28&&q[2]<-38.97));
  }
  assert.deepEqual(capture(),parts,'geometry and emissions are deterministic across builds');
});
