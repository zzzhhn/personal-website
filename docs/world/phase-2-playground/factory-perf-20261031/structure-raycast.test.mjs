import test from 'node:test';
import assert from 'node:assert/strict';
import {Mesh,MeshBasicMaterial,Raycaster,Vector3,FrontSide,DoubleSide} from 'three';
import {acceleratedRaycast,MeshBVH} from 'three-mesh-bvh';
import {buildFactoryGeometry} from '../../../../src/components/world/factory/factory-geometry.ts';
import {indexFactoryStructure} from '../../../../src/components/world/factory/factory-structure-raycast.ts';
import {FACTORY} from '../../../../src/components/world/factory/factory-layout.ts';

test('static factory acceleration preserves authored faces and exact finite-range occlusion',()=>{
 const built=buildFactoryGeometry(), geom=built.geometry, indices=geom.index.array.slice(), material=new MeshBasicMaterial(), mesh=new Mesh(geom,material);
 mesh.position.fromArray(FACTORY.origin);mesh.updateMatrixWorld(true);
 const rays=[];
 function local(eye,end,near=0,far=Infinity){const p=new Vector3(...eye).add(mesh.position),q=new Vector3(...end).add(mesh.position);rays.push(new Raycaster(p,q.sub(p).normalize(),near,far));}
 for(const z of [-11,2,15])for(const off of [0,.45,-.65,-1.25])local([-39,5.2,z+3.5],[-27.5,2.2+off,z],.05,14);
 for(let i=0;i<24;i++){const z=-28+i*2.4;local([-65,4,z],[0,2,z],.05,115);local([65,4,z],[0,2,z],.05,115);}
 local([-60,4,0],[-70,4,0]);local([0,35,0],[0,0,0],0,1);local([0,35,0],[0,0,0],5,65);
 const read=(ray)=>ray.intersectObject(mesh,false).map(h=>({face:h.faceIndex,d:h.distance,point:h.point})).sort((a,b)=>a.face-b.face);
 const original=[FrontSide,DoubleSide].map(side=>{material.side=side;return rays.map(read)});
 const start=performance.now();indexFactoryStructure(geom);const buildMs=performance.now()-start;
 mesh.raycast=acceleratedRaycast; assert.deepEqual(geom.index.array,indices);
 let hits=0,miss=0;for(const [i,side] of [FrontSide,DoubleSide].entries()){
  material.side=side;rays.forEach((ray,j)=>{const got=read(ray),ref=original[i][j];assert.equal(got.length,ref.length);ref.length?hits++:miss++;
   got.forEach((h,k)=>{assert.equal(h.face,ref[k].face);assert.ok(Math.abs(h.d-ref[k].d)<1e-7);assert.ok(h.point.distanceTo(ref[k].point)<1e-7)});
  });
 }
 assert.ok(hits&&miss);const {roots,indirectBuffer}=MeshBVH.serialize(geom.boundsTree,{cloneBuffers:false});
 console.log(JSON.stringify({rays:rays.length*2,hits,miss,structureTris:indices.length/3,buildMs,treeBufferBytes:roots.reduce((n,b)=>n+b.byteLength,indirectBuffer.byteLength)}));
 delete geom.boundsTree;material.dispose();geom.dispose();built.roofs.dispose();built.surface.dispose();
});
