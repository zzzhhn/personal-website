import test from 'node:test';
import assert from 'node:assert/strict';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Triangle, Vector3 } from 'three';
import { createCoasterTerrainRelief, COASTER_RELIEF_FORMATIONS, COASTER_INFIELD_WALK, coasterInfieldHeight } from './coaster-terrain-relief.ts';
import { coasterFrame, coasterRidePose, coasterWorld, COASTER_LENGTH } from './coaster-track.ts';
import { COASTER_CLIFF_WALK, COASTER_LOOKOUT, onCoasterCliffWalk } from './coaster-landscape-cliffs.ts';
import { WORKSHOP_TOOLS, WORKSHOP_INTAKE } from './intent-workshop-layout.ts';

const relief = createCoasterTerrainRelief();
const material = new MeshBasicMaterial({ side: DoubleSide }), mesh = new Mesh(relief.geometry, material);
mesh.updateMatrixWorld();
const point = index => new Vector3().fromArray(relief.vertices, index * 3);
const triangles = Array.from({ length: relief.triangleCount }, (_, i) => new Triangle(...Array.from({ length: 3 }, (_, k) => point(relief.indices[i * 3 + k]))));
const ray = new Raycaster(), nearest = new Vector3();

test.after(() => { relief.geometry.dispose(); material.dispose(); });

test('north formations and connected infield share closed outward visible and collision triangles under budget', () => {
  // Seven connected formations now cover the approved v4 north/east expansion.
  assert.equal(relief.formations.length, 7); assert.ok(relief.triangleCount <= 27000);
  const positions = relief.geometry.getAttribute('position');
  assert.equal(positions.count, relief.indices.length);
  relief.indices.forEach((v, i) => assert.deepEqual([positions.getX(i), positions.getY(i), positions.getZ(i)], point(v).toArray()));
  for (const formation of relief.formations) {
    const edges = new Map(); let volume = 0;
    for (let at = formation.firstTriangle; at < formation.firstTriangle + formation.triangleCount; at++) {
      const ids = Array.from(relief.indices.subarray(at * 3, at * 3 + 3)), t = triangles[at];
      assert.ok(t.getArea() > .00001, `${formation.id}: degenerate face`);
      volume += t.a.dot(t.b.clone().cross(t.c)) / 6;
      ids.forEach((a, i) => { const b = ids[(i + 1) % 3], key = [Math.min(a,b),Math.max(a,b)].join(':'); const old = edges.get(key) ?? [0,0]; edges.set(key, [old[0] + 1, old[1] + (a < b ? 1 : -1)]); });
    }
    assert.ok(volume > 100, `${formation.id}: outward volume ${volume}`);
    for (const [key, [count, orientation]] of edges) assert.deepEqual([count, orientation], [2,0], `${formation.id}: open/inconsistent edge ${key}`);
    const ys = Array.from({ length: formation.vertexCount }, (_, i) => point(formation.vertexStart + i).y);
    assert.ok(Math.min(...ys) < 1); assert.ok(Math.max(...ys) >= 6);
  }
});

test('rail and seated rider have 1.7 m clearance from actual terrain triangles along the whole ride', () => {
  let minimum = Infinity;
  const samples = Math.ceil(COASTER_LENGTH / .5);
  for (let sample = 0; sample < samples; sample++) {
    const frame = coasterFrame(sample / samples);
    for (const lift of [-.45, .8, 2.2]) {
      const p = frame.point.clone().addScaledVector(frame.up, lift);
      for (const triangle of triangles) {
        if (Math.min(triangle.a.distanceToSquared(p), triangle.b.distanceToSquared(p), triangle.c.distanceToSquared(p)) > 2500) continue;
        triangle.closestPointToPoint(p, nearest); minimum = Math.min(minimum, p.distanceTo(nearest));
      }
    }
  }
  assert.ok(minimum > 1.7, `actual minimum clearance ${minimum}`);
  console.log(JSON.stringify({ terrainTriangles: relief.triangleCount, clearanceSamples: samples, minimumRailRiderClearance: minimum }));
});

test('all camera modes retain their near field and spectator sight lines through the new relief', () => {
  for (let sample = 0; sample < 1200; sample++) for (const mode of ['chase', 'comfort', 'first-person']) {
    const u = sample / 1200, pose = coasterRidePose(u, mode), camera = new Vector3(...pose.cameraPosition), f = coasterFrame(u);
    const targets = mode === 'first-person' ? [new Vector3(...pose.cameraTarget)] : [new Vector3(...pose.cameraTarget), f.point.clone().addScaledVector(f.up, 2.2)];
    for (const target of targets) {
      const direction = target.clone().sub(camera); ray.set(camera, direction.clone().normalize()); ray.near = .01; ray.far = mode === 'first-person' ? 2 : direction.length();
      assert.equal(ray.intersectObject(mesh, false).length, 0, `${mode} obstructed at ${u}`);
    }
  }
});

test('station, workshop, lookout and full southeast walking corridor remain outside the relief', () => {
  for (let i = 0; i < relief.vertices.length / 3; i++) {
    const p = point(i), x = p.x - 50, z = p.z + 195;
    // Only the original north ridge is confined behind z=-48; the authorized infield extends south.
    if(i<relief.formations.find(f=>f.id==='infield-folds').vertexStart)assert.ok(z < -48);
    assert.equal(onCoasterCliffWalk(x, z, 3), false);
  }
  const targets = [[0,0,43],[-4.2,.08,43],...WORKSHOP_TOOLS.map(t => t.at),WORKSHOP_INTAKE,COASTER_LOOKOUT.center];
  for (let i = 1; i < COASTER_CLIFF_WALK.length; i++) for (let step = 0; step <= 20; step++) {
    const a = new Vector3(...COASTER_CLIFF_WALK[i - 1]), b = new Vector3(...COASTER_CLIFF_WALK[i]); targets.push(a.lerp(b, step / 20).toArray());
  }
  for (const p of targets) {
    ray.set(new Vector3(...coasterWorld([p[0],25,p[2]])),new Vector3(0,-1,0)); ray.near=0;ray.far=30;
    assert.equal(ray.intersectObject(mesh,false).length,0,`public route blocked at ${p}`);
  }
});

test('north equipment has a solid level shelf and all crowns have real top and underside surfaces', () => {
  for (let x = 16.5; x <= 31.5; x += 2.5) for (let z = -98.5; z <= -85.5; z += 2.6) {
    ray.set(new Vector3(...coasterWorld([x,8,z])),new Vector3(0,-1,0));ray.near=0;ray.far=10;
    const hits=ray.intersectObject(mesh,false); assert.ok(hits.length>=2,`open shelf at ${x},${z}`);
    assert.ok(Math.abs(hits[0].point.y - 6)<.001,`equipment base gap at ${x},${z}: ${hits[0].point.y}`);
  }
  for (const f of COASTER_RELIEF_FORMATIONS) {
    ray.set(new Vector3(...coasterWorld([f.center[0],15,f.center[1]])),new Vector3(0,-1,0));ray.near=0;ray.far=20;
    const hits=ray.intersectObject(mesh,false);assert.ok(hits.length>=2); assert.ok(hits.at(-1).point.y<1);
  }
});

test('the three strata masses meet above ground along the north relief spine', () => {
  const spine=[[-40,-106],[-24,-111],[-8,-110],[5,-107],[12,-100],[24,-92],[34,-83],[42,-75],[44,-64]];
  let minimum=Infinity;
  for(let i=1;i<spine.length;i++)for(let step=0;step<=30;step++){
    const a=spine[i-1],b=spine[i],x=a[0]+(b[0]-a[0])*step/30,z=a[1]+(b[1]-a[1])*step/30;
    ray.set(new Vector3(...coasterWorld([x,15,z])),new Vector3(0,-1,0));ray.near=0;ray.far=16;
    const hits=ray.intersectObject(mesh,false);assert.ok(hits.length>0,`gap between strata groups at ${x},${z}`);
    minimum=Math.min(minimum,hits[0].point.y-1);
  }
  assert.ok(minimum>.4,`relief spine drops to bare grass: ${minimum}`);
  console.log(JSON.stringify({minimumConnectingSpineHeight:minimum}));
});

test('night fill covers broad cliff faces with finite baked diffuse values and no emissive batch', () => {
  const g = relief.geometry, p = g.getAttribute('position'), n = g.getAttribute('normal'), c = g.getAttribute('color'), fill = g.getAttribute('nightRadiance');
  assert.equal(fill.count,p.count); assert.ok(fill.array.every(v=>Number.isFinite(v)&&v>=0));
  let exposed=0,readable=0;
  // Naturally dark leaf/grass patches must not force rock-face fill upward.
  for(let i=0;i<p.count;i++)if(p.getY(i)>1.5&&n.getY(i)>-.1&&c.getY(i)<c.getX(i)*1.15){exposed++;if(Math.max(fill.getX(i),fill.getY(i),fill.getZ(i))>.035)readable++;}
  assert.ok(readable/exposed>.95,`${readable}/${exposed} exposed face vertices receive diffuse fill`);
});

test('rock shoulders are broken slopes rather than flat green lids or uniform horizontal terrace bands', () => {
  assert.ok(relief.shrubCount>=40,'retain the north clusters and add grouped infield vegetation');
  for(const formation of relief.formations.filter(f=>f.id!=='equipment-shelf')){
    const upper=triangles.slice(formation.firstTriangle,formation.firstTriangle+formation.triangleCount).filter(t=>(t.a.y+t.b.y+t.c.y)/3>7);
    const flatArea=upper.filter(t=>Math.max(t.a.y,t.b.y,t.c.y)-Math.min(t.a.y,t.b.y,t.c.y)<.001).reduce((sum,t)=>sum+t.getArea(),0);
    const area=upper.reduce((sum,t)=>sum+t.getArea(),0);
    assert.ok(flatArea/area<.05,`${formation.id} still has a flat lid`);
    const elevations=new Set(upper.flatMap(t=>[t.a.y,t.b.y,t.c.y]).map(y=>Math.round(y*10)));
    assert.ok(elevations.size>25,`${formation.id} lacks broken rim and inclined bedding`);
  }
});

test('infield has substantial connected raised ground rather than a scatter of small rocks',()=>{
  let raised=0,covered=0,max=0;
  for(let x=-24;x<=42;x+=3)for(let z=-66;z<=39;z+=3){
    const height=coasterInfieldHeight(x,z);if(height===null)continue;
    covered++;if(height>2)raised++;max=Math.max(max,height);
  }
  assert.ok(covered*9>5000,`only ${covered*9} m² sampled coverage`);
  assert.ok(raised/covered>.45,`${raised}/${covered} samples rise above 2 m`);
  assert.ok(max>8,'retain genuinely different height levels');
  console.log(JSON.stringify({infieldSampledArea:covered*9,raisedAbove2m:raised*9,maximumHeight:max}));
});

test('garden loop connects to the retained promenade, with continuous gentle walkable tops and body clearance',()=>{
  assert.deepEqual(COASTER_INFIELD_WALK[0],[16,.11,36]);
  for(let i=0;i<COASTER_INFIELD_WALK.length;i++){
    const a=new Vector3(...COASTER_INFIELD_WALK[i]),b=new Vector3(...COASTER_INFIELD_WALK[(i+1)%COASTER_INFIELD_WALK.length]);
    const side=new Vector3(-(b.z-a.z),0,b.x-a.x).normalize();
    for(let step=0;step<=40;step++)for(const offset of [-1.2,0,1.2]){
      const foot=a.clone().lerp(b,step/40).addScaledVector(side,offset);
      ray.set(new Vector3(...coasterWorld([foot.x,foot.y+1,foot.z])),new Vector3(0,-1,0));ray.near=0;ray.far=1.4;
      const hits=ray.intersectObject(mesh,false);assert.ok(hits.length>0,`missing walk surface ${i}:${step}:${offset}`);
      assert.ok(hits[0].face.normal.y>Math.cos(15*Math.PI/180),`walk steeper than 15 degrees ${i}:${step}`);
      const head=hits[0].point.clone().add(new Vector3(0,1.7,0));
      ray.set(head,new Vector3(0,1,0));ray.near=.01;ray.far=.6;assert.equal(ray.intersectObject(mesh,false).length,0);
    }
  }
});
