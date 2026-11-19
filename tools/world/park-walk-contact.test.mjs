import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { buildWalk } from '../../src/components/world/WorldParkWalk.tsx';
import { parkWalkCollision } from '../../src/components/world/park-deck-collision.ts';
import { BOARDWALK_POINTS } from '../../src/components/world/layout.ts';
import { PLAYER_CENTER_HEIGHT, PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from '../../src/components/world/actor-physics.ts';
import { playerSupport, followPlayerGround } from '../../src/components/world/player-ground.ts';

test('boardwalk gaps, piles, plaza landing and both mitres match their physical surfaces', async t => {
  await R.init();
  const world = new R.World({x:0,y:-9.81,z:0});
  const legacy = new R.World({x:0,y:-9.81,z:0});
  const walk = buildWalk(), sections = [walk,...walk.groups];
  const material = new MeshBasicMaterial({side:DoubleSide});
  const deckMeshes = sections.map(s => new Mesh(s.deck,material));
  const down = new Vector3(0,-1,0), origin = new Vector3(), caster = new Raycaster();
  function install(vertices, indices, role) {
    const body = world.createRigidBody(R.RigidBodyDesc.fixed());
    body.userData = {[role]:true};
    world.createCollider(R.ColliderDesc.trimesh(vertices,indices,R.TriMeshFlags.FIX_INTERNAL_EDGES),body);
  }
  try {
    for (const s of sections) {
      const p = parkWalkCollision(s.deck,s.solid,s.id ?? 'plaza');
      install(p.deckVertices,p.floor,'surface');
      install(p.deckVertices,p.wall,'solid');
      install(p.shellVertices,p.shellIndices,'solid');
    }
    for (const slab of walk.surfaces) {
      const body = legacy.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...slab.position));
      const yaw = slab.rotation[1];
      body.setRotation({x:0,y:Math.sin(yaw/2),z:0,w:Math.cos(yaw/2)},true);
      legacy.createCollider(R.ColliderDesc.cuboid(...slab.size.map(v=>v/2)),body);
    }
    world.step(); legacy.step();
    let airGaps = 0, legacyFilled = 0, timberHits = 0, maxError = 0;
    for (let i=0; i<3; i++) {
      const a=BOARDWALK_POINTS[i], b=BOARDWALK_POINTS[i+1];
      const dx=b[0]-a[0], dz=b[2]-a[2], length=Math.hypot(dx,dz);
      // Stay off the central stringer and away from the bridge approach.
      for (let d=i===0?6:1;d<length-1;d+=.023) {
        origin.set(a[0]+(dx*d-dz*.8)/length, a[1]+.18, a[2]+(dz*d+dx*.8)/length);
        caster.set(origin,down);
        const visual=caster.intersectObjects(deckMeshes,false)[0];
        const ray = new R.Ray(origin,down), depth=.26;
        const physical=world.castRay(ray,depth,false);
        if (!visual || visual.distance>depth) {
          assert.equal(physical,null,'collision in a visible gap above the stringer at '+origin.toArray());
          airGaps++;
          if (legacy.castRay(ray,depth,false)) legacyFilled++;
        } else {
          assert.ok(physical,'missing exposed plank');
          maxError=Math.max(maxError,Math.abs(visual.distance-physical.timeOfImpact));
          timberHits++;
        }
      }
    }
    assert.ok(legacyFilled>10 && airGaps>=legacyFilled && timberHits>100);
    assert.ok(maxError<.001,'vertical surface error '+maxError);
    const waypoints = [[50,-46],...BOARDWALK_POINTS.slice(1).map(([x,,z])=>[x,z])];
    // Stop on the last full plank, then return to the same stone flag.
    const last=waypoints.at(-1), prior=waypoints.at(-2), span=Math.hypot(last[0]-prior[0],last[1]-prior[1]);
    last[0]+=(prior[0]-last[0])/span; last[1]+=(prior[1]-last[1])/span;
    const start=waypoints[0];
    const player=world.createRigidBody(R.RigidBodyDesc.dynamic().lockRotations().setTranslation(start[0],1.16+PLAYER_CENTER_HEIGHT,start[1]));
    player.userData={player:true};
    world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS).setFriction(0),player);
    for(let n=0;n<30;n++)world.step();
    let unsupported=0, maximumGap=0;
    for(const target of [...waypoints.slice(1),...waypoints.slice(0,-1).reverse()]){
      let reached=false;
      for(let tick=0;tick<1200;tick++){
        const p=player.translation(), dx=target[0]-p.x, dz=target[1]-p.z, length=Math.hypot(dx,dz);
        if(length<.1){reached=true;break;}
        const contact=playerSupport(world,R,player);
        if(!contact?.grounded){unsupported++;maximumGap=Math.max(maximumGap,contact?.gap??Infinity);}
        player.setLinvel({x:dx/length*2,y:player.linvel().y,z:dz/length*2},true);
        followPlayerGround(world,R,player,player.linvel(),1/60,false);world.step();
      }
      assert.ok(reached,'blocked before '+target+' at '+JSON.stringify(player.translation()));
    }
    assert.equal(unsupported,0,'capsule lost contact; maximum gap '+maximumGap);
    t.diagnostic(JSON.stringify({airGaps,oldBoxFilledGaps:legacyFilled,timberHits,maxError,unsupported}));
  } finally {
    for(const s of sections){s.deck.dispose();s.solid.dispose();}
    material.dispose();world.free();legacy.free();
  }
});
