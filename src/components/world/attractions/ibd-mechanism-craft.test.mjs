import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { Builder } from '../WorldStreetGeometry.ts';
import { addIbdRollerFrame } from './ibd-craft-geometry.ts';
import { buildIbdStatic, buildIbdCrane, buildIbdHook, buildIbdCables, buildIbdTools, buildIbdShutter } from './ibd-yard-geometry.ts';
const digest = a => createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');

function inspect(geometry, run) {
  const material = new MeshBasicMaterial({side:DoubleSide}), mesh = new Mesh(geometry,material);
  const hit = (from,direction,far=20) => new Raycaster(new Vector3(...from),new Vector3(...direction),0,far).intersectObject(mesh)[0];
  try { run(hit,geometry); } finally { material.dispose(); geometry.dispose(); }
}

test('mechanism visual upgrade preserves all exact solids, gallery and roller contact bytes', () => {
  const data=buildIbdStatic();
  try {
    assert.equal(data.solids.length,256);
    assert.equal(createHash('sha256').update(JSON.stringify(data.solids)).digest('hex'),'ad00d1525a6e8602925b1b43253f441332a69503a7a6f013291b00ca73a9a56e');
    assert.equal(digest(data.walkSurface.vertices),'a7a86e1c42de0df4951a7a839a08368a648436fd77b81c04a34cffb40fb54ee2');
    assert.equal(digest(data.walkSurface.indices),'6d27b54f865dd07c848f77a54e2accce001e770a22ea968ffc51fd473d33f284');
    const p=data.geometry.attributes.position, role=data.geometry.attributes.aMat, uv=data.geometry.attributes.aSuv;
    let tread=0;
    for(let i=0;i<p.count;i++)if(role.getW(i)===-4 && p.getX(i)<0){
      tread++;
      assert.equal(uv.getX(i),p.getX(i)); assert.equal(uv.getY(i),p.getZ(i));
      assert.ok(p.getY(i)>=.099 && p.getY(i)<=4.101,'tread treatment escaped the original gallery top');
    }
    assert.equal(tread,20,'five existing walk faces, without a new surface overlay');
  } finally { data.geometry.dispose(); }
});

test('long and short roller frames stand on the floor and stay under the original side rails', () => {
  for(const[start,end]of[[-8.2,-3],[5,7]]) {
    const b=new Builder();addIbdRollerFrame(b,10,start,end);
    inspect(b.build(),(hit,g)=>{
      for(const x of[8.3,11.7])for(const z of[start+.18,end-.18]) {
        const foot=hit([x,0,z],[0,1,0],.2);
        assert.ok(foot && Math.abs(foot.point.y-.1)<1e-6,'support foot floats above its floor');
        const leg=hit([x-.3,.3,z],[1,0,0],.6);
        assert.ok(leg,'folded side rail lacks a load-bearing leg');
      }
      assert.ok(g.boundingBox.min.x>=8.22-1e-6 && g.boundingBox.max.x<=11.78+1e-6,'new support invades the side approach');
      assert.ok(g.boundingBox.min.z>=start-.13 && g.boundingBox.max.z<=end+.13,'support enters the crosswalk');
      assert.equal(hit([10,.3,start-.3],[0,0,1],end-start+.6),undefined,'new transverse support closes the space under the rollers');
      for(let z=start;z<=end;z+=.8)for(const side of[-1,1]){
        const shaft=hit([10+side*1.6,1,z],[0,-1,0],.5);
        assert.ok(shaft && shaft.point.y>.68,'barrel end lacks an axle connection to its bearing');
      }
    });
  }
});

test('rolled shutter closes the former slat gaps within its unchanged motion envelope', () => {
  inspect(buildIbdShutter(),(hit,g)=>{
    assert.ok(g.boundingBox.min.x>=-.130001 && g.boundingBox.max.x<=.065001);
    assert.ok(Math.abs(g.boundingBox.min.y+1.61)<1e-6 && Math.abs(g.boundingBox.max.y-1.36)<1e-6);
    for(let row=0;row<11;row++) {
      const joint=hit([-.5,row*.25-1.375,3],[1,0,0],1);
      assert.ok(joint,'a 30 mm daylight stripe remains through the closed shutter');
    }
  });
});

test('mechanisms remain finite, noncollapsed and retain the shared metal attribute path', () => {
  for(const build of[buildIbdCrane,buildIbdHook,buildIbdCables,buildIbdTools,buildIbdShutter]) {
    const g=build();
    try {
      for(const a of Object.values(g.attributes))assert.ok(a.array.every(Number.isFinite));
      const p=g.attributes.position,idx=g.index,a=new Vector3(),edge=new Vector3(),other=new Vector3();
      for(let i=0;i<idx.count;i+=3){
        a.fromBufferAttribute(p,idx.getX(i));edge.fromBufferAttribute(p,idx.getX(i+1)).sub(a);other.fromBufferAttribute(p,idx.getX(i+2)).sub(a);
        assert.ok(edge.cross(other).length()>1e-10,`${build.name} collapsed triangle ${i/3}`);
      }
      assert.equal(g.groups.length,0);
      if(build!==buildIbdShutter)assert.ok(Array.from(g.attributes.aMat.array).some((v,i)=>i%4===3&&v===-2),'bare metal does not reach the runtime material');
    } finally {g.dispose();}
  }
});
