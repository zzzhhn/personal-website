import assert from 'node:assert/strict';
import test from 'node:test';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import R from '@dimforge/rapier3d-compat';
import { mineFoundationSurface } from '../../src/components/world/alpha-mine-foundation.ts';
import { extractMineFloorCoverage, mineFoundationVisibleSurface } from '../../src/components/world/mine-floor-coverage.ts';
import { ALPHA_MINE_ORIGIN } from '../../src/components/world/alpha-mine-layout.ts';
import { installMineContacts } from '../../src/components/world/alpha-mine-contact.ts';
import { readMineStaticVisual } from './alpha-mine-tests/static-visual.mjs';

const {mineApproachMarkers,mineMarkerGeometry,mineApproachBatch} = await import('../../src/components/world/WorldAlphaMineFoundation.tsx');
await R.init();

test('quarry markers block their 28 visible post and cap sections and keep the path between them clear',t=>{
  const terrain=()=>1;
  const markers=mineApproachMarkers(terrain), group=mineMarkerGeometry(markers);
  const apron=mineFoundationSurface(terrain), floor=mineFoundationVisibleSurface(apron,[]), batch=mineApproachBatch(floor,group);
  const material=new MeshBasicMaterial({side:DoubleSide}), draw=new Mesh(batch.geometry,material);
  draw.updateMatrixWorld(true);
  const world=new R.World({x:0,y:0,z:0});
  t.after(()=>{world.free();material.dispose();group.geometry.dispose();batch.geometry.dispose();});
  const surface=world.createCollider(R.ColliderDesc.trimesh(floor.vertices,floor.indices));
  const posts=world.createCollider(R.ColliderDesc.trimesh(group.vertices,group.indices));
  world.step();
  assert.equal(markers.length,28); assert.equal(batch.sources.length,29);
  assert.equal(batch.sources.at(-1).firstVertex+batch.sources.at(-1).vertexCount,batch.geometry.attributes.position.count);
  let missedBefore=0, maximum=0, gapCount=0;
  for(const m of markers) {
    const [x,y,z]=m.position, height=m.id.endsWith('-post')?y:y+.015;
    for(let angle=0;angle<8;angle++) {
      const dx=Math.cos(angle*Math.PI/4),dz=Math.sin(angle*Math.PI/4);
      const origin=new Vector3(x+dx*.3,height,z+dz*.3),dir=new Vector3(-dx,0,-dz);
      const visible=new Raycaster(origin,dir,0,.4).intersectObject(draw)[0];
      const ray=new R.Ray(origin,dir);
      if (surface.castRay(ray,.4,true)<0) missedBefore++;
      const hit=posts.castRay(ray,.4,true);
      assert.ok(hit>=0&&visible);
      maximum=Math.max(maximum,Math.abs(hit-visible.distance));
    }
  }
  for (let i=0;i<markers.length;i+=4) {
    const [a,,b]=markers.slice(i,i+3).map(v=>v.position);
    const centre=new Vector3((a[0]+b[0])/2,a[1]+.86,(a[2]+b[2])/2);
    assert.equal(world.intersectionWithShape(centre,{x:0,y:0,z:0,w:1},new R.Capsule(.44,.38)),null);
    gapCount++;
  }
  assert.equal(missedBefore,224); assert.ok(maximum<.00002); assert.equal(gapCount,7);
  t.diagnostic(JSON.stringify({missedBefore,maximum,gapCount}));
});

test('each real floor triangle cut out of the quarry apron has support on the installed facility at its centroid',async t=>{
  const source=await readMineStaticVisual(), root=source.root.clone(true), contact=installMineContacts(root);
  const coverage=extractMineFloorCoverage(root), apron=mineFoundationSurface(()=>1);
  const exposed=mineFoundationVisibleSurface(apron,coverage);
  const world=new R.World({x:0,y:0,z:0});
  t.after(()=>{world.free();contact.dispose();source.dispose();});
  const collider=world.createCollider(R.ColliderDesc.trimesh(exposed.vertices,exposed.indices));
  const org=ALPHA_MINE_ORIGIN;
  const body=world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...org));
  for(const data of [contact.base.surface,...contact.colliders.filter(p=>p.kind==='surface').map(p=>p.buffers)]) {
    world.createCollider(R.ColliderDesc.trimesh(data.vertices,data.indices),body);
  }
  world.step();
  let maxError=0,excluded=0;
  for(const triangle of coverage){
    const x=triangle.reduce((n,v)=>n+v[0],0)/3, z=triangle.reduce((n,v)=>n+v[1],0)/3;
    const ray=new R.Ray({x,y:org[1]+.001,z},{x:0,y:-1,z:0});
    const hit=world.castRay(ray,.06,true);
    assert.ok(hit,'missing contact at '+[x,z]);
    maxError=Math.max(maxError,Math.abs(.001-hit.timeOfImpact));
    if (collider.castRay(ray,.06,false)<0) excluded++;
  }
  assert.ok(coverage.length>1000&&excluded>1000); assert.ok(maxError<.001,JSON.stringify({maxError,excluded,coverage:coverage.length}));
  t.diagnostic(JSON.stringify({floorFaces:coverage.length,excluded,maxError,exposedTriangles:exposed.indices.length/3}));
});

test('the working quarry trail has a full pedestrian opening through the greybox and crafted highway guards',async t=>{
  const {railLayout}=await import('../../src/components/world/WorldStreetRails.tsx');
  const {solidsV4}=await import('../../src/components/world/layout-v4.ts');
  const {ALPHA_MINE_CONNECTOR}=await import('../../src/components/world/alpha-mine-layout.ts');
  const runs=solidsV4().filter(r=>r.kind==='rail' && Math.hypot(r.position[0]+76,r.position[2]+50)<15);
  const {beams,placements}=railLayout();
  const {mountStreetContacts}=await import('./facility-craft/street/contact-fixture.mjs');
  const moving=mountStreetContacts('rail',beams.filter(b=>b.kind==='guard'));
  const fallback=new R.World({x:0,y:0,z:0});
  const installations=[fallback,moving.world];
  t.after(()=>{fallback.free();moving.dispose();});
  function box(world,xyz,size,yaw) {
    const collider=R.ColliderDesc.cuboid(...size.map(s=>s/2)).setTranslation(...xyz)
      .setRotation({x:0,y:Math.sin(yaw/2),z:0,w:Math.cos(yaw/2)});
    world.createCollider(collider);
  }
  for(const r of runs) box(installations[0],r.position,r.size,r.yaw);
  for(const p of placements.filter(p=>p.kind==='guardPost')) {
    const e=p.matrix.elements;
    box(installations[1],[e[12],e[13]+.4,e[14]],[.3,.8,.3],Math.atan2(e[8],e[0]));
  }
  const [a,b]=ALPHA_MINE_CONNECTOR.slice(-2);
  const dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);
  const capsule=new R.Capsule(.46,.34), rotation={x:0,y:0,z:0,w:1};
  for (const w of installations) {
    w.step();
    for (const lane of [-1.65,0,1.65]) {
      const from={x:a[0]-dz/length*lane,y:1.88,z:a[2]+dx/length*lane};
      assert.equal(w.castShape(from,rotation,{x:dx,y:0,z:dz},capsule,.002,1,false),null);
    }
  }
});
