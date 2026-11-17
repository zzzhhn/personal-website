import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Bone, Group, Matrix4 } from 'three';
import R from '@dimforge/rapier3d-compat';
import { PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from './actor-physics.ts';
import { mineLocalToWorld } from './alpha-mine-layout.ts';
import { minePickupApproach } from './mine-pickup-approach.ts';
import { findPickupStand } from './pickup-approach.ts';
import { GuideMineLayer } from './WorldGuideMine.ts';
await R.init();
const H=PLAYER_HALF_HEIGHT+PLAYER_RADIUS;
const directory=new URL('../../../public/world/alpha-mine/',import.meta.url);
const layout=JSON.parse(readFileSync(new URL('layout.json',directory),'utf8'));
const proxies=JSON.parse(readFileSync(new URL('colliders.json',directory),'utf8'));
function addMinePatch(world,center) {
  for(const source of [proxies.surface,proxies.solid]) {
    const vertices=[],indices=[];
    for(let i=0;i<source.indices.length;i+=3) {
      const points=source.indices.slice(i,i+3).map(k=>source.vertices.slice(k*3,k*3+3));
      if(Math.max(...points.map(p=>p[0]))<center[0]-3||Math.min(...points.map(p=>p[0]))>center[0]+3
        ||Math.max(...points.map(p=>p[2]))<center[2]-3||Math.min(...points.map(p=>p[2]))>center[2]+3)continue;
      for(const point of points){indices.push(vertices.length/3);vertices.push(...mineLocalToWorld(point));}
    }
    if(indices.length)world.createCollider(R.ColliderDesc.trimesh(new Float32Array(vertices),new Uint32Array(indices)));
  }
}
function actor(world,position) {
  const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...position).lockRotations());
  world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),body);world.step();
  return body;
}
function glbNodes(url,bones=false) {
  const file=readFileSync(url),g=JSON.parse(file.subarray(20,20+file.readUInt32LE(12)).toString());
  const joints=new Set(bones?g.skins.flatMap(s=>s.joints):[]);
  const nodes=g.nodes.map((n,i)=>{const o=joints.has(i)?new Bone():new Group();o.name=n.name??'';
    if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);if(n.scale)o.scale.fromArray(n.scale);
    if(n.matrix)new Matrix4().fromArray(n.matrix).decompose(o.position,o.quaternion,o.scale);return o;});
  g.nodes.forEach((n,i)=>n.children?.forEach(c=>nodes[i].add(nodes[c])));
  const scene=new Group();g.scenes[g.scene??0].nodes.forEach(i=>scene.add(nodes[i]));scene.updateWorldMatrix(true,true);return scene;
}
function handError(stand,target,kind='ore') {
  const scene=glbNodes(new URL('../../../public/assets/world/guide/G24.glb',import.meta.url),true);
  scene.position.set(stand[0],stand[1]-H,stand[2]);scene.rotation.y=Math.atan2(stand[2]-target[2],target[0]-stand[0]);scene.updateWorldMatrix(true,true);
  const layer=new GuideMineLayer(scene);
  layer.installAssets({detector:glbNodes(new URL('detector.glb',directory)).getObjectByName('detector'),
    pickaxe:glbNodes(new URL('pickaxe.glb',directory)).getObjectByName('pickaxe'),
    ore:glbNodes(new URL('ore.glb',directory)).getObjectByName('ore'),
    colors:{REVERSAL_5:'#b7864d',ROC20_RANK:'#5c9b91',LOW_STD_20:'#9ba8b1'}});
  try {return layer.apply({equipped:true,carried:null,action:{kind:kind==='ore'?'pickup':'equip',elapsed:.48,
    duration:kind==='ore'?.85:.8,target,origin:target,factorId:'REVERSAL_5',contact:false}}).rightReachError;}
  finally {layer.dispose();}
}

test('each real mine ore tray has a clear short approach with the existing G24 visual reach',()=>{
  for(const vein of layout.veins) {
    const world=new R.World({x:0,y:0,z:0});
    try {
      addMinePatch(world,vein.oreRest);
      const target=mineLocalToWorld(vein.oreRest),from=mineLocalToWorld([vein.oreRest[0],vein.level+H+.001,vein.oreRest[2]+1.6]);
      const body=actor(world,from),pickup=minePickupApproach(()=>target),stand=findPickupStand(world,R,body,from,pickup);
      assert.equal(pickup.ready(from),false);assert.ok(stand,`${vein.id}: no capsule-clear pickup stance`);
      assert.equal(pickup.ready(stand),true);assert.ok(handError(stand,target)<=.16,`${vein.id}: the accepted stance must still support the existing hand animation`);
      assert.equal(pickup.ready([stand[0],stand[1]+3,stand[2]]),false,'never accept the storey above');
    } finally {world.free();}
  }
});

test('recovery shelves, dropped ore and live rack grips retain physical reach after outer discovery',()=>{
  for(const kind of ['ore','tools']) {
    const world=new R.World({x:0,y:0,z:0});
    try {
      world.createCollider(R.ColliderDesc.cuboid(4,.1,4).setTranslation(0,-.1,0));
      if(kind==='ore')world.createCollider(R.ColliderDesc.cuboid(.35,.3,.275).setTranslation(0,.3,0));
      else world.createCollider(R.ColliderDesc.cuboid(1,.8,.15).setTranslation(0,.8,-.3));
      let target=[0,kind==='ore'?.77:1.05,0];
      const from=[0,H+.001,1.6],body=actor(world,from),pickup=minePickupApproach(()=>target,kind);
      const stand=findPickupStand(world,R,body,from,pickup);
      assert.equal(pickup.ready(from),false);assert.ok(stand);assert.equal(pickup.ready(stand),true);
      assert.ok(handError(stand,target,kind)<=.16,`${kind}: approach must fit the existing actual hand action`);
      target=[2,target[1],0];assert.deepEqual(pickup.target(),target);assert.equal(pickup.ready(stand),false,'a moved or replaced target cannot use the old stance');
    } finally {world.free();}
  }
});
