/** Minimal regression probe for the installed Rapier. Run once normally, then with --predicate.
 * The old predicate mode intentionally demonstrates a failed world.free(); process exit reclaims it.
 * No browser, assets, or scene code is involved. */
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {default:R}=await import(require.resolve('@dimforge/rapier3d-compat',{paths:[require.resolve('@react-three/rapier')]}));
await R.init();
const old=process.argv.includes('--predicate'),world=new R.World({x:0,y:-9.81,z:0});
world.createCollider(R.ColliderDesc.cuboid(100,.5,100));
const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0,2,0));
world.createCollider(R.ColliderDesc.cuboid(1,.3,.6).setMass(1000),body);
const car=world.createVehicleController(body);car.indexUpAxis=1;car.setIndexForwardAxis=0;
for(const [x,z] of [[1,1],[1,-1],[-1,1],[-1,-1]])car.addWheel({x,y:0,z},{x:0,y:-1,z:0},{x:0,y:0,z:1},.4,.3);
for(let i=0;i<30;i++){
  car.updateVehicle(1/60,old?undefined:R.QueryFilterFlags.EXCLUDE_SENSORS,undefined,
    c=>(!old||!c.isSensor())&&c.parent()?.handle!==body.handle);world.step();
}
world.removeVehicleController(car);
try{world.free();console.log(JSON.stringify({mode:old?'predicate':'flags',freed:true}));}
catch(e){console.log(JSON.stringify({mode:old?'predicate':'flags',freed:false,error:e.message}));if(!old)process.exitCode=1;}
