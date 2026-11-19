import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Matrix4 } from 'three';
import { loadWorldModule } from '../../street/runtime.mjs';
import { sha, geom, snapshot } from './prepare.mjs';
import { mountKnockable } from './knockables-fixture.mjs';
const frozen=JSON.parse(readFileSync(new URL('./baseline/manifest.json',import.meta.url))),base=loadWorldModule('WorldParkWalk.tsx','?walkCraft=baseline'),W=loadWorldModule('WorldParkWalk.tsx'),actual=snapshot(W);
const { PARK_ROAD_HANDOVER_X, ROAD_Y }=loadWorldModule('layout-v4-flag.ts');
function originalPlaza(W, level, summary) {
  const walk=W.buildWalk(Boolean(level)),geometry=geom(walk.deck),positions=geometry.position;
  const edge=[[PARK_ROAD_HANDOVER_X,43.6],[W.PLAZA.top-.2,ROAD_Y],[W.PLAZA.z0+.35,W.PLAZA.z1-.35]];
  const corner=i=>edge.every((axis,j)=>axis.some(value=>Math.abs(positions[i*3+j]-value)<.00001));
  const keep=[];
  for(let i=0;i<positions.length/3;i+=3) {
    if(![i,i+1,i+2].every(corner))keep.push(i,i+1,i+2);
  }
  // The new visible trim contributes two treads and eight faces. Keep the
  // frozen geometry check on every original stone, including vertex attributes.
  assert.equal(positions.length/3-keep.length,30);
  const original=Object.fromEntries(Object.entries(geometry).map(([name,data])=>{
    const size=walk.deck.getAttribute(name).itemSize;
    return [name,keep.flatMap(i=>data.slice(i*size,(i+1)*size))];
  }));
  for(const part of [walk,...walk.groups]){part.deck.dispose();part.solid.dispose();}
  return {...summary,deck:sha(original),triangles:summary.triangles-10};
}

test('baseline switch preserves the previous walk, plaza stones, placements and total rail mass', () => {
  const { rail: { spec: oldSpec, ...railGeometry }, walk } = frozen;
  const { rail: { spec, ...baselineRail }, walk: baselineWalk } = JSON.parse(JSON.stringify(snapshot(base)));
  assert.deepEqual(baselineWalk.map((row,i)=>({...row,plaza:originalPlaza(base,i,row.plaza)})),walk);
  assert.deepEqual(baselineRail, railGeometry);
  assert.equal(spec.mass, oldSpec.mass);
});
for(let l=0;l<2;l++)test(`P02 L${l}: support slabs, P01 plaza, rail/lamp placements and walking geometry remain exact`,()=>{
 const old=frozen.walk[l],now=actual.walk[l];
 assert.deepEqual(originalPlaza(W,l,now.plaza),old.plaza);
 for(const k of['surfaces','rails','lamps'])assert.deepEqual(JSON.parse(JSON.stringify(now[k])),old[k]);
 const before=base.buildWalk(!!l),after=W.buildWalk(!!l);for(let i=0;i<3;i++){
  assert.equal(sha([...after.groups[i].deck.getAttribute('position').array]),sha([...before.groups[i].deck.getAttribute('position').array]));
  assert.equal(JSON.stringify(after.groups[i].center),JSON.stringify(before.groups[i].center));
  if(l)assert.equal(after.groups[i].triangles,before.groups[i].triangles);
 }
});
test('P04 keeps its shared lamp appearance in both LODs', () => {
  for (const lod of ['geometry', 'far']) assert.equal(sha(geom(W.LAMP[lod])), sha(geom(base.LAMP[lod])));
});
test('P03 near/far agree at .97 m; adjacent authored sections touch at the handrail',()=>{
 for(const g of[W.RAIL.geometry,W.RAIL.far]){g.computeBoundingBox();assert.ok(Math.abs(g.boundingBox.max.y-.97)<1e-6);assert.ok(Math.abs(g.boundingBox.min.z+1.01)<1e-6);assert.ok(Math.abs(g.boundingBox.max.z-1.01)<1e-6);}
 const placements=W.buildWalk().rails;const step=placements.filter(p=>p.id.startsWith('rail-1-l')).sort((a,b)=>a.id.localeCompare(b.id));
 assert.ok(step.length>=2);const a=step[0].position,b=step[1].position;assert.ok(Math.abs(Math.hypot(a[0]-b[0],a[2]-b[2])-2.02)<1e-6);
});
test('UVs and slots survive batch merge and dynamic clone, finite cylinder seam unwrap',()=>{
 const walk=W.buildWalk();for(const g of[...walk.groups.flatMap(g=>[g.deck,g.solid]),W.RAIL.geometry,W.RAIL.far]){
  const c=g.clone(),p=c.getAttribute('position'),uv=c.getAttribute('aSuv'),m=c.getAttribute('aMat');assert.equal(uv.count,p.count);assert.equal(m.count,p.count);assert.ok([...uv.array].every(Number.isFinite));assert.ok([...m.array].some((v,i)=>i%4===3&&v===-1));assert.ok([...uv.array].some(v=>Math.abs(v)>.1));
  assert.equal(sha(geom(c)),sha(geom(g)));c.dispose();
 }
});
test('bounded source triangle additions',()=>{
 const near=actual.walk[0].groups.reduce((n,g)=>n+g.deckTris+g.solidTris,0),old=frozen.walk[0].groups.reduce((n,g)=>n+g.deckTris+g.solidTris,0);assert.ok(near-old<2200);assert.equal(actual.rail.triangles,156);assert.equal(actual.rail.farTriangles,36);
});
test('manufactured handrail/post grain axes and underside-bearing hardware contact',()=>{
 const C=loadWorldModule('WorldWalkCraft.ts'),r=C.craftParkRail().geometry,positions=r.getAttribute('position'),uv=r.getAttribute('aSuv'),mat=r.getAttribute('aMat');
 for(const [name,axis]of[['handrail.continuous',2],['post.vertical-grain',1]]){
  const part=r.userData.craftParts.find(p=>p.name===name),ids=Array.from({length:part.count},(_,j)=>j+part.start).filter(i=>mat.getW(i)===-1);
  const slope=ids.map(i=>uv.getX(i)-positions.getComponent(i,axis)/.7);assert.ok(Math.max(...slope)-Math.min(...slope)<1e-5);
 }
 const g=new C.WalkCraftGeo();C.walkBearing(g,[0,.97,0],0);const b=g.build();b.computeBoundingBox();
 // Stringer bottom .86, crossbeam top .86; the .014 m strap crosses this interface.
 assert.ok(b.boundingBox.min.y<.86&&b.boundingBox.max.y>.86);assert.ok(b.boundingBox.min.x<-.07&&b.boundingBox.max.x>.07);
});
test('cylinder long grain has local origin and no UV interpolation across its wrap seam',()=>{
 const C=loadWorldModule('WorldWalkCraft.ts'),g=new C.WalkCraftGeo();g.cyl([64,-2.6,-40],[64,.86,-40],.15,.13,8,'#8E6E55',{smooth:true});const b=g.build(),m=b.getAttribute('aMat'),uv=b.getAttribute('aSuv'),period=2*Math.PI*.14/(.7*466/1024);
 let side=0,cut=0;for(let t=0;t<m.count;t+=3){if(m.getW(t)===-1){side++;const v=[uv.getY(t),uv.getY(t+1),uv.getY(t+2)];assert.ok(Math.max(...v)-Math.min(...v)<period/2+1e-6);}else cut++;}assert.equal(side,16);assert.equal(cut,16);
});

function slotMatrix(mesh, slot) {
  const matrix = new Matrix4();
  mesh.getMatrixAt(slot, matrix);
  return matrix;
}

function advanceFrames(host, seconds, camera) {
  const frames = Math.ceil(seconds * 60);
  for (let i = 0; i < frames; i++) host.frame(seconds / frames, camera);
}

for (const [kind, mass, hullCount, hitHeights, gaps] of [
  ['rail', 40, 13, [.2, .5, .935], [.35, .72]],
  ['lamp', 45, 4, [.03, 1.4, 2.66], []],
]) test(`${kind}: registered geometry, mass, dynamic LOD and timed sleeping reset`, t => {
  const items = [{ id: `${kind}-first`, position: [0, 0, 0], yaw: 0 }, { id: `${kind}-second`, position: [75, 0, 0], yaw: .4 }];
  const host = mountKnockable(kind, items);
  t.after(host.dispose);
  const { asset, registration, bodies, proxy, near, far, world, Rapier } = host;
  assert.equal(registration.colliderNodes.length, hullCount);
  for (const [i, element] of registration.colliderNodes.entries()) {
    const part = asset.contact.hulls[i];
    assert.equal(element.props.name, part.id);
    assert.equal(element.props.args[0], part.points);
  }
  assert.deepEqual(Array.from(registration.instances, instance => instance.name), items.map(item => item.id));
  assert.equal(proxy.visible, false);
  assert.equal(near.material, far.material);
  assert.equal(near.geometry, proxy.geometry);
  for (const i of items.keys()) bodies[i] = host.makeBody(i);
  host.frame(.016);
  world.step();
  assert.ok(bodies.every(body => Math.abs(body.mass() - mass) < .001 && body.numColliders() === hullCount && body.isSleeping()));
  const hit = height => world.castRay(new Rapier.Ray({ x: .7, y: height, z: 0 }, { x: -1, y: 0, z: 0 }), 1.4, true);
  for (const height of hitHeights) assert.ok(hit(height), `missing ${kind} contact at ${height} m`);
  for (const height of gaps) assert.equal(hit(height), null, `filled opening at ${height} m`);

  assert.deepEqual(Array.from(near.userData.worldCollisionInstances.slots), [0]);
  assert.deepEqual(Array.from(far.userData.worldCollisionInstances.slots), [1]);
  bodies[0].applyImpulse({ x: mass * 4, y: 0, z: 0 }, true);
  for (let i = 0; i < 15; i++) world.step();
  host.publish(0);
  host.frame(.25);
  assert.ok(host.state()[0].knocked && host.state()[0].position[0] > .3);
  assert.deepEqual(slotMatrix(near, 0).elements, slotMatrix(proxy, 0).elements);

  host.pause(true);
  advanceFrames(host, .5, [75, 0, 0]);
  assert.equal(host.state()[0].knockedElapsed, 0, 'paused time keeps the displaced body in place');
  assert.deepEqual(Array.from(near.userData.worldCollisionInstances.slots), [1]);
  assert.deepEqual(Array.from(far.userData.worldCollisionInstances.slots), [0]);
  assert.deepEqual(slotMatrix(far, 0).elements, slotMatrix(proxy, 0).elements);
  assert.equal(near.count + far.count, items.length);
  host.pause(false);
  advanceFrames(host, 29.4, [75, 0, 0]);
  assert.ok(Math.abs(far.geometry.getAttribute('aInstFade').getX(0) - .5) < .001);
  assert.ok(!host.state()[0].resetPhaseDone);
  advanceFrames(host, .61, [75, 0, 0]);
  assert.ok(host.state()[0].resetPhaseDone && bodies[0].isSleeping());
  assert.deepEqual({ ...bodies[0].translation() }, { x: 0, y: 0, z: 0 });
  assert.deepEqual({ ...bodies[0].linvel() }, { x: 0, y: 0, z: 0 });
  host.publish(0);
  advanceFrames(host, 1.2);
  assert.ok(!host.state()[0].knocked && bodies[0].isSleeping());
  assert.equal(near.geometry.getAttribute('aInstFade').getX(0), 1);
  assert.deepEqual(slotMatrix(near, 0).elements, new Matrix4().elements);
});

test('complete controller seeds late and recreated bodies under a rotated, scaled parent', t => {
  const host = mountKnockable('rail', [
    { id: 'origin', position: [0, 0, 0], yaw: 0 },
    { id: 'unloaded', position: [20, 0, 0], yaw: 0 },
  ]);
  t.after(host.dispose);
  const { bodies, proxy, parent, world } = host;
  parent.position.set(4, 2, 7);
  parent.rotation.y = .4;
  parent.scale.set(2, 3, 4);
  parent.updateMatrixWorld(true);
  host.pause(true);
  host.frame(0);
  assert.deepEqual(slotMatrix(proxy, 0).elements, new Matrix4().elements);
  const invalid = host.makeBody(0);
  world.removeRigidBody(invalid);
  bodies[0] = invalid;
  host.frame(0);
  assert.deepEqual(slotMatrix(proxy, 0).elements, new Matrix4().elements);

  bodies[0] = host.makeBody(0);
  host.frame(0);
  const seededWorldPose = () => parent.matrixWorld.clone().multiply(slotMatrix(proxy, 0));
  const position = (x, y, z) => new Matrix4().makeScale(2, 3, 4).setPosition(x, y, z);
  const matricesMatch = (actual, expected) => actual.elements.every((value, i) => Math.abs(value - expected.elements[i]) < 1e-5);
  assert.ok(matricesMatch(seededWorldPose(), position(0, 0, 0)));
  const next = { x: 68.56, y: 1.14, z: -33.4 };
  bodies[0].setTranslation(next, false);
  host.frame(0);
  assert.ok(matricesMatch(seededWorldPose(), position(0, 0, 0)), 'an existing body leaves publication to the host after seeding');

  const previous = bodies[0];
  bodies[0] = host.makeBody(0);
  world.removeRigidBody(previous);
  bodies[0].setTranslation(next, false);
  host.frame(0);
  assert.ok(matricesMatch(seededWorldPose(), position(next.x, next.y, next.z)));
  assert.ok(Math.abs(bodies[0].translation().x - next.x) < 1e-5, 'visual seeding leaves the physical pose intact');
});
