import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import R from '@dimforge/rapier3d-compat';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { createWindFlagStand } from './alpha-wind-flag-stand.ts';
import { decodeAlphaTerrain } from './alpha-terrain-artifact.ts';

test('three wind flags stand on the actual slope, solid only on their bases and tapered octagonal masts', async (t) => {
  await R.init();
  const raw = gunzipSync(
    await readFile(new URL('../../../../public/assets/world/terrain/alpha.bin.gz', import.meta.url)),
  );
  const terrain = decodeAlphaTerrain(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  const world = new R.World({ x: 0, y: 0, z: 0 }),
    material = new MeshBasicMaterial({ side: DoubleSide });
  t.after(() => {
    world.free();
    material.dispose();
  });
  const earth = world.createCollider(R.ColliderDesc.trimesh(terrain.positions, terrain.indices));
  for (let index = 0; index < 3; index++) {
    const stand = createWindFlagStand(index),
      [x, y, z] = stand.position;
    t.after(() => stand.dispose());
    const [pole, foot] = stand.parts.map((part) =>
      world.createCollider(R.ColliderDesc.trimesh(part.vertices, part.indices).setTranslation(x, y, z)),
    );
    let minOld = Infinity,
      maxOld = 0;
    for (let i = 0; i < 5; i++)
      for (let j = 0; j < 5; j++) {
        const px = x + (i / 4 - 0.5) * 0.598,
          pz = z + (j / 4 - 0.5) * 0.648;
        const down = new R.Ray({ x: px, y: 44, z: pz }, { x: 0, y: -1, z: 0 });
        const ground = 44 - earth.castRay(down, 20, true);
        minOld = Math.min(minOld, 38 - ground);
        maxOld = Math.max(maxOld, 38 - ground);
        const fromBelow = new R.Ray({ x: px, y: ground - 2, z: pz }, { x: 0, y: 1, z: 0 });
        const bottom = foot.castRay(fromBelow, 2, true);
        assert.ok(bottom >= 0 && bottom < 1.99);
        const top = 44 - foot.castRay(down, 20, true);
        assert.ok(top > ground && top - ground < 1.05);
      }
    let maxGap = 0;
    const visible = new Mesh(stand.parts[0].geometry, material);
    visible.position.set(x, y, z);
    visible.updateMatrixWorld(true);
    for (const h of [0.35, 1.5, 3.4])
      for (let n = 0; n < 16; n++) {
        const a = (n * Math.PI) / 8,
          origin = new Vector3(x + Math.cos(a), y + h, z + Math.sin(a)),
          dir = new Vector3(-Math.cos(a), 0, -Math.sin(a));
        const hit = pole.castRay(new R.Ray(origin, dir), 1.1, true),
          visual = new Raycaster(origin, dir, 0, 1.1).intersectObject(visible)[0];
        assert.ok(hit > 0 && visual);
        maxGap = Math.max(maxGap, Math.abs(hit - visual.distance));
      }
    const clothRay = new R.Ray({ x: x + 0.7, y: y + 3, z: z + 1 }, { x: 0, y: 0, z: -1 });
    assert.ok(maxGap < 0.0001);
    assert.equal(pole.castRay(clothRay, 2, true), -1);
    assert.equal(foot.castRay(clothRay, 2, true), -1);
    assert.ok(minOld > 0.03 && maxOld > 0.48);
    t.diagnostic(
      JSON.stringify({ index, oldBaseAirGap: [minOld, maxOld], surfaceSamples: 25, mastRays: 48, maxGap }),
    );
  }
});

test('wind gate slats, feet and crossbar keep their physical openings and each crank stance is clear',async t=>{
  const {createAlphaWindGate}=await import('./alpha-station-structures.ts');
  const {alphaActionTarget}=await import('./alpha-action-reach.ts');
  const {alphaGroundHeight}=await import('./alpha-terrain.ts');
  const {ALPHA_WIND_GATE_Y}=await import('./alpha-layout.ts');
  const {PLAYER_RADIUS,PLAYER_HALF_HEIGHT,PLAYER_CENTER_HEIGHT}=await import('../actor-physics.ts');
  await R.init();
  const world=new R.World({x:0,y:0,z:0}),parts=createAlphaWindGate();
  t.after(()=>{world.free();for(const p of parts)p.geometry.dispose();});
  const origin=[16,ALPHA_WIND_GATE_Y,-44], colliders=[];
  for(const {sources} of parts)for(const source of sources){
    const [qx,qy,qz,qw]=source.quaternion;
    const pos=source.position.map((value,i)=>value+origin[i]);
    colliders.push(world.createCollider(R.ColliderDesc.roundCuboid(...source.args).setTranslation(...pos).setRotation({x:qx,y:qy,z:qz,w:qw})));
  }
  assert.equal(colliders.length,11);
  const probe=(x,y,z)=>colliders.some(c=>c.castRay(new R.Ray({x:origin[0]+x,y:origin[1]+y,z:origin[2]+z},{x:0,y:0,z:-1}),.9,true)>=0);
  for(let i=0;i<6;i++){assert.ok(probe(-.8+i*.32,1.4,.45));if(i<5)assert.equal(probe(-.64+i*.32,1.4,.45),false);}
  assert.ok(probe(0,1.05,.45));assert.equal(probe(0,.55,.45),false);
  assert.ok(probe(-1,.15,.45));assert.ok(probe(1,.15,.45));
  world.step();
  for(let wind=0;wind<3;wind++){
    const [x,,z]=alphaActionTarget('wind',wind),px=x+.5;
    const stance={x:px,y:alphaGroundHeight(px,z)+PLAYER_CENTER_HEIGHT,z};
    assert.equal(world.intersectionWithShape(stance,{x:0,y:0,z:0,w:1},new R.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS)),null);
  }
});

test('tumbling wind sign rests on its actual downhill edge through the full strong-wind cycle',async t=>{
  const { buildTumblingSign, tumblingSignPose } = await import('./alpha-tumbling-sign.ts');
  const { Quaternion } = await import('three');
  await R.init();
  const raw=gunzipSync(await readFile(new URL('../../../../public/assets/world/terrain/alpha.bin.gz',import.meta.url)));
  const terrain=decodeAlphaTerrain(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
  const world=new R.World({x:0,y:-9.81,z:0}), model=buildTumblingSign(), axis=new Vector3(0,0,1);
  t.after(()=>{world.free();model.dispose();});
  const earth=world.createCollider(R.ColliderDesc.trimesh(terrain.positions,terrain.indices));
  const body=world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
  const parts=model.parts.map(p=>world.createCollider(R.ColliderDesc.convexHull(p.geometry.attributes.position.array),body));
  const q=new Quaternion(), material=new MeshBasicMaterial({side:DoubleSide});t.after(()=>material.dispose());
  let highestOldGap=0, deepestOldBurial=0, maxFaceBurial=0, maxFloorError=0, maxHullError=0;
  const down={x:0,y:-1,z:0};
  for(let i=0;i<=270;i++){
    const age=i/30, {position:[x,y,z],angle}=tumblingSignPose(model.corners,2,age);
    q.setFromAxisAngle(axis,angle);body.setTranslation({x,y,z},true);body.setRotation(q,true);
    world.propagateModifiedBodyPositionsToColliders();
    const groundAt=(px,pz)=>90-earth.castRay(new R.Ray({x:px,y:90,z:pz},down),100,true);
    const oldY=groundAt(x,z)+Math.max((Math.abs(Math.sin(angle))+Math.abs(Math.cos(angle)))*.25,Math.abs(Math.cos(angle))*.8+Math.abs(Math.sin(angle))*.04);
    let minGap=Infinity;
    for(const c of model.corners){
      const p=new Vector3(...c).applyQuaternion(q);
      minGap=Math.min(minGap,y+p.y-groundAt(x+p.x,z+p.z));
    }
    maxFloorError=Math.max(maxFloorError,Math.abs(minGap));
    highestOldGap=Math.max(highestOldGap,minGap+oldY-y); deepestOldBurial=Math.max(deepestOldBurial,y-oldY-minGap);
    if(i%9!==0)continue;
    for(const {geometry} of model.parts){
      const indices=geometry.index, positions=geometry.getAttribute('position');
      for(let k=0;k<indices.count;k+=3){
        const [a,b,c]=[0,1,2].map(n=>new Vector3().fromBufferAttribute(positions,indices.getX(k+n)));
        for(const [u,v] of [[.5,0],[0,.5],[.5,.5],[1/3,1/3]]){
          const p=a.clone().multiplyScalar(1-u-v).addScaledVector(b,u).addScaledVector(c,v).applyQuaternion(q);
          maxFaceBurial=Math.max(maxFaceBurial,groundAt(x+p.x,z+p.z)-p.y-y);
        }
      }
    }
    const offset=new Vector3(x,y,z),forward=new Vector3(0,0,-1);
    for(const [j,localY] of [0,-.55].entries()){
      const mesh=new Mesh(model.parts[j].geometry,material);mesh.position.copy(offset);mesh.quaternion.copy(q);mesh.updateMatrixWorld();
      const from=new Vector3(0,localY,.5).applyQuaternion(q).add(offset);
      const hit=parts[j].castRay(new R.Ray(from,forward),1,true);
      const visible=new Raycaster(from,forward,0,1).intersectObject(mesh)[0];
      assert.ok(visible&&hit>=0);maxHullError=Math.max(maxHullError,Math.abs(visible.distance-hit));
    }
    const air=new Vector3(.18,-.55,.5).applyQuaternion(q).add(offset);
    assert.ok(parts.every(c=>c.castRay(new R.Ray(air,forward),1,true)<0),'open air alongside the narrow stake');
  }
  assert.ok(maxFaceBurial<.002, String(maxFaceBurial)); assert.ok(highestOldGap>.48); assert.ok(maxFloorError<.0001); assert.ok(maxHullError<.0001);
  t.diagnostic(JSON.stringify({poses:271,highestOldGap,deepestOldBurial,maxFaceBurial,maxFloorError,maxHullError}));
});
