import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {build} from 'esbuild';
import {BoxGeometry,DoubleSide,Group,Mesh,MeshBasicMaterial,Object3D,Raycaster,Vector3} from 'three';
import {createHash} from 'node:crypto';
import R from '@dimforge/rapier3d-compat';
import {createWaterwheelArt,waterwheelFoundationContacts,buildWaterwheelFrame} from '../../src/components/world/alpha-island/batch2/waterwheel-art.ts';
import {decodeWaterwheelArtifact,encodeWaterwheelArtifact,installWaterwheelArtifact,requireWaterwheelArtifact,WATERWHEEL_GROUPS} from '../../src/components/world/alpha-island/batch2/waterwheel-artifact.ts';
import {encodeStaticSurfaces,surfaceColliderBuffers} from '../../src/components/world/static-surface-asset.ts';
import {ALPHA_WATERWHEEL} from '../../src/components/world/alpha-island/alpha-batch2-layout.ts';
import {alphaWorld,ALPHA_ORIGIN} from '../../src/components/world/alpha-island/alpha-layout.ts';
import {decodeAlphaTerrain} from '../../src/components/world/alpha-island/alpha-terrain-artifact.ts';
import {findSafePlayerLanding} from '../../src/components/world/safe-landing.ts';
import {worldActorSites,worldActorArrival,arrivalColliderRequirements} from '../../src/components/world/world-actor-sites.ts';
import {SLUICE_X,WATERWHEEL_CENTER,WATERWHEEL_FRAME_BODY,WATERWHEEL_FLOOR_BODY,WATERWHEEL_FLOOR_POSITION,WATERWHEEL_FLOOR_SCALE,WATERWHEEL_SLUICE_Z,waterwheelSluiceHeight} from '../../src/components/world/alpha-island/batch2/waterwheel-layout.ts';
import {waterwheelArticulatedSurface} from '../../src/components/world/alpha-island/batch2/waterwheel-contact.ts';
import {PLAYER_HALF_HEIGHT,PLAYER_RADIUS} from '../../src/components/world/actor-physics.ts';

const root=new URL('../../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('src/components/world/terrain-artifacts.generated.json',root),'utf8'));
const inflate=async entry=>{const bytes=gunzipSync(await readFile(new URL('public'+entry.url,root)));return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);};
const raw=await inflate(manifest.waterwheel),baked=decodeWaterwheelArtifact(raw),authored=createWaterwheelArt();
const dispose=art=>Object.values(art).flat().forEach(p=>p.geometry.dispose());
test.after(()=>{dispose(baked);dispose(authored);});

test('baked waterwheel retains all eight groups, exact attributes and independent pivots',()=>{
  assert.deepEqual(new Uint8Array(encodeWaterwheelArtifact(authored)),new Uint8Array(raw));
  assert.equal(Object.values(baked).flat().length,16);
  for(const group of WATERWHEEL_GROUPS) for(const [i,p] of baked[group].entries()) {
    const source=authored[group][i];
    assert.equal(p.finish,source.finish);assert.equal(p.space,source.space);
    assert.deepEqual(Object.keys(p.geometry.attributes),Object.keys(source.geometry.attributes));
    for(const [key,a] of Object.entries(p.geometry.attributes))assert.deepEqual(a.array,source.geometry.attributes[key].array);
    assert.deepEqual(p.geometry.index?Array.from(p.geometry.index.array):null,source.geometry.index?Array.from(source.geometry.index.array):null);
    const collider=surfaceColliderBuffers(p);
    if(['frame','floor','wheel','panel'].includes(group))assert.equal(collider.vertices,p.geometry.attributes.position.array);
    else assert.equal(collider,null);
    assert.deepEqual(p.sources,source.sources);
  }
  const originalFloor=new BoxGeometry(1,1,1);
  try {for(const [key,a] of Object.entries(originalFloor.attributes))assert.deepEqual(baked.floor[0].geometry.attributes[key].array,a.array);}
  finally{originalFloor.dispose();}
  assert.deepEqual(WATERWHEEL_FLOOR_POSITION,[3.2,.005,-4.1]);assert.deepEqual(WATERWHEEL_FLOOR_SCALE,[12,.05,2.6]);
});

test('asset rejects missing classification, groups, changed spaces and truncation; remount owns geometry',()=>{
  assert.throws(()=>requireWaterwheelArtifact(),/must be loaded/);
  const parts=Object.values(baked).flat();
  for(const patch of [{collision:undefined},{role:undefined},{space:''},{reason:''}])
    assert.throws(()=>encodeStaticSurfaces([{...parts[0],...patch}],{}));
  assert.throws(()=>decodeWaterwheelArtifact(encodeStaticSurfaces(parts.slice(1),{region:'alpha-waterwheel'})));
  assert.throws(()=>decodeWaterwheelArtifact(encodeStaticSurfaces(parts.map((p,i)=>i?p:{...p,space:'other'}),{region:'alpha-waterwheel'})));
  assert.throws(()=>decodeWaterwheelArtifact(raw.slice(0,-4)));
  const sources = Object.fromEntries(baked.frame.map(p=>[p.id,p.sources.map(range=>({...range}))]));
  sources[baked.frame[0].id][0].vertexCount -= 3;
  assert.throws(()=>decodeWaterwheelArtifact(encodeStaticSurfaces(parts,{region:'alpha-waterwheel',frameSources:sources})),/Invalid waterwheel/);
  installWaterwheelArtifact(baked);const first=requireWaterwheelArtifact(),second=requireWaterwheelArtifact();
  try {
    assert.notEqual(first.frame[0].geometry,second.frame[0].geometry);
    const original=baked.frame[0].geometry.attributes.position.array[0];
    first.frame[0].geometry.attributes.position.array[0]+=100;
    assert.equal(second.frame[0].geometry.attributes.position.array[0],original);
    assert.equal(baked.frame[0].geometry.attributes.position.array[0],original);
  } finally {dispose(first);dispose(second);}
});

test('separating thin floor trim changes collision policy without changing any authored frame triangle or shading attribute',()=>{
  const original=buildWaterwheelFrame();
  const triangles=parts=>parts.flatMap(p=>{
    const attributes=Object.entries(p.geometry.attributes),count=p.geometry.attributes.position.count;
    return Array.from({length:count/3},(_,t)=>{
      const hash=createHash('sha256').update(p.finish);
      for(const [name,a] of attributes){const values=a.array.subarray(t*3*a.itemSize,(t+1)*3*a.itemSize);hash.update(name).update(new Uint8Array(values.buffer,values.byteOffset,values.byteLength));}
      return hash.digest('hex');
    });
  }).sort();
  try {assert.deepEqual(triangles([...baked.frame,...baked.drain]),triangles(original));}
  finally{original.forEach(p=>p.geometry.dispose());}
  assert.equal(baked.drain[0].collision,'none');assert.equal(surfaceColliderBuffers(baked.drain[0]),null);
  assert.equal(baked.floor[0].collision,'solid');
});

test('fixed material batches name their actual bearing, sluice pier, arch and bank ranges', () => {
  const zones = new Map();
  for (const part of baked.frame) {
    assert.equal(part.sources.reduce((n, range) => n + range.vertexCount, 0), part.geometry.getAttribute('position').count);
    for (const range of part.sources) {
      assert.equal(range.surfaceId,part.id);
      const zone = range.id.split('/').at(-1), bounds = zones.get(zone) ?? [];
      const points = part.geometry.getAttribute('position');
      for (let i=range.firstVertex; i<range.firstVertex+range.vertexCount; i++) bounds.push([points.getX(i),points.getY(i),points.getZ(i)]);
      zones.set(zone,bounds);
    }
  }
  assert.equal(zones.size,9);
  assert.ok(zones.get('headrace-footings-and-braces').some(([,y])=>y<0),'foundations include the extended visible foot');
  assert.ok(zones.get('open-headrace-trough').every(([,y])=>y>5.85),'upper trough stays away from the floor');
  assert.ok(zones.get('passage-piers-and-lintel').every(([,,z])=>z< -2.19));
  for (const [i,x] of SLUICE_X.entries()) assert.ok(zones.get(`sluice-${i}-posts-and-guides`).every(([px,,z])=>Math.abs(px-x)<.84&&Math.abs(z-2.3)<.68));
  assert.ok(zones.get('discharge-race-stone-banks').every(([,y,z])=>y<=.301&&((z>.49&&z<.91)||(z>2.91&&z<3.33))));
});

const identity = {x:0,y:0,z:0,w:1};
const angles = [0,.33,1.7];
const sluicePosition = (index, opening) => [SLUICE_X[index],waterwheelSluiceHeight(opening),WATERWHEEL_SLUICE_Z];
function mountArticulated(world, parts, point) {
  const body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(...point));
  const collider = world.createCollider(R.ColliderDesc.trimesh(...waterwheelArticulatedSurface(parts)),body);
  return {body,collider};
}

test('gate leaves move by their visible lift and keep outside hand-operated positions clear', async t => {
  await R.init();
  const world = new R.World({x:0,y:0,z:0});
  const {body,collider} = mountArticulated(world,baked.panel,sluicePosition(1,2));
  const [x,,z] = sluicePosition(1,2), ray=(height)=>new R.Ray({x:x+.15,y:height,z:z+1.25},{x:0,y:0,z:-1});
  const capsule = new R.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS);
  try {
    for (const [opening,lower,higher] of [[2,false,true],[1,true,false],[0,true,false]]) {
      body.setNextKinematicTranslation({x,y:waterwheelSluiceHeight(opening),z}); world.step();
      assert.equal(collider.castRay(ray(.68),2.5,false)>=0,lower);
      assert.equal(collider.castRay(ray(1.75),2.5,false)>=0,higher);
      for (const lateral of [-.87,0,.87]) {
        const handStance = {x:x+lateral,y:PLAYER_HALF_HEIGHT+PLAYER_RADIUS,z:z+1.12};
        assert.equal(world.intersectionWithShape(handStance,identity,capsule),null);
      }
    }
    const old = world.createCollider(R.ColliderDesc.cuboid(.82,1.15,.6).setTranslation(x,1.15,z));
    assert.ok(old.castRay(ray(.68),2.5,false)>0 && old.castRay(ray(1.75),2.5,false)>0,'old guard occupied both heights at every gate setting');
    t.diagnostic('Former gate cover blocked both heights; new gate keeps the open underside and closed upper gap.');
  } finally {world.free();}
});

test('rotor and bucket openings agree with baked surfaces at three physical wheel angles', async t => {
  await R.init();
  const world = new R.World({x:0,y:0,z:0}), root = new Group(), pos = new Vector3(...WATERWHEEL_CENTER);
  const material = new MeshBasicMaterial({side:DoubleSide}), ray = new Raycaster(), south = new Vector3(0,0,-1);
  const {body,collider} = mountArticulated(world,baked.wheel,WATERWHEEL_CENTER);
  root.position.copy(pos); root.add(...baked.wheel.map(p=>new Mesh(p.geometry,material)));
  let hits=0, open=0, maxGap=0;
  try {
    for (const angle of angles) {
      body.setNextKinematicRotation({x:0,y:0,z:Math.sin(angle/2),w:Math.cos(angle/2)}); world.step();
      root.rotation.z = angle; root.updateMatrixWorld(true);
      for (let x=-3.18; x<3.2; x+=.267) for (let y=-3.14; y<3.2; y+=.271) {
        const from=new Vector3(pos.x+x,pos.y+y,pos.z+2.2);
        ray.set(from,south); ray.far=4.4;
        const expected=ray.intersectObject(root)[0], physical=collider.castRay(new R.Ray(from,south),4.4,false);
        assert.equal(!!expected,physical>=0,JSON.stringify({angle,x,y}));
        if (expected) {hits++; maxGap=Math.max(maxGap,Math.abs(expected.distance-physical));}
        else if (Math.abs(x)<3.15&&Math.abs(y)<3.17) open++;
      }
    }
    assert.ok(hits>300 && open>100 && maxGap<.0002,JSON.stringify({hits,open,maxGap}));
    t.diagnostic(`${hits} real rotor contacts and ${open} clear rays inside the old guard footprint. Max discrepancy ${maxGap.toFixed(6)} m.`);
  } finally {world.free();material.dispose();}
});

test('visible structure and real colliders agree through both world transforms and passage remains walkable',async()=>{
  await R.init();
  const world=new R.World({x:0,y:-9.81,z:0}),scene=new Group(),material=new MeshBasicMaterial({side:DoubleSide});
  const position=alphaWorld(ALPHA_WATERWHEEL.center),body=world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...position));
  const solid=[...baked.frame,...baked.floor],ids=new Map();scene.position.fromArray(position);
  let hits=0,misses=0,triangles=0,minHeadroom=Infinity;
  for(const part of solid) {
    const b=surfaceColliderBuffers(part);triangles+=b.indices.length/3;
    const mesh=new Mesh(part.geometry,material);mesh.userData.part=part.id;scene.add(mesh);
    let vertices=b.vertices,translation=[0,0,0];
    if(part.role==='floor') {
      mesh.position.fromArray(WATERWHEEL_FLOOR_POSITION);mesh.scale.fromArray(WATERWHEEL_FLOOR_SCALE);
      vertices=Float32Array.from(vertices,(n,i)=>n*WATERWHEEL_FLOOR_SCALE[i%3]);translation=WATERWHEEL_FLOOR_POSITION;
    }
    const collider=world.createCollider(R.ColliderDesc.trimesh(vertices,b.indices).setTranslation(...translation),body);ids.set(collider.handle,part.id);
  }
  scene.updateMatrixWorld(true);world.step();
  const ray=new Raycaster(),at=(x,y,z)=>new Vector3(position[0]+x,position[1]+y,position[2]+z);
  const probe=(origin,direction,distance)=>{
    ray.set(origin,direction);ray.far=distance;
    const visible=ray.intersectObject(scene)[0],physical=world.castRay(new R.Ray(origin,direction),distance,false);
    assert.equal(!!physical,!!visible,JSON.stringify(origin));
    if(physical){assert.ok(Math.abs(visible.distance-physical.timeOfImpact)<.0007,JSON.stringify({origin,visible:visible.distance,physical:physical.timeOfImpact}));assert.equal(ids.get(physical.collider.handle),visible.object.userData.part);hits++;}
    else misses++;
  };
  try {
    for(let x=-9.013;x<9;x+=.397)for(let y=.107;y<7;y+=.329)probe(at(x,y,-8),new Vector3(0,0,1),13);
    for(let x=-8.731;x<9;x+=.611)for(let z=-6.237;z<4;z+=.547)probe(at(x,9,z),new Vector3(0,-1,0),14);
    // Safe landing checks a support ring and 2.4 m escape route, including the
    // adjacent island. Install the actual built ground, not an invented plane.
    const terrain=decodeAlphaTerrain(await inflate(manifest.alpha));
    const terrainBody=world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...ALPHA_ORIGIN));
    world.createCollider(R.ColliderDesc.trimesh(terrain.positions,terrain.indices),terrainBody);
    const mountAtStation = (parts, point) => mountArticulated(world,parts,point.map((n,i)=>n+position[i]));
    mountAtStation(baked.wheel,WATERWHEEL_CENTER);
    for (const [i] of SLUICE_X.entries()) mountAtStation(baked.panel,sluicePosition(i,2));
    const player=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...at(3,2,-4).toArray()));
    world.createCollider(R.ColliderDesc.capsule(.48,.34),player);world.step();
    // The western end deliberately meets the wheel zone; sample the open central and eastern walking lane.
    for(let x=.1;x<7.1;x+=.4)for(const z of [-4.8,-4.55,-4.1,-3.65,-3.4]) {
      const floor=world.castRay(new R.Ray(at(x,1,z),{x:0,y:-1,z:0}),2,false,undefined,undefined,undefined,player);
      assert.ok(floor,`missing passage floor ${x},${z}`);
      const floorY=position[1]+1-floor.timeOfImpact;
      const center={x:position[0]+x,y:floorY+.88,z:position[2]+z};
      assert.equal(world.intersectionWithShape(center,{x:0,y:0,z:0,w:1},new R.Capsule(.48,.34),undefined,undefined,undefined,player),null,`blocked walking lane ${x},${z}`);
      // Automatic relocation requires a wider .75 m support ring than walking.
      // Test that policy within its fitting strip, not against the stone pillars.
      if(Math.abs(z+4.1)<.55) {
        const landing=findSafePlayerLanding(world,R,player,[[position[0]+x,floorY,position[2]+z]],-1);
        assert.ok(landing,`blocked safe landing strip ${x},${z}`);
      }
      const roof=world.castRay(new R.Ray(at(x,1,z),{x:0,y:1,z:0}),8,false,undefined,undefined,undefined,player);
      if(roof)minHeadroom=Math.min(minHeadroom,position[1]+1+roof.timeOfImpact-floorY);
    }
    assert.ok(hits>100&&misses>100);assert.ok(minHeadroom>4.5);
    console.log(JSON.stringify({waterwheelRayHits:hits,waterwheelRayMisses:misses,staticTriangles:triangles,minHeadroom}));
  } finally {world.free();material.dispose();}
});

test('waterwheel arrival and walking wait for every real fixed structural handle and close on its removal',async()=>{
  await R.init();const world=new R.World({x:0,y:0,z:0}),states=new Map();
  const entry=worldActorArrival('?start=alpha-waterwheel',false),passage=worldActorSites.passage(world,states);
  const mount=(name,part=baked.floor[0])=>{
    const b=surfaceColliderBuffers(part),body=world.createRigidBody(R.RigidBodyDesc.fixed());
    const collider=world.createCollider(R.ColliderDesc.trimesh(b.vertices,b.indices),body);
    const parent=new Object3D(),object=new Object3D();parent.name=name;parent.add(object);states.set(collider.handle,{object});
    return collider;
  };
  try {
    for(const need of arrivalColliderRequirements(null))mount(need.name);
    mount('alpha-terrain-patch');mount('alpha-terrain-patch');
    assert.equal(entry.collidersReady(world,states),false);assert.equal(passage.at(entry.position,.34),false);
    for(const part of baked.frame){mount(WATERWHEEL_FRAME_BODY,part);assert.equal(entry.collidersReady(world,states),false);}
    const floor=mount(WATERWHEEL_FLOOR_BODY);
    assert.equal(entry.collidersReady(world,states),true);assert.equal(passage.at(entry.position,.34),true);
    floor.setSensor(true);assert.equal(entry.collidersReady(world,states),false);assert.equal(passage.at(entry.position,.34),false);
    floor.setSensor(false);world.removeCollider(floor,false);assert.equal(entry.collidersReady(world,states),false);
  }finally{world.free();}
});

test('eight baked footings reach actual built terrain across their full bearing footprints',async()=>{
  await R.init();const terrain=decodeAlphaTerrain(await inflate(manifest.alpha)),world=new R.World({x:0,y:0,z:0});
  const ground=world.createCollider(R.ColliderDesc.trimesh(terrain.positions,terrain.indices));world.step();
  let count=0,maxGap=-Infinity;
  try {
    const stone=baked.frame.find(p=>p.finish==='stone').geometry.attributes.position;
    for(const f of waterwheelFoundationContacts()) {
      let min=Infinity;
      for(let i=0;i<stone.count;i++)if(Math.abs(stone.getX(i)-f.x)<f.width/2+.001&&Math.abs(stone.getZ(i)-f.z)<f.depth/2+.001&&stone.getY(i)<=f.top)
        min=Math.min(min,stone.getY(i));
      assert.ok(Number.isFinite(min));
      for(const dx of [-.4,-.2,0,.2,.4])for(const dz of [-.4,-.2,0,.2,.4]) {
        const x=ALPHA_WATERWHEEL.center[0]+f.x+dx*f.width,z=ALPHA_WATERWHEEL.center[2]+f.z+dz*f.depth;
        const hit=ground.castRay(new R.Ray({x,y:60,z},{x:0,y:-1,z:0}),100,false);assert.notEqual(hit,null);
        const gap=ALPHA_WATERWHEEL.center[1]+min-(60-hit);maxGap=Math.max(maxGap,gap);assert.ok(gap<.0001);count++;
      }
    }
    assert.equal(count,200);console.log(JSON.stringify({waterwheelBearingSamples:count,maxGap}));
  }finally{world.free();}
});

test('production waterwheel imports the baked contract, not procedural waterwheel authoring',async()=>{
  const result=await build({entryPoints:[new URL('src/components/world/alpha-island/batch2/AlphaWaterwheel.tsx',root).pathname],bundle:true,write:false,format:'esm',packages:'external',metafile:true,logLevel:'silent'});
  const inputs=Object.keys(result.metafile.inputs);
  assert.ok(inputs.some(p=>p.endsWith('/waterwheel-artifact.ts')));
  assert.equal(inputs.some(p=>p.endsWith('/waterwheel-art.ts')),false);
});
