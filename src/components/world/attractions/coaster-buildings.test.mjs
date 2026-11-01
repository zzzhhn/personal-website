import test from 'node:test';
import assert from 'node:assert/strict';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { addCoasterBuildingArt, addCoasterStationRoof, CoasterBatch, createCoasterStructure } from './coaster-geometry.ts';
import { COASTER_CANOPY_BOUNDS, coasterFrame, coasterRidePose, coasterWorld } from './coaster-track.ts';

test('folded roof remains inside the retained canopy collision bounds',()=>{
  const b=new CoasterBatch();addCoasterStationRoof(b);const g=b.finish();
  try{
    g.computeBoundingBox();
    for(const [i,axis] of ['x','y','z'].entries()){
      assert.ok(g.boundingBox.min[axis]>=COASTER_CANOPY_BOUNDS.min[i]-1e-5);
      assert.ok(g.boundingBox.max[axis]<=COASTER_CANOPY_BOUNDS.max[i]+1e-5);
    }
    const n=g.attributes.normal;let pitched=0;
    for(let i=0;i<n.count;i++)if(n.getY(i)>.7&&Math.abs(n.getX(i))>.1)pitched++;
    assert.ok(pitched>0,'roof must have actual folded planes');
  }finally{g.dispose();}
});

test('building articulation stays inside the 8k near / 4k far increment without new material groups',()=>{
  for(const detailed of [true,false]){
    const b=new CoasterBatch();addCoasterBuildingArt(b,detailed);const g=b.finish();
    try{
      assert.ok(g.attributes.position.count/3<=(detailed?8000:4000));
      assert.equal(g.groups.length,0);
      for(const a of Object.values(g.attributes))assert.ok(a.array.every(Number.isFinite));
      assert.equal(g.attributes.nightRadiance.count,g.attributes.position.count);
    }finally{g.dispose();}
  }
});

test('all ride views keep the added building framework out of rider and forward sight lines',()=>{
  const b=new CoasterBatch();addCoasterBuildingArt(b,true);addCoasterStationRoof(b);
  const g=b.finish(),mat=new MeshBasicMaterial({side:DoubleSide}),mesh=new Mesh(g,mat),ray=new Raycaster();mesh.updateMatrixWorld();
  try{
    for(let i=0;i<1600;i++)for(const mode of ['chase','comfort','first-person']){
      const u=i/1600,pose=coasterRidePose(u,mode),eye=new Vector3(...pose.cameraPosition),f=coasterFrame(u);
      const targets=mode==='first-person'?[new Vector3(...pose.cameraTarget)]:[new Vector3(...pose.cameraTarget),f.point.clone().addScaledVector(f.up,2.2)];
      for(const target of targets){const d=target.sub(eye);ray.set(eye,d.clone().normalize());ray.near=.05;ray.far=mode==='first-person'?2:d.length();
        assert.equal(ray.intersectObject(mesh,false).length,0,`${mode} obstructed at ${u}`);}
    }
  }finally{g.dispose();mat.dispose();}
});

test('station and equipment buildings retain their original collision profiles',()=>{
  const g=createCoasterStructure(true);
  const expected=[
    [[-2,6.8,41.5],[9,.6,11.5]],[[10,3.1,43],[2.75,3.1,7]],
    [[-14.5,2.7,35],[2.5,2.7,4]],[[-36,5.4,13],[4.5,5.4,4.5]],[[24,8.8,-92],[5,3.8,4]],
  ];
  try{for(const [p,half]of expected){
    const world=coasterWorld(p),c=g.colliders.find(c=>c.position.every((v,i)=>v===world[i]));
    assert.ok(c,`missing collider ${p}`);assert.deepEqual(c.half,half);
  }}finally{g.steel.dispose();g.glow.dispose();}
});
