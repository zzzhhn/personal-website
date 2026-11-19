import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import R from '@dimforge/rapier3d-compat';
import { Box3, BoxGeometry, BufferGeometry, DoubleSide, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Object3D, Raycaster, Scene, Vector3 } from 'three';
import { campColliderKey, campGradedFlagstones, campPlacementMatrix, campShapes, campStoneInstances, campStoneShapes } from './WorldCampPhysics.tsx';
import { PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from './actor-physics.ts';
import { collisionInventory } from './world-collision-inventory.ts';
import { playerSupport, followPlayerGround, compensatePlayerSlopeGravity, clearPlayerSlopeGravity } from './player-ground.ts';
import { createPlayerClearance, sweptPlayerVelocity, playerVelocityChange } from './player-motion.ts';
import { readWorldCraftGltf, disposeWorldCraftGltf } from './world-craft-gltf-test.mjs';

await R.init();
const nodeRequire = createRequire(import.meta.url);
const decoderPath = nodeRequire.resolve('three/examples/jsm/libs/draco/gltf/draco_decoder.js');
const decoderModule = { exports: {} };
new Function('module', 'exports', 'require', '__dirname', '__filename', readFileSync(decoderPath, 'utf8'))(
  decoderModule, decoderModule.exports, nodeRequire, dirname(decoderPath), decoderPath);
const draco = await decoderModule.exports({});

function oldCampAsset(family, asset = `camp/${family}`) {
  const bytes = readFileSync(new URL(`../../../public/assets/world/${asset}.glb`, import.meta.url));
  const length = bytes.readUInt32LE(12), info = JSON.parse(bytes.subarray(20, 20 + length));
  const binary = bytes.subarray(28 + length), material = new MeshBasicMaterial();
  const nodes = info.nodes.map(node => {
    const group = new Group();
    group.name = node.name;
    group.userData = node.extras ?? {};
    if (node.translation) group.position.fromArray(node.translation);
    if (node.rotation) group.quaternion.fromArray(node.rotation);
    if (node.scale) group.scale.fromArray(node.scale);
    if (node.matrix) new Matrix4().fromArray(node.matrix).decompose(group.position, group.quaternion, group.scale);
    if (node.mesh !== undefined) for (const primitive of info.meshes[node.mesh].primitives) {
      const ext = primitive.extensions.KHR_draco_mesh_compression, view = info.bufferViews[ext.bufferView];
      const encoded = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
      const decoder = new draco.Decoder(), buffer = new draco.DecoderBuffer(), decoded = new draco.Mesh();
      buffer.Init(encoded, encoded.length);
      const status = decoder.DecodeBufferToMesh(buffer, decoded), values = new draco.DracoFloat32Array(), face = new draco.DracoInt32Array();
      try {
        assert.ok(status.ok(), status.error_msg());
        const geometry = new BufferGeometry();
        for (const [name, key] of [['position','POSITION'],['_wind','_WIND']]) {
          if (ext.attributes[key] === undefined) continue;
          const attribute = decoder.GetAttributeByUniqueId(decoded, ext.attributes[key]);
          decoder.GetAttributeFloatForAllPoints(decoded, attribute, values);
          const points = Float32Array.from({ length: values.size() }, (_, i) => values.GetValue(i));
          geometry.setAttribute(name, new Float32BufferAttribute(points, attribute.num_components()));
        }
        const indices = [];
        for (let i = 0; i < decoded.num_faces(); i++) {
          decoder.GetFaceFromMesh(decoded, i, face);
          for (let j = 0; j < 3; j++) indices.push(face.GetValue(j));
        }
        group.add(new Mesh(geometry.setIndex(indices), material));
      } finally { for (const value of [face, values, status, decoded, buffer, decoder]) draco.destroy(value); }
    }
    return group;
  });
  for (const [i, node] of info.nodes.entries()) for (const child of node.children ?? []) nodes[i].add(nodes[child]);
  const scene = new Scene();
  scene.add(...info.scenes[info.scene ?? 0].nodes.map(i => nodes[i]));
  return { scene, dispose() { disposeWorldCraftGltf(scene); } };
}

function fixedProbe(shapes, transform, run) {
  const world = new R.World({ x: 0, y: -12.5, z: 0 }), point = new Vector3();
  try {
    for (const { kind, vertices, indices, points, sensor } of shapes) {
      const input = vertices ?? points, fixed = new Float32Array(input.length);
      for (let i = 0; i < fixed.length; i += 3) point.fromArray(input, i).applyMatrix4(transform).toArray(fixed, i);
      const shape = kind === 'hull' ? R.ColliderDesc.convexHull(fixed).setSensor(Boolean(sensor))
        : R.ColliderDesc.trimesh(fixed, indices, R.TriMeshFlags.FIX_INTERNAL_EDGES);
      world.createCollider(shape, world.createRigidBody(R.RigidBodyDesc.fixed()));
    }
    world.step();
    return run(world);
  } finally { world.free(); }
}

test('fixed camp furniture follows the visible first hit instead of the original GLB boundary', async t => {
  const pack = await readWorldCraftGltf(['public/assets/world/camp/craft/camp-props-v1.glb']);
  try {
    for (const family of ['C05','C06','C07']) {
      const legacy = oldCampAsset(family), model = pack.scene.getObjectByName(family);
      try {
        pack.scene.updateMatrixWorld(true);
        const old = campShapes(family, legacy);
        const replacement = campShapes(family, pack);
        const visualHits = [];
        for (let x = -1.6; x <= 1.6; x += .075) for (let z = -2.35; z <= 2.35; z += .075) {
          const position = new Vector3(x, 1.8, z), direction = new Vector3(0,-1,0);
          const hit = new Raycaster(position,direction,0,1.79).intersectObject(model)[0];
          if (hit) visualHits.push({ position, direction, distance: hit.distance });
        }
        const compare = shapes => fixedProbe(shapes,new Matrix4(),world => visualHits.map(({position,direction,distance}) => {
          const hit = world.castRay(new R.Ray(position,direction),1.79,true);
          return hit ? Math.abs(hit.timeOfImpact-distance) : Infinity;
        }));
        const before = compare(old), after = compare(replacement);
        const beforeMismatch = before.filter(gap=>gap>.02).length, afterMismatch = after.filter(gap=>gap>.002).length;
        t.diagnostic(`${family}: ${visualHits.length} visual contacts, >2 cm old mismatches ${beforeMismatch}, >2 mm new mismatches ${afterMismatch}`);
        assert.ok(visualHits.length>35);
        assert.equal(afterMismatch,0);
      } finally { legacy.dispose(); }
    }
  } finally { disposeWorldCraftGltf(pack.scene); }
});

test('large and small tent shells retain a real open doorway, block side panels and keep their authored closed shell', async () => {
  for (const [family,asset] of [['C03','scenario-craft-pilot/C03-tent-v1'],['C04','camp-shelter-craft/C04']]) {
    const gltf = await readWorldCraftGltf([`public/assets/world/${asset}.glb`]), legacy = oldCampAsset(family);
    try {
      const old = campShapes(family, legacy), replacement = campShapes(family, gltf);
      assert.deepEqual(replacement, old, `${family} exact portable shell`);
      const placement = new Matrix4().makeRotationY(-Math.PI/2).setPosition(-42,4.8,15);
      const heading = new Vector3(-1,0,0).transformDirection(placement);
      const capsule = new R.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS), rotation = {x:0,y:0,z:0,w:1};
      fixedProbe(replacement,placement,world => {
        const path = lateral => world.castShape(new Vector3(2.65,.83,lateral).applyMatrix4(placement),rotation,heading,capsule,0,2.6,true);
        assert.equal(path(0),null,`${family} entry centre has no air wall`);
        assert.equal(path(.15),null,`${family} standing capsule beside entry centre fits`);
        assert.ok(path(.95),`${family} visible front side blocks the same approach`);
      });
    } finally { legacy.dispose(); disposeWorldCraftGltf(gltf.scene); }
  }
});

test('visible rock faces use their placed triangles and the soft shrub volumes overlap without becoming physical support', async t => {
  const rocks = await readWorldCraftGltf(['public/assets/world/nature-camp-craft/G21.glb']), legacy = oldCampAsset('G21');
  try {
    const placement = new Matrix4().makeRotationY(.81).scale(new Vector3(.9,.9,.9)).setPosition(-61,4.8,34);
    const model = rocks.scene.getObjectByName('G21');
    const shape = campShapes('G21',rocks), prior = campShapes('G21',legacy);
    rocks.scene.applyMatrix4(placement); rocks.scene.updateMatrixWorld(true);
    model.traverse(object => { if (object.isMesh) for (const material of [object.material].flat()) material.side = DoubleSide; });
    const sampled = [];
    for (let x = -1.25; x <= 1.25; x += .15) for (let z=-1.25; z <= 1.25; z += .15) {
      const point = new Vector3(x,2,z).applyMatrix4(placement), direction = new Vector3(0,-1,0);
      const visible = new Raycaster(point,direction,0,2).intersectObject(model)[0];
      if (visible) sampled.push({point,direction,expected:visible.distance});
    }
    const probe = shapes => fixedProbe(shapes,placement,world=>sampled.map(({point,direction,expected})=>{
      const hit = world.castRay(new R.Ray(point,direction),2,true);
      return hit ? Math.abs(hit.timeOfImpact-expected) : Infinity;
    }));
    const before = probe(prior).filter(distance=>distance>.02).length, after = probe(shape);
    t.diagnostic(`G21: ${sampled.length} placed stone samples, >2 cm old mismatches ${before}, max after ${Math.max(...after).toFixed(6)} m`);
    assert.ok(sampled.length>100 && before>0);
    assert.ok(after.every(distance=>distance<.002));
  } finally { legacy.dispose(); disposeWorldCraftGltf(rocks.scene); }
  for (const family of ['G19','G20']) {
    const source = oldCampAsset(family);
    try {
      const shapes = campShapes(family,source);
      fixedProbe(shapes,new Matrix4(),world => {
        const capsule = new R.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS), identity = {x:0,y:0,z:0,w:1};
        const at = {x:0,y:.65,z:0}, direction = {x:1,y:0,z:0};
        const overlapping = world.intersectionWithShape(at,identity,capsule);
        assert.equal(overlapping?.isSensor(),true);
        assert.equal(world.intersectionWithShape(at,identity,capsule,R.QueryFilterFlags.EXCLUDE_SENSORS),null);
        assert.equal(world.castShape({x:-2,y:.65,z:0},identity,direction,capsule,0,4,true,R.QueryFilterFlags.EXCLUDE_SENSORS),null);
      });
    } finally { source.dispose(); }
  }
});

test('near and far G17 wood LODs retain the same lower trunk contact through the player walk volume', async t => {
  const gltf = oldCampAsset('G17','facility-craft/nature/G17'), legacy = oldCampAsset('G17');
  try {
    gltf.scene.updateMatrixWorld(true);
    const near = gltf.scene.getObjectByName('L0_wood'), far = gltf.scene.getObjectByName('L1_wood');
    const ring = [];
    for (const y of [.12,.45,.82,1.25,1.60]) for(let i=0;i<32;i++) {
      const a=i*Math.PI*2/32;
      const p = new Vector3(Math.cos(a)*1.5,y,Math.sin(a)*1.5), direction = new Vector3(-Math.cos(a),0,-Math.sin(a));
      const raycaster = new Raycaster(p,direction,0,1.5);
      const nearHit = raycaster.intersectObject(near)[0], farHit = raycaster.intersectObject(far)[0];
      assert.ok(nearHit && farHit);
      ring.push({p,direction,near:nearHit.distance,far:farHit.distance});
    }
    const worstLod = Math.max(...ring.map(row=>Math.abs(row.near-row.far)));
    const compare = shapes => fixedProbe(shapes,new Matrix4(),world=>Math.max(...ring.map(row=>{
      const hit = world.castRay(new R.Ray(row.p,row.direction),1.5,true);
      return hit ? Math.abs(hit.timeOfImpact-row.near) : Infinity;
    })));
    const before = compare(campShapes('G17',legacy)), after = compare(campShapes('G17',gltf));
    t.diagnostic(`G17: max old→near ${before.toFixed(4)} m, far→near ${worstLod.toFixed(4)} m, new→near ${after.toFixed(6)} m`);
    assert.ok(worstLod<.025);
    assert.ok(after<.002);
  } finally { legacy.dispose(); gltf.dispose(); }
});

test('tilted G22 stones settle their actual underside into the existing burial depth', t => {
  const model = oldCampAsset('G22','nature-craft/G22'), legacy = oldCampAsset('G22');
  try {
    const shapes = campShapes('G22',model), oldBox = new Box3().setFromObject(legacy.scene);
    const groundY = 4.8, sink = .08;
    for (const tilt of [1.2,1.45]) {
      const p = {position:[-56,groundY,43],tilt,yaw:.7,scale:1,sink};
      const oldLift = -oldBox.min.y * Math.cos(tilt) + oldBox.max.z * Math.sin(tilt);
      const after = campPlacementMatrix(p, shapes), prior = after.clone().setPosition(p.position[0],groundY+oldLift-sink,p.position[2]);
      const lowest = matrix => Math.min(...Array.from(shapes[0].indices,i=>new Vector3().fromArray(shapes[0].vertices,i*3).applyMatrix4(matrix).y));
      const beforeGap = lowest(prior)-groundY, afterGap = lowest(after)-groundY;
      t.diagnostic(`G22 pitch ${tilt}: lowest old ${beforeGap.toFixed(4)} m, new ${afterGap.toFixed(4)} m from ground`);
      assert.ok(beforeGap + sink > .02);
      assert.ok(Math.abs(afterGap+sink) < 1e-6);
    }
  } finally { model.dispose(); legacy.dispose(); }
});

test('C02 installed flagstone and fallback disclose support and side collider ownership for each displayed matrix', async t => {
  const gltf = await readWorldCraftGltf(['public/assets/world/camp-site-craft/camp-site-v1.glb']);
  const material = new MeshBasicMaterial({side:DoubleSide}), fallback = new BoxGeometry(3.1,.1,2.5).translate(0,-.05,0);
  try {
    const model = gltf.scene.getObjectByName('C02_stone_batch');
    gltf.scene.updateMatrixWorld(true);
    const geometry = campGradedFlagstones(model.geometry,model.matrixWorld), shapes = campStoneShapes(geometry), legacyFlat = campStoneShapes(fallback);
    const position = new Vector3(), direction = new Vector3(0,-1,0);
    const sample = geometry => {
      const visual = new Mesh(geometry,material), expected=[];
      visual.updateMatrixWorld(true);
      for(let x=-1.54;x<=1.54;x+=.049) for(let z=-1.246;z<=1.246;z+=.043) {
        position.set(x,.5,z);
        const hit = new Raycaster(position,direction,0,.61).intersectObject(visual)[0];
        if (hit) expected.push({start:position.clone(),distance:hit.distance});
      }
      return expected;
    };
    const measure = (shape,expected) => fixedProbe(shape,new Matrix4(),world => expected.map(({start,distance})=>{
      const hit = world.castRay(new R.Ray(start,direction),.61,true);
      return hit ? Math.abs(hit.timeOfImpact-distance) : Infinity;
    }));
    const old = measure(legacyFlat,sample(model.geometry)), next = measure(shapes,sample(geometry));
    t.diagnostic(`C02 ${old.length} flagstone ray samples, old >2mm ${old.filter(gap=>gap>.002).length}, max old ${Math.max(...old).toFixed(4)} m; next ${Math.max(...next).toFixed(6)} m`);
    assert.ok(old.some(gap=>gap>.008) && next.every(gap=>gap<.002));
    const placements = [new Matrix4().makeRotationY(.4).setPosition(-28,4.9,33),new Matrix4().makeRotationY(1.5).setPosition(-57,4.9,21)];
    {
      const mesh = new InstancedMesh(geometry,material,placements.length);
      mesh.userData = campStoneInstances('test',placements);
      placements.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));
      const scene = new Scene(), root = new Group(); root.name='camp-pad-test'; scene.add(root); root.add(mesh);
      const nodes = Array.from({length:placements.length},(_,i)=>['top','sides'].map(part=>{
        const node=new Object3D(); node.name=campColliderKey('C02','test',i,part); return node;
      })).flat();
      root.add(...nodes);
      assert.deepEqual(collisionInventory(scene,[mesh],nodes,[root.name]).errors,[]);
      assert.ok(collisionInventory(scene,[mesh],nodes.slice(1),[root.name]).errors.length>0,'missing support is detected');
      mesh.userData.worldCollisionInstances.placements[0].surfaceIds.push(nodes[0].name);
      assert.ok(collisionInventory(scene,[mesh],nodes,[root.name]).errors.some(error=>error.includes('invalid')),'duplicates within one rendered instance fail');
      mesh.dispose();
    }
    geometry.dispose();
  } finally { fallback.dispose(); material.dispose(); disposeWorldCraftGltf(gltf.scene); }
});

test('the standing capsule can walk onto, across and off a real flagstone pad without jumping',async t=>{
  const gltf = await readWorldCraftGltf(['public/assets/world/camp-site-craft/camp-site-v1.glb']);
  const dt=1/60, center=PLAYER_RADIUS+PLAYER_HALF_HEIGHT;
  const mesh=gltf.scene.getObjectByName('C02_stone_batch');
  mesh.updateWorldMatrix(true,false);
  const graded=campGradedFlagstones(mesh.geometry,mesh.matrixWorld),shapes=campStoneShapes(graded);
  try {
    for(const x of [-.82,0,.82])for(const heading of [-1,1]) {
      fixedProbe(shapes,new Matrix4(),world=>{
        world.timestep=dt;
        world.createCollider(R.ColliderDesc.cuboid(6,.5,6).setTranslation(0,-.60,0));
        const b=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x,center-.09,-heading*2.3)
          .lockRotations().setLinearDamping(.2).setCcdEnabled(true).setSoftCcdPrediction(.1));
        world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS).setMass(72).setFriction(0)
          .setFrictionCombineRule(R.CoefficientCombineRule.Min),b);
        const guard=createPlayerClearance(world);
        try {
          const step=(target=0)=>{
            const s=playerSupport(world,R,b),v=b.linvel(),change=playerVelocityChange(v,{x:0,y:0,z:target},dt,!!s?.grounded);
            compensatePlayerSlopeGravity(world,b,s,dt,false);
            b.applyImpulse({x:0,y:0,z:change.z*b.mass()},true);
            b.setLinvel(sweptPlayerVelocity(guard,b,b.linvel(),dt,R.QueryFilterFlags.EXCLUDE_SENSORS),true);
            followPlayerGround(world,R,b,b.linvel(),dt,false);world.step();clearPlayerSlopeGravity(b);
          };
          for(let i=0;i<30;i++)step();
          let furthest=0, onStones=false;
          for(let i=0;i<320;i++) {
            step(heading*3.6);
            const p=b.translation();furthest=Math.max(furthest,p.z*heading);
            if(Math.abs(p.z)<.8&&p.y>center-.006)onStones=true;
            if(furthest>2)break;
          }
          assert.ok(furthest>2&&onStones, `pad lane ${x} ${heading} stopped at ${JSON.stringify(b.translation())}`);
        }finally{world.removeCharacterController(guard);}
      });
    }
    t.diagnostic('Six bidirectional centre/margin crossings retain the stone-height support.');
  }finally{graded.dispose();disposeWorldCraftGltf(gltf.scene);}
});

test('the visible C08 covers, ledger and edges own the book stack collision at the real desk angle', async t => {
  const gltf=await readWorldCraftGltf(['public/assets/world/camp-workshop-craft/camp-workshop.glb']), legacy=oldCampAsset('C08');
  try {
    const model=gltf.scene.getObjectByName('C08');
    const placement=new Matrix4().makeRotationY(2.54).setPosition(-52.7,5.75,41);
    const prior=campShapes('C08',legacy), next=campShapes('C08',gltf);
    model.applyMatrix4(placement); gltf.scene.updateMatrixWorld(true);
    model.traverse(object=>{if(object.isMesh)for(const material of [object.material].flat())material.side=DoubleSide;});
    const samples = [];
    for(let x=-.41;x<=.42;x+=.036)for(let z=-.58;z<=.59;z+=.038){
      const start=new Vector3(x,.65,z).applyMatrix4(placement), direction=new Vector3(0,-1,0);
      const hit=new Raycaster(start,direction,0,.66).intersectObject(model)[0];
      if(hit)samples.push({start,direction,distance:hit.distance});
    }
    const measure=shape=>fixedProbe(shape,placement,world=>samples.map(({start,direction,distance})=>{
      const hit=world.castRay(new R.Ray(start,direction),.66,true);
      return hit?Math.abs(hit.timeOfImpact-distance):Infinity;
    }));
    const before=measure(prior), after=measure(next);
    t.diagnostic(`C08 ${samples.length} contact rays, old >2cm ${before.filter(gap=>gap>.02).length}, max current ${Math.max(...after).toFixed(6)} m`);
    assert.ok(samples.length>50&&before.some(gap=>gap>.02));assert.ok(after.every(gap=>gap<.002));
  }finally{legacy.dispose();disposeWorldCraftGltf(gltf.scene);}
});
