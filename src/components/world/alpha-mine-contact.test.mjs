import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DoubleSide, Euler, Group, Object3D, Quaternion, Raycaster, Scene, Vector3 } from 'three';
import { PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from './actor-physics.ts';
import { mineLocalToWorld, ALPHA_MINE_ORIGIN } from './alpha-mine-layout.ts';
import { installMineContacts, mineRackToolPose, mineVeinStateContact, mineVeinContactRoot, MINE_RACK_ROOT, MINE_POOL_ROOT, MINE_WEST_RAMP_ROOT, MINE_ROUTE_ROOTS } from './alpha-mine-contact.ts';
import { collisionInventory } from './world-collision-inventory.ts';
import { minePickupApproach } from './mine-pickup-approach.ts';
import { findPickupStand } from './pickup-approach.ts';
import { canBeginMineAction, mineActor, useAlphaMineStore } from './alpha-mine-state.ts';
import { minePoolBayAnchor, minePoolBayFixtures, minePoolBayOffset, minePoolShelfAnchor, minePoolShelfBox, minePoolFixtureHalf } from './mine-pool-contact.ts';
import { waterSurfaceAt } from './WorldWaterSurfaces.ts';
import { disposeWorldCraftGltf, readWorldCraftGltf } from './world-craft-gltf-test.mjs';
import { readMineStaticVisual, readMineContactVisual } from '../../../tools/world/alpha-mine-tests/static-visual.mjs';
import { RAPIER as R, quarryWalkCases, quarryWorld, walkQuarry } from '../../../tools/world/alpha-mine-tests/quarry-walk.mjs';

const ship = name=>JSON.parse(readFileSync(new URL('../../../public/world/alpha-mine/'+name,import.meta.url),'utf8'));
const old=ship('colliders.json'), layout=ship('layout.json');
const asset=await readMineStaticVisual();
const result=installMineContacts(asset.root.clone(true)), veinAsset=await readMineContactVisual('veins.glb');
test.after(()=>{result.dispose();asset.dispose();veinAsset.dispose();});
const part = id => result.colliders.find(part=>part.id==='alpha-mine-'+id);
const cast = (collider,p,d,distance) => collider.castRay(new R.Ray(new Vector3(...p),new Vector3(...d)),distance,false);

function mount(world, kind, buffers, translation=[0,0,0]) {
  const body=world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...translation));
  body.userData={kind};
  const vertices=Float32Array.from(buffers.vertices), indices=Uint32Array.from(buffers.indices);
  return world.createCollider(R.ColliderDesc.trimesh(vertices,indices).setFriction(.9).setRestitution(0),body);
}
function liveVein(vein,state) {
  const contract=layout.dynamicAssets.veins.roots[vein.id];
  return mineVeinStateContact(veinAsset.root.getObjectByName(vein.id),contract.states[state],vein.id);
}
function candidateWorld(translation=[0,0,0], state='intact') {
  const world=new R.World({x:0,y:-12.5,z:0});world.timestep=1/60;
  for(const [kind,buffers] of Object.entries(result.base)) mount(world,kind,buffers,translation);
  for(const {kind,buffers} of result.colliders) mount(world,kind,buffers,translation);
  for (const vein of layout.veins) mount(world,'solid',liveVein(vein,state).buffers,vein.socket.map((n,i)=>n+translation[i]));
  world.step();
  return world;
}

test('the shipped scopes own each physical shape once',()=>{
  const restored=installMineContacts(asset.root.clone(true));
  const scene=new Scene(), frame=[];
  try {
    const roots=[MINE_RACK_ROOT,...Object.values(MINE_ROUTE_ROOTS),...layout.veins.map(v=>mineVeinContactRoot(v.id))];
    for(const [name,source] of restored.sections) {
      const scope=new Group(); scope.name=name; scene.add(scope);
      scope.add(source);
      source.traverse(node=>{if(node.isMesh)frame.push(node);});
    }
    const activeVeins=layout.veins.map(vein=>{
      const root=mineVeinContactRoot(vein.id), fitted=liveVein(vein,'intact');
      scene.getObjectByName(root).add(fitted.visual);
      return {root,id:fitted.id};
    });
    const counts=Object.fromEntries(roots.map(id=>[id,2]));
    assert.equal(restored.colliders.filter(part=>part.root!==MINE_POOL_ROOT).length+activeVeins.length,roots.length*2);
    const handles=[...restored.colliders,...activeVeins].filter(part=>part.root!==MINE_POOL_ROOT).map(part=>{
      const collider=new Object3D(); collider.name=part.id; scene.getObjectByName(part.root).add(collider);
      return collider;
    });
    const report=collisionInventory(scene,frame,handles,roots);
    assert.deepEqual(report.errors,[]);
    assert.deepEqual(report.registrations,counts);
    assert.ok(collisionInventory(scene,frame,handles.slice(1),roots).errors.length>0);
    assert.ok(restored.base.surface.indices.length>10000&&restored.base.solid.indices.length>20000);
    assert.deepEqual([...restored.sections.get(MINE_RACK_ROOT).children,...restored.sections.get(MINE_WEST_RAMP_ROOT).children].map(m=>[m.name,m.geometry.index.count/3]).sort(),
      [['alpha-mine-rack-frame-visible',528],['alpha-mine-rack-hooks-visible',88],['alpha-mine-west-deck-visible',2024],
       ['alpha-mine-west-fasteners-visible',672],['alpha-mine-west-structure-visible',1496]]);
  } finally {restored.dispose();}
});

test('both visible rack hooks block their real front faces and the working tools can still be approached',async t=>{
  const baseline=quarryWorld(), upgraded=candidateWorld();
  const detector=await readWorldCraftGltf(['public/world/alpha-mine/detector.glb']);
  const pickaxe=await readWorldCraftGltf(['public/world/alpha-mine/pickaxe.glb']);
  const world=candidateWorld(ALPHA_MINE_ORIGIN);
  try {
    const hit=(physics,x)=>physics.castRay(new R.Ray({x,y:1.5,z:-2.95},{x:0,y:0,z:-1}),.38,false);
    const results=[-9.35,-8.2].map(x=>[hit(baseline,x)?.timeOfImpact??null,hit(upgraded,x)?.timeOfImpact??null]);
    assert.ok(results.every(([oldDistance,newDistance])=>oldDistance===null && newDistance>.26 && newDistance<.31),JSON.stringify(results));
    const targetPose=mineRackToolPose(asset.root,detector.scene.getObjectByName('detector'),'detector');
    const axePose=mineRackToolPose(asset.root,pickaxe.scene.getObjectByName('pickaxe'),'pickaxe');
    const socket=asset.root.getObjectByName('rack_detector').getWorldPosition(new Vector3()).toArray();
    assert.ok(socket.every((v,i)=>Math.abs(v-layout.toolRack.detectorSocket[i])<.00001));
    assert.deepEqual(axePose.matrix.elements.slice(12,15),asset.root.getObjectByName('rack_pickaxe').getWorldPosition(new Vector3()).toArray());
    const target=mineLocalToWorld(targetPose.target), from=mineLocalToWorld([-9.05,PLAYER_HALF_HEIGHT+PLAYER_RADIUS+.002,-1.88]);
    const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...from).lockRotations());
    world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),body); world.step();
    const pickup=minePickupApproach(()=>target,'tools'), stand=findPickupStand(world,R,body,from,pickup);
    assert.ok(stand && pickup.ready(stand),JSON.stringify({target,from,stand}));
    t.diagnostic(JSON.stringify({hookRaysOldNew:results,placedDetectorTarget:target,validGripStand:stand}));
  } finally {baseline.free();upgraded.free();world.free();disposeWorldCraftGltf(detector.scene);disposeWorldCraftGltf(pickaxe.scene);}
});

test('placed west ramp triangles track the actual plank tops, reveals and rails',async t=>{
  const source=asset.root.clone(true), fitted=installMineContacts(source), world=new R.World({x:0,y:0,z:0});
  const ray = new Raycaster(), deck=mount(world,'surface',part('west-deck').buffers), rail=mount(world,'solid',part('west-structure').buffers);
  const former = mount(world,'surface',old.surface);
  let plankHits=0, reveals=0, structureHits=0, maxError=0;
  try {
    const west=fitted.sections.get(MINE_WEST_RAMP_ROOT);west.updateMatrixWorld(true);
    const timber = west.children.filter(m=>m.userData.worldCollision==='solid');
    for(const mesh of timber) mesh.material.side=DoubleSide;
    const run=(mesh,shape,origin,dir,distance)=>{
      ray.set(new Vector3(...origin),new Vector3(...dir));ray.far=distance;
      const visual=ray.intersectObject(mesh)[0],actual=cast(shape,origin,dir,distance);
      assert.equal(actual>=0,Boolean(visual),JSON.stringify({mesh:mesh.name,origin,actual}));
      if (visual) maxError=Math.max(maxError,Math.abs(actual-visual.distance));
      return Boolean(visual);
    };
    const [deckMesh,structure] = timber;
    for(let z=-9.017;z>-21;z-=.047)for(const x of [-12.65,-11.814,-10.95]){
      const y=-(z+9)/4, point=[x,y+.14,z],vertical=[0,-1,0];
      if(run(deckMesh,deck,point,vertical,.158)) plankHits++;
      else if (cast(former,point,vertical,.158)>=0) reveals++;
    }
    for(let z=-9.015;z>-21;z-=.12)for(const y of [.40,.47,.51,.89,.99,1.03,1.09]) {
      if(run(structure,rail,[-11.8,-(z+9)/4+y,z],[1,0,0],1.7)) structureHits++;
    }
    assert.ok(plankHits>680 && reveals>12 && structureHits>150 && maxError<.00005,JSON.stringify({plankHits,reveals,structureHits,maxError}));
    t.diagnostic(JSON.stringify({plankHits,reveals,structureHits,maxError}));
  } finally {fitted.dispose();world.free();}
});

for(const name of ['core-west-ramp','crate-east-approach','west-support-to-entrance','west-support-to-entrance-reverse','ravine-to-forecourt']){
  test('real collision still supports continuous controlled walking through '+name,t=>{
    const route=quarryWalkCases()[name], result=walkQuarry(route,{createWorld:candidateWorld});
    t.diagnostic(JSON.stringify(result));
    assert.ok(result.passed,JSON.stringify(result));
  });
}

test('all seven planked routes retain their real reveals and both hand rails',t=>{
  const routes=[...layout.ramps,layout.bridge,...layout.gallery.ramps,...layout.gallery.bridges];
  const baseline=quarryWorld(),world=new R.World({x:0,y:0,z:0}), report={};
  try {
    for (const route of routes) {
      const id=route.id==='ramp-west-0-3'?'west':route.id;
      const deck=mount(world,'surface',part(id+'-deck').buffers), rails=mount(world,'solid',part(id+'-structure').buffers);
      const a=new Vector3(...route.a),b=new Vector3(...route.b),delta=b.clone().sub(a);
      const lateral=new Vector3(-delta.z,0,delta.x).normalize(), samples=Math.ceil(delta.length()/.27);
      let oldFilled=0,newOpen=0,newSupport=0,railContacts=0;
      for (let i=1;i<samples;i++) {
        const seam=a.clone().addScaledVector(delta,i/samples), board=a.clone().addScaledVector(delta,(i+.5)/samples);
        seam.y+=.12;board.y+=.12;
        const down=new Vector3(0,-1,0);
        if (baseline.castRay(new R.Ray(seam,down),.143,false)) oldFilled++;
        if (cast(deck,seam.toArray(),down.toArray(),.143)<0) newOpen++;
        if (cast(deck,board.toArray(),down.toArray(),.143)>=0) newSupport++;
      }
      for (const t of [.18,.30,.46,.60,.72,.82]) {
        const p=a.clone().addScaledVector(delta,t); p.y+=1.02;
        for (const side of [-1,1]) if(cast(rails,p.toArray(),lateral.toArray().map(v=>v*side),route.deckWidth)>=0) railContacts++;
      }
      assert.ok(oldFilled>=samples-2&&newOpen===samples-1&&newSupport===samples-1&&railContacts>=8,
        JSON.stringify({id,samples,oldFilled,newOpen,newSupport,railContacts}));
      report[id]={oldFilled,newOpen,newSupport,railContacts};
    }
    t.diagnostic(JSON.stringify(report));
  } finally {world.free();baseline.free();}
});

test('the three mining faces match their selected mesh and reveal true recesses through the three states',t=>{
  const rays={},oldWorld=quarryWorld(),world=new R.World({x:0,y:0,z:0}), raycaster=new Raycaster();
  const direction=[0,0,-1];
  try {
    for(const vein of layout.veins) {
      const start=new Vector3(...vein.socket).add(new Vector3(0,0,2));
      const before=oldWorld.castRay(new R.Ray(start,new Vector3(...direction)),4,false)?.timeOfImpact;
      rays[vein.id]=[];
      for(const [stage,expected] of [['intact',1.745],['cracked',1.84],['open',1.95]]) {
        const {visual,buffers}=liveVein(vein,stage);
        visual.position.fromArray(vein.socket);
        visual.traverse(n=>{if(n.isMesh)n.material.side=DoubleSide;});
        visual.updateMatrixWorld(true);
        const shape=mount(world,'solid',buffers,vein.socket);
        raycaster.set(start,new Vector3(...direction));raycaster.far=4;
        const meshHit=raycaster.intersectObject(visual)[0];
        const distance=cast(shape,start.toArray(),direction,4);
        assert.ok(meshHit && Math.abs(meshHit.distance-distance)<.000003);
        assert.ok(Math.abs(distance-expected)<.0003 && before-distance>.16);
        const inactive=Object.values(layout.dynamicAssets.veins.roots[vein.id].states).filter(name=>!name.endsWith('_'+stage));
        assert.ok(inactive.every(name=>!visual.getObjectByName(name)));
        rays[vein.id].push({stage,oldBackWall:before,newFace:distance});
      }
    }
    t.diagnostic(JSON.stringify(rays));
  }finally{world.free();oldWorld.free();}
});

test('each opened seam keeps a physical tray and clear hand pickup on its own level',t=>{
  const world=candidateWorld(ALPHA_MINE_ORIGIN,'open');
  try {
    for(const [name,vein] of ['lower','middle','upper'].map((id,i)=>[id,layout.veins[i]])) {
      const tray=part(name+'-tray');
      assert.ok(tray.buffers.indices.length>=200);
      const from=mineLocalToWorld([vein.oreRest[0],vein.level+PLAYER_HALF_HEIGHT+PLAYER_RADIUS+.002,vein.oreRest[2]+1.5]);
      const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...from).lockRotations());
      world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),body);world.step();
      const target=mineLocalToWorld(vein.oreRest), pickup=minePickupApproach(()=>target);
      const stand=findPickupStand(world,R,body,from,pickup);
      assert.ok(stand && pickup.ready(stand),JSON.stringify({name,from,target,stand}));
      for(const otherFloor of [-3,3]) assert.equal(pickup.ready([stand[0],stand[1]+otherFloor,stand[2]]),false);
      t.diagnostic(JSON.stringify({name,stand,pickupTarget:target}));
      world.removeRigidBody(body);
    }
  } finally {world.free();}
});

// The east cliff starts at x=17. Turning there lets the moving capsule
// drift onto the descending rock, even with the unmodified shipping colliders.
const galleryInsideTurn=layout.gallery.route.map(([x,y,z])=>[x===17?16:x,y,z]);
for(const [name,tour] of [['main circuit',layout.route.points],['west gallery to ravine',galleryInsideTurn]]) {
  test('continuous walk on '+name,t=>{
    for(const points of [tour,[...tour].reverse()]) {
      const result=walkQuarry(points,{createWorld:candidateWorld});
      t.diagnostic(JSON.stringify(result));
      assert.ok(result.passed,JSON.stringify(result));
    }
  });
}

const poolLegacy = JSON.parse(readFileSync(new URL('./alpha-mine-contact.generated.json',import.meta.url),'utf8')).old;
const poolCenter = layout.basin.center;
const recoveryFixture = index=>minePoolShelfBox(minePoolShelfAnchor(poolCenter,index),index);
const bayFixtures = bay=>minePoolBayFixtures(bay).map(p=>({...p,center:p.center.map((x,i)=>x+minePoolBayAnchor(poolCenter,bay)[i])}));
function mountPoolFixture(world,fixture,origin=[0,0,0]) {
  const position=fixture.center.map((x,i)=>x+origin[i]);
  const rotation=new Quaternion().setFromEuler(new Euler(...(fixture.rotation??[0,0,0])));
  const body=world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...position).setRotation(rotation));
  return world.createCollider(R.ColliderDesc.cuboid(...minePoolFixtureHalf(fixture)),body);
}

test('the stone rim follows the real chamfer and masonry joints around the whole pool',t=>{
  const scene=result.sections.get(MINE_POOL_ROOT), display=scene.getObjectByName('alpha-mine-pool-rim-visible');
  scene.updateMatrixWorld(true);display.material.side=DoubleSide;
  const world=new R.World({x:0,y:0,z:0}), baseline=new R.World({x:0,y:0,z:0}), raycaster=new Raycaster();
  const rim=mount(world,'solid',part('pool-rim').buffers);
  const oldRim=poolLegacy['pool-rim'].map(([kind,start,count])=>mount(baseline,kind,
    {vertices:old[kind].vertices,indices:old[kind].indices.slice(start,start+count)}));
  let matches=0,clear=0,oldGhosts=0,maxOldGap=0,maxCurrentGap=0;
  try {
    for(let arm=0;arm<260;arm++)for(let y of [.015,.025,.04,.09,.23,.32,.55,.58,.60,.61,.62,.63,.64]) {
      const a=2*Math.PI*(arm+.37)/260,dx=Math.cos(a),dz=Math.sin(a);
      const from=[poolCenter[0]+3.65*dx,y,poolCenter[2]+3.65*dz],d=[-dx,0,-dz];
      raycaster.set(new Vector3(...from),new Vector3(...d));raycaster.far=.92;
      const visible=raycaster.intersectObject(display)[0];
      const now=cast(rim,from,d,.92),before=Math.min(...oldRim.map(c=>cast(c,from,d,.92)).filter(v=>v>=0));
      assert.equal(now>=0,Boolean(visible));
      if (visible) {
        matches++; maxCurrentGap=Math.max(maxCurrentGap,Math.abs(visible.distance-now));
        if(Number.isFinite(before)) maxOldGap=Math.max(maxOldGap,Math.abs(visible.distance-before));
      } else {
        clear++;
        if(Number.isFinite(before)) oldGhosts++;
      }
    }
    t.diagnostic(JSON.stringify({matches,clear,oldGhosts,maxOldGap,maxCurrentGap}));
    assert.ok(matches>=2400&&clear>=800&&oldGhosts>=250&&maxCurrentGap<.000005);
  }finally{world.free();baseline.free();}
});

test('both pool boards really block at shoulder height while throwing and recovering remain reachable',t=>{
  const world=candidateWorld(ALPHA_MINE_ORIGIN), prior=quarryWorld();
  const oldState=useAlphaMineStore.getState(), oldActor={...mineActor};
  const bays=[...bayFixtures(0),...bayFixtures(1)], shelves=[0,1,2].map(recoveryFixture);
  const installed=new Map([...bays,...shelves].map(fixture=>[fixture.id,mountPoolFixture(world,fixture,ALPHA_MINE_ORIGIN)]));
  world.step();
  const report={bays:[],shelves:[]};
  try {
    useAlphaMineStore.setState({equipped:true,carried:'REVERSAL_5',action:null});
    for(const bay of [0,1]) {
      const anchor=minePoolBayAnchor(poolCenter,bay),from=[anchor[0],anchor[1],anchor[2]+.55];
      const dir=[0,0,-1], distance=cast(installed.get('alpha-mine-pool-plaque-'+bay),mineLocalToWorld(from),dir,.8);
      assert.equal(prior.castRay(new R.Ray({x:from[0],y:from[1],z:from[2]},{x:0,y:0,z:-1}),.8,false)?.timeOfImpact??null,null);
      assert.ok(Math.abs(distance-(.55-.035/Math.cos(.25)))<.00001,distance);
      const stand=mineLocalToWorld([anchor[0],PLAYER_HALF_HEIGHT+PLAYER_RADIUS+.003,anchor[2]+.55]);
      const clear=world.intersectionWithShape(new Vector3(...stand),{x:0,y:0,z:0,w:1},new R.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS));
      assert.equal(clear?.handle??null,null,'standing in front of the actual plaque stays clear');
      Object.assign(mineActor,{available:true,grounded:true,moving:false,position:stand});
      const [x,,z]=layout.basin.impact;
      assert.ok(canBeginMineAction('deposit',mineLocalToWorld([x+minePoolBayOffset(bay)*.45,layout.basin.waterY,z]),'REVERSAL_5'));
      report.bays.push({bay,distance,stand});
    }
    for(const index of [0,1,2]) {
      const anchor=minePoolShelfAnchor(poolCenter,index),target=mineLocalToWorld(anchor);
      const from=mineLocalToWorld([anchor[0],PLAYER_HALF_HEIGHT+PLAYER_RADIUS+.003,anchor[2]+1.45]);
      const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...from).lockRotations());
      world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),body); world.step();
      const pickup=minePickupApproach(()=>target), stand=findPickupStand(world,R,body,from,pickup);
      assert.ok(stand&&pickup.ready(stand),JSON.stringify({index,from,target,stand}));
      report.shelves.push({index,stand});
      world.removeRigidBody(body);
    }
    t.diagnostic(JSON.stringify(report));
  }finally {
    Object.assign(mineActor,oldActor);useAlphaMineStore.setState(oldState);
    world.free();prior.free();
  }
});

test('fitted rim blocks level walking and the basin floor still supports a wading player',t=>{
  const world=candidateWorld(),cap=new R.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),q={x:0,y:0,z:0,w:1};
  const from={x:poolCenter[0]+3.92,y:.86,z:poolCenter[2]};
  try {
    const delta={x:-4,y:0,z:0};
    const baseline=world.castShape(from,q,delta,cap,.004,1,false);
    assert.ok(baseline?.time_of_impact<.15);
    const above=world.castShape({...from,y:1.63},q,delta,cap,.004,1,false);
    assert.equal(above?.time_of_impact??null,null,'body clears over the visible rim while jumping');
    const support=world.castRay(new R.Ray({x:poolCenter[0]+.23,y:.43,z:poolCenter[2]+.37},{x:0,y:-1,z:0}),.6,false);
    assert.ok(support && Math.abs(.43-support.timeOfImpact-.08)<.00015,support?.timeOfImpact);
    const [x,,z]=mineLocalToWorld(poolCenter);
    assert.equal(waterSurfaceAt(x,z,layout.basin),ALPHA_MINE_ORIGIN[1]+layout.basin.waterY);
    t.diagnostic(JSON.stringify({walkingRimHit:baseline.time_of_impact,bottom:.43-support.timeOfImpact,waterDepth:layout.basin.waterY-.08}));
  }finally {world.free();}
});

test('all six installed residual batches disclose exact supports, solids and authored nonblocking ranges',()=>{
  const source=asset.root.clone(true), cooked=installMineContacts(source), scene=new Scene(), root=new Group();
  root.name='alpha-mine-attraction';scene.add(root);root.add(source);
  const ids=['alpha-mine-surface','alpha-mine-solid'];
  const handles=ids.map(id=>{const shape=new Object3D();shape.name=id;root.add(shape);return shape;});
  const visible=[], authorVisualOnly={};
  try {
    source.traverse(node=>{
      if(!node.isMesh)return;
      visible.push(node);
      const spans=node.userData.worldCollisionSources;
      assert.equal(spans.reduce((n,s)=>n+s.indexCount,0),node.geometry.index.count);
      for(const part of spans)if(part.collision==='none')authorVisualOnly[part.id]=part.indexCount/3;
    });
    assert.equal(visible.length,6);
    assert.equal(authorVisualOnly.AM01_inlaid_seams,7004);
    assert.deepEqual(Object.keys(authorVisualOnly).sort(),['AM01_inlaid_seams','AM03_hoist_cable','AM05_freight_rails',
      'AM05_iron_nails','AM05_lamp_glass','AM05_rail_sleepers']);
    const physicalCount=visible.reduce((n,m)=>n+m.userData.worldCollisionSources.filter(p=>p.collision==='solid').reduce((sum,p)=>sum+p.indexCount,0),0);
    assert.equal(physicalCount,cooked.base.surface.indices.length+cooked.base.solid.indices.length);
    const originalCount=76856;
    assert.equal(visible.reduce((n,m)=>n+m.geometry.index.count/3,0)
      +[...cooked.sections.values()].flatMap(group=>group.children).reduce((n,m)=>n+m.geometry.index.count/3,0),originalCount);
    const inventory=collisionInventory(scene,visible,handles,[root.name]);
    assert.deepEqual(inventory.errors,[]);
    assert.equal(inventory.registrations[root.name],2);
    assert.ok(collisionInventory(scene,visible,handles.slice(1),[root.name]).errors.length>0);
  }finally{cooked.dispose();}
});

test('the occupied quarry levels, cart wheel and entrance fence match the visible profiles',t=>{
  const w=new R.World({x:0,y:0,z:0}), before=quarryWorld(), directed=new Raycaster(), rr=result.base;
  for(const [kind,buffers] of Object.entries(rr)) mount(w,kind,buffers);
  w.step();
  const source=asset.root.clone(true), fitted=installMineContacts(source);
  source.updateMatrixWorld(true);
  source.traverse(m=>{if(m.isMesh)m.material.side=DoubleSide;});
  const nextSolid=()=>directed.intersectObject(source).find(hit=>hit.object.userData.worldCollisionSources.some(part=>
    part.collision==='solid' && hit.faceIndex*3>=part.firstIndex && hit.faceIndex*3<part.firstIndex+part.indexCount));
  const wheelAt=[14.11,6.31,-40.13], wheelDir=[-1,0,0], wheelRay=new R.Ray(new Vector3(...wheelAt),new Vector3(...wheelDir));
  const moved=[];
  try {
    const oldHit=before.castRay(wheelRay,1.3,false), newHit=w.castRay(wheelRay,1.3,false);
    directed.set(new Vector3(...wheelAt),new Vector3(...wheelDir));directed.far=1.3;
    const wheelDraw=nextSolid();
    assert.ok(wheelDraw && newHit && Math.abs(wheelDraw.distance-newHit.timeOfImpact)<.00002);
    assert.ok(!oldHit || oldHit.timeOfImpact-newHit.timeOfImpact>.045,oldHit?.timeOfImpact);
    for(const sample of [
      {name:'lower forecourt',x:-1.347,y:1,z:-5.81,d:-1,expected:0},
      {name:'middle stone',x:-9.193,y:4,z:-22.44,d:-1,expected:3},
      {name:'tunnel floor',x:-13.251,y:7,z:-43.17,d:-1,expected:6},
      {name:'tunnel roof',x:-13.251,y:7,z:-43.17,d:1,expected:10.074},
    ]) {
      const from=new Vector3(sample.x,sample.y,sample.z),dir=new Vector3(0,sample.d,0);
      directed.set(from,dir); directed.far=5;
      const seen=nextSolid();
      const hit=w.castRay(new R.Ray(from,dir),5,false);
      assert.ok(seen && hit);
      assert.ok(Math.abs(seen.distance-hit.timeOfImpact)<.00002,JSON.stringify({sample,seen:seen.distance,hit:hit.timeOfImpact}));
      const height=sample.y+sample.d*hit.timeOfImpact;
      assert.ok(Math.abs(height-sample.expected)<.45,JSON.stringify({sample,height}));
      moved.push({role:sample.name,height});
    }
    const entrance=[];
    for(const [x,y,blocked] of [[5.45,.99,true],[5.45,.73,false],[0,.99,false]]) {
      const from=new Vector3(x,y,.49),dir=new Vector3(0,0,-1);
      directed.set(from,dir);directed.far=.9;
      const visible=nextSolid(), ray=new R.Ray(from,dir);
      const active=w.castRay(ray,.9,false),previous=before.castRay(ray,.9,false);
      assert.equal(Boolean(active),blocked);
      assert.equal(Boolean(visible),blocked);
      if(active)assert.ok(Math.abs(visible.distance-active.timeOfImpact)<.00002);
      entrance.push({x,y,old:previous?.timeOfImpact??null,new:active?.timeOfImpact??null});
    }
    t.diagnostic(JSON.stringify({wheelOld:oldHit?.timeOfImpact??null,wheelNew:newHit.timeOfImpact,moved,entrance,triangles:{
      support:rr.surface.indices.length/3,solid:rr.solid.indices.length/3}}));
  }finally{w.free();before.free();fitted.dispose();}
});
