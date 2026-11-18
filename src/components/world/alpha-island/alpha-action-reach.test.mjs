/** CPU-only metadata/transform checks. No GLB mesh decoding or full island terrain. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Bone,Group,Matrix4,Vector3 } from 'three';
import { GuideCampLayer } from '../WorldGuideCamp.ts';
import { PLAYER_RADIUS,PLAYER_HALF_HEIGHT } from '../actor-physics.ts';
import { alphaWorld,ALPHA_WIND_GATE_Y } from './alpha-layout.ts';
import { alphaHeight } from './alpha-terrain.ts';
import { alphaActionTarget,alphaActionCanReach,alphaActionLabel,alphaActionNotice,alphaStonePlacementTarget,
  alphaMeasuredHandError,alphaLanternCarryTarget,alphaLanternReleaseInteraction } from './alpha-action-reach.ts';

import { actorActivities, interactionActor } from '../actor-activities.ts';
import { registerCampActivity } from '../camp-actor-activity.ts';
import { campPropActor, startCampPropInteraction } from '../camp-prop-interactions.ts';
import { alphaStationInteraction } from './alpha-station-interaction.ts';
import { advanceAlphaHand, alphaMotion, cancelAlphaHand, useAlphaStore } from './alpha-state.ts';

const centreHeight=PLAYER_RADIUS+PLAYER_HALF_HEIGHT;
let guideSource;
function rig(){
  if(!guideSource){const data=readFileSync(new URL('../../../../public/assets/world/guide/G24.glb',import.meta.url));guideSource=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString());}
  const gltf=guideSource,joints=new Set(gltf.skins.flatMap(s=>s.joints));
  const nodes=gltf.nodes.map((n,i)=>{const o=joints.has(i)?new Bone():new Group();o.name=n.name??'';
    if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);if(n.scale)o.scale.fromArray(n.scale);
    if(n.matrix)new Matrix4().fromArray(n.matrix).decompose(o.position,o.quaternion,o.scale);return o;});
  gltf.nodes.forEach((n,i)=>n.children?.forEach(c=>nodes[i].add(nodes[c])));const scene=new Group();
  gltf.scenes[gltf.scene??0].nodes.forEach(i=>scene.add(nodes[i]));return scene;
}
function palmAt(stand,target){
  const scene=rig();scene.position.fromArray(stand);scene.rotation.y=Math.atan2(stand[2]-target[2],target[0]-stand[0]);scene.updateMatrixWorld(true);
  const layer=new GuideCampLayer(scene);let palm;
  for(let i=0;i<15;i++)palm=layer.apply(target,'grip',.05);
  return new Vector3(...palm).distanceTo(new Vector3(...target));
}
function flatPhysicalCell(x,z,y){
  // alphaTerrainData's unchanged 1.5m lattice. Four equal source heights prove
  // both actual physical triangles are flat, without allocating the island mesh.
  const nx=Math.ceil(196/1.5),nz=Math.ceil(228/1.5),dx=196/nx,dz=228/nz;
  const i=Math.floor((x+98)/dx),j=Math.floor((z+114)/dz);
  for(const [di,dj]of [[0,0],[1,0],[0,1],[1,1]])assert.ok(Math.abs(alphaHeight(-98+(i+di)*dx,-114+(j+dj)*dz)-y)<1e-7,`non-flat support at ${x},${z}`);
}
function physicalSupport(x,z){
  // Same Float32 vertices, diagonal and barycentric interpolation as
  // alphaTerrainData/alphaGroundHeight, but evaluate only this one source cell.
  const nx=Math.ceil(196/1.5),nz=Math.ceil(228/1.5),i=Math.floor((x+98)/196*nx),j=Math.floor((z+114)/228*nz);
  const point=(i,j)=>{const x=-98+i*196/nx,z=-114+j*228/nz;return [x,alphaHeight(x,z),z].map(Math.fround);};
  const a=point(i,j),b=point(i+1,j),c=point(i,j+1),d=point(i+1,j+1),u=(x-a[0])/(b[0]-a[0]),v=(z-a[2])/(c[2]-a[2]);
  const tri=u+v<=1?[a,c,b]:[b,c,d],ab=new Vector3(...tri[1]).sub(new Vector3(...tri[0])),ac=new Vector3(...tri[2]).sub(new Vector3(...tri[0]));
  const normal=ab.cross(ac).normalize();
  return {height:u+v<=1?a[1]*(1-u-v)+b[1]*u+c[1]*v:b[1]*(1-v)+c[1]*(1-u)+d[1]*(u+v-1),normalY:normal.y};
}
const actor=(stand)=>alphaWorld([stand[0],stand[1]+centreHeight,stand[2]]);

test('the summit rack respects a busy camp prop and survives unloading the camp during pickup', t => {
  const position = actor([-8.65,83,41.17]);
  const unregister = registerCampActivity();
  t.after(() => { unregister(); cancelAlphaHand(); actorActivities.sync({available:false,grounded:false}); });
  let starts=0, releases=0;
  const rack=alphaStationInteraction('lantern',0,()=>{starts++;});
  actorActivities.sync({position,yaw:0,grounded:true,available:true});
  startCampPropInteraction({id:'fixture',anchor:position,release:()=>{releases++;}});
  actorActivities.sync({grounded:true});
  assert.equal(rack.enabled(),false);
  rack.onInteract();
  assert.equal(releases,0);
  assert.equal(starts,0);
  unregister();
  actorActivities.sync({grounded:true});
  assert.equal(campPropActor.available,false);
  assert.equal(rack.enabled(),true);
  assert.ok(rack.approach.ready(position));
  rack.onInteract();
  const unload = registerCampActivity();
  actorActivities.sync({position,yaw:0,grounded:true,available:true});
  unload();
  assert.equal(campPropActor.available,false);
  for(let i=0;i<8;i++)advanceAlphaHand(.06,position,interactionActor.available);
  assert.equal(useAlphaStore.getState().carried,true);
  assert.equal(starts,1);
  const hook=[...rack.position];
  alphaMotion.handTarget[0]+=1;
  assert.deepEqual(rack.position,hook);
  cancelAlphaHand();
  actorActivities.sync({available:false});
  rack.onInteract();
  assert.equal(starts,1);
});

test('paper-lantern entrance is capsule-clear, physically supported and reachable by real G24 palm',()=>{
  const stand=[-8.65,83,41.17],target=alphaActionTarget('lantern');flatPhysicalCell(stand[0],stand[2],83);
  // Existing rack slab front at z=41.575; its leg bases end at z=41.65.
  assert.ok(41.575-stand[2]>PLAYER_RADIUS,'capsule overlaps the preserved rack slab');
  assert.ok(41.65-stand[2]>PLAYER_RADIUS,'capsule overlaps the preserved leg bases');
  assert.equal(alphaActionCanReach('lantern',actor(stand),true),true);
  const error=palmAt(stand,target);assert.ok(error<.06,`paper-lantern contact ${error}`);
  const far=[stand[0],83,target[2]-1.3];
  assert.equal(alphaActionCanReach('lantern',actor(far),true),false);
  assert.ok(palmAt(far,target)>.5,'reproduce old discovery-radius failure');
  console.log(JSON.stringify({lanternStand:stand,palmError:error,contactThreshold:.06}));
});

test('each wind grip has a natural supported stance; labels and feedback describe the actual next effect',()=>{
  const evidence=[];
  for(let wind=0;wind<3;wind++){
    const target=alphaActionTarget('wind',wind),support=physicalSupport(target[0]+.5,target[2]),stand=[target[0]+.5,support.height,target[2]];
    assert.equal(target[1],ALPHA_WIND_GATE_Y+1.05,'contact and visible crank share the gate datum');
    assert.ok(support.normalY>.64,'wind operator requires walkable physical triangles');
    assert.equal(alphaActionCanReach('wind',actor(stand),true,wind),true);
    const error=palmAt(stand,target);assert.ok(error<.06,`wind ${wind}: ${error}`);
    assert.equal(alphaActionCanReach('wind',actor([stand[0]+1,stand[1],stand[2]]),true,wind),false);
    const accepted=[];let maxError=0,minBaseClearance=Infinity;
    for(let ix=0;ix<=6;ix++)for(let iz=0;iz<=6;iz++){
      const dx=.38+ix*.03,dz=-.15+iz*.05,x=target[0]+dx,z=target[2]+dz,surface=physicalSupport(x,z),sample=[x,surface.height,z];
      if(!alphaActionCanReach('wind',actor(sample),true,wind))continue;
      assert.ok(surface.normalY>.64,'offered stance has no walkable ground');
      for(const footX of [15,17]){
        const clearance=Math.hypot(Math.max(0,Math.abs(x-footX)-.3),Math.max(0,Math.abs(z+44)-.325))-PLAYER_RADIUS;
        assert.ok(clearance>.02,'operator clips an extended stone footing');minBaseClearance=Math.min(minBaseClearance,clearance);
      }
      const contactError=palmAt(sample,target);assert.ok(contactError<.06,`wind ${wind} grid ${dx},${dz}: ${contactError}`);
      maxError=Math.max(maxError,contactError);accepted.push({dx,dz});
    }
    assert.ok(accepted.length>=30,'retain a usable area, not one exact stance');
    const dxRange=[Math.min(...accepted.map(p=>p.dx)),Math.max(...accepted.map(p=>p.dx))],dzRange=[Math.min(...accepted.map(p=>p.dz)),Math.max(...accepted.map(p=>p.dz))];
    assert.ok(dxRange[1]-dxRange[0]>=.14&&dzRange[1]-dzRange[0]>=.29,'natural approach area was narrowed too far');
    const oldLabel=alphaActionLabel('wind',wind),newLabel=alphaActionLabel('wind',(wind+1)%3);
    assert.notEqual(oldLabel,newLabel);assert.notEqual(oldLabel.zh,newLabel.zh);
    evidence.push({wind,stand,palmError:error,accepted:accepted.length,maxGridPalmError:maxError,minBaseClearance,dxRange,dzRange,nextNotice:alphaActionNotice('wind',(wind+1)%3)});
  }
  assert.match(alphaActionNotice('wind',2).zh,/路牌/);
  assert.match(alphaActionNotice('wind',1).zh,/旗面/);
  assert.match(alphaActionNotice('wind',0).zh,/平静/);
  console.log(JSON.stringify({wind:evidence}));
});

test('first cairn addition retains its original arc and has a supported planted stance',()=>{
  const stand=[1.45,83,39.675];flatPhysicalCell(stand[0],stand[2],83);
  // Within the existing summit's 3m decorative-cairn exclusion and far from the rack.
  assert.ok(Math.hypot(stand[0]-2,stand[2]-39)<3);
  assert.ok(Math.hypot(stand[0]+8,stand[2]-42)>4);
  let maxError=0;
  for(let i=0;i<=16;i++){
    const f=i/16,target=alphaStonePlacementTarget(0,f);
    assert.deepEqual(target,[1,83.35+(.12+.08-.35)*f+Math.sin(Math.PI*f)*.55,40+(-.8+.15)*f]);
    maxError=Math.max(maxError,palmAt(stand,target));
  }
  assert.ok(maxError<.06,`first stone arc unreachable: ${maxError}`);
  console.log(JSON.stringify({firstStoneStand:stand,maxPalmError:maxError,contactThreshold:.06}));
});

test('carry release uses the live player anchor and preserves ownership and single use without a palm gate',()=>{
  let position=[226.35,83.82,231.17],carried=true,owner='alpha-island',count=0;
  const canRelease=()=>carried&&owner==='alpha-island';
  const item=alphaLanternReleaseInteraction(()=>position,canRelease,()=>{count++;carried=false;});
  const first=item.position;
  position=[250,84,250];
  assert.deepEqual(item.position,position);assert.notEqual(item.position,first);
  assert.deepEqual(first,[226.35,83.82,231.17],'previous anchor is a snapshot');
  for(const invalid of [()=>{owner='alpha-echo-cave';},()=>{owner='alpha-island';carried=false;}]){
    invalid();assert.equal(item.enabled(),false);item.onInteract();assert.equal(count,0);
  }
  carried=true;assert.equal(item.enabled(),true);item.onInteract();assert.equal(count,1);
  item.onInteract();assert.equal(count,1,'one carried lantern releases once');
});

test('unchanged carried-lantern palm target remains reachable while the release anchor moves',()=>{
  const position=[0,centreHeight,0],target=alphaLanternCarryTarget(position,0),scene=rig(),layer=new GuideCampLayer(scene);
  scene.updateMatrixWorld(true);let palm;
  for(let i=0;i<15;i++)palm=layer.apply(target,'grip',.05);
  const error=alphaMeasuredHandError(palm,target,'alpha-island');
  assert.ok(error<.06,`carrying grip cannot settle: ${error}`);
  assert.equal(alphaMeasuredHandError(palm,target,'alpha-echo-cave'),Infinity);
});
