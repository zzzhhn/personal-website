import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Quaternion, Raycaster, Vector3 } from 'three';
import { PLAYER_CENTER_HEIGHT, PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from '../../../src/components/world/actor-physics.ts';
import { interactionVisible } from '../../../src/components/world/interaction-offer.ts';
import { followPlayerGround, playerSupport } from '../../../src/components/world/player-ground.ts';
import { alphaActionTarget, alphaPickupApproach } from '../../../src/components/world/alpha-island/alpha-action-reach.ts';
import { alphaWorld, ALPHA_ORIGIN } from '../../../src/components/world/alpha-island/alpha-layout.ts';
import { actorActivities } from '../../../src/components/world/actor-activities.ts';
import { alphaStationInteraction } from '../../../src/components/world/alpha-island/alpha-station-interaction.ts';
import { advanceAlphaHand, cancelAlphaHand, useAlphaStore } from '../../../src/components/world/alpha-island/alpha-state.ts';

function operate(kind, position) {
  actorActivities.sync({position,yaw:0,grounded:true,available:true});
  try {
    let starts=0, committed;
    const station=alphaStationInteraction(kind,0,()=>{starts++;});
    assert.ok(station.enabled()); station.onInteract(); assert.equal(starts,1);
    for(let frame=0;frame<40&&!committed;frame++) committed=advanceAlphaHand(.06,position,true);
    assert.equal(committed?.kind,kind);
    if(kind==='lantern')assert.equal(useAlphaStore.getState().carried,true);
  } finally { cancelAlphaHand(); actorActivities.sync({available:false,grounded:false}); }
}

export function surveyStationStructures(scene, ground, t) {
  const world = new R.World({x:0,y:-9.81,z:0});
  const capsule = new R.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS);
  const identity = new Quaternion();
  let solid = 0, decoration = 0, largestError = 0;
  try {
    const lodge = scene.getObjectByName('alpha-dock-lodge'), rack = scene.getObjectByName('alpha-lantern-rack');
    for (const station of [lodge,rack]) {
      const shapes = new Map();
      station.traverse(node => {
        if (!node.userData.roundBox) return;
        const position = node.getWorldPosition(new Vector3()), rotation = node.getWorldQuaternion(new Quaternion());
        const descriptor = R.ColliderDesc.roundCuboid(...node.userData.roundBox).setTranslation(...position.toArray()).setRotation(rotation);
        world.createCollider(descriptor);
        assert.ok(!shapes.has(node.name));
        shapes.set(node.name,node);
      });
      for (const mesh of station.children.filter(n => n.isMesh)) {
        const vertices = mesh.geometry.getAttribute('position');
        let start = 0;
        for (const piece of mesh.userData.sources) {
          assert.equal(piece.firstVertex,start);
          start += piece.vertexCount;
          const shape = shapes.get(piece.id);
          if (piece.collision === 'none') {
            decoration++;
            assert.equal(piece.role,'decoration'); assert.equal(shape,undefined); continue;
          }
          solid++;
          assert.ok(shape,piece.id);
          assert.equal(shape.parent.userData.surface,piece.role==='floor');
          shapes.delete(piece.id);
          const inverse = shape.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
          const point = new Vector3(), args = shape.userData.roundBox;
          // Test the separately mounted physical primitive against every visible facet centre.
          const vertex = new Vector3();
          for (let i=piece.firstVertex; i<start; i+=3) {
            point.fromBufferAttribute(vertices,i).add(vertex.fromBufferAttribute(vertices,i+1))
              .add(vertex.fromBufferAttribute(vertices,i+2)).multiplyScalar(1/3).applyMatrix4(inverse);
            const distance = Math.hypot(Math.max(0,Math.abs(point.x)-args[0]),Math.max(0,Math.abs(point.y)-args[1]),
              Math.max(0,Math.abs(point.z)-args[2]));
            const error = Math.abs(distance-args[3]);
            // The two-segment bevel is faceted; its sagitta scales with radius.
            assert.ok(error <= args[3]*.05 + 1e-5, piece.id + ' facet outside its rounded profile: ' + error);
            largestError = Math.max(largestError,error);
          }
        }
        assert.equal(start,vertices.count,'all visible vertices classified: '+mesh.name);
      }
      assert.equal(shapes.size,0,'no collider without a mesh owner');
    }
    assert.ok(largestError<.005,'rounded shape to visible facet error: '+largestError);
    assert.equal(decoration,7,'sand button and three pinned notes');
    const ramp = scene.getObjectByName('alpha-lodge-access-ramp');
    const rampHost = ramp.parent.children.find(n=>n.userData.colliderArgs);
    const rampPosition = rampHost.getWorldPosition(new Vector3());
    world.createCollider(R.ColliderDesc.trimesh(...rampHost.userData.colliderArgs).setTranslation(...rampPosition.toArray()));
    world.step();
    function compareRay(structure, origin, direction, distance, expectHit) {
      const start = structure.localToWorld(new Vector3(...origin)), dir = new Vector3(...direction);
      const visible = new Raycaster(start,dir,0,distance).intersectObjects(structure.children,true)[0];
      const physical = world.castRay(new R.Ray(start,dir),distance,true);
      assert.equal(!!visible,expectHit); assert.equal(!!physical,expectHit);
      if (expectHit) assert.ok(Math.abs(visible.distance-physical.timeOfImpact)<.004);
    }
    compareRay(rack,[0,2.55,2],[0,0,-1],3,true);
    compareRay(rack,[0,1.4,2],[0,0,-1],3,false);
    compareRay(lodge,[0,6,0],[0,-1,0],2,true);
    compareRay(lodge,[0,1.6,3.4],[0,0,-1],1.5,false);
    compareRay(lodge,[-1,1.0,1.9],[0,0,-1],2,true);
    compareRay(lodge,[0,.8,1.9],[0,-1,0],.6,true);

    const foundation = lodge.children.find(n=>n.isMesh && n.name.endsWith('/stone'));
    const base = foundation.userData.sources.find(p=>p.id.includes('/foundation/'));
    const pos = foundation.geometry.attributes.position;
    const bottom = Math.min(...Array.from({length:base.vertexCount},(_,i)=>pos.getY(base.firstVertex+i)));
    let highestSeam = -Infinity;
    for (let i=base.firstVertex;i<base.firstVertex+base.vertexCount;i++) {
      const v=foundation.localToWorld(new Vector3().fromBufferAttribute(pos,i));
      if (pos.getY(i)<=bottom+.0901) highestSeam=Math.max(highestSeam,v.y-ground.height(v.x,v.z));
    }
    assert.ok(highestSeam<-.008,'foundation lower bevel meets ground: '+highestSeam);

    // Walk from the real incline across the sill and deck joints to the sand table.
    const terrain=ground.data;
    for(const indices of [terrain.surface,terrain.solid])
      world.createCollider(R.ColliderDesc.trimesh(terrain.positions,indices).setTranslation(...ALPHA_ORIGIN));
    const doorwaySteps=[];
    for(const offset of [-.65,0,.65]){
      const start = lodge.localToWorld(new Vector3(offset,0,5.2));
      start.y=ground.height(start.x,start.z)+PLAYER_CENTER_HEIGHT;
      const actor = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...start.toArray()).lockRotations().setCcdEnabled(true));
      world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS).setFriction(0).setMass(72),actor);
      for(let i=0;i<45;i++)world.step();
      let steps=0;
      const table=alphaWorld(alphaActionTarget('sand')), stopZ=table[2]+.6;
      while(actor.translation().z>stopZ && steps++<150){
        actor.setLinvel({x:0,y:actor.linvel().y,z:-1.6},true);
        followPlayerGround(world,R,actor,actor.linvel(),world.timestep,false);
        world.step();
        assert.ok(playerSupport(world,R,actor)?.grounded,'lost support on lodge entry: '+JSON.stringify({step:steps,pose:actor.translation(),velocity:actor.linvel(),support:playerSupport(world,R,actor)}));
      }
      assert.ok(actor.translation().z<=stopZ,'doorway and furnishings allow access to sand table');
      assert.ok(interactionVisible(world,R,actor,actor.translation(),table),'table button visible from aisle');
      const {x,y,z}=actor.translation();
      operate('sand',[x,y,z]); doorwaySteps.push(steps);
      world.removeRigidBody(actor);
    }

    const pickup=alphaPickupApproach('lantern',0), target=pickup.target();
    const from=[target[0],ground.height(target[0],target[2]-2)+PLAYER_CENTER_HEIGHT,target[2]-2];
    const candidates=pickup.candidates(from);
    assert.ok(candidates.length>0);
    for(const candidate of candidates){
      candidate[1]=ground.height(candidate[0],candidate[2])+PLAYER_HALF_HEIGHT+PLAYER_RADIUS;
      assert.ok(pickup.ready(candidate),'candidate is within hand reach');
      const stand=new Vector3(...candidate), approach=new Vector3(...from);
      // Permit ordinary contact with the supporting terrain under the soles.
      const above=stand.clone(); above.y+=.005;
      assert.equal(world.intersectionWithShape(above,identity,capsule),null,'candidate has capsule clearance');
      assert.equal(world.castShape(approach,identity,above.clone().sub(approach),capsule,0,1,true),null,'approach is open');
      assert.ok(interactionVisible(world,R,undefined,stand,target),'paper lantern is visible');
      operate('lantern',candidate);
    }
    t.diagnostic(JSON.stringify({solid,decoration,maximumFacetErrorMm:1000*largestError,
      foundationSeamMm:1000*highestSeam,doorwaySteps,clearLanternStances:candidates.length}));
  } finally { world.free(); }
}
