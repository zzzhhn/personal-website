import test from 'node:test';
import assert from 'node:assert/strict';
import { DoubleSide, Euler, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Vector3 } from 'three';
import { INTENT_COASTER, INTENT_COASTER_FOOTPRINT, IBD_YARD, attractionCapeDistance, attractionCliffCoastHeight } from './attraction-layout.ts';
import { COASTER_POINTS, COASTER_EXIT, COASTER_GATE_Z, coasterWorld } from './coaster-track.ts';
import { COASTER_CLIFF_WALK, COASTER_LOOKOUT } from './coaster-landscape-cliffs.ts';
import { createCoasterStructure } from './coaster-geometry.ts';

test('expanded concave coast is about twice the former footprint and keeps the IBD origin separate',()=>{
  const p=INTENT_COASTER_FOOTPRINT;
  const area=Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-b[0]*a[1]},0))/2;
  assert.ok(area/(110*130)>1.8&&area/(110*130)<2.2);
  assert.ok(attractionCapeDistance(140,-200)>0,'the inlet is actually outside the land polygon');
  assert.ok(attractionCapeDistance(140,-160)<-5,'the southern headland remains connected land');
  assert.deepEqual(IBD_YARD.center,[-88,1,-177]);assert.deepEqual(IBD_YARD.entrance,[-88,1.08,-143]);
  assert.equal(attractionCliffCoastHeight(-88,-177,3),null);
  assert.equal(attractionCliffCoastHeight(120,-210,0),1);
  assert.equal(attractionCliffCoastHeight(120,-210,3.5),-6);
});

test('north/east expansion preserves the established entrance, station controls and safe exit',()=>{
  assert.deepEqual(INTENT_COASTER.center,[50,1,-195]);assert.deepEqual(INTENT_COASTER.entrance,[50,1.08,-125]);
  assert.deepEqual(COASTER_EXIT,[45.8,1.08,-152]);assert.equal(COASTER_GATE_Z,56);
  assert.deepEqual(COASTER_POINTS.slice(0,3),[[0,.8,43],[0,1.2,30],[-17,8,24]]);
  assert.deepEqual(COASTER_POINTS.slice(37),[[-21,3,6],[-34,2.8,1],[-47,2.4,13],[-40,2.2,34],[-22,1.8,38],[-16,1,43],[-9,.8,51],[-2,.8,49]]);
});

test('cliff promenade has continuous physical surfaces, modest slopes and clear standing space',()=>{
  const g=createCoasterStructure(true),material=new MeshBasicMaterial({side:DoubleSide}),mesh=new Mesh(g.steel,material),ray=new Raycaster();mesh.updateMatrixWorld();
  const solids=g.colliders.filter(c=>!c.surface).map(c=>({...c,inverse:new Quaternion().setFromEuler(new Euler(...(c.rotation??[0,0,0]))).invert()}));
  try{
    for(let i=1;i<COASTER_CLIFF_WALK.length;i++){
      const a=new Vector3(...coasterWorld(COASTER_CLIFF_WALK[i-1])),b=new Vector3(...coasterWorld(COASTER_CLIFF_WALK[i]));
      assert.ok(Math.atan2(Math.abs(b.y-a.y),Math.hypot(b.x-a.x,b.z-a.z))*180/Math.PI<15);
      for(let sample=0;sample<=40;sample++){
        const foot=a.clone().lerp(b,sample/40),centre=foot.clone().add(new Vector3(0,.9,0));
        ray.set(foot.clone().add(new Vector3(0,.2,0)),new Vector3(0,-1,0));ray.near=0;ray.far=.3;
        assert.ok(ray.intersectObject(mesh,false).length>0,`missing walking surface ${i}:${sample}`);
        for(const c of solids){
          const d=centre.clone().sub(new Vector3(...c.position)).applyQuaternion(c.inverse);
          assert.ok(Math.abs(d.x)>=c.half[0]+.35-1e-6||Math.abs(d.y)>=c.half[1]+.85-1e-6||Math.abs(d.z)>=c.half[2]+.35-1e-6,`walking body overlaps ${c.position} at ${i}:${sample}`);
        }
      }
    }
    assert.ok(g.colliders.some(c=>c.surface&&c.position.every((v,i)=>Math.abs(v-coasterWorld(COASTER_LOOKOUT.center)[i])<1e-8)));
  }finally{g.steel.dispose();g.glow.dispose();material.dispose()}
});

test('new lookout paving carries diffuse warm night fill, not just luminous outlines',()=>{
  const g=createCoasterStructure(true),p=g.steel.attributes.position,n=g.steel.attributes.normal,fill=g.steel.attributes.nightRadiance;
  let count=0,warm=0;
  for(let i=0;i<p.count;i++)if(Math.abs(p.getX(i)-105)<6.1&&Math.abs(p.getZ(i)+181)<6.1&&Math.abs(p.getY(i)-9.08)<.02&&n.getY(i)>.9){count++;if(fill.getX(i)>.25&&fill.getX(i)>fill.getZ(i))warm++;}
  g.steel.dispose();g.glow.dispose();assert.ok(count>0);assert.ok(warm/count>.8,`${warm}/${count} top vertices have warm diffuse fill`);
});

test('tall tower wall has interior lighting samples near its facade fixtures',()=>{
  const g=createCoasterStructure(true),p=g.steel.attributes.position,n=g.steel.attributes.normal,fill=g.steel.attributes.nightRadiance;
  let samples=0,warm=0;
  for(let i=0;i<p.count;i++)if(p.getX(i)>6&&p.getX(i)<14&&p.getY(i)>10&&p.getY(i)<45&&Math.abs(p.getZ(i)+270.5)<.05&&n.getZ(i)>.9){
    samples++;if(fill.getX(i)>.3&&fill.getX(i)>fill.getZ(i))warm++;
  }
  g.steel.dispose();g.glow.dispose();
  assert.ok(samples>=6,'a tall wall cannot sample local lighting only at its top and bottom');
  assert.ok(warm/samples>.5,`${warm}/${samples} interior facade samples carry warm diffuse light`);
});
