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
