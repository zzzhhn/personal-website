import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import RAPIER from '@dimforge/rapier3d-compat';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3 } from 'three';
import { cameraCollisionRadius, cameraOverlapsGuide, sweepCamera } from './camera-collision.ts';
import { orbitDirection } from './actor-physics.ts';
import { WorldOcclusion } from './WorldOcclusion.ts';
await RAPIER.init();
const solid = c => !c.isSensor();
const radius = cameraCollisionRadius(.1, 50, 16 / 9);
function sweep(world, from, to, r = radius) { return sweepCamera(world, RAPIER, from, to, r, undefined, solid); }
function overlaps(world, p, r = radius) {
  let hit = false;
  world.intersectionsWithShape(p, { x:0,y:0,z:0,w:1 }, new RAPIER.Ball(r), () => { hit = true; return false; });
  return hit;
}
test('near-plane corners fit the collision sphere at wide aspect ratios and first-person FOV', () => {
  for (const fov of [50, 70]) for (const aspect of [1, 16 / 9, 3.5]) {
    const h = .1 * Math.tan(fov * Math.PI / 360);
    assert.ok(cameraCollisionRadius(.1, fov, aspect, .16) > Math.hypot(.1, h, h * aspect));
  }
});
test('cave camera stays below the roof instead of lifting onto a higher walking deck', () => {
  const world = new RAPIER.World({ x:0,y:0,z:0 });
  try {
    world.createCollider(RAPIER.ColliderDesc.cuboid(20,.2,20).setTranslation(0,3,0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(20,.2,20).setTranslation(0,-.2,0));
    world.step();
    const low = sweep(world, {x:0,y:1.5,z:0}, {x:0,y:1.5,z:12});
    assert.equal(low.hit, null); assert.equal(low.position.y, 1.5);
    const high = sweep(world, {x:0,y:1.5,z:0}, {x:0,y:12,z:12});
    assert.ok(high.position.y < 2.8 - radius); assert.equal(overlaps(world, high.position), false);
  } finally { world.free(); }
});
test('thin walls constrain orbit, lagging pivot and first-person eye without crossing or overlap', () => {
  const world = new RAPIER.World({x:0,y:0,z:0});
  try {
    world.createCollider(RAPIER.ColliderDesc.cuboid(.015,5,5).setTranslation(.6,2,0)); world.step();
    const body={x:0,y:1,z:0};
    const pivot=sweep(world,body,{x:1.5,y:1.6,z:0});
    assert.ok(pivot.position.x < .6-radius); assert.equal(overlaps(world,pivot.position),false);
    for (const to of [{x:5,y:1.6,z:0},{x:4,y:3,z:2},{x:4,y:.3,z:-2}]) {
      const r=sweep(world,pivot.position,to); assert.ok(r.position.x<.6-radius); assert.equal(overlaps(world,r.position),false);
    }
    const eye=sweep(world,{x:.15,y:1,z:0},{x:.65,y:1.4,z:0},cameraCollisionRadius(.1,70,3.5,.16));
    assert.ok(eye.position.x<.6-.16); assert.equal(overlaps(world,eye.position,.16),false);
  } finally {world.free();}
});
test('forced-close orbit hides its own helmet/body and restores drawing only after safe clearance',()=>{
  const world=new RAPIER.World({x:0,y:0,z:0}),foot={x:0,y:0,z:0};
  try{
    world.createCollider(RAPIER.ColliderDesc.cuboid(.02,3,3).setTranslation(.55,1,0));world.step();
    const close=sweep(world,{x:0,y:1.5,z:0},{x:5,y:1.5,z:0});
    assert.equal(cameraOverlapsGuide(close.position,foot,radius),true,'legal camera sweep can end inside the guide envelope');
    assert.equal(cameraOverlapsGuide({x:0,y:1.425,z:0},foot,radius),true,'helmet interior');
    assert.equal(cameraOverlapsGuide({x:0,y:.6,z:0},foot,radius),true,'body interior');
    assert.equal(cameraOverlapsGuide({x:.6,y:1.425,z:0},foot,radius,true),true,'hysteresis avoids visibility flicker');
    assert.equal(cameraOverlapsGuide({x:.85,y:1.425,z:0},foot,radius,true),false,'normal orbit restores drawing');
  }finally{world.free();}
});
test('actual quarry route camera sweeps stay clear at near/far distance and low/high orbit angles', t => {
  const root=new URL('../../../public/world/alpha-mine/',import.meta.url);
  const layout=JSON.parse(readFileSync(new URL('layout.json',root),'utf8'));
  const proxy=JSON.parse(readFileSync(new URL('colliders.json',root),'utf8'));
  const world=new RAPIER.World({x:0,y:0,z:0}); let samples=0;
  try {
    for(const part of Object.values(proxy)) world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(part.vertices),new Uint32Array(part.indices)));
    world.step();
    const route=[...layout.route.points,...layout.gallery.route];
    for(const [i,p] of route.entries()) {
      if(i%2)continue;
      const body={x:p[0],y:p[1]+.88,z:p[2]},pivot=sweep(world,body,{...body,y:body.y+.65}).position;
      assert.equal(overlaps(world,pivot),false,`route ${i}: unsafe pivot`);
      for(const yaw of [0,Math.PI/4,Math.PI/2,Math.PI*.75,Math.PI,Math.PI*1.25,Math.PI*1.5,Math.PI*1.75])
        for(const pitch of [-.2,.45,1.2])for(const d of [5,20]){
          const dir=orbitDirection(yaw,pitch),to={x:pivot.x+dir[0]*d,y:pivot.y+dir[1]*d,z:pivot.z+dir[2]*d};
          const r=sweep(world,pivot,to);
          assert.equal(overlaps(world,r.position),false,`route ${i}, yaw ${yaw}, pitch ${pitch}, d ${d}`); samples++;
        }
    }
    t.diagnostic(`${samples} actual quarry camera placements`);
  }finally{world.free();}
});
test('quarry walls stay opaque while ordinary view-corridor fading still works', () => {
  const scene=new Scene(),camera=new PerspectiveCamera(50,1,.1,100),quarry=new Group();
  quarry.userData.assetId='alpha-mine'; scene.add(quarry);
  const wall=new Mesh(new BoxGeometry(2,3,.1),new MeshBasicMaterial());wall.castShadow=true;wall.position.z=2;quarry.add(wall);
  camera.position.set(0,1,5);scene.updateMatrixWorld(true);
  const fade=new WorldOcclusion();fade.update(scene,camera,new Vector3(0,1,0),1);
  assert.equal(wall.material.transparent,false);assert.deepEqual(fade.debug().fades,[]);
  quarry.userData.assetId='qa-building';fade.update(scene,camera,new Vector3(0,1,0),1);
  assert.equal(wall.material.transparent,true);assert.equal(fade.debug().fades.length,1);
  fade.dispose();wall.geometry.dispose();wall.material.dispose();
});
