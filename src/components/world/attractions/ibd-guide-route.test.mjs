import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { Euler, Quaternion } from 'three';
import { buildIbdStatic } from './ibd-yard-geometry.ts';
import { createIbdYardGame, requestIbdYardAction, finishIbdYardAction, yardActions } from './ibd-yard-game.ts';
import { ibdStation, IBD_SLOTS } from './ibd-yard-layout.ts';
import { ibdCargoPose } from './ibd-yard-motion.ts';
import { ibdGuideRoute, ibdGuideStep } from './ibd-yard-guide.ts';
import { ibdRouteBetween } from './ibd-guide-route.ts';
import { playerVerdict } from './ibd-test-player.mjs';
await RAPIER.init();
const identity = { x: 0, y: 0, z: 0, w: 1 }, capsule = new RAPIER.Capsule(.48, .34);
function act(game, action) {
  const actor = { active: true, local: ibdStation(action.station, game.core.moved).at };
  const next = requestIbdYardAction(game, playerVerdict(game, action), actor);
  return next.pending ? finishIbdYardAction(next, next.pending.token, actor) : next;
}

test('all batch routes sweep a player capsule clear of real guards, rollers, controls and current cargo', () => {
  const data = buildIbdStatic(), world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  try {
    for (const s of data.solids) world.createCollider(RAPIER.ColliderDesc.cuboid(...s.size.map(n => n / 2))
      .setTranslation(...s.at).setRotation(new Quaternion().setFromEuler(new Euler(...(s.rotation ?? [0, 0, 0])))));
    world.createCollider(RAPIER.ColliderDesc.trimesh(data.walkSurface.vertices, data.walkSurface.indices));
    const cargo = IBD_SLOTS.map(slot => world.createCollider(RAPIER.ColliderDesc.cuboid(...(slot.startsWith('coil') ? [2, 2, 1.4] : [1.4, .55, 1.3]))));
    const check = (game, route, label) => {
      for (let i = 0; i < IBD_SLOTS.length; i++) {
        const slot = IBD_SLOTS[i], pose = ibdCargoPose(game, slot, 0), [x, y, z] = pose.at;
        cargo[i].setTranslation({ x, y: y + (slot.startsWith('coil') ? 0 : .45), z });
        cargo[i].setRotation(new Quaternion().setFromEuler(new Euler(0, pose.yaw, 0)));
      }
      world.step();
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1], b = route[i];
        const hit = world.castShape({ x: a[0], y: a[1] + .86, z: a[2] }, identity,
          { x: b[0] - a[0], y: b[1] - a[1], z: b[2] - a[2] }, capsule, 0, 1, true);
        assert.ok(!hit, `${label}: blocked ${a} -> ${b} by ${JSON.stringify(hit?.collider.translation())}`);
      }
    };
    for (let index = 0; index < 4; index++) {
      let game = createIbdYardGame(index);
      for (let i = 0; i < 60 && !game.released; i++) {
        const step = ibdGuideStep(game);
        check(game, ibdGuideRoute(game), `${index}/${game.completedAction?.station ?? 'entry'} -> ${step.action.station}`);
        game = act(game, step.action);
      }
      assert.ok(game.released);
      game = act(game, yardActions(game, 'dispatch')[0]);
      check(game, ibdGuideRoute(game), 'next batch from dispatch');
    }
    let game = act(act(createIbdYardGame(), { kind: 'brief', station: 'manifest' }), { kind: 'kit', station: 'kit' });
    game = act(game, yardActions(game, 'gallery-front')[0]);
    check(game, ibdGuideRoute(game), 'free-exploration gallery return');
    for (const id of ['gallery-front', 'gallery-rear']) check(game, ibdRouteBetween(id, 'manifest', []), `${id} ramp exit`);
  } finally { world.free(); data.geometry.dispose(); }
});

test('neighboring cartons share the clear standing gap and never send the player back to the central entrance', () => {
  const route = ibdRouteBetween('parts-a', 'parts-b', []);
  const length = route.slice(1).reduce((sum, p, i) => sum + Math.hypot(...p.map((v, axis) => v - route[i][axis])), 0);
  assert.equal(length, 8);
  assert.ok(route.every(p => p[2] === -9.5));
});
