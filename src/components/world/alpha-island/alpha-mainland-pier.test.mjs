import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { alphaMainlandPierStructure, alphaPierDeckHeight } from './alpha-mainland-pier.ts';
import { Object3D, Quaternion, Vector3 } from 'three';
import { arrivalColliderRequirements, worldActorSites } from '../world-actor-sites.ts';
import { PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from '../actor-physics.ts';
import { playerSupport, followPlayerGround } from '../player-ground.ts';

await R.init();

// Pile lengths depend on terrain. Vertex ownership and material partitions do not.
test('all mainland pier render batches have declared collision sources', () => {
  const { parts, pieces }=alphaMainlandPierStructure(()=>-4);
  try {
    assert.ok(parts.length && pieces.length);
    assert.equal(new Set(pieces.map(p=>p.id)).size,pieces.length);
    assert.equal(new Set(parts.flatMap(p=>p.sources)).size,pieces.length);
    for (const part of parts) {
      let next=0;
      for (const piece of part.sources) {
        assert.ok(pieces.includes(piece));
        assert.equal(piece.finish,part.finish);
        assert.equal(piece.collision,'solid');
        assert.ok(['floor','enclosure'].includes(piece.role),piece.id);
        assert.equal(piece.firstVertex,next,piece.id);
        assert.ok(piece.vertexCount>0 && piece.vertexCount%3===0);
        assert.ok(piece.args.every(v=>Number.isFinite(v) && v>0),piece.id);
        next+=piece.vertexCount;
      }
      assert.equal(next, part.geometry.getAttribute('position').count,part.finish);
    }
  } finally { parts.forEach(part=>part.geometry.dispose()); }
});

test('mainland pier rail openings, deck survey and capsule crossing use the visible structure', t => {
  const world = new R.World({ x:0, y:-12.5, z:0 });
  const { parts } = alphaMainlandPierStructure();
  try {
    let worstProjection=0, worstShapeDeviation=0;
    for (const part of parts) {
      const positions=part.geometry.getAttribute('position');
      let vertex=0;
      for (const piece of part.sources) {
        assert.equal(piece.firstVertex,vertex,piece.id);
        assert.equal(piece.collision,'solid');
        const fixed=world.createRigidBody(R.RigidBodyDesc.fixed());
        fixed.userData={surface:piece.role==='floor',solid:piece.role==='enclosure'};
        const [x,y,z,w]=piece.quaternion;
        const collider=world.createCollider(R.ColliderDesc.roundCuboid(...piece.args)
          .setTranslation(...piece.position).setRotation({x,y,z,w}),fixed);
        const v=new Vector3(),point=new Vector3();
        const origin=new Vector3(...piece.position), inverse=new Quaternion(x,y,z,w).invert();
        for (let face=vertex;face<vertex+piece.vertexCount;face+=3) {
          point.set(0,0,0);
          for (let j=0;j<3;j++) point.add(v.fromBufferAttribute(positions,face+j));
          point.multiplyScalar(1/3);
          const hit=collider.projectPoint(point,false);
          worstProjection=Math.max(worstProjection,point.distanceTo(hit.point));
          // Independent distance to the rounded primitive in its own coordinates.
          // Rapier projects onto thin, long boxes with a separate solver tolerance.
          point.sub(origin).applyQuaternion(inverse);
          const outside=Math.hypot(...point.toArray().map((v,i)=>Math.max(Math.abs(v)-piece.args[i],0)));
          worstShapeDeviation=Math.max(worstShapeDeviation,Math.abs(outside-piece.args[3]));
        }
        vertex+=piece.vertexCount;
      }
      assert.equal(vertex,positions.count,'every visible triangle has an owner');
    }
    assert.ok(worstShapeDeviation<.002,'mesh to rounded primitive '+worstShapeDeviation);
    assert.ok(worstProjection<2*PLAYER_RADIUS/100,'projection must remain within 1% of capsule width');
    t.diagnostic(JSON.stringify({shapeDeviationMm:1000*worstShapeDeviation,rapierProjectionMm:1000*worstProjection}));
    world.step();
    const west = y => world.castRay(new R.Ray({x:-10,y,z:72},{x:-1,y:0,z:0}),2,true);
    assert.equal(west(1.82),null,'open air between the timber rail and rope');
    assert.ok(west(2.07),'timber rail');
    assert.ok(west(1.59),'rope');
    // Sweep over real bevels, interiors, seams and the exposed end of each deck.
    for (const [start,end] of [[70,70.8],[106.25,107],[117,117.7]]) {
      for (let z=start; z<=end; z+=.007) {
        const y=alphaPierDeckHeight(-10,z);
        const hit=world.castRay(new R.Ray({x:-10,y:1.5,z},{x:0,y:-1,z:0}),1,true);
        if (!hit) assert.equal(y,null,'ground reported over a slot at '+z);
        else assert.ok(y!==null && Math.abs(y-(1.5-hit.timeOfImpact))<.004,'deck height at '+z);
      }
    }
    const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(-10,2,70.3).lockRotations().setCcdEnabled(true));
    world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS).setMass(72)
      .setFriction(0).setFrictionCombineRule(R.CoefficientCombineRule.Min),body);
    for (let i=0;i<40;i++) world.step();
    let unsupported=0;
    for (let i=0;i<1000 && body.translation().z<116;i++) {
      body.setLinvel({x:0,y:body.linvel().y,z:3.6},true);
      followPlayerGround(world,R,body,body.linvel(),world.timestep,false);
      world.step();
      if (!playerSupport(world,R,body)?.grounded) unsupported++;
    }
    assert.ok(body.translation().z>=116,'capsule can cross the neck and reach the boarding platform');
    assert.equal(unsupported,0,'capsule should bridge the narrow slots between planks');
    t.diagnostic('Mainland pier crossing reached z='+body.translation().z.toFixed(2)+'; unsupported steps='+unsupported);
  } finally { world.free(); parts.forEach(part=>part.geometry.dispose()); }
});


test('the ferry pier boundary waits for all installed pieces and reopens after a deck plank remounts', () => {
  const { parts, pieces } = alphaMainlandPierStructure();
  const world = new R.World({ x: 0, y: -12.5, z: 0 }), states = new Map();
  const pier = new Object3D();
  pier.name = 'alpha-mainland-pier-r4-candidate';
  const fixed = world.createRigidBody(R.RigidBodyDesc.fixed());
  const register = (name, desc, group) => {
    const collider = world.createCollider(desc, fixed), object = new Object3D();
    object.name = name;
    group?.add(object);
    states.set(collider.handle, { object });
    return collider;
  };
  const install = piece => {
    const [x, y, z, w] = piece.quaternion;
    return register(piece.id, R.ColliderDesc.roundCuboid(...piece.args).setTranslation(...piece.position).setRotation({ x, y, z, w }), pier);
  };
  try {
    for (const need of arrivalColliderRequirements(null)) {
      register(need.name, R.ColliderDesc.trimesh(new Float32Array([0,0,0,1,0,0,0,0,1]), new Uint32Array([0,2,1])));
    }
    const from = [-10, 2, 68], to = [-10, 2, 72];
    const passage = worldActorSites.passage(world, states);
    for (const piece of pieces.slice(0, -1)) install(piece);
    assert.equal(passage.allows(from, to, PLAYER_RADIUS), false);
    install(pieces.at(-1));
    assert.equal(passage.allows(from, to, PLAYER_RADIUS), true);
    const plank = pieces.find(piece => piece.id === 'mainland-pier/1/plank/0');
    let collider;
    for (const [handle, state] of states) if (state.object.name === plank.id) collider = world.getCollider(handle);
    world.removeCollider(collider, false); states.delete(collider.handle);
    assert.equal(passage.at([-10, 2, 112], PLAYER_RADIUS), false);
    install(plank);
    assert.equal(passage.at([-10, 2, 112], PLAYER_RADIUS), true);
  } finally { world.free(); parts.forEach(part => part.geometry.dispose()); }
});
