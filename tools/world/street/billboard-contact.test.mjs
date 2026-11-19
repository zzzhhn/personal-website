import test from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three';
import R from '@dimforge/rapier3d-compat';
import {billboardPlacements} from '../../../src/components/world/WorldStreetBillboards.tsx';
import {billboard} from '../../../src/components/world/WorldStreetAssets.ts';
import {mountStreetContacts,meshFromBatch,compareContact} from '../facility-craft/street/contact-fixture.mjs';

test('each timber billboard keeps its open braces, mounted print and pushable LODs at every instance',t=>{
  const items=billboardPlacements(),site=mountStreetContacts('billboard',items);
  t.after(()=>site.dispose());
  assert.equal(items.length,3);
  const audit=()=>{const inv=site.inventory();assert.equal(inv.errors.length,0,inv.errors.join(", "));assert.equal(inv.registrations['street-billboard-group'],42);};
  audit();
  let air=0,solids=0,oldBlocked=0;
  const builder=billboard(0,items[0].cell),braces=builder.parts.filter(p=>p.name.startsWith('brace-'));
  // These pairs were merged under one convex hull on each side of the board.
  const old=site.world.createCollider(R.ColliderDesc.convexHull(Float32Array.from(braces.slice(0,2).flatMap(p=>builder.pos.slice(3*p.start,3*p.end)))));
  for(const h of [.16,.22,.28])for(const z of [-.105,.105]){
    const ray=new R.Ray({x:-1.5,y:h,z},{x:1,y:0,z:0});
    if(old.castRay(ray,.73,true)>=0)oldBlocked++;
  }
  assert.equal(oldBlocked,6);
  site.world.removeCollider(old,false);
  items.forEach((item,i)=>{
    site.frame(item.position);
    const visual=meshFromBatch(site.mesh,i);t.after(()=>{visual.geometry.dispose();visual.material.dispose();});
    const {body,colliders}=site.bodies[i];
    assert.ok(Math.abs(body.mass()-36)<.001);
    assert.equal(colliders.length,14);
    for(const x of [-1.12,1.12])for(const h of [.16,.22,.28])for(const z of [-.105,.105]){
      const h1=compareContact(visual,colliders,[x-.4,h,z],[1,0,0],.75);
      assert.equal(h1.visual,null);assert.equal(h1.physical,null);air++;
    }
    for(const x of [-1.12,1.12])for(const z of [-.1944,.1944]){
      const hit=compareContact(visual,colliders,[x-.4,.22,z],[1,0,0],.75);
      assert.ok(hit.visual!==null && hit.physical!==null && Math.abs(hit.physical-hit.visual)<.001);solids++;
    }
    const print=compareContact(visual,colliders,[0,1.65,.3],[0,0,-1],.6);
    assert.ok(Math.abs(print.physical-print.visual-.003)<.0002);
    site.frame([item.position[0]+48,item.position[1],item.position[2]]);
    audit();
    const q=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.17);
    body.setRotation(q,true);site.frame(item.position);audit();
  });
  t.diagnostic(JSON.stringify({oldBlocked,air,solids}));
});
