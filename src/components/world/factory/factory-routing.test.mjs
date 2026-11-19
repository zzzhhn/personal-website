import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Mesh, MeshBasicMaterial, DoubleSide, Raycaster, Vector3, Box3 } from 'three';
import { buildFactoryGeometry } from './factory-geometry.ts';
import { FACTORY_MODULES } from './factory-game.ts';
import { factoryRoutingPath, factoryBatchPosition, factoryIntakePath, sampleFactoryRoute } from './factory-routing.ts';
import { FACTORY_RAW_HALF_HEIGHT, FACTORY_CONVEYOR_TOP, FACTORY_LINE_Z, factoryRawDrop, createFactoryOperation, stepFactoryOperation, FACTORY_RAW_IDLE } from './factory-operation.ts';

await R.init();

test('intake and every outgoing/return route join the actual waiting pocket and press without diagonal shortcuts',()=>{
  for(const module of FACTORY_MODULES){
    const intake=factoryIntakePath(module);
    assert.deepEqual(intake[0],factoryRawDrop(module));assert.deepEqual(intake.at(-1),factoryBatchPosition(module));
    for(const line of FACTORY_MODULES){
      const path=factoryRoutingPath(module,line),out=[0,0,0];
      assert.deepEqual(sampleFactoryRoute(path,0,out),factoryBatchPosition(module));
      assert.deepEqual(sampleFactoryRoute(path,1,out),[-27,FACTORY_CONVEYOR_TOP+FACTORY_RAW_HALF_HEIGHT[module],FACTORY_LINE_Z[line]]);
      for(let i=1;i<path.length;i++)assert.ok(path[i][0]===path[i-1][0]||path[i][2]===path[i-1][2]);
      let previous=[...path.at(-1)];
      for(let i=0;i<=500;i++){
        sampleFactoryRoute(path,1-i/500,out);
        assert.ok(Math.hypot(...out.map((v,k)=>v-previous[k]))<.12);previous=[...out];
      }
      assert.deepEqual(out,factoryBatchPosition(module),'wrong-line returns end at their own batch pocket');
    }
  }
});

test('actual static decks support intake and staging-to-line transfer, with no collider through the travelling blank',()=>{
  const g=buildFactoryGeometry(),mat=new MeshBasicMaterial({side:DoubleSide}),mesh=new Mesh(g.geometry,mat);
  const halves={frame:[.31,.1,.36],wheels:[.26,.15,.26],shell:[.29,.06,.35]};
  const world=new R.World({x:0,y:0,z:0}),fixed=world.createRigidBody(R.RigidBodyDesc.fixed()), pose={x:0,y:0,z:0,w:1};
  for(const c of [...g.rails,...g.structureContacts])world.createCollider(R.ColliderDesc.trimesh(c.vertices,c.indices),fixed);
  world.step();
  try{
    for(const module of FACTORY_MODULES){
      const h=halves[module],paths=[factoryIntakePath(module),...FACTORY_MODULES.map(line=>factoryRoutingPath(module,line))];
      for(const path of paths)for(let i=0;i<=160;i++){
        const p=sampleFactoryRoute(path,i/160,[0,0,0]),bottom=p[1]-h[1];
        // 12 mm clearance includes the authored 15 mm deck bevel at the shallow incline joint.
        const hull=new Box3(new Vector3(p[0]-h[0]+.005,bottom+.012,p[2]-h[2]+.005),new Vector3(p[0]+h[0]-.005,p[1]+h[1]-.005,p[2]+h[2]-.005));
        const half=hull.getSize(new Vector3()).multiplyScalar(.5);
        assert.equal(world.intersectionWithShape(hull.getCenter(new Vector3()),pose,new R.Cuboid(...half)),null,`${module}: obstruction at ${p}`);
        // The blank spans roller gaps; sample its footprint, not just its centre.
        let nearest=Infinity;
        for(const dx of [-h[0]*.85,0,h[0]*.85]){
          const from=new Vector3(p[0]+dx,bottom+.02,p[2]),dir=new Vector3(0,-1,0);
          const hit=new Raycaster(from,dir,0,.2).intersectObject(mesh,false)[0];
          const contact=world.castRay(new R.Ray(from,dir),.2,true);
          if(hit && contact){
            assert.ok(Math.abs(hit.distance-contact.timeOfImpact)<.005,`${module}: visible support differs at ${p}`);
            nearest=Math.min(nearest,Math.abs(bottom-hit.point.y));
          }
        }
        assert.ok(nearest<.04,`${module}: unsupported at ${p}, gap ${nearest}`);
      }
    }
  }finally{world.free();g.geometry.dispose();g.roofs.dispose();g.surface.dispose();mat.dispose();}
});

test('extraction corrects alignment continuously and only commits after material transport and empty-hoist parking',()=>{
  for(const module of FACTORY_MODULES){
    const op=createFactoryOperation({type:'extract',module}),input={x:0,z:0,held:false,confirm:false};
    op.tool[0]=op.target[0]+.5;op.tool[2]=op.target[2];
    stepFactoryOperation(op,{...input,confirm:true},1/60);
    assert.equal(op.tool[0],op.target[0]+.5,'E must not teleport into alignment');
    let previous=[...op.tool],released=false,transported=false;
    for(let i=0;i<1800&&op.phase!=='done';i++){
      if(op.phase==='carry'){
        input.x=Math.max(-1,Math.min(1,(op.target[0]-op.tool[0])*4));input.z=Math.max(-1,Math.min(1,(op.target[2]-op.tool[2])*4));
        input.confirm=Math.hypot(op.target[0]-op.tool[0],op.target[2]-op.tool[2])<.06;
      }else{input.x=0;input.z=0;input.confirm=false;}
      const wasAttached=op.attached;stepFactoryOperation(op,input,1/60);
      assert.ok(Math.hypot(...op.tool.map((v,k)=>v-previous[k]))<.12,'bounded continuous magnet movement');previous=[...op.tool];
      if(wasAttached&&!op.attached){released=true;assert.equal(op.phase,'outfeed');assert.equal(op.progress,0);}
      if(op.phase==='outfeed'&&op.progress>.5)transported=true;
    }
    assert.ok(released&&transported);assert.equal(op.phase,'done');assert.deepEqual(op.tool,FACTORY_RAW_IDLE);
  }
});
