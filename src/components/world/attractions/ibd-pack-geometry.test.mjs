import test from 'node:test';
import assert from 'node:assert/strict';
import { DoubleSide, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { buildIbdPack,buildIbdPackParts,buildIbdPackShell } from './ibd-pack-geometry.ts';
import { IBD_PACK_SLOTS,IBD_PACK_SAMPLE_DIMENSIONS,IBD_PACK_INSPECTION,ibdPackInspectAnchors,ibdPackTransferPose } from './ibd-pack-layout.ts';
const triangles=g=>g.index.count/3,near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const material=new MeshBasicMaterial({side:DoubleSide});
function hit(g,origin,direction,at=[0,0,0]){
  const mesh=new Mesh(g,material);mesh.position.set(...at);mesh.updateMatrixWorld(true);
  return new Raycaster(new Vector3(...origin),new Vector3(...direction)).intersectObject(mesh,false)[0];
}
test('separate parts retain the crate transport envelope and finite indexed material geometry',()=>{
  for(const spec of ['M6','M8']){
    const parts=buildIbdPackParts(4,spec),full=buildIbdPack(4,spec),shell=buildIbdPackShell();
    try{
      const all=[parts.shell,parts.sample,parts.tray,parts.caliperFixed,parts.caliperJaw,parts.rigMast,parts.rigBoom,parts.rigTether];
      for(const g of all){
        for(const name of ['position','normal','color','aMat','aSuv'])assert.ok(g.getAttribute(name));
        for(const a of Object.values(g.attributes))for(const v of a.array)assert.ok(Number.isFinite(v));
        const p=g.attributes.position,a=new Vector3(),b=new Vector3(),c=new Vector3();
        for(let i=0;i<g.index.count;i+=3){
          a.fromBufferAttribute(p,g.index.getX(i));b.fromBufferAttribute(p,g.index.getX(i+1));c.fromBufferAttribute(p,g.index.getX(i+2));
          assert.ok(b.sub(a).cross(c.sub(a)).lengthSq()>1e-16,'no collapsed mechanical face');
        }
      }
      const box=full.boundingBox;
      assert.ok(box.min.x>=-1.5001&&box.max.x<=1.5001&&box.min.z>=-1.3501&&box.max.z<=1.3501);
      assert.ok(box.min.y>=-1.0101&&box.max.y<=1.0451,'unchanged rolling crate and closed-lid height');
      assert.equal(triangles(full),triangles(shell)+4*triangles(parts.sample),'legacy complete pack reuses the separate pieces');
      assert.ok(all.reduce((n,g)=>n+triangles(g),0)<5000);
      console.log(JSON.stringify({spec,triangles:Object.fromEntries(Object.entries(parts).filter(([,v])=>v?.isBufferGeometry).map(([k,g])=>[k,triangles(g)])),fullPack:triangles(full)}));
    }finally{parts.dispose();full.dispose();shell.dispose();}
  }
});
test('all four slots remain independent and a short pack exposes a genuinely empty slot',()=>{
  const parts=buildIbdPackParts(3,'M8'),full=buildIbdPack(3,'M8');
  try{
    assert.deepEqual(parts.slots.map(s=>s.at),IBD_PACK_SLOTS.map(s=>s.at));
    assert.deepEqual(parts.slots.map(s=>s.occupied),[true,true,true,false]);
    for(const s of parts.slots){
      const mesh=hit(full,[s.at[0],2,s.at[2]],[0,-1,0]);
      assert.ok(mesh);near(mesh.point.y,s.occupied?s.at[1]+.56:.33);
    }
    assert.equal(triangles(full),triangles(parts.shell)+3*triangles(parts.sample));
  }finally{parts.dispose();full.dispose();}
});
test('M6/M8 shaft diameters and grip anchors come from actual visible surfaces',()=>{
  for(const spec of ['M6','M8']){
    const parts=buildIbdPackParts(4,spec),d=IBD_PACK_SAMPLE_DIMENSIONS[spec],a=ibdPackInspectAnchors(spec,d.diameter);
    try{
      const left=hit(parts.sample,[-1,.23,0],[1,0,0]),right=hit(parts.sample,[1,.23,0],[-1,0,0]);
      near(right.point.x-left.point.x,a.diameter);
      const grip=hit(parts.sample,[0,.065,1],[0,0,-1]);near(grip.point.z,a.leftGrip[2]);
      near(a.leftGrip[1],grip.point.y);near(parts.sample.boundingBox.max.y,d.height);
    }finally{parts.dispose();}
  }
});
test('fixed and sliding anvils form the actual adjustable gap; the right palm contacts the thumb tab',()=>{
  const parts=buildIbdPackParts(4,'M8');
  try{
    for(const gap of [.18,.28,.46,.54]){
      const a=ibdPackInspectAnchors('M8',gap),fixed=hit(parts.caliperFixed,[.3,.17,0],[-1,0,0],a.caliperFixedAt.map((v,i)=>i===2?0:v));
      const moving=hit(parts.caliperJaw,[-1,.17,0],[1,0,0],a.caliperJawAt.map((v,i)=>i===2?0:v));
      near(fixed.point.x,a.fixedContact[0]);near(moving.point.x,a.movingContact[0]);near(moving.point.x-fixed.point.x,gap);
      const palm=hit(parts.caliperJaw,[0,.18,1],[0,0,-1]);near(palm.point.z,.29);
    }
    assert.ok(Math.abs(ibdPackInspectAnchors('M8',.28).gap-.46)>.1,'an undersized setting cannot masquerade as correct geometry');
  }finally{parts.dispose();}
});
test('tray and sample move continuously above the crate before lowering outside its front wall',()=>{
  for(const spec of ['M6','M8']){
    const parts=buildIbdPackParts(4,spec);
    try{
      for(const slot of IBD_PACK_SLOTS){
        assert.deepEqual(ibdPackTransferPose(slot.index,spec,0).at,slot.at);
        const final=ibdPackTransferPose(slot.index,spec,1).at,target=ibdPackInspectAnchors(spec,.54).sampleAt;
        final.forEach((v,i)=>near(v,target[i]));let previous=slot.at;
        for(let i=1;i<=800;i++){
          const progress=i<=400?i/400:2-i/400,pose=ibdPackTransferPose(slot.index,spec,progress),at=pose.at;
          assert.ok(Math.hypot(...at.map((v,k)=>v-previous[k]))<.025,'no slot-to-hand teleport');previous=at;
          if(pose.stage==='traverse')assert.ok(parts.tray.boundingBox.min.y+at[1]>1.045,'tray clears the rim during horizontal travel');
          if(pose.stage==='lower')assert.ok(parts.tray.boundingBox.min.z+at[2]>1.28,'lower outside the closed front wall');
        }
        previous.forEach((v,i)=>near(v,slot.at[i]));
      }
    }finally{parts.dispose();}
  }
});
test('the fork has a real foam channel and the presented tray leaves full standing-body clearance',()=>{
  const parts=buildIbdPackParts(4,'M8');
  try{
    for(const s of IBD_PACK_SLOTS){
      const floor=hit(parts.shell,[s.at[0]-.08,1,s.at[2]],[0,-1,0]);near(floor.point.y,.33);
      assert.ok(parts.tray.boundingBox.min.y+s.at[1]>.33,'fork fits above the crate floor');
    }
    near(parts.tray.boundingBox.max.z+IBD_PACK_INSPECTION.presentZ,2.13);
    assert.ok(IBD_PACK_INSPECTION.stand[2]-.34>parts.tray.boundingBox.max.z+IBD_PACK_INSPECTION.presentZ);
    for(const spec of ['M6','M8'])for(const gap of [.18,.28,.46,.54]){
      const a=ibdPackInspectAnchors(spec,gap);
      for(const p of [a.leftTarget,a.rightTarget]){
        assert.ok(Math.hypot(p[0]-a.stand[0],p[2]-a.stand[2])<.5);
        assert.ok(p[1]-a.stand[1]>=.95&&p[1]-a.stand[1]<=1.2);
      }
    }
  }finally{parts.dispose();}
});
test('the two-part caliper can stow below the existing closed lid',()=>{
  const parts=buildIbdPackParts(4,'M8');
  try{
    const box=parts.caliperFixed.boundingBox.clone().union(parts.caliperJaw.boundingBox.clone().translate(new Vector3(IBD_PACK_INSPECTION.gapMin,0,0)));
    box.applyMatrix4(new Matrix4().makeRotationY(IBD_PACK_INSPECTION.stowedToolYaw).setPosition(new Vector3(...IBD_PACK_INSPECTION.stowedToolAt)));
    assert.ok(box.min.x>=-1.35&&box.max.x<=1.35&&box.min.z>=-1.25&&box.max.z<=1.25);
    assert.ok(box.max.y<1.02,'stowed caliper clears the unchanged closed lid');
  }finally{parts.dispose();}
});
test('the representative yard plus two complete inspection rigs retain the original 70k budget',async()=>{
  const y=await import('./ibd-yard-geometry.ts'),parts=buildIbdPackParts(4,'M8');
  const all=[y.buildIbdStatic().geometry,y.buildIbdCoil(false),y.buildIbdCoil(true,2),y.buildIbdPack(4,'M8'),y.buildIbdPack(3,'M8'),
    y.buildIbdLid(),y.buildIbdLid(),y.buildIbdCrane(),y.buildIbdHook(),y.buildIbdCables(),y.buildIbdShutter(),y.buildIbdTorch(),y.buildIbdPack(4,'M6')];
  try{
    const rigs=2*[parts.tray,parts.caliperFixed,parts.caliperJaw,parts.rigMast,parts.rigBoom,parts.rigTether].reduce((n,g)=>n+triangles(g),0);
    const total=all.reduce((n,g)=>n+triangles(g),0)+rigs+24; // open 12-sided inspection light shaft
    assert.ok(total<70000,`${total} representative triangles including both rigs`);
    console.log(JSON.stringify({representativeWithTwoRigs:total,budget:70000}));
  }finally{all.forEach(g=>g.dispose());parts.dispose();}
});
test.after(()=>material.dispose());
