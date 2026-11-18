/** CPU-only floor/rig measurements. No mesh decoding, browser or island generation. */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Bone, Group, Matrix4, Vector3 } from 'three';
import { GuideCampLayer } from '../../WorldGuideCamp.ts';
import { PLAYER_RADIUS, PLAYER_HALF_HEIGHT } from '../../actor-physics.ts';
import { createCaveFloorGeometry } from './cave-art.ts';
import { CAVE_LAMP_HOME, createCaveState, startCaveLamp, tickCaveState } from './cave-state.ts';
import { ALPHA_CAVE_PATH, batch2Segment } from '../alpha-batch2-layout.ts';
import { caveLampApproach, caveLampInteraction, caveLampPickupReach } from './batch2-station-feedback.ts';

const floorGeometry=createCaveFloorGeometry(),p=floorGeometry.attributes.position,ids=floorGeometry.index.array;
after(()=>floorGeometry.dispose());
function floorHeight(x,z){
  for(let i=0;i<ids.length;i+=3){
    const a=ids[i],b=ids[i+1],c=ids[i+2],ax=p.getX(a),az=p.getZ(a),bx=p.getX(b),bz=p.getZ(b),cx=p.getX(c),cz=p.getZ(c);
    const d=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz),u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/d,v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/d;
    if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7)return u*p.getY(a)+v*p.getY(b)+(1-u-v)*p.getY(c);
  }
  return null;
}
function rig(){
  const data=readFileSync(new URL('../../../../../public/assets/world/guide/G24.glb',import.meta.url));
  const gltf=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString()),joints=new Set(gltf.skins.flatMap(s=>s.joints));
  const nodes=gltf.nodes.map((n,i)=>{
    const o=joints.has(i)?new Bone():new Group();o.name=n.name??'';
    if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);if(n.scale)o.scale.fromArray(n.scale);
    if(n.matrix)new Matrix4().fromArray(n.matrix).decompose(o.position,o.quaternion,o.scale);return o;
  });
  gltf.nodes.forEach((n,i)=>n.children?.forEach(c=>nodes[i].add(nodes[c])));
  const scene=new Group();gltf.scenes[gltf.scene??0].nodes.forEach(i=>scene.add(nodes[i]));return scene;
}
const hook=[CAVE_LAMP_HOME[0]+.32,CAVE_LAMP_HOME[1]+1.48,CAVE_LAMP_HOME[2]];
const centreHeight=PLAYER_RADIUS+PLAYER_HALF_HEIGHT;

test('complete unchanged rack base seats on actual cave-floor triangles beside the through-route',()=>{
  let min=Infinity,max=-Infinity,routeClearance=Infinity;
  for(let ix=0;ix<=4;ix++)for(let iz=0;iz<=4;iz++){
    const x=CAVE_LAMP_HOME[0]-.41+.82*ix/4,z=CAVE_LAMP_HOME[2]-.375+.75*iz/4,y=floorHeight(x,z);
    assert.notEqual(y,null,`base has no cave floor at ${x},${z}`);
    min=Math.min(min,y);max=Math.max(max,y);routeClearance=Math.min(routeClearance,batch2Segment(x,z,ALPHA_CAVE_PATH).distance);
  }
  assert.ok(CAVE_LAMP_HOME[1]+.09<=min-.009,'bury the existing lower round-over');
  assert.ok(CAVE_LAMP_HOME[1]+.36>max,'retain the base top above the floor');
  assert.ok(routeClearance>PLAYER_RADIUS+.7,'base must leave the centre through-route clear');
  assert.equal(floorHeight(-16.55,-34.8),null,'old natural approach lay before the butt-ended portal floor');
  console.log(JSON.stringify({rackHome:CAVE_LAMP_HOME,footprintSamples:25,floorMin:min,floorMax:max,routeClearance}));
});

test('every offered take stance is capsule-clear and reaches the unchanged hook with the actual G24 bones',()=>{
  const scene=rig(),layer=new GuideCampLayer(scene),goal=new Vector3(...hook);
  let count=0,maxError=0;const evidence=[];
  for(let ix=0;ix<=8;ix++)for(let iz=0;iz<=10;iz++){
    const dx=.43+ix*.02,dz=-.25+iz*.05,x=hook[0]+dx,z=hook[2]+dz,y=floorHeight(x,z);
    if(y===null)continue;
    const actor=[x,y+centreHeight,z];if(!caveLampPickupReach(actor,hook,true))continue;
    assert.ok(x-(CAVE_LAMP_HOME[0]+.41)>=PLAYER_RADIUS-1e-6,'capsule overlaps the preserved base');
    layer.reset();scene.position.set(x,y,z);scene.rotation.set(0,Math.atan2(z-hook[2],hook[0]-x),0);scene.updateMatrixWorld(true);
    let palm;for(let frame=0;frame<20;frame++)palm=layer.apply(hook,'grip',.05);
    const error=new Vector3(...palm).distanceTo(goal);assert.ok(error<.12,`unreachable offered stance ${actor}: ${error}`);
    maxError=Math.max(maxError,error);count++;
    if(Math.abs(dx-.49)<1e-6&&Math.abs(dz)<1e-6)evidence.push({stand:[x,y,z],palm:[...palm],error});
  }
  assert.ok(count>40);
  const farX=hook[0]+1.35,farY=floorHeight(farX,hook[2]);
  layer.reset();scene.position.set(farX,farY,hook[2]);scene.rotation.set(0,Math.PI,0);scene.updateMatrixWorld(true);
  let farPalm;for(let frame=0;frame<20;frame++)farPalm=layer.apply(hook,'grip',.05);
  const farError=new Vector3(...farPalm).distanceTo(goal);assert.ok(farError>.5,'reproduce why the old 1.35 m offer could not work');
  console.log(JSON.stringify({reachableStances:count,maxPalmError:maxError,operationExample:evidence,oldRadiusPalmError:farError,contactThreshold:.12}));
});

test('the rack offers one pickup action and only its open side qualifies as the final stance',()=>{
  const x=hook[0]+.5,y=floorHeight(x,hook[2]),actor=[x,y+centreHeight,hook[2]];
  const approach=caveLampApproach(hook);
  assert.equal(caveLampInteraction('rack',false),'take');
  assert.ok(approach.ready(actor));
  assert.equal(approach.ready([hook[0]+1.2,actor[1],hook[2]]),false);
  assert.equal(approach.ready([hook[0]-.5,actor[1],hook[2]]),false);
  assert.equal(caveLampInteraction('carried',true),'return');
  assert.equal(caveLampInteraction('carried',false),null);
});

test('small grounded drift across the offer boundary still completes an accepted pickup', () => {
  const stance = dx => [hook[0] + dx, floorHeight(hook[0] + dx, hook[2]) + centreHeight, hook[2]];
  const before = stance(.59), after = stance(.61);
  assert.equal(caveLampPickupReach(before, hook, true), true);
  assert.equal(caveLampPickupReach(after, hook, true), false);
  const state = createCaveState();
  assert.equal(startCaveLamp(state, before), true);
  for (let frame = 0; frame < 8; frame++) tickCaveState(state, .05, after);
  assert.equal(state.lamp, 'carried');
});
