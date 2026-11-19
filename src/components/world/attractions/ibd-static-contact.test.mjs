import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { DoubleSide, Euler, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Vector3 } from 'three';
import { buildIbdStatic } from './ibd-yard-geometry.ts';
import { ibdCraftOptions } from './ibd-craft-options.ts';
import { PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from '../actor-physics.ts';

await R.init();
const options = { separateCraftShells: true, ...ibdCraftOptions(null) };
const at = (x,y,z) => ({x,y,z});
const identity = {x:0,y:0,z:0,w:1};

test('the release architecture ranges preserve the same rendered triangles and positions', t => {
  const data = buildIbdStatic(options), { geometry } = data;
  t.after(() => { geometry.dispose(); data.craftShellGeometry.dispose(); });
  const positions = geometry.getAttribute('position'), index = geometry.index;
  const key = (values) => Array.from(values, value => Math.round(value*1e6)).join(',');
  let last = 0, total = 0;
  const surfaces = [...data.contactSurfaces].sort((a,b) => a.firstIndex-b.firstIndex);
  assert.equal(new Set(surfaces.map(s => s.id)).size, surfaces.length);
  for (const surface of surfaces) {
    assert.ok(surface.firstIndex >= last && surface.indexCount % 3 === 0, surface.id);
    assert.equal(surface.indexCount, surface.indices.length, surface.id);
    for (let i=0; i<surface.indexCount; i+=3) {
      const expected = [], actual = [];
      for (let k=0; k<3; k++) {
        const drawn = index.getX(surface.firstIndex+i+k), physical = surface.indices[i+k];
        expected.push(key([positions.getX(drawn),positions.getY(drawn),positions.getZ(drawn)]));
        actual.push(key(surface.vertices.subarray(physical*3,physical*3+3)));
      }
      assert.equal(actual.sort().join('|'), expected.sort().join('|'), `${surface.id} triangle ${i/3}`);
    }
    last = surface.firstIndex+surface.indexCount;
    total += surface.indexCount/3;
  }
  t.diagnostic(`${surfaces.length} named contacts, ${total}/${index.count/3} source triangles`);
});

test('Rapier contacts follow the I-profile, open rack slot, and real roller frame', t => {
  const data = buildIbdStatic(options), world = new R.World(at(0,0,0));
  const material = new MeshBasicMaterial({side: DoubleSide}), drawing = new Mesh(data.geometry,material);
  t.after(() => { world.free(); material.dispose(); data.geometry.dispose(); data.craftShellGeometry.dispose(); });
  const names = new Map();
  for (const shape of data.contactSurfaces) {
    const collider = world.createCollider(R.ColliderDesc.trimesh(shape.vertices,shape.indices,R.TriMeshFlags.FIX_INTERNAL_EDGES));
    names.set(collider.handle,shape.id);
  }
  for (const s of data.solids) {
    world.createCollider(R.ColliderDesc.cuboid(...s.size.map(v=>v/2)).setTranslation(...s.at)
      .setRotation(new Quaternion().setFromEuler(new Euler(...s.rotation??[0,0,0]))));
  }
  world.step();
  for (const [name,origin,direction,max,owner] of [
    ['coil column web',[-4,1.2,4.93],[1,0,0],1.5,'ibd-shed-coil'],
    ['rack gap between two timber cases',[4.99,1.48,-20.5],[0,0,-1],3.5,null],
    ['bearing underframe',[7.55,.47,-4.69],[1,0,0],1.1,'ibd-roller-10-long'],
    ['dispatch open rear',[8.5,1.15,6],[0,0,-1],4,null],
  ]) {
    const o=new Vector3(...origin), d=new Vector3(...direction);
    const seen=new Raycaster(o,d,0,max).intersectObject(drawing)[0];
    const hit=world.castRay(new R.Ray(o,d),max,true);
    assert.equal(names.get(hit?.collider.handle)??null, owner, name);
    if (owner) assert.ok(seen && hit && Math.abs(hit.timeOfImpact-seen.distance)<.0001, name);
    else assert.ok(!seen && !hit, name);
  }
  const capsule=new R.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS);
  for (const [x,y,z,dx,dz] of [[6.5,.98,6,0,-4],[8,.99,0,12,0],[8,.99,4,12,0]]) {
    const hit=world.castShape(at(x,y,z),identity,at(dx,0,dz),capsule,0,1,true);
    assert.ok(!hit,`open lane at ${x},${z}; hit ${names.get(hit?.collider.handle)??'old box'} at ${hit?.time_of_impact}`);
  }
});
