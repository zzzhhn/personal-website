import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import { compileWorldComponent } from './alpha-mine-tests/component-host.mjs';

const paving = await import('../../src/components/world/WorldTerrainPaving.ts');
const { decorV4 } = await import('../../src/components/world/layout-v4.ts');
const { collisionInventory } = await import('../../src/components/world/world-collision-inventory.ts');
await R.init();
const load = compileWorldComponent(new URL('../../src/components/world/WorldTerrainRoads.tsx', import.meta.url));

function installed(t, handover) {
  const scene = new THREE.Scene();
  const world = new R.World({ x:0, y:0, z:0 });
  const meshes = [], contacts = new Map(), nodes = [], cleanup = [];
  const Road = load({
    './WorldTerrainPaving':paving,
    './WorldVisualClaims':{useGreyboxClaim(){},useIsClaimed:()=>handover},
    react:{...React,memo:f=>f,useMemo:f=>f(),useEffect:f=>cleanup.push(f())},
    '@react-three/rapier':{RigidBody:'rigid-body',TrimeshCollider:'trimesh'},
  }).default;
  function mount(element, parent) {
    if (Array.isArray(element)) return element.forEach(child=>mount(child,parent));
    if (!element) return;
    const {type,props} = element;
    if (typeof type === 'function') return mount(type(props),parent);
    if (type === React.Fragment) return mount(props.children,parent);
    const node = type === 'mesh' ? new THREE.Mesh(props.geometry,props.material) : new THREE.Group();
    node.name = props.name; node.userData = props.userData ?? {};
    parent.add(node);
    if (type === 'mesh') meshes.push(node);
    if (type === 'trimesh') {
      const [vertices,indices] = props.args;
      const collider = world.createCollider(R.ColliderDesc.trimesh(vertices,indices));
      contacts.set(node.name,{vertices,indices,collider}); nodes.push(node);
    }
    mount(props.children,node);
  }
  mount(Road({}),scene); world.step();
  t.after(()=>{world.free(); for (const fn of cleanup.reverse()) fn?.();});
  return {scene,world,meshes,nodes,contacts};
}

for (const handover of [false,true]) test('mainland paving triangles and installed physical roles with park plaza '+(handover?'mounted':'loading'), t=>{
  const {scene,world,meshes,contacts,nodes} = installed(t,handover);
  assert.equal(meshes.length,4);
  const inventory = collisionInventory(scene,new Set(meshes),nodes,['world-paving-v4']);
  assert.deepEqual(inventory.errors,[]);
  assert.equal(inventory.registrations['world-paving-v4'],contacts.size);
  let solids=0,paint=0;
  const consumed = new Map();
  for (const mesh of meshes) {
    const p=mesh.geometry.getAttribute('position'), mode=mesh.geometry.getAttribute('paveMode');
    for (const part of mesh.userData.worldCollisionSources) {
      if (part.collision==='none') {
        for(let i=part.firstVertex;i<part.firstVertex+part.vertexCount;i++) assert.equal(mode.getX(i),paving.PAVE_MODE.paint);
        paint+=part.vertexCount/3; continue;
      }
      const {vertices,indices}=contacts.get(part.surfaceId);
      let at=consumed.get(part.surfaceId)??0;
      for (let i=part.firstVertex;i<part.firstVertex+part.vertexCount;i++) {
        const j=indices[at++]*3;
        assert.equal(p.getX(i),vertices[j]); assert.equal(p.getY(i),vertices[j+1]); assert.equal(p.getZ(i),vertices[j+2]);
      }
      consumed.set(part.surfaceId,at); solids+=part.vertexCount/3;
    }
  }
  for(const [name,{indices}] of contacts) assert.equal(consumed.get(name),indices.length,name+' has hidden collider triangles');
  const posts=decorV4().filter(p=>p.color==='#6E5642'); assert.equal(posts.length,32);
  let rays=0, maxError=0;
  for (const {position:[x,y,z],size} of posts) {
    for(let n=0;n<8;n++) {
      const a=(n+.5)*Math.PI/4, dx=Math.cos(a), dz=Math.sin(a);
      const ray=new R.Ray({x:x+dx*.4,y,z:z+dz*.4},{x:-dx,y:0,z:-dz});
      const hit=world.castRay(ray,.45,true);
      assert.ok(hit,'missing octagonal post at '+[x,z,n]);
      maxError=Math.max(maxError,Math.abs(hit.timeOfImpact-(.4-Math.cos(Math.PI/8)*size[0]/2))); rays++;
    }
  }
  assert.ok(maxError<.00002);
  const down=(x,z)=>world.castRay(new R.Ray({x,y:2,z},{x:0,y:-1,z:0}),1.1,true);
  assert.ok(down(43.55,-44),'road just west of the shared edge');
  assert.equal(Boolean(down(45,-45)),!handover,'park owns the ground east of the shared edge after handover');
  t.diagnostic(JSON.stringify({handover,solids,paint,rays,maxError,colliders:contacts.size}));
});
