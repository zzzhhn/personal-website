import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import draco3d from 'draco3d';
import R from '@dimforge/rapier3d-compat';
import { Box3, BufferGeometry, Color, Float32BufferAttribute, Group, InstancedMesh, Mesh, MeshStandardMaterial, Ray, Vector3 } from 'three';
import { COASTER_VEGETATION_BUDGET as B, coasterVegetationLayout, mergeCoasterPlantGeometry, coasterTrunkCollider, selectCoasterVegetation, updateCoasterVegetationInstances } from './coaster-vegetation-layout.ts';
import { coasterFrame, coasterRidePose, coasterSupports, coasterWorld } from './coaster-track.ts';
import { COASTER_INFIELD_WALK, onCoasterInfieldWalk } from './coaster-terrain-relief.ts';
import { onCoasterCliffWalk } from './coaster-landscape-cliffs.ts';
import { createCoasterStructure } from './coaster-geometry.ts';
import { coasterColliderDescriptor } from './coaster-collision.ts';

let sources, geometry, trunks, plants, colliders;
const assetPaths = ['street/ST1','street/ST2','camp/G19'];
// Decode the shipped Draco payloads, not hand-authored stand-ins. This requires no browser/download.
async function decodeAssets() {
  const d = await draco3d.createDecoderModule({});
  return assetPaths.map(path=>{
    const file = fs.readFileSync(new URL(`../../../../public/assets/world/${path}.glb`,import.meta.url));
    const jsonLength = file.readUInt32LE(12), gltf = JSON.parse(file.subarray(20,20+jsonLength));
    const binary = file.subarray(28+jsonLength), root = new Group();
    for (const node of gltf.nodes.filter(n=>n.mesh !== undefined)) {
      assert.equal(node.matrix,undefined); assert.equal(node.translation,undefined); assert.equal(node.scale,undefined);
      const group = new Group(); group.name = node.name; root.add(group);
      for (const primitive of gltf.meshes[node.mesh].primitives) {
        const compression = primitive.extensions.KHR_draco_mesh_compression, view = gltf.bufferViews[compression.bufferView];
        const input = binary.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
        const buffer = new d.DecoderBuffer(), decoder = new d.Decoder(), mesh = new d.Mesh();
        buffer.Init(new Int8Array(input),input.length);
        const status = decoder.DecodeBufferToMesh(buffer,mesh); assert.ok(status.ok());
        const geo = new BufferGeometry();
        for (const [name,id] of Object.entries(compression.attributes)) {
          const attr = decoder.GetAttributeByUniqueId(mesh,id), values = new d.DracoFloat32Array();
          decoder.GetAttributeFloatForAllPoints(mesh,attr,values);
          const array = Float32Array.from({length:values.size()},(_,i)=>values.GetValue(i));
          geo.setAttribute(name.toLowerCase(),new Float32BufferAttribute(array,attr.num_components())); d.destroy(values);
        }
        const indices = [], face = new d.DracoInt32Array();
        for (let i=0;i<mesh.num_faces();i++) { decoder.GetFaceFromMesh(mesh,i,face); indices.push(face.GetValue(0),face.GetValue(1),face.GetValue(2)); }
        geo.setIndex(indices);
        const rgb = gltf.materials[primitive.material].pbrMetallicRoughness.baseColorFactor;
        const material = new MeshStandardMaterial({color:new Color().setRGB(...rgb.slice(0,3))});
        group.add(new Mesh(geo,material));
        d.destroy(face); d.destroy(mesh); d.destroy(decoder); d.destroy(buffer);
      }
    }
    return { root, bytes:file.length };
  });
}
before(async()=>{
  sources = await decodeAssets();
  geometry = sources.slice(0,2).flatMap(s=>[0,1].map(lod=>mergeCoasterPlantGeometry(s.root,[`L${lod}-crown`,'L0-trunk'])));
  geometry.push(mergeCoasterPlantGeometry(sources[2].root,['crown']));
  trunks = sources.slice(0,2).map(s=>mergeCoasterPlantGeometry(s.root,['L0-trunk']));
  plants = coasterVegetationLayout();
  colliders = plants.filter(p=>p.kind!==2).map(p=>({p,...coasterTrunkCollider(trunks[p.kind],p.matrix)}));
});
after(()=>{
  geometry?.forEach(g=>g.dispose()); trunks?.forEach(g=>g.dispose());
  sources?.forEach(s=>s.root.traverse(o=>{ if(o.isMesh){o.geometry.dispose();o.material.dispose();} }));
});

test('shipped assets, finite geometry and bounded near/far/visible budgets are auditable',()=>{
  const triangles = geometry.map(g=>g.attributes.position.count/3);
  assert.deepEqual(triangles,[4526,1490,4644,1722,2052]);
  for(const g of geometry){assert.equal(g.groups.length,0);for(const a of Object.values(g.attributes)) assert.ok(a.array.every(Number.isFinite));}
  const trees = plants.filter(p=>p.kind!==2), bushes = plants.filter(p=>p.kind===2);
  assert.ok(trees.length>=32 && trees.length<=B.trees,`${trees.length} trees`);
  assert.equal(bushes.length,B.bushes);
  assert.ok(new Set(trees.map(p=>p.id.split('-')[1])).size>=10);
  const far = trees.reduce((sum,p)=>sum+triangles[p.kind*2+1],0);
  const upgrades = trees.map(p=>triangles[p.kind*2]-triangles[p.kind*2+1]).sort((a,b)=>b-a).slice(0,B.nearTrees).reduce((a,b)=>a+b,0);
  const visibleUpper = far+upgrades+B.visibleBushes*triangles[4];
  assert.ok(visibleUpper<=160000);
  const geometryBytes = geometry.reduce((sum,g)=>sum+Object.values(g.attributes).reduce((s,a)=>s+a.array.byteLength,0),0);
  const colliderBytes = colliders.reduce((sum,c)=>sum+c.pos.byteLength+c.idx.byteLength,0);
  let decodedSourceBytes=0;
  sources.forEach(s=>s.root.traverse(o=>{if(o.isMesh) decodedSourceBytes+=Object.values(o.geometry.attributes).reduce((sum,a)=>sum+a.array.byteLength,0)+(o.geometry.index?.array.byteLength??0);}));
  assert.ok(geometryBytes<2.5*1024**2); assert.ok(colliderBytes<2*1024**2);
  console.log(JSON.stringify({trees:trees.length,bushes:bushes.length,triangles,farTrees:far,nearUpgradeMax:upgrades,visibleUpper,
    sourceBytes:sources.reduce((s,a)=>s+a.bytes,0),decodedSourceBytes,geometryBytes,colliderBytes,instanceMatrixBytes:(trees.length*2+bushes.length)*64,
    maxDraws:5,maxNear:B.nearTrees,maxVisibleTrees:B.trees,maxVisibleBushes:B.visibleBushes}));
});

test('actual LOD vertices plus maximum shared wind fit the conservative placement envelope',()=>{
  const v = new Vector3();
  for(const p of plants) for(const i of p.kind===2?[4]:[p.kind*2,p.kind*2+1]) {
    const geo = geometry[i], pos = geo.attributes.position, wind = geo.attributes._wind;
    for(let j=0;j<pos.count;j++) {
      v.fromBufferAttribute(pos,j).applyMatrix4(p.matrix);
      const moving = wind.getX(j)||wind.getY(j)||wind.getZ(j), pad = moving ? .13*p.scale : 0;
      assert.ok(v.x-pad>=p.bounds.min.x && v.x+pad<=p.bounds.max.x && v.z-pad>=p.bounds.min.z && v.z+pad<=p.bounds.max.z && v.y+pad<=p.bounds.max.y && v.y-pad>=p.bounds.min.y,p.id);
    }
  }
});

test('both visible LODs keep precisely the physical L0 trunk and rigid branch weights',()=>{
  for(const c of colliders) {
    const count = trunks[c.p.kind].attributes.position.count, v = new Vector3();
    for(const lod of [0,1]) {
      const geo = geometry[c.p.kind*2+lod], start = geo.attributes.position.count-count;
      for(let j=0;j<count;j++) {
        v.fromBufferAttribute(geo.attributes.position,start+j).applyMatrix4(c.p.matrix);
        for(let k=0;k<3;k++) assert.ok(Math.abs(v.getComponent(k)-c.pos[j*3+k])<.00003);
        assert.equal(geo.attributes._wind.getX(start+j),0);assert.equal(geo.attributes._wind.getY(start+j),0);assert.equal(geo.attributes._wind.getZ(start+j),0);
      }
    }
  }
});

test('denser independent ride samples retain rail, rider and every camera sight line',()=>{
  const ray = new Ray(), hit = new Vector3(), direction = new Vector3(), box = new Box3();
  let minRail = Infinity;
  for(let i=0;i<3600;i++) {
    const u = (i+.37)/3600, f = coasterFrame(u), head = f.point.clone().addScaledVector(f.up,2.2);
    for(const p of plants) for(const q of [f.point,head]) minRail=Math.min(minRail,p.bounds.distanceToPoint(q));
    for(const mode of ['chase','comfort','first-person']) {
      const pose = coasterRidePose(u,mode), eye = new Vector3(...pose.cameraPosition);
      for(const target of mode==='first-person'?[new Vector3(...pose.cameraTarget)]:[head,new Vector3(...pose.cameraTarget)]) {
        direction.copy(target).sub(eye); const length = direction.length();ray.set(eye,direction.normalize());
        for(const p of plants) {
          box.copy(p.bounds).expandByScalar(.22);
          assert.equal(box.containsPoint(eye),false,`${mode} camera inside ${p.id}`);
          const intersection = ray.intersectBox(box,hit);
          assert.ok(!intersection || intersection.distanceTo(eye)>length,`${mode} sight blocked by ${p.id} at ${u}`);
        }
      }
    }
  }
  assert.ok(minRail>1.7,`minimum wind envelope clearance: ${minRail}`);
  console.log(JSON.stringify({independentRideSamples:3600,minRailRiderEnvelope: minRail}));
});

test('public routes remain outside foliage, with no random layout or distance-dependent trunks',()=>{
  assert.equal(coasterVegetationLayout(),plants);
  for(const p of plants.filter(p=>!p.id.startsWith('planter'))) {
    const radius = (p.bounds.max.x-p.bounds.min.x)/2;
    assert.equal(onCoasterInfieldWalk(p.local[0],p.local[2],radius+.8),false,p.id);
    assert.equal(onCoasterCliffWalk(p.local[0],p.local[2],radius+1),false,p.id);
  }
  assert.equal(colliders.length,plants.filter(p=>p.kind!==2).length);
});

test('neither support LOD grows through a tree or bush, including its diagonal braces',()=>{
  const ray = new Ray(), hit = new Vector3(), box = new Box3();
  for(const detailed of [true,false]) for(const {a,b,beams} of coasterSupports(detailed)) {
    const segments = beams.map(beam=>[beam.a,beam.b,beam.radius]);
    for(const p of plants) {
      for(const q of [a,b]) assert.equal(p.bounds.intersectsBox(new Box3(new Vector3(q.x-1.05,1,q.z-1.05),new Vector3(q.x+1.05,1.8,q.z+1.05))),false,p.id);
      for(const [from,to,radius] of segments) {
        const length = from.distanceTo(to);box.copy(p.bounds).expandByScalar(radius);
        assert.equal(box.containsPoint(from),false,p.id);
        ray.set(from,to.clone().sub(from).normalize());const intersection = ray.intersectBox(box,hit);
        assert.ok(!intersection || intersection.distanceTo(from)>length,`${p.id} intersects a ${detailed?'near':'far'} support`);
      }
    }
  }
});

test('selection respects capacity, stable ordering, distance cutoff and near hysteresis',()=>{
  let previous = new Set();
  for(const local of [[0,20,0],[15,3,38],[-20,10,-40],[40,10,-25],[100,60,150]]) {
    const eye = new Vector3(...coasterWorld(local)), a = selectCoasterVegetation(plants,eye,()=>true,previous);
    assert.ok(a.groups[0].length+a.groups[2].length<=B.nearTrees);
    assert.ok(a.groups[4].length<=B.visibleBushes);
    assert.equal(new Set(a.groups.flat().map(p=>p.id)).size,a.groups.flat().length);
    const b = selectCoasterVegetation(plants,eye.clone().addScalar(.00001),()=>true,a.near);
    assert.deepEqual(b.groups.map(g=>g.map(p=>p.id)),a.groups.map(g=>g.map(p=>p.id)));
    previous = a.near;
  }
  assert.equal(selectCoasterVegetation(plants,new Vector3(10000,10000,10000),()=>true,previous).groups.flat().length,0);
  assert.equal(selectCoasterVegetation(plants,new Vector3(),()=>false,previous).groups.flat().length,0);
});

test('unchanged instance sets never upload; changed sets refresh the occlusion sphere',()=>{
  const mesh = new InstancedMesh(geometry[0],new MeshStandardMaterial(),B.trees), trees = plants.filter(p=>p.kind===0);
  try {
    let signature = updateCoasterVegetationInstances(mesh,trees.slice(0,2),'');
    const version = mesh.instanceMatrix.version, originalSphere = mesh.boundingSphere.clone();
    for(let i=0;i<300;i++) signature = updateCoasterVegetationInstances(mesh,trees.slice(0,2),signature);
    assert.equal(mesh.instanceMatrix.version,version); assert.equal(mesh.userData.matrixUploads,1);
    assert.deepEqual(mesh.boundingSphere,originalSphere);
    signature = updateCoasterVegetationInstances(mesh,trees.slice(-2),signature);
    assert.equal(mesh.instanceMatrix.version,version+1);assert.notDeepEqual(mesh.boundingSphere,originalSphere);
    for(const p of trees.slice(-2)) assert.ok(mesh.boundingSphere.containsPoint(new Vector3().setFromMatrixPosition(p.matrix)));
    updateCoasterVegetationInstances(mesh,[],signature);assert.equal(mesh.visible,false);assert.equal(mesh.count,0);
  } finally {mesh.material.dispose();mesh.dispose();}
});

test('the player capsule completes the garden loop with actual tree trunks and retained scene colliders',async()=>{
  await R.init(); const scene = createCoasterStructure(true), world = new R.World({x:0,y:0,z:0});
  try {
    world.createCollider(R.ColliderDesc.trimesh(scene.relief.vertices,scene.relief.indices));
    world.createCollider(R.ColliderDesc.cuboid(80,.5,120).setTranslation(50,.5,-195));
    for(const c of scene.colliders) world.createCollider(coasterColliderDescriptor(R, c));
    for(const c of colliders) world.createCollider(R.ColliderDesc.trimesh(c.pos,c.idx));
    const first=COASTER_INFIELD_WALK[0],start=coasterWorld([first[0],first[1]+.87,first[2]]);
    const body=world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(...start));
    const capsule=world.createCollider(R.ColliderDesc.capsule(.48,.34),body), controller=world.createCharacterController(.015);
    controller.enableSnapToGround(.35);controller.setMaxSlopeClimbAngle(Math.PI/12);world.step();
    let steps=0,grounded=0;
    for(const target of [...COASTER_INFIELD_WALK.slice(1),first]) {
      const [x,,z]=coasterWorld(target);let reached=false;
      for(let frame=0;frame<400;frame++) {
        const p=body.translation(),dx=x-p.x,dz=z-p.z,d=Math.hypot(dx,dz);if(d<.12){reached=true;break;}
        const scale=Math.min(.08,d)/d;
        controller.computeColliderMovement(capsule,{x:dx*scale,y:-.12,z:dz*scale},undefined,undefined,c=>c.handle!==capsule.handle);
        const m=controller.computedMovement();body.setNextKinematicTranslation({x:p.x+m.x,y:p.y+m.y,z:p.z+m.z});world.step();
        steps++;if(controller.computedGrounded())grounded++;
      }
      assert.ok(reached,`blocked toward ${target}: ${JSON.stringify(body.translation())}`);
    }
    assert.ok(grounded/steps>.95);console.log(JSON.stringify({gardenLoopPhysicsSteps:steps,groundedFrames:grounded,treeTrimeshes:colliders.length}));
  } finally {world.free();scene.steel.dispose();scene.glow.dispose();}
});
