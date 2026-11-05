import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BoxGeometry, BufferGeometry, CatmullRomCurve3, DoubleSide, Float32BufferAttribute, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Vector3 } from 'three';
import { ATTRACTION_ROADS, ATTRACTION_ROAD_SAMPLES, COASTER_ARRIVAL, INTENT_COASTER, attractionRoadDistance, attractionScatterBlocked } from './attraction-layout.ts';
import { COASTER_APRON_TOP, COASTER_ARRIVAL_CENTER, COASTER_ARRIVAL_RADIUS, COASTER_ROAD_TOP, COASTER_WALK_Z, COASTER_WORKSHOP_APRON, arrivalCrossCoordinate, clipArrivalJunction, coasterApronWestX, coasterWalkHeight, roadRail } from './coaster-arrival-site.ts';
import { addCoasterPavingEdges } from './coaster-paving-craft.ts';
import { attachIntentCraftBatch, INTENT_CRAFT, INTENT_CRAFT_ATTRIBUTE } from './intent-craft-surface.ts';
import { createCoasterStructure } from './coaster-geometry.ts';
import { coasterColliderDescriptor } from './coaster-collision.ts';
import R from '@dimforge/rapier3d-compat';

function inside(p, polygon) {
  let yes = false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[j],b=polygon[i];
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;
  }
  return yes;
}
function mesh(data, material) {
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(data.positions,3));g.setIndex(data.indices);g.computeVertexNormals();
  const m=new Mesh(g,material);m.updateMatrixWorld();return m;
}
test('the northern apron corners exclude grass while the replanted north tree belongs to the verge',()=>{
  for(let x=16.1;x<52;x+=.31)for(let z=-140;z<-115;z+=.29) {
    if(inside([x,z],COASTER_WORKSHOP_APRON))assert.ok(attractionScatterBlocked(x,z),`grass on apron at ${x},${z}`);
  }
  assert.equal(inside([38,-112],COASTER_WORKSHOP_APRON),false);
});
test('the real apron collider supports the whole west entry and north corners',async()=>{
  await R.init();
  const data=createCoasterStructure(false),world=new R.World({x:0,y:-9.81,z:0});
  try {
    for(const c of data.colliders.filter(c=>c.surface))world.createCollider(coasterColliderDescriptor(R,c));
    world.step();
    for(const [x,z] of [[18.8,-123],[20,-123],[22,-123],[24,-123],[38,-116],[48,-118]]) {
      const hit=world.castRay(new R.Ray({x,y:1.3,z},{x:0,y:-1,z:0}),.4,true);
      assert.ok(hit,`missing support ${x},${z}`);
      assert.ok(Math.abs(1.3-hit.timeOfImpact-1.12)<.001,`top mismatch ${x},${z}`);
    }
  }finally{world.free();data.steel.dispose();data.glow.dispose();Object.values(data.railCraft??{}).forEach(g=>g.dispose());data.railShadow?.dispose();}
});

test('main asphalt samples stay identical to the retained Three curve; the car spur stops west of the apron',()=>{
  assert.deepEqual(ATTRACTION_ROADS[0],[[-4,-54],[-5,-80],[-5,-103],[-15,-123],[-35,-140],[-62,-140],[-88,-140],[-88,-148]]);
  for(let road=0;road<ATTRACTION_ROADS.length;road++) {
    const curve=new CatmullRomCurve3(ATTRACTION_ROADS[road].map(([x,z])=>new Vector3(x,0,z)),false,'centripetal');
    const before=curve.getPoints(Math.ceil(curve.getLength())),after=ATTRACTION_ROAD_SAMPLES[road];
    assert.equal(before.length,after.length);
    before.forEach((p,i)=>assert.ok(Math.hypot(p.x-after[i][0],p.z-after[i][1])<1e-10));
  }
  assert.deepEqual(ATTRACTION_ROADS[1].at(-1),COASTER_ARRIVAL_CENTER);
  assert.equal(COASTER_ARRIVAL_RADIUS,6.4);
  assert.ok(Math.max(...COASTER_ARRIVAL.roadOutline.map(p=>p[0]))<11.41);
  assert.ok(Math.max(...roadRail(ATTRACTION_ROAD_SAMPLES[0],3.2).map(p=>p[0]))<16);
  assert.ok(attractionRoadDistance(32,-120)>15,'removed road does not remain in vegetation / distance survey');
  assert.deepEqual(INTENT_COASTER.entrance,[50,1.08,-125]);
});

test('one joined spur contour meets the main asphalt edge without interior overlap; its shoulder has an actual opening',()=>{
  const main=ATTRACTION_ROAD_SAMPLES[0],east=roadRail(main,3.2),west=roadRail(main,-3.2);
  const mainOutline=[...east,...west.reverse()];
  const center=COASTER_ARRIVAL_CENTER,outline=COASTER_ARRIVAL.roadOutline;
  const signs=outline.map((a,i)=>{const b=outline[(i+1)%outline.length];return (a[0]-center[0])*(b[1]-center[1])-(a[1]-center[1])*(b[0]-center[0]);});
  assert.ok(signs.every(s=>s<1e-7),'fan is star shaped with a consistent winding');
  for(let x=-21.91;x<12;x+=.27)for(let z=-132.87;z<-110;z+=.29) {
    assert.ok(!(inside([x,z],mainOutline)&&inside([x,z],outline)),`duplicate asphalt at ${x},${z}`);
  }
  const inner=roadRail(main,3.15),outer=roadRail(main,4.25);
  let opened=0;
  for(let i=1;i<main.length;i++) {
    const before=[inner[i-1],outer[i-1],outer[i],inner[i]],after=clipArrivalJunction(before);
    if(after.length!==1||after[0].length!==4)opened++;
    for(const polygon of after) {
      const c=polygon.reduce((a,p)=>[a[0]+p[0]/polygon.length,a[1]+p[1]/polygon.length],[0,0]);
      if(Math.hypot(c[0]+15,c[1]+123)<10)assert.ok(Math.abs(arrivalCrossCoordinate(c))>=3.2-1e-8);
    }
  }
  assert.ok(opened>=2);
  for(const p of COASTER_ARRIVAL.shoulderPolygons) {
    const c=p.reduce((a,v)=>[a[0]+v[0]/p.length,a[1]+v[1]/p.length],[0,0]);
    assert.equal(inside(c,COASTER_ARRIVAL.walkOutline),false,'road edging does not cross pedestrian mouth');
  }
});

test('three metre walk has a flush road arc, flush apron edge, continuous gentle top and grass clearance',()=>{
  const material=new MeshBasicMaterial({side:DoubleSide}),road=mesh(COASTER_ARRIVAL.road,material),walk=mesh(COASTER_ARRIVAL.walk,material);
  try {
    const outline=COASTER_ARRIVAL.walkOutline;
    assert.equal(Math.max(...outline.map(p=>p[1]))-Math.min(...outline.map(p=>p[1])),3);
    for(const [x,z] of outline.slice(0,-2)) {
      assert.ok(Math.abs(Math.hypot(x-5,z+121)-6.4)<1e-8);
      assert.ok(Math.abs(coasterWalkHeight(x,z)-COASTER_ROAD_TOP)<1e-8);
    }
    for(const [x,z] of outline.slice(-2)) {
      assert.equal(x,coasterApronWestX(z));assert.equal(coasterWalkHeight(x,z),COASTER_APRON_TOP);
    }
    // Cross the real triangulated road/walk join, not just the ideal circle.
    for(const z of [-124.1,-123,-121.9]) {
      let previous=COASTER_ROAD_TOP;
      for(let x=9.8;x<coasterApronWestX(z)-.03;x+=.07) {
        const ray=new Raycaster(new Vector3(x,3,z),new Vector3(0,-1,0),0,4);
        const hits=ray.intersectObjects([road,walk]);
        assert.equal(hits.length,1,`single continuous collision / visible top at ${x},${z}`);
        assert.ok(hits[0].point.y>=COASTER_ROAD_TOP-1e-6&&hits[0].point.y<=COASTER_APRON_TOP+1e-6);
        assert.ok(Math.abs(hits[0].point.y-previous)<.004,'no height step at the joining arc or triangle boundary');
        previous=hits[0].point.y;
        assert.ok(attractionScatterBlocked(x,z),'walk must exclude procedural grass');
      }
    }
  }finally{road.geometry.dispose();walk.geometry.dispose();material.dispose();}
});

test('apron edge blocks leave the walk open; paving reuses its material role with bounded triangles',()=>{
  const parts=[];
  const batch={parts,add(g,_color,matrix){if(matrix)g.applyMatrix4(matrix);if(g.index){const n=g.toNonIndexed();g.dispose();g=n;}parts.push(g);},
    box(position,size,color,q=new Quaternion()){this.add(new BoxGeometry(...size),color,new Matrix4().compose(new Vector3(...position),q,new Vector3(1,1,1)));}};
  addCoasterPavingEdges(batch);attachIntentCraftBatch(parts);
  try {
    const walk=parts.at(-2),roles=walk.getAttribute(INTENT_CRAFT_ATTRIBUTE);
    assert.ok([...roles.array].every(r=>r===INTENT_CRAFT.courtyardPaving));
    assert.equal(walk.getAttribute('position').count/3,COASTER_ARRIVAL.walk.indices.length/3);
    // Edge blocks are the earlier concreteBase parts. Every vertex that sits
    // beside the west opening must stay outside its usable three metre band.
    for(const part of parts.slice(0,-2)) {
      const p=part.getAttribute('position');
      for(let i=0;i<p.count;i++)if(p.getX(i)>17&&p.getX(i)<20.1&&p.getZ(i)>COASTER_WALK_Z[0]&&p.getZ(i)<COASTER_WALK_Z[1]) {
        assert.ok(p.getX(i)-coasterApronWestX(p.getZ(i))>.4,'perimeter block intrudes into flush entry');
      }
    }
    const triangles=parts.reduce((n,g)=>n+g.getAttribute('position').count/3,0);
    const arrivalTriangles=COASTER_ARRIVAL.road.indices.length/3+COASTER_ARRIVAL.walk.indices.length/3+COASTER_ARRIVAL.shoulderPolygons.reduce((n,p)=>n+p.length-2,0);
    assert.ok(triangles<6500);assert.ok(arrivalTriangles<180);
    assert.equal(new Set(parts.flatMap(p=>[...p.getAttribute(INTENT_CRAFT_ATTRIBUTE).array])).size,5);
    const approach=readFileSync(new URL('./WorldAttractionApproach.tsx',import.meta.url),'utf8');
    assert.match(approach,/siteGeometry\(COASTER_ARRIVAL.walk\)/);
    assert.match(approach,/built.walk.getAttribute\('position'\).array/);
    assert.match(approach,/groups=\[asphalt,edge,paint\]/,'three existing approach materials only');
    console.log(JSON.stringify({arrivalTriangles,pavingEdgeAndWalkTriangles:triangles,approachMaterials:3,newWalkMaterials:0,walkTop:[COASTER_ROAD_TOP,COASTER_APRON_TOP]}));
  }finally{parts.forEach(g=>g.dispose());}
});
