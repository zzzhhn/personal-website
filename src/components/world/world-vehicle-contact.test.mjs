import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import R from '@dimforge/rapier3d-compat';
import { BufferAttribute, BufferGeometry, DoubleSide, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Vector3 } from 'three';
import { VEHICLES } from './layout.ts';
import { PLAYER_HALF_HEIGHT, PLAYER_RADIUS, wheelGeometry } from './actor-physics.ts';
import { adaptVehicleSeats, vehicleHulls } from './WorldVehicleAssets.ts';
import { refineCoupeWheel, refineVehicleBody } from './WorldVehicleDetail.ts';
import { isHeldPlayerContact, isPlayerContact, registerPlayerContact } from './world-player-contact.ts';
import { retainedVehicleRoofSource, vanBeaconId, vehicleBodySources, vehicleContactHull, vehicleDoorContactMesh, vehicleHullId, vehicleLeafPose, vehicleRoofContactBlocks, vehicleRoofContactMesh, vehicleTyreContactHull, vehicleTyrePose } from './world-vehicle-contact.ts';
import { glb } from '../../../tools/world/guide/boot-analysis.mjs';

const assets={offroad:'G25',coupe:'G26',van:'G27'};
async function decoderModule() {
  const root=new URL('../../../public/assets/world/draco/',import.meta.url);
  const sandbox={require:createRequire(import.meta.url),__dirname:root.pathname,console,WebAssembly,TextDecoder,TextEncoder,Buffer,process};
  vm.runInNewContext(readFileSync(new URL('draco_wasm_wrapper.js',root),'utf8'),sandbox);
  return sandbox.DracoDecoderModule({wasmBinary:readFileSync(new URL('draco_decoder.wasm',root))});
}

function geometryFromNode(module,data,name) {
  const node=data.json.nodes.find(n=>n.name===name),vertices=[],normals=[],roles=[];
  const decoder=new module.Decoder(),face=new module.DracoInt32Array();
  try {
    for(const primitive of data.json.meshes[node.mesh].primitives){
      const c=primitive.extensions.KHR_draco_mesh_compression,view=data.json.bufferViews[c.bufferView];
      const bytes=data.bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
      const buffer=new module.DecoderBuffer(),mesh=new module.Mesh();
      buffer.Init(new Int8Array(bytes),bytes.length);
      const status=decoder.DecodeBufferToMesh(buffer,mesh);
      assert.ok(status.ok(),`${name} Draco geometry`);
      const attributes={};
      for(const key of ['POSITION','NORMAL']){
        const a=decoder.GetAttributeByUniqueId(mesh,c.attributes[key]),values=new module.DracoFloat32Array();
        decoder.GetAttributeFloatForAllPoints(mesh,a,values);
        attributes[key]=Float32Array.from({length:mesh.num_points()*3},(_,i)=>values.GetValue(i));
        module.destroy(values);
      }
      const role=data.json.materials[primitive.material].extras?.materialRole;
      for(let i=0;i<mesh.num_faces();i++){
        decoder.GetFaceFromMesh(mesh,i,face);
        for(let j=0;j<3;j++){
          const k=face.GetValue(j)*3;
          vertices.push(...attributes.POSITION.subarray(k,k+3));
          normals.push(...attributes.NORMAL.subarray(k,k+3));
          roles.push(({light_front:1,light_brake:2,light_reverse:3,light_beacon:4,glass:5})[role]??0);
        }
      }
      module.destroy(mesh);module.destroy(buffer);
    }
  } finally { module.destroy(decoder);module.destroy(face); }
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new BufferAttribute(Float32Array.from(vertices),3));
  geometry.setAttribute('normal',new BufferAttribute(Float32Array.from(normals),3));
  geometry.setAttribute('color',new BufferAttribute(new Float32Array(vertices.length),3));
  geometry.setAttribute('aRM',new BufferAttribute(new Float32Array(vertices.length/3*2),2));
  geometry.setAttribute('aRole',new BufferAttribute(Float32Array.from(roles),1));
  return {node,geometry};
}

const localRay=(origin,direction)=>new R.Ray(origin,direction);
const rotation=new Quaternion(),position=new Vector3();
const sourceData=await decoderModule();
await R.init();

test('all production vehicle body LODs retain triangle ownership for the authored compound, fittings, and seat adaptations',t=>{
  const rows=[],material=new MeshBasicMaterial({side:DoubleSide}),canonical=new Map();
  for(const [id,asset] of Object.entries(assets))for(const lod of ['', '-lod1']){
    const data=glb(new URL(`../../../public/assets/world/vehicles/${asset}${lod}.glb`,import.meta.url));
    const {geometry}=geometryFromNode(sourceData,data,`${asset}_body`),seated=adaptVehicleSeats(id,geometry);
    const visual=lod?seated:refineVehicleBody(id,seated),entry=vehicleHulls(id),ranges=vehicleBodySources(id,visual,entry);
    let total=0;
    for(const range of ranges){assert.equal(range.firstVertex,total);total+=range.vertexCount;}
    assert.equal(total,visual.attributes.position.count);
    const used=new Set(ranges.map(r=>r.surfaceId).filter(Boolean));
    const rack=vehicleRoofContactBlocks(visual,ranges,vehicleHullId(id,'rack'));
    const expected=[...entry.hulls.filter(h=>h.part!=='rack').map(h=>vehicleHullId(id,h.part)),...rack.map(part=>part.id)];
    if(id==='van')expected.push(vanBeaconId);
    assert.deepEqual([...used].sort(),expected.sort(),`${id}${lod}`);
    if(!lod)canonical.set(id,{geometry:visual.clone(),ranges,used:[...used].sort()});
    else{
      const near=canonical.get(id),retained=retainedVehicleRoofSource(id,near.geometry,near.ranges,ranges);
      for(const part of retained?.ranges??[])used.add(part.surfaceId);
      assert.deepEqual([...used].sort(),near.used,`${id}: far and retained near sources account for the same parts`);
      retained?.geometry.dispose();near.geometry.dispose();
    }
    const world=new R.World({x:0,y:0,z:0});
    const colliders=entry.hulls.map(({part,points})=>({part,collider:world.createCollider(R.ColliderDesc.convexHull(Float32Array.from(points)))}));
    const mesh=new Mesh(visual,material);
    const contacts=[];
    for(const x of [-1.6,-1.2,-.8,-.4,0,.4,.8,1.2,1.6])for(const z of [-.45,0,.45]){
      const origin=new Vector3(x,3,z),down=new Vector3(0,-1,0),ray=localRay(origin,down);
      const rendered=new Raycaster(origin,down,0,4).intersectObject(mesh)[0]?.distance;
      const hits=colliders.map(({part,collider})=>({part,distance:collider.castRay(ray,4,true)})).filter(hit=>hit.distance>=0).sort((a,b)=>a.distance-b.distance);
      if(rendered===undefined||!hits.length)continue;
      contacts.push({x,z,part:hits[0].part,delta:hits[0].distance-rendered});
    }
    assert.ok(contacts.length>=20&&contacts.some(c=>Math.abs(c.delta)<.024),id+' visible roof/panel probes');
    rows.push({id,lod:lod||'near',triangles:total/3,parts:used.size,smallFittingTriangles:ranges.filter(r=>r.collision==='none').reduce((n,r)=>n+r.vertexCount/3,0),
      roofSamples:contacts.length,worstRoofSample:contacts.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta))[0]});
    world.free();
    for(const object of new Set([geometry,seated,visual]))object.dispose();
  }
  material.dispose();
  t.diagnostic(JSON.stringify(rows));
});

test('convex roof assemblies keep the installed ladder and lip openings and use the actual beacon',t=>{
  const material=new MeshBasicMaterial({side:DoubleSide}),results=[];
  for(const id of ['offroad','van']){
    const asset=assets[id],entry=vehicleHulls(id),world=new R.World({x:0,y:0,z:0});
    const shell=entry.hulls.filter(({part})=>part!=='rack').map(({points})=>world.createCollider(R.ColliderDesc.convexHull(Float32Array.from(points))));
    const oldRack=world.createCollider(R.ColliderDesc.convexHull(Float32Array.from(entry.hulls.find(({part})=>part==='rack').points)));
    const data=glb(new URL(`../../../public/assets/world/vehicles/${asset}.glb`,import.meta.url));
    const {geometry}=geometryFromNode(sourceData,data,`${asset}_body`),mesh=new Mesh(geometry,material),ranges=vehicleBodySources(id,geometry,entry);
    const rack=vehicleRoofContactBlocks(geometry,ranges,vehicleHullId(id,'rack')).map(({points})=>world.createCollider(R.ColliderDesc.convexHull(points)));
    const shapes=[...rack];
    if(id==='van')for(const {points} of vehicleRoofContactBlocks(geometry,ranges,vanBeaconId))shapes.push(world.createCollider(R.ColliderDesc.convexHull(points)));
    assert.ok(rack.length>=8);
    const points=id==='offroad'?[['air',-.8,-.45],['rail',-.8,-.80]]:[['air',-1.6,-.45],['rail',-1.2,-.86],['beacon',1.2,0]];
    for(const [name,x,z] of points){
      const origin=new Vector3(x,3,z),down=new Vector3(0,-1,0),ray=localRay(origin,down);
      const rendered=new Raycaster(origin,down,0,4).intersectObject(mesh)[0]?.distance;
      assert.ok(rendered>0);
      const nearest=colliders=>Math.min(...colliders.map(c=>c.castRay(ray,4,true)).filter(d=>d>=0));
      const previous=nearest([...shell,oldRack]),after=nearest([...shell,...shapes]);
      if(name==='air'){
        assert.ok(previous+.12<rendered,`${id}: old rack filled an opening`);
        assert.ok(rack.every(shape=>shape.castRay(ray,4,true)===-1),`${id}: no rack contact through its opening`);
      }
      if(name==='rail')assert.ok(rack.some(shape=>shape.castRay(ray,4,true)>0),`${id}: real tube is still solid`);
      if(name==='beacon')assert.ok(previous>rendered+.12,`${id}: old cab missed the beacon`);
      assert.ok(Math.abs(after-rendered)<.035,`${id} ${name}: visual-to-physics roof fit ${after-rendered}`);
      results.push({id,name,point:[x,z],previousDifference:previous-rendered,afterDifference:after-rendered});
    }
    geometry.dispose();world.free();
  }
  material.dispose();t.diagnostic(JSON.stringify(results));
});

test('actual panels and tyres block a walking probe that the previous static chassis missed',t=>{
  const material=new MeshBasicMaterial({side:DoubleSide}),results=[];
  for(const [id,asset] of Object.entries(assets)){
    const world=new R.World({x:0,y:0,z:0}),body=world.createRigidBody(R.RigidBodyDesc.dynamic()),entry=vehicleHulls(id);
    const old=entry.hulls.map(({points})=>world.createCollider(R.ColliderDesc.convexHull(Float32Array.from(points)).setTranslation(0,entry.bodyY,0),body));
    const data=glb(new URL(`../../../public/assets/world/vehicles/${asset}.glb`,import.meta.url));
    const {geometry:wheel}=geometryFromNode(sourceData,data,'wheel-front-left');
    const tyre=id==='coupe'?refineCoupeWheel(wheel):wheel;
    const tyreHull=vehicleTyreContactHull(tyre),controller=wheelGeometry(VEHICLES.find(v=>v.id===id).size);
    const wheelHit=world.createCollider(R.ColliderDesc.convexHull(tyreHull).setMass(0),body);
    const point=controller.points[1];
    vehicleTyrePose(point,.32,.2,.35,position,rotation);
    wheelHit.setTranslationWrtParent(position);wheelHit.setRotationWrtParent(rotation);
    world.propagateModifiedBodyPositionsToColliders();
    const transform=new Matrix4().compose(position,rotation,new Vector3(1,1,1));
    const axle=new Vector3(0,0,1).applyQuaternion(rotation),origin=new Vector3(0,0,-2).applyMatrix4(transform);
    const raycaster=new Raycaster(origin,axle,0,2),wheelMesh=new Mesh(tyre,material);wheelMesh.matrixWorld.copy(transform);
    const visible=raycaster.intersectObject(wheelMesh)[0],hit=wheelHit.castRay(localRay(origin,axle),2,true);
    assert.ok(visible&&hit>0&&hit<2,`${id}: tyre side visible and solid`);
    assert.ok(Math.abs(visible.distance-hit)<.045,`${id} tyre fit ${visible.distance-hit}`);
    const walking=new R.Capsule(.04,.09),capRotation=new Quaternion();
    const tyreSamples=[-.55,-.25,0,.25,.55].flatMap(x=>[-.8,-.55,-.3,0].map(y=>new Vector3(x*controller.radius,y*controller.radius,-.16).applyMatrix4(transform)));
    const tyreGap=tyreSamples.find(p=>wheelHit.intersectsShape(walking,p,capRotation)&&!old.some(c=>c.intersectsShape(walking,p,capRotation)));
    assert.ok(tyreGap,`${id} old compound misses at least one occupied point along the visible tyre side`);
    const doors=[];
    for(const side of [-1,1]){
      const {node,geometry}=geometryFromNode(sourceData,data,side<0?'door-left':'door-right');
      const hinge=new Vector3().fromArray(node.translation);hinge.y+=entry.bodyY;
      const leaf=world.createCollider(R.ColliderDesc.convexHull(vehicleContactHull(geometry)).setTranslation(...hinge.toArray()).setMass(0),body);
      const mesh=new Mesh(geometry,material);
      for(const openness of [0,.5,1]){
        vehicleLeafPose(id,side,{side,openness},rotation);leaf.setRotationWrtParent(rotation);
        world.propagateModifiedBodyPositionsToColliders();
        mesh.matrixWorld.compose(hinge,rotation,new Vector3(1,1,1));
        const probe=new Vector3(-.19,-.25,side*2).applyMatrix4(mesh.matrixWorld);
        const direction=new Vector3(0,0,-side).applyQuaternion(rotation);
        const visible=new Raycaster(probe,direction,0,2.3).intersectObject(mesh)[0];
        const distance=leaf.castRay(localRay(probe,direction),2.3,true);
        assert.ok(visible&&distance>0,`${id} ${side} door leaf at ${openness}`);
        assert.ok(Math.abs(distance-visible.distance)<.035,`${id} ${side} ${openness}: animated leaf fit ${distance-visible.distance}`);
        let previousLeafGap;
        if(openness===1){
          const samples=[-.19,-.4,-.6,-.8].flatMap(x=>[-.25,0,.2,.38].map(y=>new Vector3(x,y,side*.045).applyMatrix4(mesh.matrixWorld)));
          previousLeafGap=samples.find(p=>leaf.intersectsShape(walking,p,capRotation)&&!old.some(c=>c.intersectsShape(walking,p,capRotation)));
          assert.ok(previousLeafGap,`${id} ${side}: legacy hull misses the actual open leaf`);
        }
        doors.push({side,openness,difference:Math.abs(distance-visible.distance),previousLeafGap:previousLeafGap?.toArray()});
      }
      geometry.dispose();
    }
    results.push({id,tyreDistance:Math.abs(visible.distance-hit),tyreHullVertices:tyreHull.length/3,previousTyreGap:tyreGap.toArray(),doors});
    tyre.dispose();if(tyre!==wheel)wheel.dispose();world.free();
  }
  material.dispose();t.diagnostic(JSON.stringify(results));
});

test('G24 contact keeps the tuned capsule and only accepts suspension from its actual owner',()=>{
  const world=new R.World({x:0,y:0,z:0}),body=world.createRigidBody(R.RigidBodyDesc.dynamic());
  const collider=world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),body);
  const another=world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS));
  let owned=false;
  registerPlayerContact(collider,()=>owned);
  assert.equal(isPlayerContact(collider),true);
  assert.equal(isPlayerContact(another),false);
  body.setEnabled(false);
  assert.equal(collider.isEnabled(),true,'Rapier propagates the parent flag on the next step');
  assert.equal(isHeldPlayerContact(collider,body),false,'unexpected disable remains invalid');
  owned=true;
  assert.equal(isHeldPlayerContact(collider,body),true);
  world.step();
  assert.equal(collider.isEnabled(),false);
  assert.equal(isHeldPlayerContact(collider,body),true,'the check survives the engine copying the parent flag');
  assert.equal(isHeldPlayerContact(another,body),false);
  collider.setSensor(true);
  assert.equal(isHeldPlayerContact(collider,body),false);
  collider.setSensor(false);body.setEnabled(true);
  assert.equal(isHeldPlayerContact(collider,body),false);
  assert.ok(Math.abs(collider.radius()-PLAYER_RADIUS)<1e-6);
  assert.ok(Math.abs(collider.halfHeight()-PLAYER_HALF_HEIGHT)<1e-6);
  world.free();
});

test('the added tyre contact stops G24 without adding a suspension or body mass',()=>{
  function fixture(supplement) {
    const world=new R.World({x:0,y:-9.81,z:0});
    world.createCollider(R.ColliderDesc.cuboid(8,.2,8).setTranslation(0,-.2,0));
    const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0,.6,0));
    const base=world.createCollider(R.ColliderDesc.cuboid(.8,.25,.6).setMass(1500),body);
    let wheel,playerShape;
    if(supplement)wheel=world.createCollider(R.ColliderDesc.cylinder(.41,.4).setTranslation(0,0,1.2).setMass(0)
      .setActiveHooks(R.ActiveHooks.FILTER_CONTACT_PAIRS),body);
    const hooks={filterContactPair(a,b){
      if(a!==wheel?.handle&&b!==wheel?.handle)return null;
      const target=a===wheel.handle?b:a;
      return target===playerShape?.handle&&isPlayerContact(playerShape)?R.SolverFlags.COMPUTE_IMPULSE:R.SolverFlags.EMPTY;
    },filterIntersectionPair(){return true;}};
    const events=new R.EventQueue(true),step=()=>world.step(events,hooks);
    for(let i=0;i<180;i++)step();
    const car={y:body.translation().y,mass:body.mass(),com:{...body.localCom()},inertia:{...body.principalInertia()}};
    const player=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0,PLAYER_HALF_HEIGHT+PLAYER_RADIUS,3).lockRotations());
    playerShape=world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS).setMass(72),player);
    registerPlayerContact(playerShape,()=>false);
    const contacts=new Set();
    for(let i=0;i<90;i++){
      player.setLinvel({x:0,y:player.linvel().y,z:-1.7},true);step();
      world.contactPairsWith(playerShape,c=>contacts.add(c.handle));
    }
    const z=player.translation().z, hitWheel=contacts.has(wheel?.handle), hitBody=contacts.has(base.handle);
    events.free();world.free();return {car,z,hitWheel,hitBody};
  }
  const before=fixture(false),after=fixture(true);
  assert.deepEqual(after.car,before.car,'supplemental contacts leave body support, mass, COM and inertia unchanged');
  assert.equal(before.hitBody,true);
  assert.equal(after.hitWheel,true);
  assert.equal(after.hitBody,false);
  assert.ok(after.z-before.z>.35,'the walking capsule now stops at the visible sidewall');
});
