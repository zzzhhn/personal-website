import test from 'node:test';
import assert from 'node:assert/strict';
import '../../../../tools/world/alpha-mine-tests/register.mjs';
import { createHash } from 'node:crypto';
import { Group } from 'three';
import { compileWorldComponent } from '../../../../tools/world/alpha-mine-tests/component-host.mjs';
import { readWorldCraftGltf, disposeWorldCraftGltf } from '../world-craft-gltf-test.mjs';
const { createCoasterStructure, CoasterBatch, addCoasterBuildingArt } = await import('./coaster-geometry.ts');
const { packCoasterStructure, unpackCoasterStructure } = await import('./coaster-structure-transfer.ts');
const promotion=await import('./coaster-craft-promotion.ts');
const hash = a => createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
const signature = g => ({
  attributes: Object.fromEntries(Object.keys(g.attributes).sort().map(k => {
    const a = g.attributes[k]; return [k,[a.itemSize,a.normalized,a.array.constructor.name,hash(a.array)]];
  })),
  index: g.index && hash(g.index.array), sphere: g.boundingSphere?.toArray?.() || (g.boundingSphere && [g.boundingSphere.center.toArray(),g.boundingSphere.radius]),
  box: g.boundingBox && [g.boundingBox.min.toArray(),g.boundingBox.max.toArray()],
});
const surface = s => ({...s,vertices:hash(s.vertices),indices:hash(s.indices)});
const packetSignature = value => ({
  steel:signature(value.steel),glow:signature(value.glow),
  rails:Object.fromEntries(Object.entries(value.railCraft ?? {}).map(([k,g])=>[k,signature(g)])),
  railShadow:value.railShadow && signature(value.railShadow),
  colliders:value.colliders.map(c => ({...c,hull:c.hull && hash(c.hull),mesh:c.mesh && surface(c.mesh)})),
  relief:surface(value.relief),track:surface(value.track),art:value.art,
});
const dispose = value => {
  if(value) for(const g of [value.steel,value.glow,...Object.values(value.railCraft ?? {}),value.railShadow]) g?.dispose();
};
function protectedRegion(g, min, max) {
  const position = g.getAttribute('position'), keys = Object.keys(g.attributes).sort(), digest = createHash('sha256');
  let triangles = 0;
  const count = g.index?.count || position.count;
  for (let i = 0; i < count; i += 3) {
    const ids = [0,1,2].map(j => g.index ? g.index.getX(i+j) : i+j);
    const center = [0,1,2].map(k => ids.reduce((sum,id)=>sum+position.array[id*3+k],0)/3);
    if (!center.every((v,k)=>v>=min[k]&&v<=max[k])) continue;
    triangles++;
    for (const id of ids) for (const key of keys) {
      const a = g.attributes[key], offset = a.array.byteOffset+id*a.itemSize*a.array.BYTES_PER_ELEMENT;
      digest.update(Buffer.from(a.array.buffer,offset,a.itemSize*a.array.BYTES_PER_ELEMENT));
    }
  }
  return {triangles,hash:digest.digest('hex')};
}
test('near/far promotion preserves all collider/light/contact bytes and transfers the production derivative exactly',()=>{
  assert.equal(promotion.COASTER_ARCHITECTURE_CRAFT,true);
  for(const near of [false,true]) {
    let old, promoted, restored;
    try {
      old=createCoasterStructure(near,'full',false);
      promoted=createCoasterStructure(near,'full',true);
      assert.deepEqual(promoted.colliders,old.colliders,'original solid order, hulls, rotations and surfaces');
      assert.deepEqual(surface(promoted.track),surface(old.track),'track contact bytes');
      assert.deepEqual(surface(promoted.relief),surface(old.relief),'terrain contact bytes');
      assert.deepEqual(signature(promoted.glow),signature(old.glow),'all old luminous vertices and attributes');
      assert.deepEqual(promoted.art,old.art,'landscape identity');
      const oldVertices=old.steel.getAttribute('position').count, newVertices=promoted.steel.getAttribute('position').count;
      assert.ok(newVertices>0&&newVertices<oldVertices,'only old visuals disappear');
      for(const a of Object.values(promoted.steel.attributes))assert.ok(a.array.every(Number.isFinite));
      // Independent spatial assertions protect the two equipment buildings and
      // the staff access deck from overbroad "station" or "gate" range removal.
      for(const [min,max] of [
        [[7.9,.9,-187.1],[20.1,15,-176.8]],
        [[68,5,-292],[80,15.5,-281.9]],
        [[-3,15,-220],[15,17.8,-179.5]],
      ]) {
        const a=protectedRegion(old.steel,min,max),b=protectedRegion(promoted.steel,min,max);
        assert.ok(a.triangles>0,'protected equipment region is nonempty');assert.deepEqual(b,a);
      }
      const before=packetSignature(promoted);
      const {packet,transfer}=packCoasterStructure(promoted);
      assert.equal(new Set(transfer).size,transfer.length);
      const received=structuredClone(packet,{transfer});
      assert.ok(transfer.every(buffer=>buffer.byteLength===0),'sender relinquishes buffer ownership');
      restored=unpackCoasterStructure(received);
      assert.deepEqual(packetSignature(restored),before,'worker packet retains render/contact attributes');
      assert.equal(restored.steel.attributes.position.array,received.steel.attributes.position.array,'unpack does not clone arrays');
      assert.equal(restored.track.vertices,received.track.vertices);
      console.log(`promotion ${near?'near':'far'}: steel vertices ${oldVertices} -> ${newVertices}, colliders ${old.colliders.length}; contacts/glow/worker exact`);
    } finally {dispose(old);dispose(promoted);dispose(restored);}
  }
});

const cacheModule = await import('./coaster-structure-cache.ts');
const track = await import('./coaster-track.ts');
const transitions = await import('./coaster-transition.ts');
const access = await import('./coaster-access.ts');
const passage = await import('./coaster-passage.ts');
const sceneDependencies = {
  './coaster-craft-promotion':promotion,
  './intent-stations':await import('./intent-stations.ts'),
  './coaster-device-geometry':await import('./coaster-device-geometry.ts'),
  './attraction-camera':await import('./attraction-camera.ts'),
  '../actor-physics':await import('../actor-physics.ts'),
  '../region-passage':await import('../region-passage.ts'),
  '../region-load-failure':await import('../region-load-failure.ts'),
  '../rides/ride-clearance':await import('../rides/ride-clearance.ts'),
};
const loadScene = compileWorldComponent(new URL('./WorldIntentCoaster.tsx', import.meta.url));
const loadDevices = compileWorldComponent(new URL('./WorldIntentDevices.tsx', import.meta.url));

test('independent building art retains the complete station and gate at both detail levels',()=>{
  for(const detailed of [false,true]) {
    const geometry=(...options)=>{
      const batch=new CoasterBatch();
      addCoasterBuildingArt(batch,detailed,...options);
      return batch.finish();
    };
    const standard=geometry(),legacy=geometry(false),substituted=geometry(true);
    try {
      assert.deepEqual(signature(standard),signature(legacy));
      assert.ok(substituted.getAttribute('position').count < standard.getAttribute('position').count);
    } finally { standard.dispose();legacy.dispose();substituted.dispose(); }
  }
});

test('the worker accepts both detail requests and transfers the same structure as the synchronous cache', async () => {
  const cache = new cacheModule.CoasterStructureCache(createCoasterStructure);
  const port = {};
  const self = Object.getOwnPropertyDescriptor(globalThis,'self');
  Object.defineProperty(globalThis,'self',{value:port, configurable:true});
  try {
    await import('./coaster-structure.worker.ts');
    for (const near of [false,true]) {
      let reply;
      port.postMessage = (message,options) => { reply=structuredClone(message,options); };
      port.onmessage({data:near});
      assert.ok(reply?.packet,reply?.error);
      const received=unpackCoasterStructure(reply.packet), expected=createCoasterStructure(near,'full',true);
      try {
        const wanted=packetSignature(expected);
        assert.deepEqual(packetSignature(received),wanted);
        assert.deepEqual(packetSignature(cache.get(near)),wanted);
      } finally { dispose(received); dispose(expected); }
    }
  } finally {
    cache.dispose();
    if(self) Object.defineProperty(globalThis,'self',self); else delete globalThis.self;
  }
});

function sceneFixture(active,riding) {
  const state={riding,view:'chase',progress:{passed:[],clarified:[]},tools:{}};
  const useIntentStore=Object.assign((select=s=>s)=>select(state),{
    getState:()=>state, setState:update=>Object.assign(state,update),
  });
  const frames=[],inputs=[],targets=[],built=[],doc={hidden:false},worldState={paused:false};
  let hooks=null, physicsComponent=null;
  function useRef(current) {
    if (!hooks) return {current};
    const index=hooks.index++;
    return hooks.refs[index] ??= {current};
  }
  const pose=track.coasterRidePose(0,'chase');
  const ride={active:riding,revision:7,transition:transitions.createCoasterTransition(pose.seat,pose.yaw,pose)};
  ride.transition.phase='riding'; ride.transition.captured=true;
  const clock={elapsed:10,riding,revision:7};
  const services={
    ...sceneDependencies,
    react:{memo:f=>f,useRef,useEffect(){},useMemo:f=>f(),
      useState:init=>[typeof init==='function'?init():init,()=>{}],Suspense:'suspense'},
    '@react-three/fiber':{useFrame:cb=>frames.push(cb)},
    '@react-three/rapier':{RigidBody:'rigid-body',CuboidCollider:'box',ConvexHullCollider:'hull',
      TrimeshCollider:'trimesh',useBeforePhysicsStep(step){ hooks.step=step; },useRapier:()=>({world:{timestep:1/60}})},
    '../store':{useWorldStore:{getState:()=>worldState,setState(){}}},
    '../WorldInteract':{useInteractable:input=>inputs.push(input)},
    './intent-state':{useIntentStore,intentRideClock:clock,activateIntentTarget:id=>targets.push(id)},
    './coaster-track':track,'./coaster-transition':transitions,'./coaster-access':access,
    './attraction-ride':{attractionRide:ride,updateAttractionRide(){}},
    './coaster-passage':passage,'./WorldIntentSurface':{WorldIntentReflectiveSurface:'surface'},
    './coaster-motion-audio':{}, './coaster-structure-job':{}, '../WorldParkAudio':{}, '../WorldNight':{night:{value:0}},
    './coaster-geometry':{createCoasterStructure(near){
      built.push(near);
      return {steel:{attributes:{},userData:{}},glow:{attributes:{}},colliders:[],track:{},relief:{}};
    }},
    './coaster-structure-cache':cacheModule,
  };
  for (const name of ['WorldCoasterStationCraft','WorldCoasterGateCraft','WorldCoasterRailCraft','WorldCoasterTrainCraft',
    'WorldCoasterVegetation','WorldIntentWorkshopCraft','WorldIntentWorkshop','WorldCoasterChestTransfer','WorldIntentSigns'])
    services['./'+name]=name;
  services['./WorldIntentDevices']=loadDevices(services,doc).default;
  function render(element) {
    if(!element || typeof element!=='object')return [];
    if(typeof element.type==='function') {
      const instance={refs:[],index:0};
      const update=()=>{
        hooks=instance; instance.index=0;
        try { return element.type(element.props); } finally { hooks=null; }
      };
      const output=update();
      if(instance.step) physicsComponent={update,step:()=>instance.step()};
      return render(output);
    }
    return [element,...[element.props.children].flat(Infinity).flatMap(render)];
  }
  const nodes=render(loadScene(services,doc).default({active}));
  return {nodes,frames,inputs,targets,built,ride,clock,state,worldState,doc,physicsComponent};
}

test('distance and occupancy select the visible station, interactive devices and parked contacts',()=>{
  for(const active of [false,true]) for(const riding of [false,true]) {
    const {nodes,inputs,targets,built}=sceneFixture(active,riding), enabled=active||riding;
    const all=type=>nodes.filter(n=>n.type===type);
    assert.deepEqual(built,[enabled]);
    assert.deepEqual(all('WorldCoasterStationCraft').map(n=>n.props.detailed),[enabled]);
    const gate=all('WorldCoasterGateCraft');
    assert.equal(gate.filter(n=>n.props.part==='static').length,1);
    assert.equal(gate.filter(n=>n.props.part==='leaf').length,enabled?2:0);
    for(const name of ['WorldIntentSigns','WorldIntentWorkshopCraft','WorldCoasterChestTransfer'])
      assert.equal(all(name).length,Number(enabled));
    assert.equal(all('WorldIntentWorkshop').length,0);
    if(enabled)assert.equal(all('WorldCoasterChestTransfer')[0].props.keyVisual.props.children.props.part,'key');
    assert.deepEqual(inputs.map(i=>i.id),enabled?['intent-chest','intent-gate','intent-board']:[]);
    for(const input of inputs)input.onInteract();
    assert.deepEqual(targets,enabled?['chest','gate','board']:[]);
    assert.equal(all('rigid-body').some(n=>n.props.userData?.assetId==='coaster-track-sample'),enabled);
    const train=all('WorldCoasterTrainCraft')[0];
    assert.equal(train.props.contactActive,active&&!riding);
    const trainLease=all('suspense').find(n=>n.props.children===train);
    const parked=trainLease.props.fallback?.props.children??[];
    assert.equal(parked.length,active&&!riding?3:0,'temporary boxes apply only before the parked craft has mounted');
    for(const body of parked)assert.deepEqual(body.props.children.map(c=>[c.props.position,c.props.args]),
      access.COASTER_CAR_PANELS.map(p=>[p.at,p.size.map(x=>x/2)]));
  }
});

test('three cars follow the track, hold at an unready region, resume and dispatch boarding clicks',()=>{
  const {nodes,frames,targets,ride,clock}=sceneFixture(true,true);
  const train=nodes.find(n=>n.props.name==='intent-train');
  assert.equal(train.props.userData.shadowDynamic,true);
  let stopped=false;
  train.props.onClick({stopPropagation(){stopped=true;}});
  assert.equal(stopped,true);assert.deepEqual(targets,['board']);
  const cars=train.props.children.flat().filter(e=>typeof e?.props.ref==='function').map(e=>{
    const car=new Group();
    car.position.copy(e.props.position);car.quaternion.copy(e.props.quaternion);e.props.ref(car);
    return car;
  });
  function check(u) {
    assert.equal(cars.length,3);
    cars.forEach((car,i)=>{
      const expected=track.coasterFrame(u-i*3.55/track.COASTER_LENGTH);
      assert.ok(car.position.distanceTo(expected.point)<1e-5);
      assert.ok(car.quaternion.angleTo(expected.rotation)<1e-6);
    });
  }
  check(0);
  let ready=true;
  ride.passage={at:()=>ready,allows:()=>ready};
  for(const admitted of [true,false,true]) {
    ready=admitted;
    const before=clock.elapsed;
    frames.forEach(frame=>frame(null,1/60));
    if(admitted)assert.ok(clock.elapsed>before);else assert.equal(clock.elapsed,before);
    check(track.coasterDistanceAt(clock.elapsed));
  }
});

test('the mounted gate holds both physical leaves on pause and opens the passage when unlocked',async()=>{
  const {default:R}=await import('@dimforge/rapier3d-compat');
  const {coasterModelContact}=await import('./coaster-model-contact.ts');
  const {scene}=await readWorldCraftGltf(['docs/world/phase-2-playground/coaster-gate-craft-20261105/coaster-gate.glb']);
  await R.init();
  const {nodes,state,worldState,physicsComponent,doc}=sceneFixture(true,false);
  const leaves=nodes.filter(n=>n.props.userData?.assetId==='coaster-gate');
  const world=new R.World({x:0,y:0,z:0});
  try {
    assert.equal(leaves.length,2);
    const bodies=leaves.map(leaf=>{
      assert.equal(leaf.props.type,'kinematicPosition');
      const body=world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(...leaf.props.position));
      const { children, fallback } = leaf.props.children.props;
      assert.equal(fallback.props.name, children.props.surfaceId, 'the temporary gate still locks while the source downloads');
      const { vertices, indices } = coasterModelContact(scene.getObjectByName('GateLeaf').clone(true),
        children.props.surfaceId, children.props.mirrorX);
      world.createCollider(R.ColliderDesc.trimesh(vertices, indices),body);
      leaf.props.ref(body);
      return body;
    });
    world.step();
    const [x,y,z]=track.coasterWorld([-.4,1.35,track.COASTER_GATE_Z]);
    const blocked=()=>!!world.castRay(new R.Ray({x,y,z:z-2},{x:0,y:0,z:1}),4,true);
    assert.ok(blocked());
    state.progress.gateOpen=true;
    physicsComponent.update();
    const tick=()=>{physicsComponent.step();world.step();};
    for(const hold of [[true,false],[false,true]]) {
      [worldState.paused,doc.hidden]=hold;
      for(let i=0;i<20;i++)tick();
      assert.ok(bodies.every(body=>Math.abs(body.rotation().y)<1e-6));
      assert.ok(blocked());
    }
    worldState.paused=false;doc.hidden=false;
    tick();
    assert.ok(bodies[0].rotation().y*bodies[1].rotation().y<0);
    assert.ok(blocked(),'the first opening frame still closes the aisle');
    for(let i=0;i<150;i++)tick();
    assert.equal(blocked(),false);
    bodies.forEach((body,i)=>assert.ok(Math.abs(2*Math.atan2(body.rotation().y,body.rotation().w)-
      access.coasterGateAngle(access.COASTER_GATE_LEAVES[i].side,1))<.001));
  }finally {world.free();disposeWorldCraftGltf(scene);}
});
