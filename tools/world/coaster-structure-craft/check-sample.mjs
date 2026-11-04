import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import R from '@dimforge/rapier3d-compat';
import { Vector3 } from 'three';
import { addCoasterRailSections, addCoasterSampleNodes } from '../../../src/components/world/attractions/coaster-rail-section.ts';
import { inCoasterCraftBay } from '../../../src/components/world/attractions/coaster-structure-craft.ts';
import { coasterFrame, coasterRidePose, coasterSupports } from '../../../src/components/world/attractions/coaster-track.ts';

await R.init();
function assembly(detailed, craft) {
  const batch = { parts: [], add(geometry, _colour, matrix) {
    if (matrix) geometry.applyMatrix4(matrix);
    this.parts.push(geometry);
  } };
  const track = addCoasterRailSections(batch, detailed, undefined, craft);
  const supports = coasterSupports(detailed);
  addCoasterSampleNodes(batch, supports, track, craft);
  return { ...batch, track, supports };
}
function addMesh(world, g) {
  const index = g.index?.array ?? Uint32Array.from({length:g.attributes.position.count}, (_,i)=>i);
  return world.createCollider(R.ColliderDesc.trimesh(new Float32Array(g.attributes.position.array), new Uint32Array(index)));
}
function count(g) { return (g.index?.count ?? g.attributes.position.count)/3; }
const full = process.argv.includes('--full');
for (const detailed of [true,false]) {
  const baseline = assembly(detailed), candidate = assembly(detailed, full ? { scope:'full', detailed } : {});
  assert.deepEqual(candidate.track, baseline.track);
  assert.equal(candidate.supports.filter(s => inCoasterCraftBay(s.u)).length,1);
  const changed = candidate.parts.filter(g => g.userData.intentStructureRole);
  const world = new R.World({x:0,y:0,z:0});
  try {
    // Running rail and spine surfaces have identical positions. Isolate changed visual geometry.
    const byHandle = new Map();
    for(const g of changed) if (!['runningSteel','spineCoat'].includes(g.userData.intentStructureRole)) byHandle.set(addMesh(world,g).handle,g);
    world.step();
    const failures = new Map();
    const check = (hit, category, u) => {
      if (!hit) return;
      const g = byHandle.get(hit.handle);
      const key = [g.userData.intentStructureRole, g.userData.structureAt, category].join(' ');
      failures.set(key, u);
    };
    for (let i=0;i<3600;i++) {
      const u=(i+.31)/3600,f=coasterFrame(u),center=f.point.clone().addScaledVector(f.up,.8);
      check(world.intersectionWithShape(center,f.rotation,new R.Cuboid(1.5,.5,.95)), 'car', u);
      check(world.intersectionWithShape(f.point.clone().addScaledVector(f.up,2.2),f.rotation,new R.Ball(.2)), 'head', u);
      for (const mode of ['chase','comfort','first-person']) {
        const pose=coasterRidePose(u,mode),a=new Vector3(...pose.cameraPosition),b=new Vector3(...pose.cameraTarget),d=b.sub(a),length=d.length();
        check(world.castRay(new R.Ray(a,d.normalize()),mode==='first-person'?2:length,true)?.collider, mode, u);
      }
    }
    assert.equal(failures.size,0,JSON.stringify(Object.fromEntries(failures)));
    const hash = createHash('sha256').update(Buffer.from(candidate.track.vertices.buffer)).update(Buffer.from(candidate.track.indices.buffer)).digest('hex');
    const old = baseline.parts.reduce((n,g)=>n+count(g),0);
    const next = candidate.parts.reduce((n,g)=>n+count(g),0);
    const roles = changed.reduce((m,g)=>(m[g.userData.intentStructureRole]=(m[g.userData.intentStructureRole]??0)+count(g),m),{});
    console.log(JSON.stringify({ lod:detailed?'near':'far', baselineTriangles:old, candidateTriangles:next,
      deltaTriangles:next-old, contactHash:hash, rideSamples:3600, roles }));
  } finally {
    world.free();
    for (const g of [...baseline.parts,...candidate.parts]) g.dispose();
  }
}
