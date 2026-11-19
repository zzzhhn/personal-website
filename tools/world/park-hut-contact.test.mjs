import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Vector3, DoubleSide, Mesh, MeshBasicMaterial, Raycaster } from 'three';
import { BOARDWALK_POINTS } from '../../src/components/world/layout.ts';
import { buildWalk } from '../../src/components/world/WorldParkWalk.tsx';
import { parkWalkCollision } from '../../src/components/world/park-deck-collision.ts';
import { HUTS, HUT_FRONT_Z, DECK_Y } from '../../src/components/world/WorldParkLayout.ts';
import { buildParkHut } from '../../src/components/world/park-hut-structure.ts';
import { PLAYER_HALF_HEIGHT, PLAYER_RADIUS, PLAYER_CENTER_HEIGHT } from '../../src/components/world/actor-physics.ts';
import { createPlayerClearance, playerVelocityChange, sweptPlayerVelocity } from '../../src/components/world/player-motion.ts';
import { followPlayerGround, playerSupport, compensatePlayerSlopeGravity, clearPlayerSlopeGravity } from '../../src/components/world/player-ground.ts';
import { readWorldCraftGltf, disposeWorldCraftGltf } from '../../src/components/world/world-craft-gltf-test.mjs';

test('walk both ways between the visible park hut planks and the doorway, with air between boards', async t => {
  await R.init();
  const gltf=await readWorldCraftGltf(['public/assets/world/craft-batch6-facilities/hut-runtime.glb']);
  const material=new MeshBasicMaterial({side:DoubleSide});
  try {
    for (const [index,h] of HUTS.entries()) await t.test(h.id,child=>{
      const model=buildParkHut(gltf.scene.getObjectByName('hut_'+h.variant),h,index);
      const world=new R.World({x:0,y:-9.81,z:0}), drawing=new Mesh(model.deck,material);
      const raycaster=new Raycaster(),down=new Vector3(0,-1,0);
      const put=(vertices,indices,role)=>{
        const fixed=world.createRigidBody(R.RigidBodyDesc.fixed());
        fixed.userData={[role]:true};
        return world.createCollider(R.ColliderDesc.trimesh(vertices,indices,R.TriMeshFlags.FIX_INTERNAL_EDGES),fixed);
      };
      try {
        put(model.shellVertices,model.shellIndices,'solid');
        const treads=put(model.deckVertices,model.floor,'surface'),sides=put(model.deckVertices,model.wall,'solid');
        assert.ok(h.spur,'production hut has a spur connecting the boardwalk');
        const length=Math.hypot(h.spur.to[0]-h.spur.from[0],h.spur.to[2]-h.spur.from[2]);
        let newGaps=0,hitCount=0,maxError=0;
        for(let z=.03;z<length-.1;z+=.012){
          const origin=new Vector3(...h.local(0,.35,HUT_FRONT_Z+z));
          raycaster.set(origin,down);const visible=raycaster.intersectObject(drawing,false)[0];
          const ray=new R.Ray(origin,down);
          const hits=[treads.castRay(ray,1,false),sides.castRay(ray,1,false)].filter(n=>n>=0);
          if(!visible || visible.distance>1) {assert.equal(hits.length,0,'invisible board');newGaps++;}
          else {
            assert.ok(hits.length,'visible board missing');
            maxError=Math.max(maxError,Math.abs(visible.distance-Math.min(...hits)));hitCount++;
          }
        }
        assert.ok(hitCount>0 && newGaps>0);assert.ok(maxError<.001);
        // Start on the last full board. Crossing goes through the meeting of the separately
        // authored spur and interior, then returns to the same board.
        for(const lateral of [-.5,0,.5]){
          const start=h.local(lateral,0,HUT_FRONT_Z+Math.max(.14,length-.48)),inside=h.local(lateral,0,HUT_FRONT_Z-1.2);
          const player=world.createRigidBody(R.RigidBodyDesc.dynamic().lockRotations().setTranslation(start[0],DECK_Y+PLAYER_CENTER_HEIGHT+.002,start[2]));
          player.userData={player:true};
          world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS).setFriction(0),player);
          for (let tick=0;tick<30;tick++) world.step();
          assert.ok(playerSupport(world,R,player)?.grounded,'resting a capsule on the last board');
          for(const end of [inside,start]){
            let reached=false,unsupported=[];
            for(let step=0;step<600;step++){
              const p=player.translation(),dx=end[0]-p.x,dz=end[2]-p.z,dist=Math.hypot(dx,dz);
              if(dist<.09){reached=true;break;}
              const support=playerSupport(world,R,player);
              if(!support?.grounded)unsupported.push({step,gap:support?.gap,at:[p.x,p.y,p.z]});
              compensatePlayerSlopeGravity(world,player,support,1/60,false);
              const v=player.linvel(),dt=1/60,change=playerVelocityChange(v,{x:2*dx/dist,y:0,z:2*dz/dist},dt,!!support?.grounded);
              player.setLinvel({x:v.x+change.x,y:v.y,z:v.z+change.z},true);
              followPlayerGround(world,R,player,player.linvel(),dt,false);world.step();clearPlayerSlopeGravity(player);
            }
            assert.ok(reached,'doorway blocked at '+player.translation().x+','+player.translation().z);
            assert.equal(unsupported.length,0,'lost foot support across a seam '+JSON.stringify(unsupported.slice(0,3)));
          }
          world.removeRigidBody(player);
        }
        child.diagnostic(JSON.stringify({spurMetres:length,airRays:newGaps,timberRays:hitCount,maxSurfaceError:maxError,walks:6}));
      } finally {world.free();for(const g of [model.deck,model.solid,model.low.deck,model.low.solid])g.dispose();}
    });
  } finally {disposeWorldCraftGltf(gltf.scene);material.dispose();}
});


test('the classroom spur is reachable from the finite boardwalk end and can return to it',async t=>{
  await R.init();
  const index=HUTS.findIndex(h=>h.id==='interactive-learning'), hut=HUTS[index];
  const asset=await readWorldCraftGltf(['public/assets/world/craft-batch6-facilities/hut-runtime.glb']);
  const room=buildParkHut(asset.scene.getObjectByName('hut_'+hut.variant),hut,index);
  const walk=buildWalk(), terminal=walk.groups.at(-1);
  const deck=parkWalkCollision(terminal.deck,terminal.solid,'boardwalk-terminal');
  const world=new R.World({x:0,y:-12.5,z:0});
  t.after(()=>{
    world.free();
    for(const part of [walk,...walk.groups,room,room.low]){part.deck.dispose();part.solid.dispose();}
    disposeWorldCraftGltf(asset.scene);
  });
  function mount(vertices,indices,role) {
    const fixed=world.createRigidBody(R.RigidBodyDesc.fixed());
    fixed.userData={[role]:true};
    world.createCollider(R.ColliderDesc.trimesh(vertices,indices),fixed);
  }
  for(const structure of [deck,room]){
    mount(structure.deckVertices,structure.floor,'surface');
    mount(structure.deckVertices,structure.wall,'solid');
    mount(structure.shellVertices,structure.shellIndices,'solid');
  }
  const end=BOARDWALK_POINTS.at(-1), previous=BOARDWALK_POINTS.at(-2);
  const tangent=new Vector3(...previous).sub(new Vector3(...end)).normalize();
  const diagnostic=[];
  for(const inset of [.35,.65,.9]){
    const inboard=point=>new Vector3(...point).addScaledVector(tangent,inset);
    const start=inboard(end);
    const spur=inboard(hut.spur.to),inside=new Vector3(...hut.local(0,0,HUT_FRONT_Z-.9));
    const actor=world.createRigidBody(R.RigidBodyDesc.dynamic().lockRotations()
      .setTranslation(start.x,DECK_Y+PLAYER_CENTER_HEIGHT,start.z).setLinearDamping(.2)
      .setCcdEnabled(true).setSoftCcdPrediction(.1));
    world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS).setFriction(0).setMass(72),actor);
    const guard=createPlayerClearance(world);
    const step=(vx=0,vz=0)=>{
      const support=playerSupport(world,R,actor);
      const change=playerVelocityChange(actor.linvel(),{x:vx,y:0,z:vz},1/60,!!support?.grounded);
      compensatePlayerSlopeGravity(world,actor,support,1/60,false);
      actor.applyImpulse({x:change.x*actor.mass(),y:0,z:change.z*actor.mass()},true);
      const velocity=sweptPlayerVelocity(guard,actor,actor.linvel(),1/60,R.QueryFilterFlags.EXCLUDE_SENSORS);
      actor.setLinvel(velocity,true);
      followPlayerGround(world,R,actor,velocity,1/60,false);
      world.step();
      clearPlayerSlopeGravity(actor);
    };
    for(let i=0;i<30;i++)step();
    let lowest=Infinity;
    for(const target of [spur,inside,spur,start]){
      let reached=false;
      for(let i=0;i<300;i++){
        const p=actor.translation(),dx=target.x-p.x,dz=target.z-p.z,distance=Math.hypot(dx,dz);
        assert.ok(playerSupport(world,R,actor)?.grounded,JSON.stringify({inset,p,target}));
        lowest=Math.min(lowest,p.y);
        if(distance<.16){reached=true;break;}
        step(dx*2/distance,dz*2/distance);
      }
      assert.ok(reached,JSON.stringify({inset,target,body:actor.translation()}));
    }
    diagnostic.push({inset,lowest,returnPosition:actor.translation()});
    world.removeCharacterController(guard);
    world.removeRigidBody(actor);
  }
  t.diagnostic(JSON.stringify(diagnostic));
});
