import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { FACTORY_PRESS_ROD_BASE_LENGTH, FACTORY_PRESS_ROD_TOP, syncFactoryPressRod } from './factory-press-rod.ts';
import { FACTORY_CONVEYOR_TOP, FACTORY_RAW_HALF_HEIGHT, createFactoryOperation, stepFactoryOperation } from './factory-operation.ts';

const near = (a,b) => assert.ok(Math.abs(a-b)<1e-6, `${a} != ${b}`);
function rig() {
  const ram=new Group(), material=new MeshBasicMaterial();
  const rod=new Mesh(new CylinderGeometry(.15,.15,FACTORY_PRESS_ROD_BASE_LENGTH,12),material);
  const platen=new Mesh(new BoxGeometry(3.8,.32,3.2),material);
  ram.add(platen,rod);
  return {ram,rod,platen,dispose(){rod.geometry.dispose();platen.geometry.dispose();material.dispose();}};
}
function check(model,module,stroke) {
  const contact=FACTORY_CONVEYOR_TOP+FACTORY_RAW_HALF_HEIGHT[module]*2+.16;
  const y=3.6-stroke*(3.6-contact);
  model.ram.position.y=y;syncFactoryPressRod(model.rod,y);model.ram.updateMatrixWorld(true);
  const rod=new Box3().setFromObject(model.rod),platen=new Box3().setFromObject(model.platen);
  near(rod.max.y,FACTORY_PRESS_ROD_TOP);near(platen.max.y-rod.min.y,.06);
  assert.ok(rod.max.y>3.95&&rod.max.y<5.095,'upper end is always inside the real sleeve');
  near(rod.min.x,-.15);near(rod.max.x,.15);near(rod.min.z,-.15);near(rod.max.z,.15);
  assert.ok(rod.intersectsBox(platen),'the rod physically enters the moving platen');
  assert.ok(rod.min.y<3.95,'no exposed gap below the sleeve');
  near(model.rod.scale.x,1);near(model.rod.scale.z,1);
}

test('actual cylinder endpoints stay joined through every material cycle at 30, 60 and 120 Hz',()=>{
  const model=rig();
  try {
    for(const module of ['frame','wheels','shell']) for(const hz of [30,60,120]) {
      const op=createFactoryOperation({type:'process',module}); let samples=0,maximum=0;
      while(op.phase!=='outfeed'&&samples<hz*5) {
        stepFactoryOperation(op,{x:0,z:0,held:true,confirm:false},1/hz);
        check(model,module,op.stroke);maximum=Math.max(maximum,op.stroke);samples++;
      }
      assert.equal(op.phase,'outfeed');near(maximum,1);near(op.stroke,0);assert.ok(samples>hz*2);
    }
  } finally {model.dispose();}
});

test('early release, return and pause preserve sleeve/platen contact without changing operation time',()=>{
  const model=rig();
  try {
    for(const module of ['frame','wheels','shell']) {
      const op=createFactoryOperation({type:'process',module});
      while(op.stroke<.65)stepFactoryOperation(op,{x:0,z:0,held:true,confirm:false},1/60);
      const saved=structuredClone(op);
      for(let i=0;i<120;i++) {
        stepFactoryOperation(op,{x:0,z:0,held:true,confirm:false},1/60,true);
        check(model,module,op.stroke);
      }
      assert.deepEqual(op,saved);
      for(let i=0;i<100;i++) {
        stepFactoryOperation(op,{x:0,z:0,held:false,confirm:false},1/60);
        check(model,module,op.stroke);
      }
      near(op.stroke,0);near(op.guard,0);assert.equal(op.phase,'ready');
    }
  } finally {model.dispose();}
});

test('pose synchronization changes only local Y and never changes mesh or geometry ownership',()=>{
  const model=rig(),geometry=model.rod.geometry,position=model.rod.position,scale=model.rod.scale;
  try {
    model.rod.position.x=.02;model.rod.position.z=-.03;
    for(let i=0;i<=100;i++)syncFactoryPressRod(model.rod,1.5+i*.021);
    assert.equal(model.rod.geometry,geometry);assert.equal(model.rod.position,position);assert.equal(model.rod.scale,scale);
    near(position.x,.02);near(position.z,-.03);near(scale.x,1);near(scale.z,1);
    assert.equal(model.ram.children.length,2);
  } finally {model.dispose();}
});
