import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useBeforePhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier';
import { BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide, Group, Mesh, SRGBColorSpace, Vector3, type Matrix4 } from 'three';
import { UI } from '../../lib/i18n';
import { PLAYER_CENTER_HEIGHT, rotateVector, yawRotation } from './actor-physics';
import { CAMP_DUMBBELL_REACH, CAMP_TOOL_GRIPS, campDumbbellDrop, campDumbbellGrip, campMissingSignalTime, campPalmTouches, campPropActor, campPropHand, campPushablePrompt, campSuitcaseHandleZ, campSuitcasePull, campSuitcaseTowTarget, campSuitcaseTurn, canReachCampProp, cancelCampPropInteraction, currentCampPropInteraction, holdCampDumbbell, horizontalCampReach, nearestCampToolLane, readCampPropActivity, startCampPropInteraction } from './camp-prop-interactions';
import { bookStack, type Place } from './WorldCampContentLayout';
import { useInteractable } from './WorldInteract';
import { useWorldStore } from './store';
import type { Vec3 } from './types';

type Labels = { en: string; zh: string };
const PALM_CONTACT = .06;
// A shape query can miss at the instant a dumbbell collider is removed or at a stone seam.
// A missing render sample can also span the rig's .22 s blend as it reacquires the grip.
const HELD_SUPPORT_GRACE = .18;
const HELD_PALM_GRACE = .28;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const smooth = (n: number) => { const t = clamp(n, 0, 1); return t * t * (3 - 2 * t); };
const blend = (a: Vec3, b: Vec3, amount: number): Vec3 => [
  a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount,
];
const setPoint = (point: Vec3, x: number, y: number, z: number) => { point[0] = x; point[1] = y; point[2] = z; };
const isActive = (id: string) => currentCampPropInteraction()?.id === id;
const notice = (labels: Labels) => {
  const toast = { ...labels, at: performance.now() };
  useWorldStore.setState({ toast });
  return () => { if (useWorldStore.getState().toast === toast) useWorldStore.setState({ toast: null }); };
};

function useCancelOnUnmount(id: string) {
  useEffect(() => () => { if (isActive(id)) cancelCampPropInteraction('unmounted'); }, [id]);
}

/** Release even when paused physics has already stopped, including a return to camp from Esc. */
export function CampPropSession() {
  useEffect(() => {
    const unsubscribe = useWorldStore.subscribe((state, previous) => {
      const prop = currentCampPropInteraction();
      if (!prop) return;
      const pick = state.interactPick;
      if (state.campReturnRequest !== previous.campReturnRequest) cancelCampPropInteraction('return-to-camp');
      else if (state.paused) cancelCampPropInteraction('paused');
      else if (state.poolInspect || state.activeVehicle || state.seat || state.card || state.clubMode || state.shot) cancelCampPropInteraction('world-mode');
      else if (state.zone !== 'camp') cancelCampPropInteraction('left-camp');
      else if (pick && pick !== previous.interactPick && pick !== prop.id && pick !== prop.keepOnPick) cancelCampPropInteraction('target-switch');
    });
    const hide = () => { if (document.hidden) cancelCampPropInteraction('tab-hidden'); };
    const blur = () => { cancelCampPropInteraction('window-blur'); };
    const qa = new URLSearchParams(window.location.search).get('qa') === '1';
    const debugWindow = window as Window & { __worldCampPropPlay?: typeof readCampPropActivity };
    if (qa) debugWindow.__worldCampPropPlay = readCampPropActivity;
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', hide);
    return () => {
      unsubscribe();
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', hide);
      if (debugWindow.__worldCampPropPlay === readCampPropActivity) delete debugWindow.__worldCampPropPlay;
      cancelCampPropInteraction('unmounted');
    };
  }, []);
  return null;
}

function useCampAction(id: string, position: Vec3, radius: number, label: Labels, enabled: () => boolean, onInteract: () => void) {
  useInteractable({ id, position, radius, kind: 'exhibit', label, enabled, onInteract });
}

function aim(target: Vec3, mode: 'reach' | 'grip', facing: Vec3 | null = target) {
  campPropHand.target = target;
  campPropHand.mode = mode;
  campPropHand.facing = facing;
}

function carryPoint(y: number, forward = .24): Vec3 {
  const [x, py, z] = campPropActor.position;
  const [dx, , dz] = rotateVector([forward, 0, .31], yawRotation(campPropActor.yaw));
  return [x + dx, py + y, z + dz];
}

// C15's authored pull handle, shared by legacy and facility craft assets.
const SUITCASE_GRIP: Vec3 = [-.126, .846, .015];
function bodyGrip(body: RapierRigidBody, local: Vec3): Vec3 {
  const p = body.translation(), [x, y, z] = rotateVector(local, body.rotation());
  return [p.x + x, p.y + y, p.z + z];
}

type PushPhase = 'reach' | 'held' | 'curl' | 'lower' | 'drag';
type PushPlay = {
  phase: PushPhase;
  age: number;
  offGroundFor: number;
  palmMissingFor: number;
  pickup: Vec3;
  grip: Vec3;
  drop?: ReturnType<typeof holdCampDumbbell>;
  drag?: { actor: Vec3 };
};

/** A dumbbell shares one visual and rigid body throughout pick up, curls and release. The case stays
 * dynamic throughout, so a blocked suitcase cannot be pulled through a wall. */
export function useCampPushableInteraction(id: string, home: Place, body: RefObject<RapierRigidBody | null>, resetDisplacement: () => void) {
  const gym = id.startsWith('C13-'), suitcase = id === 'C15', playable = gym || suitcase;
  const key = gym ? `camp-prop-dumbbell-${id.slice(4)}` : 'camp-prop-suitcase';
  const lowerKey = `${key}-lower`;
  const anchor = useMemo(() => [...home.position] as Vec3, [home]);
  const phase = useRef<PushPlay | null>(null);
  const pendingDrop = useRef<(() => boolean) | null>(null);
  const gripFailure = gym ? { en: 'Step closer to the dumbbell', zh: '再靠近一点握住哑铃' }
    : { en: 'Move closer to the suitcase handle', zh: '靠近行李箱拉杆再试' };
  const { rapier, world } = useRapier();
  useCancelOnUnmount(playable ? key : '');

  const reach = gym ? CAMP_DUMBBELL_REACH : .66;
  const localGrip = (b: RapierRigidBody) => {
    if (!gym) return SUITCASE_GRIP;
    const p = b.translation();
    return campDumbbellGrip([p.x, p.y, p.z], b.rotation(), campPropActor.position);
  };
  const pickupTarget = (b: RapierRigidBody) => {
    const grip = localGrip(b), point = bodyGrip(b, grip);
    return canReachCampProp(point, reach) ? { grip, point } : null;
  };
  const begin = () => {
    const b = body.current;
    if (pendingDrop.current || !b || !b.isValid()) return;
    const target = pickupTarget(b);
    if (!target) { notice(gripFailure); return; }
    const { grip, point: pickup } = target;
    startCampPropInteraction({ id: key, anchor, keepOnPick: gym ? lowerKey : undefined, inspect: () => {
      const p = phase.current;
      if (!b.isValid()) return null;
      const t = b.translation(), collider = b.collider(0);
      return {
        phase: p?.phase ?? 'released', age: p?.age ?? 0, offGroundFor: p?.offGroundFor ?? 0, palmMissingFor: p?.palmMissingFor ?? 0,
        bodyX: t.x, bodyY: t.y, bodyZ: t.z, colliderEnabled: collider.isEnabled(), sensor: collider.isSensor(),
        collisionGroups: collider.collisionGroups(), solverGroups: collider.solverGroups(),
      };
    }, release: () => {
      const was = phase.current;
      phase.current = null;
      if (!was || !b.isValid()) return;
      const drop = was.drop;
      if (drop) {
        const restore = () => {
          if (!b.isValid()) return true;
          const pose = campDumbbellDrop(world, b, campPropActor.position, home.position, home.yaw);
          if (!pose) return false;
          drop(pose); resetDisplacement();
          return true;
        };
        // A crowded spot may have no free pose yet. Keep the released weight isolated until it clears.
        if (!restore()) pendingDrop.current = restore;
      } else if (was.phase === 'drag') {
        b.setEnabledRotations(true, true, true, true);
        resetDisplacement();
      }
    } });
    phase.current = { phase: 'reach', age: 0, offGroundFor: 0, palmMissingFor: 0, pickup, grip: [...grip] };
    aim(pickup, 'reach');
  };

  useBeforePhysicsStep(world => {
    if (!playable) return;
    if (pendingDrop.current) {
      if (pendingDrop.current()) pendingDrop.current = null;
      return;
    }
    const b = body.current;
    if (!b) return;
    const p = b.translation(), play = phase.current;
    const grip = play?.grip ?? localGrip(b), currentGrip = bodyGrip(b, grip);
    if (!play) {
      setPoint(anchor, ...campPushablePrompt(currentGrip, campPropActor.position, gym ? .28 : .05));
      return;
    }
    const dt = world.timestep || 1 / 60;
    play.offGroundFor = campMissingSignalTime(play.offGroundFor, campPropActor.grounded, dt);
    if (!campPropActor.available) { cancelCampPropInteraction('actor-unavailable'); return; }
    if (play.offGroundFor > (play.phase === 'reach' ? 0 : HELD_SUPPORT_GRACE)) {
      cancelCampPropInteraction('lost-ground'); return;
    }
    if (play.phase === 'reach' && horizontalCampReach(campPropActor.position, currentGrip) > 1.05
      || gym && horizontalCampReach(campPropActor.position, play.pickup) > 3.1
      || play.phase === 'drag' && horizontalCampReach(campPropActor.position, currentGrip) > 1.28) {
      cancelCampPropInteraction('out-of-reach'); return;
    }
    play.age += dt;
    if (play.phase === 'reach') {
      aim(currentGrip, 'reach');
      if (play.age > 1.6) { cancelCampPropInteraction('grip-timeout'); notice(gripFailure); return; }
      if (play.age < .15 || !campPalmTouches(currentGrip, PALM_CONTACT)) return;
      if (gym) {
        play.pickup = currentGrip;
        play.drop = holdCampDumbbell(b, rapier.RigidBodyType);
        play.phase = 'held';
      } else {
        b.setEnabledRotations(false, true, false, true);
        const a = campPropActor.position;
        play.drag = { actor: [...a] };
        play.phase = 'drag';
      }
      play.age = 0;
      resetDisplacement();
      return;
    }

    // The active controls stay reachable while walking with the suitcase or holding the weight.
    const a = campPropActor.position;
    setPoint(anchor, a[0], a[1], a[2]);
    if (play.drag) {
      const drag = play.drag, q = b.rotation();
      const caseX = p.x - a[0], caseZ = p.z - a[2];
      grip[2] = campSuitcaseHandleZ(caseX, caseZ, q, campPropActor.yaw, grip[2], dt);
      const handTarget = bodyGrip(b, grip);
      aim(handTarget, 'grip', null);
      const actorDx = a[0] - drag.actor[0], actorDz = a[2] - drag.actor[2];
      setPoint(drag.actor, ...a);
      if (!campPropActor.grounded) return;
      play.palmMissingFor = campMissingSignalTime(play.palmMissingFor, campPalmTouches(handTarget, .13), dt);
      if (play.palmMissingFor > .46) {
        cancelCampPropInteraction('lost-palm');
        notice({ en: 'The handle slipped free', zh: '拉杆脱手了' });
        return;
      }
      const target = campSuitcaseTowTarget(caseX, caseZ, campPropActor.yaw);
      const v = b.linvel(), speed = Math.hypot(actorDx, actorDz) / dt;
      const feed = Math.min(1, 2 / Math.max(.001, speed)) / dt;
      b.applyImpulse(campSuitcasePull(target.x - caseX, target.z - caseZ, v.x, v.z, b.mass(), dt, actorDx * feed, actorDz * feed), true);
      const omega = b.angvel(), yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
      b.applyTorqueImpulse({ x: 0, y: campSuitcaseTurn(yaw, caseX, caseZ, omega.y, b.principalInertia().y, dt), z: 0 }, true);
      return;
    }

    play.palmMissingFor = campMissingSignalTime(play.palmMissingFor, !!campPropHand.palm, dt);
    if (play.palmMissingFor > HELD_PALM_GRACE) { cancelCampPropInteraction('lost-palm'); return; }
    const dip = play.phase === 'curl' ? Math.sin(Math.PI * clamp(play.age / .96, 0, 1)) : 0;
    const lifted = carryPoint(-.025 + .41 * dip, .24 + .09 * dip);
    const target = play.phase === 'lower'
      ? blend(lifted, carryPoint(-PLAYER_CENTER_HEIGHT + .135, .52), smooth(play.age / .62))
      : blend(play.pickup, lifted, smooth(play.age / .4));
    aim(target, 'grip', null);
    const palm = campPropHand.palm;
    if (palm) {
      const yaw = yawRotation(campPropActor.yaw);
      const [x, y, z] = rotateVector(grip, yaw);
      const ease = 1 - Math.exp(-24 * dt);
      b.setNextKinematicTranslation({
        x: p.x + (palm[0] - x - p.x) * ease, y: p.y + (palm[1] - y - p.y) * ease, z: p.z + (palm[2] - z - p.z) * ease,
      });
      b.setNextKinematicRotation(yaw);
    }
    if (play.phase === 'lower' && (play.age > 1 || (play.age > .63 && campPalmTouches(target, PALM_CONTACT)))) cancelCampPropInteraction('set-down');
    if (play.phase === 'curl' && play.age >= .96) { play.phase = 'held'; play.age = 1; play.pickup = lifted; }
  });

  // Read phase through an accessor so the HUD changes labels at its normal publish cadence.
  const label = () => !isActive(key) ? (gym ? { en: 'Pick up dumbbell', zh: '拿起哑铃' } : { en: 'Pull suitcase', zh: '拉行李箱' })
    : phase.current?.phase === 'reach' ? { en: 'Cancel reach', zh: '取消取用' }
      : suitcase ? { en: 'Let go', zh: '放开拉杆' } : { en: 'Curl dumbbell', zh: '举哑铃' };
  useInteractable(playable ? {
    id: key, position: anchor, radius: .9, kind: 'exhibit', get label() { return label(); },
    enabled: () => {
      if (isActive(key)) return true;
      if (pendingDrop.current) return false;
      const b = body.current;
      return !!b && b.isValid() && pickupTarget(b) !== null;
    },
    onInteract: () => {
      const p = phase.current;
      if (!isActive(key) || !p) begin();
      else if (p.phase === 'reach' || p.phase === 'drag') cancelCampPropInteraction(p.phase === 'reach' ? 'cancel-reach' : 'let-go');
      else if (p.phase === 'held' && p.age > .40) { p.phase = 'curl'; p.age = 0; p.pickup = carryPoint(-.025); }
    },
  } : null);
  useInteractable(gym ? {
    id: lowerKey, position: anchor, radius: .9, kind: 'exhibit', label: { en: 'Set down dumbbell', zh: '放下哑铃' },
    enabled: () => isActive(key) && (phase.current?.phase === 'held' || phase.current?.phase === 'curl'),
    onInteract: () => { if (phase.current && isActive(key)) { phase.current.phase = 'lower'; phase.current.age = 0; } },
  } : null);
  return () => playable && (isActive(key) || pendingDrop.current !== null);
}

interface ToolPiece { source: Mesh; original: BufferGeometry; wall: BufferGeometry; hand: Mesh }
function toolGeometry(source: BufferGeometry, indices: number[]) {
  const geometry = new BufferGeometry();
  const vertices: number[] = [], remap = new Map<number, number>();
  const compactIndices = indices.map(index => {
    const existing = remap.get(index);
    if (existing !== undefined) return existing;
    const next = vertices.length;
    vertices.push(index); remap.set(index, next);
    return next;
  });
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const { itemSize } = attribute;
    const values = new Float32Array(vertices.length * itemSize);
    for (let i = 0; i < vertices.length; i++) {
      for (let j = 0; j < itemSize; j++) values[i * itemSize + j] = attribute.getComponent(vertices[i], j);
    }
    geometry.setAttribute(name, new BufferAttribute(values, itemSize));
  }
  geometry.setIndex(compactIndices);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** Preserve the pack's three idle material batches. Separate only the selected lane from
 * each batch while the tool is away. Its mounting peg remains part of the fixed wall. */
function takeTool(root: Group, carried: Group, lane: number, centres: readonly number[]) {
  const pieces: ToolPiece[] = [];
  root.updateWorldMatrix(true, true);
  const point = new Vector3(), parentInverse = root.matrixWorld.clone().invert();
  root.traverse(object => {
    const source = object as Mesh;
    if (!source.isMesh || !source.visible) return;
    const original = source.geometry;
    const positions = original.getAttribute('position'), index = original.getIndex();
    if (!positions) return;
    const transform = parentInverse.clone().multiply(source.matrixWorld);
    const kept: number[] = [], taken: number[] = [];
    for (let i = 0, count = index?.count ?? positions.count; i < count; i += 3) {
      const a = index?.getX(i) ?? i, b = index?.getX(i + 1) ?? i + 1, c = index?.getX(i + 2) ?? i + 2;
      point.set((positions.getX(a) + positions.getX(b) + positions.getX(c)) / 3,
        (positions.getY(a) + positions.getY(b) + positions.getY(c)) / 3,
        (positions.getZ(a) + positions.getZ(b) + positions.getZ(c)) / 3).applyMatrix4(transform);
      (nearestCampToolLane(point.z, centres) === lane ? taken : kept).push(a, b, c);
    }
    if (!taken.length) return;
    const wall = toolGeometry(original, kept);
    const hand = new Mesh(toolGeometry(original, taken), source.material);
    hand.name = `camp-carried-tool-${lane}`;
    hand.matrix.copy(transform); hand.matrixAutoUpdate = false;
    hand.castShadow = source.castShadow; hand.receiveShadow = source.receiveShadow;
    hand.userData = { assetId: 'C11', noOcclusionFade: true, shadowDynamic: true };
    pieces.push({ source, original, wall, hand });
  });
  for (const piece of pieces) { piece.source.geometry = piece.wall; carried.add(piece.hand); }
  return pieces;
}

type ToolPlay = { index: number; phase: 'reach' | 'held' | 'return'; age: number; pieces: ToolPiece[]; clearNotice?: () => void };

export function CampToolWall({ frame, centres, children }: { frame: Matrix4; centres: readonly number[]; children: ReactNode }) {
  const wall = useRef<Group>(null), carried = useRef<Group>(null), play = useRef<ToolPlay | null>(null);
  const positions = useMemo(() => centres.map(z => new Vector3(.58, -.04, z).applyMatrix4(frame).toArray() as Vec3), [centres, frame]);
  const grips = useMemo(() => centres.map((z, i) => new Vector3(-.006, CAMP_TOOL_GRIPS[i].y, z).applyMatrix4(frame).toArray() as Vec3), [centres, frame]);
  const inverse = useMemo(() => frame.clone().invert(), [frame]);
  const local = useMemo(() => new Vector3(), []);
  const pegClearance = useMemo(() => new Vector3(1, 0, 0).transformDirection(frame).multiplyScalar(.14), [frame]);
  const actionId = (index: number) => `camp-prop-tool-${index}`;
  const canTake = (index: number) => {
    if (play.current?.index === index) return true;
    const a = campPropActor.position;
    return canReachCampProp(grips[index], .66) && local.fromArray(a).applyMatrix4(inverse).x > .29;
  };
  const act = (index: number) => {
    const p = play.current;
    if (p?.index === index) {
      if (p.phase === 'held') { p.phase = 'return'; p.age = 0; }
      else if (p.phase === 'reach') cancelCampPropInteraction('cancel-reach');
      return;
    }
    if (!canTake(index) || !wall.current || !carried.current) return;
    const obj = carried.current;
    startCampPropInteraction({ id: actionId(index), anchor: positions[index], inspect: () => {
      const p = play.current;
      return p ? { phase: p.phase, age: p.age } : null;
    }, release: () => {
      const previous = play.current;
      play.current = null;
      previous?.clearNotice?.();
      for (const part of previous?.pieces ?? []) {
        part.source.geometry = part.original;
        part.hand.removeFromParent();
        part.hand.geometry.dispose();
        part.wall.dispose();
      }
      obj.position.set(0, 0, 0);
      obj.rotation.set(0, 0, 0);
    } });
    play.current = { index, phase: 'reach', age: 0, pieces: [] };
    aim(grips[index], 'reach');
  };
  useEffect(() => () => { if (play.current) cancelCampPropInteraction('unmounted'); }, []);
  useFrame((_, delta) => {
    const p = play.current, obj = carried.current, root = wall.current;
    if (!p || !obj || !root) return;
    const grip = grips[p.index];
    if (!campPropActor.available) { cancelCampPropInteraction('actor-unavailable'); return; }
    if (!campPropActor.grounded) { cancelCampPropInteraction('lost-ground'); return; }
    if (horizontalCampReach(campPropActor.position, grip) > .99) { cancelCampPropInteraction('out-of-reach'); return; }
    if (p.pieces.some(({ source }) => { for (let n = source.parent; n; n = n.parent) if (n === root) return false; return true; })) {
      cancelCampPropInteraction('tool-visual-replaced'); return;
    }
    p.age += Math.min(delta, .05);
    if (p.phase === 'reach') {
      if (p.age > 1.5) {
        cancelCampPropInteraction('grip-timeout');
        notice({ en: 'Step closer to the tool wall', zh: '再靠近一点取用工具' });
        return;
      }
      if (p.age < .14 || !campPalmTouches(grip, PALM_CONTACT)) return;
      p.pieces = takeTool(root, obj, p.index, centres);
      if (!p.pieces.length) { cancelCampPropInteraction('tool-geometry-missing'); return; }
      p.phase = 'held'; p.age = 0;
      const category = (lang: 'en' | 'zh') => UI.about.techCategories[lang][p.index].items.filter(item => !item.endsWith(':')).join(' · ');
      p.clearNotice = notice({ en: category('en'), zh: category('zh') });
    }
    const palm = campPropHand.palm;
    const lifted = carryPoint(.08, .38);
    const offPeg: Vec3 = [grip[0] + pegClearance.x, grip[1] + .025, grip[2] + pegClearance.z];
    if (p.phase === 'return') {
      const amount = smooth((p.age - .28) / .34);
      aim(p.age < .28 ? blend(lifted, offPeg, smooth(p.age / .28)) : blend(offPeg, grip, amount), 'grip', grip);
      if (p.age > 1.2 || (p.age > .62 && campPalmTouches(grip, PALM_CONTACT))) { cancelCampPropInteraction('tool-returned'); return; }
    } else {
      aim(p.age < .20 ? blend(grip, offPeg, smooth(p.age / .20)) : blend(offPeg, lifted, smooth((p.age - .20) / .33)), 'grip', grip);
    }
    if (palm) {
      const from = local.fromArray(palm).applyMatrix4(inverse);
      obj.position.set(from.x + .006, from.y - CAMP_TOOL_GRIPS[p.index].y, from.z - centres[p.index]);
    }
  });
  return <group matrix={frame} matrixAutoUpdate={false} name="camp-content-C11-tools" userData={{ assetId: 'C11', shadowDynamic: true }}>
    <group ref={wall}>{children}</group>
    <group ref={carried} name="camp-carried-tool" />
    {positions.map((position, index) => <ToolAction key={index} id={actionId(index)} position={position} index={index} play={play}
      enabled={() => canTake(index)} onInteract={() => act(index)} />)}
  </group>;
}

function ToolAction({ id, position, index, play, enabled, onInteract }: {
  id: string; position: Vec3; index: number; play: RefObject<ToolPlay | null>; enabled: () => boolean; onInteract: () => void;
}) {
  useInteractable({ id, position, radius: .75, kind: 'exhibit', enabled, onInteract, get label() {
    const tool = CAMP_TOOL_GRIPS[index], returning = play.current?.index === index;
    return returning ? { en: `Return ${tool.en.toLowerCase()}`, zh: `归位${tool.zh}` }
      : { en: `Take ${tool.en.toLowerCase()}`, zh: `取用${tool.zh}` };
  } });
}

const BOOK_KEY = 'camp-prop-journal';
const BOOK_PAGES = [
  { en: UI.education.school.en, zh: UI.education.school.zh },
  { en: UI.education.degree.en, zh: UI.education.degree.zh },
  { en: `${UI.education.period.en} · ${UI.education.expectedGrad.en}`, zh: `${UI.education.period.zh} · ${UI.education.expectedGrad.zh}` },
];
const BOOK_WIDTH = .236, BOOK_DEPTH = .171;

function makeJournalPaper() {
  const canvas = document.createElement('canvas');
  canvas.width = 384; canvas.height = 278;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4;
  return { canvas, texture };
}

function drawJournalPage(canvas: HTMLCanvasElement, text: string, page: number, chinese: boolean) {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  ctx.fillStyle = '#e8dac1'; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#c4b49b'; ctx.lineWidth = 1;
  for (let y = 56; y < height - 20; y += 36) { ctx.beginPath(); ctx.moveTo(19, y); ctx.lineTo(width - 19, y); ctx.stroke(); }
  ctx.fillStyle = '#553c30'; ctx.font = '600 29px Georgia, "PingFang SC", serif';
  const words = chinese ? [...text] : text.split(' ');
  const separator = chinese ? '' : ' ';
  let row = '', y = 48;
  for (const word of words) {
    const next = row ? row + separator + word : word;
    if (row && ctx.measureText(next).width > width - 46) { ctx.fillText(row, 22, y); row = word; y += 36; }
    else row = next;
  }
  ctx.fillText(row, 22, y);
  ctx.fillStyle = '#725d45'; ctx.font = '20px Georgia, serif';
  ctx.fillText(`${page + 1} / ${BOOK_PAGES.length}`, width - 77, height - 18);
}

export function CampJournal({ anchor }: { anchor: Vec3 }) {
  const book = useMemo(bookStack, []);
  const pages = useRef<Group>(null), leaf = useRef<Group>(null), left = useRef<Group>(null);
  const state = useRef({ page: -1, turn: -1, display: -1, clearNotice: undefined as (() => void) | undefined });
  const [paper, turningPaper] = useMemo(() => [makeJournalPaper(), makeJournalPaper()], []);
  useEffect(() => () => { paper.texture.dispose(); turningPaper.texture.dispose(); }, [paper, turningPaper]);
  useCancelOnUnmount(BOOK_KEY);

  const updatePage = (page: number) => {
    const lang = useWorldStore.getState().lang;
    drawJournalPage(paper.canvas, BOOK_PAGES[page][lang], page, lang === 'zh');
    paper.texture.needsUpdate = true;
    state.current.display = page;
    state.current.clearNotice?.();
    state.current.clearNotice = notice(BOOK_PAGES[page]);
  };
  const read = () => {
    const s = state.current;
    if (!isActive(BOOK_KEY)) {
      if (!canReachCampProp(anchor, 1.55)) return;
      startCampPropInteraction({ id: BOOK_KEY, anchor, inspect: () => ({ page: s.page, turn: s.turn }), release: () => {
        s.clearNotice?.(); s.clearNotice = undefined;
        s.page = s.turn = s.display = -1;
        if (pages.current) pages.current.visible = false;
      } });
      s.page = 0;
      updatePage(0);
      if (pages.current) pages.current.visible = true;
    } else if (s.turn < 0) {
      if (s.page === BOOK_PAGES.length - 1) cancelCampPropInteraction('journal-finished');
      else {
        const lang = useWorldStore.getState().lang;
        drawJournalPage(turningPaper.canvas, BOOK_PAGES[s.page][lang], s.page, lang === 'zh');
        turningPaper.texture.needsUpdate = true;
        s.page++; s.turn = 0;
      }
    }
  };
  useInteractable({
    id: BOOK_KEY, position: anchor, radius: 1.55, kind: 'exhibit',
    get label() {
      return !isActive(BOOK_KEY) ? { en: 'Read journal', zh: '读手记' }
        : state.current.page === BOOK_PAGES.length - 1 ? { en: 'Finish reading', zh: '结束阅读' }
          : { en: 'Turn page', zh: '翻页' };
    },
    enabled: () => campPropActor.available,
    onInteract: read,
  });
  useFrame((_, delta) => {
    if (!isActive(BOOK_KEY)) return;
    if (!campPropActor.available) { cancelCampPropInteraction('actor-unavailable'); return; }
    if (horizontalCampReach(campPropActor.position, anchor) > 1.7
      || Math.abs(campPropActor.position[1] - anchor[1]) > .7) { cancelCampPropInteraction('out-of-reach'); return; }
    const s = state.current, pivot = leaf.current, backing = left.current;
    if (!pivot || !backing) return;
    if (s.turn < 0) { pivot.visible = false; backing.visible = s.page > 0; return; }
    s.turn += Math.min(.05, delta);
    const amount = smooth(s.turn / .62);
    pivot.visible = amount < 1;
    pivot.rotation.z = Math.PI * amount;
    if (amount > .5 && s.display !== s.page) updatePage(s.page);
    if (amount >= 1) { s.turn = -1; backing.visible = true; }
  });

  return <group ref={pages} visible={false} name="camp-prop-journal-pages"
    position={[book.position[0], book.position[1] + .336, book.position[2]]} rotation={[0, book.yaw, 0]}
    userData={{ assetId: 'C08', noOcclusionFade: true, shadowDynamic: true }}>
    <mesh position={[BOOK_WIDTH / 2, .001, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} receiveShadow>
      <planeGeometry args={[BOOK_DEPTH, BOOK_WIDTH]} />
      <meshStandardMaterial map={paper.texture} roughness={.92} />
    </mesh>
    <group ref={left} visible={false}>
      <mesh position={[-.104, .0005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[.205, BOOK_DEPTH]} /><meshStandardMaterial color="#d7c7a8" roughness={.95} />
      </mesh>
    </group>
    <group ref={leaf} visible={false} position={[0, .003, 0]}>
      <mesh position={[BOOK_WIDTH / 2, 0, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} castShadow receiveShadow>
        <planeGeometry args={[BOOK_DEPTH, BOOK_WIDTH]} /><meshStandardMaterial map={turningPaper.texture} side={DoubleSide} roughness={.95} />
      </mesh>
    </group>
  </group>;
}
