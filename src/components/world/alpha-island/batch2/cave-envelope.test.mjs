import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, MeshBasicMaterial, DoubleSide, Raycaster, Vector3 } from 'three';
import { caveMountainHeight, createCaveEnvelopeGeometry, createCaveFloorFoundation, CAVE_MOUNTAINSIDE_MOUTHS } from './cave-envelope.ts';
import { ALPHA_CAVE_PATH, ALPHA_CAVE_DEAD_END } from '../alpha-batch2-layout.ts';
import { ALPHA_MAIN_PATH } from '../alpha-layout.ts';
import { alphaGroundHeight } from '../alpha-terrain.ts';
import { createCaveFloorGeometry } from './cave-art.ts';

test('continuous mountain crown covers both cave branches and blends below surrounding ground at its edge',()=>{
  for(const path of [ALPHA_CAVE_PATH,ALPHA_CAVE_DEAD_END])for(let i=1;i<path.length;i++)for(let k=0;k<=10;k++){
    const a=path[i-1],b=path[i],t=k/10,x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t,y=a[1]+(b[1]-a[1])*t;
    assert.ok(caveMountainHeight(x,z,20)>y+9,'the existing 8m arch must be buried inside the crown');
  }
  for(const [x,z] of [[-36,-54],[-45,-56],[-36,-56],[-27,-56]])assert.ok(caveMountainHeight(x,z,12)<12,'existing main/coastal footpath stays uncovered');
  for(const [x,z] of [[-50,-49],[40,-56],[-15,-10]])assert.equal(caveMountainHeight(x,z,17),16.91,'foothills bury their outer edge in actual ground');
});

test('actual envelope triangles keep both mouths open and their crown over the fork',()=>{
  // Small isolated geometry check: no full island mesh, physics or browser.
  const geometry=createCaveEnvelopeGeometry(()=>20),material=new MeshBasicMaterial({side:DoubleSide}),mesh=new Mesh(geometry,material),ray=new Raycaster();
  try{
    assert.ok(geometry.index.count/3<5000,'bounded static mountain surface');
    mesh.updateMatrixWorld(true);
    for(const mouth of CAVE_MOUNTAINSIDE_MOUTHS)for(const across of [-2.4,0,2.4])for(const lift of [.5,1.8,3.2,4.8]){
      const origin=new Vector3(mouth.p[0]-mouth.dx*.3-mouth.dz*across,mouth.p[1]+lift,mouth.p[2]-mouth.dz*.3+mouth.dx*across);
      ray.set(origin,new Vector3(mouth.dx,0,mouth.dz));ray.far=18;
      assert.equal(ray.intersectObject(mesh).length,0,`blocked open mouth at ${mouth.p}, across=${across}, lift=${lift}`);
    }
    for(const [x,y,z] of [[-10,26,-42],[-14,27,-48],[0,29,-48]]){
      ray.set(new Vector3(x,y+1.8,z),new Vector3(0,1,0));ray.far=20;
      const hit=ray.intersectObject(mesh)[0];assert.ok(hit&&hit.point.y>y+8,'mountain roof covers the fork without filling its cavity');
    }
  }finally{geometry.dispose();material.dispose();}
});

test('production terrain and floor retain full-width cave, open mouths and outdoor walking clearance',()=>{
  const geometry=createCaveEnvelopeGeometry(alphaGroundHeight),floor=createCaveFloorGeometry(),foundation=createCaveFloorFoundation(floor),material=new MeshBasicMaterial({side:DoubleSide});
  const mountain=new Mesh(geometry,material),walking=new Mesh(floor,material),footing=new Mesh(foundation,material),ray=new Raycaster();
  mountain.updateMatrixWorld(true);walking.updateMatrixWorld(true);footing.updateMatrixWorld(true);
  let caveSamples=0,pathSamples=0,minCrown=Infinity,maxPathIntrusion=-Infinity;
  const samplePath=(path,step,visit)=>{
    for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i],length=Math.hypot(b[0]-a[0],b[2]-a[2]),dx=(b[0]-a[0])/length,dz=(b[2]-a[2])/length,n=Math.ceil(length/step);
      for(let k=0;k<=n;k++)for(const across of [-2.4,-1.2,0,1.2,2.4]){const t=k/n;visit(a[0]+(b[0]-a[0])*t-dz*across,a[2]+(b[2]-a[2])*t+dx*across,a[1]+(b[1]-a[1])*t);}
    }
  };
  try{
    for(const path of [ALPHA_CAVE_PATH,ALPHA_CAVE_DEAD_END])samplePath(path,1,(x,z)=>{
      ray.set(new Vector3(x,100,z),new Vector3(0,-1,0));ray.far=100;
      const hit=ray.intersectObject(walking)[0];if(!hit)return;
      const y=hit.point.y;
      ray.set(new Vector3(x,y+.03,z),new Vector3(0,1,0));ray.far=6;
      assert.equal(ray.intersectObject(mountain).length,0,`mountain intrudes into actual cave clearance at ${x},${y},${z}`);
      assert.equal(ray.intersectObject(footing).length,0,'floor foundation must stay below walking skin');
      ray.far=30;const roof=ray.intersectObject(mountain)[0];
      if(CAVE_MOUNTAINSIDE_MOUTHS.every(m=>m.outward(x,z)<-.5))assert.ok(roof,`missing mountain cover over cave interior at ${x},${z}`);
      if(roof){minCrown=Math.min(minCrown,roof.point.y-y);assert.ok(roof.point.y-y>7.5,`mountain dips through ceiling at ${x},${z}: crown ${roof.point.y-y}`);}
      assert.ok(alphaGroundHeight(x,z)<y+.25,'the terrain collider must not fill the cavity');caveSamples++;
    });
    for(const mouth of CAVE_MOUNTAINSIDE_MOUTHS)for(const across of [-2.4,0,2.4])for(const lift of [.5,1.8,3.2,4.8]){
      ray.set(new Vector3(mouth.p[0]-mouth.dx*.3-mouth.dz*across,mouth.p[1]+lift,mouth.p[2]-mouth.dz*.3+mouth.dx*across),new Vector3(mouth.dx,0,mouth.dz));ray.far=18;
      assert.equal(ray.intersectObject(mountain).length,0,`actual terrain-backed mouth is obstructed at ${mouth.p}`);
    }
    for(const path of [ALPHA_MAIN_PATH,[[-45,12,-56],[-27,12,-56]]])samplePath(path,1.5,(x,z)=>{
      const y=alphaGroundHeight(x,z);ray.set(new Vector3(x,y+8,z),new Vector3(0,-1,0));ray.far=8;
      const hit=ray.intersectObject(mountain)[0],intrusion=hit?hit.point.y-y:0;
      maxPathIntrusion=Math.max(maxPathIntrusion,intrusion);assert.ok(intrusion<.25,`mountain blocks existing outdoor path at ${x},${z}: ${intrusion}`);pathSamples++;
    });
    assert.ok(caveSamples>150&&pathSamples>500);
    console.log(JSON.stringify({caveSamples,pathSamples,minCrown,maxPathIntrusion,envelopeTriangles:geometry.index.count/3,floorTriangles:floor.index.count/3,foundationTriangles:foundation.index.count/3,addedSolidTriangles:(geometry.index.count+foundation.index.count)/3}));
  }finally{geometry.dispose();floor.dispose();foundation.dispose();material.dispose();}
});
