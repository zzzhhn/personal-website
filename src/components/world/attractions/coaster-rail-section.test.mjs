import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { DoubleSide, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Vector3 } from 'three';
import { addCoasterRailSections, addCoasterSampleNodes, coasterRailRings, COASTER_STRUCTURE_SAMPLE, inCoasterStructureSample } from './coaster-rail-section.ts';
import { coasterFrame, coasterRidePose, coasterSupports } from './coaster-track.ts';
await R.init();

test('continuous sections bound both LOD chord error and preserve the shared ride frame and gauge', t => {
  const bounds=[0,COASTER_STRUCTURE_SAMPLE.start,COASTER_STRUCTURE_SAMPLE.end,1],counts=[];
  for(const detailed of [true,false]) {
    let maximum=0,segments=0;
    for(let j=0;j<3;j++) {
      const rings=coasterRailRings(detailed,bounds[j],bounds[j+1]);segments+=rings.length-1;
      for(let i=1;i<rings.length;i++)for(const v of [.25,.5,.75])for(const [side,up] of [[-.89,0],[.89,0],[-.44,-1.2],[.44,-1.2]]) {
        const a=rings[i-1],b=rings[i],u=a.u+(b.u-a.u)*v,f=coasterFrame(u);
        const point=r=>r.frame.point.clone().addScaledVector(r.frame.side,side).addScaledVector(r.frame.up,up);
        const error=f.point.clone().addScaledVector(f.side,side).addScaledVector(f.up,up).distanceTo(point(a).lerp(point(b),v));
        maximum=Math.max(maximum,error);
        assert.ok(error<.022,`section chord error ${error} m at ${u}`);
      }
    }
    counts.push({lod:detailed?'near':'far',segments,maxChordErrorM:maximum});
  }
  const {start,end}=COASTER_STRUCTURE_SAMPLE;
  assert.deepEqual(coasterRailRings(true,start,end).map(r=>r.u),coasterRailRings(false,start,end).map(r=>r.u));
  t.diagnostic(JSON.stringify(counts));
});

test('sample faces and node collars share physical contacts and leave all ride views and the car clear', t => {
  for(const detailed of [true,false]) {
    const parts=[],batch={add(g){parts.push(g);}},contact=addCoasterRailSections(batch,detailed);
    const supports=coasterSupports(detailed).filter(s=>inCoasterStructureSample(s.u));
    addCoasterSampleNodes(batch,supports,contact);
    const rings=coasterRailRings(detailed,COASTER_STRUCTURE_SAMPLE.start,COASTER_STRUCTURE_SAMPLE.end);
    for(const [part,side] of [[parts[3],-.78],[parts[4],.78]])for(let i=0;i<rings.length;i++) {
      const f=rings[i].frame,center=new Vector3();
      for(let j=0;j<12;j++) {
        const p=new Vector3().fromBufferAttribute(part.attributes.position,i*12+j);
        center.add(p);
        assert.ok(Math.abs(p.distanceTo(f.point.clone().addScaledVector(f.side,side))-.11)<.00004);
      }
      assert.ok(center.multiplyScalar(1/12).distanceTo(f.point.clone().addScaledVector(f.side,side))<.00004,'rail gauge shifted');
    }
    const world=new R.World({x:0,y:0,z:0}),material=new MeshBasicMaterial({side:DoubleSide});
    const meshes=parts.map(g=>{const mesh=new Mesh(g,material);mesh.updateMatrixWorld();return mesh;});
    world.createCollider(R.ColliderDesc.trimesh(contact.vertices,contact.indices));
    world.step();let surfaceError=0;
    try {
      assert.ok(contact.indices.length/3<24000);assert.ok(contact.vertices.every(Number.isFinite));
      const {start,end}=COASTER_STRUCTURE_SAMPLE;
      for(let i=1;i<20;i++) {
        // Avoid placing a float32 Rapier ray exactly on a shared ring/triangle edge.
        const f=coasterFrame(start+(end-start)*(i+.37)/20),origin=f.point.clone().addScaledVector(f.up,-2.5),direction=f.up;
        const physical=world.castRay(new R.Ray(origin,direction),4,true);
        const visible=new Raycaster(origin,direction,0,4).intersectObjects(meshes)[0];
        assert.ok(physical&&visible,'spine must have visible and physical faces');
        surfaceError=Math.max(surfaceError,Math.abs(physical.timeOfImpact-visible.distance));
      }
      assert.ok(surfaceError<.001,`contact disagreement ${surfaceError}`);
      // Capsule/sphere queries must also cross exact shared-ring seams without a crack.
      for(const index of [0,Math.floor(rings.length/2),Math.floor(rings.length*.75),rings.length-1]) {
        const f=rings[index].frame,origin=f.point.clone().addScaledVector(f.up,-2.5);
        const hit=world.castShape(origin,{x:0,y:0,z:0,w:1},f.up,new R.Ball(.05),0,4,true);
        assert.ok(hit&&hit.time_of_impact<2.6,'shared ring has a physical gap');
      }
      // Include actual enlarged pillar/crossbeam envelopes in the clearance check.
      for(const support of supports)for(const beam of support.beams.slice(0,3)) {
        const d=beam.b.clone().sub(beam.a),q=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.clone().normalize());
        world.createCollider(R.ColliderDesc.cuboid(beam.radius,d.length()/2,beam.radius)
          .setTranslation(...beam.a.clone().add(beam.b).multiplyScalar(.5).toArray()).setRotation(q));
      }
      world.step();
      for(let i=0;i<3600;i++) {
        const u=(i+.31)/3600,f=coasterFrame(u),center=f.point.clone().addScaledVector(f.up,.8);
        assert.ok(!world.intersectionWithShape(center,f.rotation,new R.Cuboid(1.5,.5,.95)),`car intersects sample at ${u}`);
        assert.ok(!world.intersectionWithShape(f.point.clone().addScaledVector(f.up,2.2),f.rotation,new R.Ball(.2)),`head intersects sample at ${u}`);
        for(const mode of ['chase','comfort','first-person']) {
          const pose=coasterRidePose(u,mode),a=new Vector3(...pose.cameraPosition),b=new Vector3(...pose.cameraTarget),d=b.sub(a),length=d.length();
          const hit=world.castRay(new R.Ray(a,d.normalize()),mode==='first-person'?2:length,true);
          assert.ok(!hit,`${mode} sample obstruction at ${u}, distance ${hit?.timeOfImpact}`);
        }
      }
      t.diagnostic(JSON.stringify({lod:detailed?'near':'far',sampleSupportGroups:supports.length,contactTriangles:contact.indices.length/3,
        contactBytes:contact.vertices.byteLength+contact.indices.byteLength,surfaceErrorM:surfaceError,rideSamples:3600}));
    } finally {world.free();parts.forEach(g=>g.dispose());material.dispose();}
  }
});
