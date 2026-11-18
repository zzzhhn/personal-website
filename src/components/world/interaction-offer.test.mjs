import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { createInteractionApproach, createInteractionOfferResolver } from './interaction-offer.ts';
import { findPickupStand, pickupStandingRing } from './pickup-approach.ts';
import { PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from './actor-physics.ts';
import { registerInteractable, nearestInteractable, reachableInteractables, publishInteractionPrompt, resolvePromptTarget } from './WorldInteract.ts';

const H = PLAYER_HALF_HEIGHT + PLAYER_RADIUS;
const approach = {
  target: () => [0, 1.15, 0],
  ready: p => Math.hypot(p[0], p[2]) <= .6 && Math.abs(p[1] - H) < .05,
  candidates: p => pickupStandingRing([0, 1.15, 0], p, .5),
};
const item = { id: 'offer-lamp', position: [0, 1.15, 0], radius: 1.8, kind: 'exhibit',
  label: { en: 'Take lamp', zh: '取灯' }, approach, onInteract() {} };
const context = () => ({ position: [1.6, H, 0], now: 0, available: () => true,
  visible: () => true, findStand: () => [.5, H, 0] });

test('repeated E preserves the selected approach; interruption, obstruction and expiry never dispatch it', () => {
  for(const stop of ['arrive','cancel','obstruction','expiry','unregister','airborne']) {
    const driver=createInteractionApproach();
    let valid=true,count=0,requests=0;
    const lamp={...item,enabled:()=>valid,onInteract:()=>count++};
    const select=()=>driver.request(lamp,()=>{requests++;return {item:lamp,stand:[.5,H,0]};});
    assert.ok(select()); assert.ok(select()); assert.equal(requests,1);
    if(stop==='cancel')driver.cancel();
    if(stop==='unregister')valid=false;
    for(let frame=0;frame<240;frame++){
      const motion=driver.step(1/60,stop==='expiry'?[1.6,H,0]:[.5,H,0],Math.PI,0,stop!=='airborne',()=>stop!=='obstruction');
      motion?.arrived?.onInteract();
    }
    assert.equal(count,stop==='arrive'?1:0,stop);assert.equal(driver.active,false);
  }
});

test('a visible nearby object without a safe stance is absent from both E and Q selection', () => {
  const resolver = createInteractionOfferResolver(), ctx = context(), release = registerInteractable(item);
  ctx.findStand = () => null;
  try {
    assert.equal(nearestInteractable(...ctx.position, i => !!resolver.resolve(i, ctx)), null);
    assert.deepEqual(reachableInteractables(), []);
    assert.equal(resolver.resolve(item, ctx, true), null);
    ctx.now = .13; ctx.findStand = () => [.5, H, 0];
    assert.equal(nearestInteractable(...ctx.position, i => !!resolver.resolve(i, ctx)).item, item);
    assert.deepEqual(reachableInteractables(), [item]);
    assert.deepEqual(resolver.resolve(item, ctx, true).stand, [.5, H, 0]);
  } finally { release(); }
});

test('prompt probes are throttled, while E rechecks a newly blocked route immediately', () => {
  const resolver = createInteractionOfferResolver(), ctx = context(); let calls = 0, blocked = false;
  ctx.findStand = () => { calls++; return blocked ? null : [.5, H, 0]; };
  for (let i = 0; i < 7; i++) { ctx.now = i / 60; assert.ok(resolver.resolve(item, ctx)); }
  assert.equal(calls, 1);
  blocked = true;
  assert.equal(resolver.resolve(item, ctx, true), null);
  assert.equal(calls, 2);
  assert.equal(resolver.resolve(item, ctx), null);
});

test('actor locks, enabled state and sight cannot reuse a positive cached offer', () => {
  for (const gate of ['available', 'visible', 'enabled']) {
    const resolver = createInteractionOfferResolver(), ctx = context(); let allowed = true;
    const target = { ...item, enabled: () => gate !== 'enabled' || allowed };
    if (gate !== 'enabled') ctx[gate] = () => allowed;
    assert.ok(resolver.resolve(target, ctx));
    allowed = false;
    assert.equal(resolver.resolve(target, ctx), null);
    assert.equal(resolver.resolve(target, ctx, true), null);
  }
});

test('moving player, moving target, changed stance rule and reset invalidate stance probes', () => {
  const resolver = createInteractionOfferResolver(), ctx = context(); let calls = 0, target = [0, 1.15, 0];
  const moving = { ...item, approach: { ...approach, target: () => target } };
  ctx.findStand = () => { calls++; return [.5, H, 0]; };
  resolver.resolve(moving, ctx);
  ctx.position = [1.5, H, 0]; resolver.resolve(moving, ctx);
  target = [.1, 1.15, 0]; resolver.resolve(moving, ctx);
  moving.approach = { ...moving.approach, ready: () => false }; resolver.resolve(moving, ctx);
  resolver.clear(); resolver.resolve(moving, ctx);
  ctx.now = .13; resolver.resolve(moving, ctx);
  assert.equal(calls, 6);
});

test('live adapter getters do not accidentally run a full route search every physics frame', () => {
  const resolver = createInteractionOfferResolver(), ctx = context(); let calls = 0;
  const dynamic = { ...item, get approach() { return { ...approach }; } };
  ctx.findStand = () => { calls++; return [.5, H, 0]; };
  for (let i = 0; i < 7; i++) { ctx.now = i / 60; assert.ok(resolver.resolve(dynamic, ctx)); }
  assert.equal(calls, 1);
});

test('invalid positions, distant storeys and unready adapter stances never produce E', () => {
  for (const position of [[NaN, H, 0], [5, H, 0], [0, H + 4, 0]]) {
    const ctx = context(); ctx.position = position;
    assert.equal(createInteractionOfferResolver().resolve(item, ctx), null);
  }
  for (const stand of [[NaN, H, 0], [2, H, 0]]) {
    const ctx = context(); ctx.findStand = () => stand;
    assert.equal(createInteractionOfferResolver().resolve(item, ctx), null);
  }
});

test('ordinary signs and booths do not incur stance searches', () => {
  const ctx = context(); ctx.findStand = () => assert.fail('unnecessary physics query');
  assert.deepEqual(createInteractionOfferResolver().resolve({ ...item, approach: undefined }, ctx).stand, null);
});

await R.init();
test('real Rapier floor gap hides pickup despite unobstructed line of sight; supported floor restores it', () => {
  for (const gap of [true, false]) {
    const world = new R.World({ x: 0, y: -9.81, z: 0 });
    try {
      if (gap) {
        world.createCollider(R.ColliderDesc.cuboid(.4, .1, 2).setTranslation(1.75, -.1, 0));
        world.createCollider(R.ColliderDesc.cuboid(.35, .1, 2).setTranslation(.25, -.1, 0));
      } else world.createCollider(R.ColliderDesc.cuboid(4, .1, 4).setTranslation(0, -.1, 0));
      const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(1.6, H + .001, 0).lockRotations());
      world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS), body);
      world.step();
      const p = body.translation(), ctx = context(); ctx.position = [p.x, p.y, p.z];
      ctx.findStand = a => findPickupStand(world, R, body, ctx.position, a);
      const resolver = createInteractionOfferResolver();
      assert.equal(!!resolver.resolve(item, ctx), !gap);
      assert.equal(!!resolver.resolve(item, ctx, true), !gap);
    } finally { world.free(); }
  }
});

test('a changed command or a newly mounted rack cannot finish an older approach', () => {
  for (const change of ['command', 'replacement']) {
    const rack = {...item, label:{en:'Take',zh:'领取'}};
    const release = registerInteractable(rack);
    let cleanup;
    try {
      const chosen = nearestInteractable(1.2,H,0).item;
      const prompt = publishInteractionPrompt(chosen, null);
      const driver = createInteractionApproach();
      driver.request(rack, () => ({item:rack,stand:[.5,H,0]}), () => resolvePromptTarget(prompt) === rack);
      if (change === 'command') rack.label = {en:'Return',zh:'归还'};
      else cleanup = registerInteractable({...rack});
      assert.equal(driver.step(1/60,[.5,H,0],Math.PI,0,true,()=>true),null);
      assert.equal(driver.active,false);
    } finally {cleanup?.(); release();}
  }
});
