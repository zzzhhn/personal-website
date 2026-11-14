import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, BoxGeometry, CylinderGeometry, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { buildFactoryGantry } from './factory-gantry.ts';
import { buildFactoryGeometry, FACTORY_PALETTE } from './factory-geometry.ts';
import { createFactoryOperation, stepFactoryOperation, FACTORY_RAW_PICK, FACTORY_RAW_DROP, FACTORY_RAW_TRANSFER_TOP } from './factory-operation.ts';

const neutral={x:0,z:0,held:false,confirm:false};
const bounds=o=>new Box3().setFromObject(o);
const close=(a,b,message)=>assert.ok(Math.abs(a-b)<2e-5,`${message}: ${a} != ${b}`);
function ray(mesh,x,y,z,dy){
  const hits=new Raycaster(new Vector3(x,y,z),new Vector3(0,dy,0)).intersectObject(mesh,false);
  assert.ok(hits.length,`no surface at ${x},${y},${z} direction ${dy}`);return hits[0].point.y;
}
function operationSamples(){
  const samples=[];
  // Reach the production operation's own clamps instead of supplying copied bounds.
  for(const x of [-1,1])for(const z of [-1,1]){
    const op=createFactoryOperation({type:'extract',module:'frame'});
    for(let i=0;i<240;i++)stepFactoryOperation(op,{...neutral,x,z},.05);
    samples.push([...op.tool]);
  }
  for(const module of ['frame','wheels','shell']){
    const op=createFactoryOperation({type:'extract',module});
    op.tool[0]=FACTORY_RAW_PICK[module][0];op.tool[2]=FACTORY_RAW_PICK[module][2];
    stepFactoryOperation(op,{...neutral,confirm:true},.05);
    for(let i=0;i<30;i++){stepFactoryOperation(op,neutral,.05);samples.push([...op.tool]);}
    op.tool[0]=FACTORY_RAW_DROP[0];op.tool[2]=FACTORY_RAW_DROP[2];
    stepFactoryOperation(op,{...neutral,confirm:true},.05);
    for(let i=0;i<25;i++){stepFactoryOperation(op,neutral,.05);samples.push([...op.tool]);}
  }
  return samples;
}
const disposeStatic=g=>{g.geometry.dispose();g.roofs.dispose();g.surface.dispose();};

test('production extraction extremes keep bridge and trolley wheels on real supporting geometry',()=>{
  const rig=buildFactoryGantry(FACTORY_PALETTE),fixed=buildFactoryGeometry(),material=new MeshBasicMaterial();
  const runway=new Mesh(fixed.geometry,material),bridge=rig.group.getObjectByName('gantry-twin-bridge-and-end-trucks');
  const trolley=rig.group.getObjectByName('gantry-trolley-deck');
  const posts=fixed.solids.filter(s=>s.size[1]>5&&s.size[0]<.8&&s.size[2]<.8&&s.at[0]<-30&&s.at[2]>-26&&s.at[2]<-12);
  assert.equal(posts.length,4,'four physical posts support the runway');
  const columnXs=[...new Set(posts.map(p=>p.at[0]))];
  try{
    runway.updateMatrixWorld(true);
    for(const p of operationSamples()){
      rig.update(p);rig.group.updateMatrixWorld(true);
      for(const x of columnXs)for(const dz of [-.48,.48]){
        const wheelBottom=ray(bridge,x,5.4,p[2]+dz,1);
        const railTop=ray(runway,x,5.9,p[2]+dz,-1);
        close(wheelBottom,railTop,'bridge wheel/runway contact');
      }
      for(const dx of [-.43,.43])for(const dz of [-.36,.36]){
        const wheelBottom=ray(trolley,p[0]+dx,6.4,p[2]+dz,1);
        const beamTop=ray(bridge,p[0]+dx,6.6,p[2]+dz,-1);
        close(wheelBottom,beamTop,'trolley wheel/bridge contact');
      }
    }
  }finally{rig.dispose();disposeStatic(fixed);material.dispose();}
});

test('steel ropes contact the winch guides and magnet sockets throughout lowering without clamping',()=>{
  const rig=buildFactoryGantry(FACTORY_PALETTE),magnet=new Mesh(new CylinderGeometry(.34,.42,.22,12),new MeshBasicMaterial());
  const hoist=rig.group.getObjectByName('gantry-winch-and-rope-guides'),socket=rig.group.getObjectByName('gantry-magnet-rope-sockets');
  try{
    for(const p of [...operationSamples(),[-39,.4,-20],[-39,4.2,-20]]){
      rig.update(p);rig.group.updateMatrixWorld(true);magnet.position.set(...p);magnet.updateMatrixWorld(true);
      close(bounds(socket).min.y,bounds(magnet).max.y,'socket rests on actual magnet top');
      for(const [name,dx] of [['gantry-rope-left',-.16],['gantry-rope-right',.16]]){
        const rope=bounds(rig.group.getObjectByName(name));
        const guideBottom=ray(hoist,p[0]+dx,5.85,p[2],1);
        const socketTop=ray(socket,p[0]+dx,p[1]+.4,p[2],-1);
        assert.ok(rope.max.y>guideBottom&&rope.max.y<guideBottom+.15,'upper rope terminates inside winch guide');
        assert.ok(rope.min.y<socketTop&&rope.min.y>socketTop-.05,'lower rope terminates inside socket');
        close((rope.min.x+rope.max.x)/2,p[0]+dx,'rope follows transverse trolley');
        close((rope.min.z+rope.max.z)/2,p[2],'rope follows bridge');
      }
    }
  }finally{rig.dispose();magnet.geometry.dispose();magnet.material.dispose();}
});

test('gantry posts and intake preserve the console approach and full raw placement tolerance',()=>{
  const g=buildFactoryGeometry(),material=new MeshBasicMaterial(),mesh=new Mesh(g.geometry,material);
  try{
    mesh.updateMatrixWorld(true);
    for(const s of g.solids.filter(s=>s.at[0]<-30&&s.at[2]>-26&&s.at[2]<-12)){
      const overlaps=(x,z,r)=>Math.abs(x-s.at[0])<s.size[0]/2+r&&Math.abs(z-s.at[2])<s.size[2]/2+r;
      if(s.at[1]-s.size[1]/2<1.9){
        assert.equal(overlaps(-37,-25,.4),false,'player stance remains clear');
        if(s.size[1]>5)for(const p of Object.values(FACTORY_RAW_PICK))
          assert.equal(overlaps(p[0],p[2],1.45),false,'column does not cross a raw bin');
      }
    }
    for(const half of [[.31,.1,.36],[.26,.15,.26],[.29,.06,.35]])for(let angle=0;angle<Math.PI*2;angle+=Math.PI/4){
      for(const sx of [-1,1])for(const sz of [-1,1]){
        const x=FACTORY_RAW_DROP[0]+Math.cos(angle)*.72+sx*half[0];
        const z=FACTORY_RAW_DROP[2]+Math.sin(angle)*.72+sz*half[2];
        const surface=ray(mesh,x,1.5,z,-1);
        assert.ok(surface<=FACTORY_RAW_TRANSFER_TOP+.001,`rim obstructs accepted raw placement at ${x},${z}`);
      }
    }
  }finally{disposeStatic(g);material.dispose();}
});

test('updates retain finite geometry and stable resources; disposal owns only rig resources exactly once',()=>{
  const rig=buildFactoryGantry(FACTORY_PALETTE),geometries=new Set(),materials=new Set();
  rig.group.traverse(o=>{if(o instanceof Mesh){geometries.add(o.geometry);materials.add(o.material);}});
  const counts={geometry:0,material:0,external:0};
  geometries.forEach(g=>g.addEventListener('dispose',()=>counts.geometry++));
  materials.forEach(m=>m.addEventListener('dispose',()=>counts.material++));
  const external=new Mesh(new BoxGeometry(1,1,1),new MeshBasicMaterial());
  external.geometry.addEventListener('dispose',()=>counts.external++);rig.group.add(external);
  for(const p of operationSamples())rig.update(p);
  rig.group.updateMatrixWorld(true);
  rig.group.traverse(o=>{
    assert.ok(o.matrixWorld.elements.every(Number.isFinite));
    if(o instanceof Mesh&&o!==external){assert.ok(geometries.has(o.geometry));assert.ok(materials.has(o.material));}
  });
  for(const g of geometries)for(const attribute of Object.values(g.attributes))assert.ok(Array.from(attribute.array).every(Number.isFinite));
  assert.ok(geometries.size<=6&&materials.size<=2,'bounded dynamic draw and material budget');
  rig.dispose();rig.dispose();rig.update([-37,3.4,-19]);
  assert.equal(counts.geometry,geometries.size);assert.equal(counts.material,materials.size);assert.equal(counts.external,0);
  external.geometry.dispose();external.material.dispose();
});
