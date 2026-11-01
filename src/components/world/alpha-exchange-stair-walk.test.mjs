import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { buildAlphaExchangeGeometry } from './WorldAlphaExchangeGeometry.ts';
import { playerSupport,followPlayerGround,compensatePlayerSlopeGravity,clearPlayerSlopeGravity } from './player-ground.ts';
import { createPlayerClearance,sweptPlayerVelocity,playerVelocityChange } from './player-motion.ts';

await R.init();
test('production capsule walks the actual east treads uphill and downhill without a jump',()=>{
  const g=buildAlphaExchangeGeometry();
  try {
    for(const direction of [-1,1])for(const offset of [-.55,.55]) {
      const w=new R.World({x:0,y:-12.5,z:0});w.timestep=1/60;
      for(const [kind,m]of Object.entries(g.colliders)) {
        const fixed=w.createRigidBody(R.RigidBodyDesc.fixed());fixed.userData={[kind]:true};
        w.createCollider(R.ColliderDesc.trimesh(m.vertices,m.indices,m.flags).setFriction(.9),fixed);
      }
      const ascending=direction<0,start=ascending?-10.2:-30.6,finish=ascending?-30.6:-10.2;
      const body=w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(15.7+offset,(ascending?.45:5.2)+.88,start)
        .lockRotations().setLinearDamping(.2).setCcdEnabled(true).setSoftCcdPrediction(.1));
      w.createCollider(R.ColliderDesc.capsule(.48,.34).setMass(72).setFriction(0).setFrictionCombineRule(R.CoefficientCombineRule.Min),body);
      const guard=createPlayerClearance(w);w.step();
      const tick=(speed=0)=>{
        const s=playerSupport(w,R,body),v=body.linvel(),change=playerVelocityChange(v,{x:0,y:0,z:direction*speed},1/60,!!s?.grounded);
        compensatePlayerSlopeGravity(w,body,s,1/60,false);
        body.applyImpulse({x:change.x*body.mass(),y:0,z:change.z*body.mass()},true);
        body.setLinvel(sweptPlayerVelocity(guard,body,body.linvel(),1/60,R.QueryFilterFlags.EXCLUDE_SENSORS),true);
        followPlayerGround(w,R,body,body.linvel(),1/60,false);w.step();clearPlayerSlopeGravity(body);
      };
      try {
        for(let i=0;i<45;i++)tick();
        let arrived=false,longestAir=0,air=0;
        for(let i=0;i<900;i++) {
          const remaining=(finish-body.translation().z)*direction;
          if(remaining<.08){arrived=true;break;}
          tick(Math.min(3.6,remaining*4));
          air=playerSupport(w,R,body)?.grounded?0:air+1;longestAir=Math.max(longestAir,air);
        }
        assert.ok(arrived,JSON.stringify({direction,offset,position:body.translation()}));
        assert.ok(longestAir<8,`stair lost contact for ${longestAir} frames`);
        for(let i=0;i<60;i++)tick();
        assert.ok(playerSupport(w,R,body)?.grounded);
        assert.ok(Math.abs(body.translation().y-(ascending?5.2:.45)-.82)<.02);
      } finally {w.removeCharacterController(guard);w.free();}
    }
  } finally {g.body.dispose();g.glass.dispose();}
});
