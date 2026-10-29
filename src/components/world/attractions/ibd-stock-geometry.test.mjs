import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Euler,Quaternion,Matrix4,Vector3 } from 'three';
import { buildIbdStatic,buildIbdLid } from './ibd-yard-geometry.ts';
import { IBD_CARGO_HOME,IBD_STOCK_KEYS,IBD_STOCK_HOME,ibdPackHome,ibdStockRoute } from './ibd-yard-layout.ts';
import { ibdPackInspectAnchors } from './ibd-pack-layout.ts';
import { createIbdYardGame } from './ibd-yard-game.ts';
import { ibdCargoPose,ibdMotionStops } from './ibd-yard-motion.ts';
await R.init();
const identity={x:0,y:0,z:0,w:1};
function fixture(moving){
  const world=new R.World({x:0,y:-9.81,z:0}),data=buildIbdStatic();
  for(const s of data.solids)world.createCollider(R.ColliderDesc.cuboid(...s.size.map(n=>n/2))
    .setTranslation(...s.at).setRotation(new Quaternion().setFromEuler(new Euler(...(s.rotation??[0,0,0])))));
  for(const [id,p]of Object.entries({...IBD_CARGO_HOME,...IBD_STOCK_HOME,quarantine:[14,1.1,-16.3]})){
    if(id===moving||id==='parts-b'||id.startsWith('coil'))continue;
    world.createCollider(R.ColliderDesc.cuboid(1.4,.55,1.3).setTranslation(p[0],p[1]+.45,p[2]));
  }
  world.step();
  return {world,dispose(){world.free();data.geometry.dispose();}};
}
const hits=(w,shape,p)=>{const result=[];w.intersectionsWithShape({x:p[0],y:p[1],z:p[2]},identity,shape,c=>{result.push(c.translation());return true;});return result;};
test('both reserve cartons travel behind quarantine with their full visible envelope',()=>{
  for(const key of IBD_STOCK_KEYS){
    const f=fixture(key);try{
      const g=createIbdYardGame(1);g.stock={originalReturned:true,requested:true,assigned:null};
      g.pending={token:1,seconds:5,action:{kind:'select-stock',station:key,slot:'parts-b'}};
      const shape=new R.Cuboid(1.5,.55,1.35);
      for(let i=0;i<=800;i++){
        const p=ibdCargoPose(g,'parts-b',i/800).at;
        assert.deepEqual(hits(f.world,shape,[p[0],p[1]+.45,p[2]]),[],`${key} transport ${i}`);
      }
      assert.deepEqual(ibdCargoPose(g,'parts-b',0).at,IBD_STOCK_HOME[key]);
      assert.deepEqual(ibdCargoPose(g,'parts-b',1).at,IBD_CARGO_HOME['parts-b']);
      assert.ok(ibdMotionStops(g).includes(.16),'close lid before the first transport leg');
      g.stock.assigned=key;g.stock.requested=false;g.pending.action={kind:'return-stock',slot:'parts-b',station:'parts-b'};
      assert.deepEqual(ibdCargoPose(g,'parts-b',0).at,IBD_CARGO_HOME['parts-b']);
      assert.deepEqual(ibdCargoPose(g,'parts-b',1).at,IBD_STOCK_HOME[key]);
      assert.deepEqual(ibdStockRoute(key).at(-1),IBD_CARGO_HOME['parts-b']);
    }finally{f.dispose();}
  }
});
test('reserve lids, sampling stands and the aisle between both workstations clear actual furniture',()=>{
  const f=fixture(null),lid=buildIbdLid();try{
    lid.computeBoundingBox();
    const capsule=new R.Capsule(.48,.34);
    for(const key of IBD_STOCK_KEYS){
      const home=ibdPackHome(key),stand=ibdPackInspectAnchors('M8',.46).stand.map((v,i)=>v+home[i]);
      assert.deepEqual(hits(f.world,capsule,[stand[0],stand[1]+.88,stand[2]]),[]);
      const box=lid.boundingBox.clone().applyMatrix4(new Matrix4().makeRotationX(-2)
        .setPosition(new Vector3(home[0],home[1]+1.08,home[2]-1.25)));
      assert.ok(box.min.z>-21.3,'fully opened lid must stay in front of the rack');
    }
    for(let x=5;x<=26;x+=.05)assert.deepEqual(hits(f.world,capsule,[x,.98,-14.3]),[],`cross aisle ${x}`);
    for(const x of [5,26])for(let z=-14.3;z>=-16.32;z-=.04)
      assert.deepEqual(hits(f.world,capsule,[x,.98,z]),[],`approach ${x},${z}`);
  }finally{lid.dispose();f.dispose();}
});
