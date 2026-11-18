import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { buildAlphaExchangeGeometry } from './WorldAlphaExchangeGeometry.ts';
import { playerSupport,followPlayerGround,compensatePlayerSlopeGravity,clearPlayerSlopeGravity } from './player-ground.ts';
import { createPlayerClearance,sweptPlayerVelocity,playerVelocityChange } from './player-motion.ts';

import { EXCHANGE_PLAY_STATIONS, EXCHANGE_ARCHIVE_DRAWERS } from './alpha-exchange-play-layout.ts';
import { exchangeWorld, ALPHA_EXCHANGE_ORIGIN } from './alpha-exchange-layout.ts';
import { cancelExchangeBodyAction } from './alpha-exchange-motion.ts';
import { canRequestExchangeArchiveTicket, requestExchangeArchiveTicket, canRequestExchangePlay, requestExchangePlay, useExchangePlay } from './alpha-exchange-play.ts';
import { registerExchangeActivity } from './alpha-exchange-activity.ts';
import { createActorActivities } from './actor-activities.ts';
import { interactionVisible } from './interaction-offer.ts';
import { pickupGroundRoute } from './pickup-approach.ts';
import { PLAYER_RADIUS, PLAYER_HALF_HEIGHT } from './actor-physics.ts';
import { useWorldStore } from './store.ts';
import { useAlphaExchange } from './alpha-exchange-state.ts';
import { exchangeArchiveCatalog } from './alpha-exchange-data.ts';

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

test('exchange bell and four archive drawers accept open aisles and reject obstructed diagonal approaches', () => {
  const world = new R.World({ x: 0, y: -12.5, z: 0 });
  const scene = buildAlphaExchangeGeometry();
  const registry = createActorActivities(), release = registerExchangeActivity(registry);
  try {
    for (const [kind, mesh] of Object.entries(scene.colliders)) {
      const fixed = world.createRigidBody(R.RigidBodyDesc.fixed());
      fixed.userData = { [kind]: true };
      world.createCollider(R.ColliderDesc.trimesh(mesh.vertices, mesh.indices, mesh.flags), fixed);
    }
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic().lockRotations());
    const capsule = new R.Capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS);
    world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS), body);
    world.step();
    const local = point => point.map((value, i) => value - ALPHA_EXCHANGE_ORIGIN[i]);
    const groundRoute = (from, to, limit) => {
      const end = pickupGroundRoute(world, R, body, local(from), local(to), limit);
      return end && exchangeWorld(end);
    };
    useWorldStore.setState({ paused: false });
    const history = [2020, 2021, 2022, 2023].flatMap(year => Array.from({ length: 20 }, (_, day) => ({
      date: year + '-01-' + String(day + 1).padStart(2, '0'), value: 100 + day,
    })));
    useAlphaExchange.setState({ phase: 'open', history });
    const catalog = exchangeArchiveCatalog(history);
    const stations = [EXCHANGE_PLAY_STATIONS.bell, ...EXCHANGE_ARCHIVE_DRAWERS];
    const obstructedDegrees = [190, 190, 350, 190, 350];
    for (const [index, station] of stations.entries()) {
      const isBell = index === 0, distance = isBell ? 1.04 : .6;
      useExchangePlay.setState({ round: isBell ? { phase: 'sealed' } : null, catalog });
      for (const [degrees, reachable] of [[90, true], [obstructedDegrees[index], false]]) {
        const angle = degrees * Math.PI / 180;
        const [x, y, z] = station.stand;
        const point = { x: x + distance * Math.cos(angle), y: y + PLAYER_HALF_HEIGHT + PLAYER_RADIUS + .001,
          z: z + distance * Math.sin(angle) };
        assert.ok(playerSupport(world, R, body, point, true)?.grounded);
        assert.equal(world.intersectionWithShape(point, body.rotation(), capsule, undefined, undefined, undefined, body), null);
        assert.ok(interactionVisible(world, R, body, point, station.stand));
        const position = exchangeWorld([point.x, point.y, point.z]);
        registry.sync({ position, grounded: true, available: true, yaw: station.yaw, groundRoute });
        assert.equal(!!groundRoute(position, exchangeWorld(station.stand), 1.1), reachable);
        if (isBell) {
          assert.equal(canRequestExchangePlay('bell'), reachable, 'bell prompt');
          assert.equal(requestExchangePlay('bell'), reachable, 'bell activation');
        } else {
          const ticket = catalog[index].id;
          assert.equal(canRequestExchangeArchiveTicket(ticket), reachable, ticket + ' prompt');
          assert.equal(requestExchangeArchiveTicket(ticket), reachable, ticket + ' activation');
        }
        cancelExchangeBodyAction();
      }
    }
  } finally {
    release();
    world.free();
    for (const key of ['body', 'faces', 'glass']) scene[key]?.dispose();
  }
});
