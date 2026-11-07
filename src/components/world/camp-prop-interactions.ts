import type { RigidBody, RigidBodyType, Vector, World } from '@dimforge/rapier3d-compat';
import { angleDelta, rotateVector, yawRotation, type Rotation } from './actor-physics';
import type { Vec3 } from './types';

/** Live actor and palm samples, kept outside React and the HUD store. */
export const campPropActor = { position: [0, 0, 0] as Vec3, yaw: 0, grounded: false, available: false };
export const campPropHand: { target: Vec3 | null; facing: Vec3 | null; mode: 'reach' | 'grip'; palm: Vec3 | null } = {
  target: null, facing: null, mode: 'reach', palm: null,
};

interface CampPropInteraction {
  id: string;
  anchor: Vec3;
  keepOnPick?: string;
  inspect?: () => Record<string, string | number | boolean> | null;
  release: () => void;
}
let active: CampPropInteraction | null = null;
let lastCancel: (ReturnType<typeof campPropSnapshot> & { reason: string; afterState?: ReturnType<NonNullable<CampPropInteraction['inspect']>> }) | null = null;
export const currentCampPropInteraction = () => active;

function campPropSnapshot() {
  const { target, palm, mode } = campPropHand;
  return {
    id: active?.id ?? null,
    state: active?.inspect?.() ?? null,
    actor: { ...campPropActor, position: [...campPropActor.position] },
    hand: { mode, target: target ? [...target] : null, palm: palm ? [...palm] : null },
  };
}
export const readCampPropActivity = () => ({ ...campPropSnapshot(), lastCancel });

export function startCampPropInteraction(interaction: CampPropInteraction) {
  cancelCampPropInteraction('superseded');
  active = interaction;
}

export function cancelCampPropInteraction(reason = 'manual'): boolean {
  if (!active) return false;
  const previous = active;
  const cancelled = { ...campPropSnapshot(), reason };
  active = null;
  campPropHand.target = campPropHand.facing = campPropHand.palm = null;
  campPropHand.mode = 'reach';
  previous.release();
  lastCancel = { ...cancelled, afterState: previous.inspect?.() };
  return true;
}

export const horizontalCampReach = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
export const canReachCampProp = (target: Vec3, distance: number) => campPropActor.available && campPropActor.grounded
  && horizontalCampReach(campPropActor.position, target) <= distance
  && Math.abs(campPropActor.position[1] - target[1]) < 1.35;

export const CAMP_DUMBBELL_REACH = .62;
const BAR_CENTRE_Y = .1001;
const BAR_RADIUS = .016 * 1.7;
const BAR_TOP_OFFSET = .010;

/** Pick a point on the near upper surface of the actual C13 grip cylinder. The
 * 1.7× art scale is also applied to the hull. Never reach for an end weight. */
export function campDumbbellGrip(position: Vec3, rotation: Rotation, actor: Vec3): Vec3 {
  const [x, , z] = rotateVector([actor[0] - position[0], actor[1] - position[1], actor[2] - position[2]],
    { x: -rotation.x, y: -rotation.y, z: -rotation.z, w: rotation.w });
  const side = Math.sqrt(BAR_RADIUS * BAR_RADIUS - BAR_TOP_OFFSET * BAR_TOP_OFFSET);
  return [x < 0 ? -side : side, BAR_CENTRE_Y + BAR_TOP_OFFSET, Math.max(-.03, Math.min(.03, z))];
}

/** Isolate a held weight before changing its body type. Rapier can retain a
 * solver manifold across the transition even when the collider reports disabled. */
type DumbbellDrop = { position: Vector; rotation: Rotation };

export function holdCampDumbbell(body: RigidBody, types: typeof RigidBodyType) {
  const collider = body.collider(0);
  const { enabled, sensor, collision, solver } = {
    enabled: collider.isEnabled(), sensor: collider.isSensor(),
    collision: collider.collisionGroups(), solver: collider.solverGroups(),
  };
  const zero = { x: 0, y: 0, z: 0 };
  collider.setCollisionGroups(0);
  collider.setSolverGroups(0);
  collider.setSensor(true);
  collider.setEnabled(false);
  body.setLinvel(zero, true);
  body.setAngvel(zero, true);
  body.setBodyType(types.KinematicPositionBased, true);
  body.setNextKinematicTranslation(body.translation());
  body.setNextKinematicRotation(body.rotation());
  return ({ position, rotation }: DumbbellDrop) => {
    body.setTranslation(position, false);
    body.setRotation(rotation, false);
    body.setBodyType(types.Dynamic, true);
    body.setLinvel(zero, true);
    body.setAngvel(zero, true);
    collider.setSensor(sensor);
    collider.setCollisionGroups(collision);
    collider.setSolverGroups(solver);
    collider.setEnabled(enabled);
  };
}

/** A dropped collider must begin clear of the capsule and nearby solid scenery. */
export function campDumbbellDrop(world: World, body: RigidBody, actor: Vec3, home: Vec3, homeYaw: number): DumbbellDrop | null {
  const collider = body.collider(0), shape = collider.shape;
  const clear = (position: Vector, rotation: Rotation) => {
    let overlaps = false;
    world.intersectionsWithShape(position, rotation, shape, () => { overlaps = true; return false; },
      undefined, undefined, collider, body, other => other.isEnabled() && !other.isSensor());
    return !overlaps;
  };
  const position = body.translation(), rotation = body.rotation();
  if (clear(position, rotation)) return { position, rotation };
  const heading = Math.atan2(position.z - actor[2], position.x - actor[0]);
  for (const distance of [.62, .81]) for (const arc of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]) {
    const candidate = {
      x: actor[0] + distance * Math.cos(heading + arc),
      y: position.y + .03,
      z: actor[2] + distance * Math.sin(heading + arc),
    };
    if (clear(candidate, rotation)) return { position: candidate, rotation };
  }
  const homePosition = { x: home[0], y: home[1] + .05, z: home[2] }, homeRotation = yawRotation(homeYaw);
  return clear(homePosition, homeRotation) ? { position: homePosition, rotation: homeRotation } : null;
}

/** Project the prompt toward the player from the live grip, from either side of the prop. */
export function campPushablePrompt(grip: Vec3, actor: Vec3, height: number): Vec3 {
  const x = actor[0] - grip[0], z = actor[2] - grip[2];
  const t = Math.min(1, .36 / Math.max(.001, Math.hypot(x, z)));
  return [grip[0] + x * t, grip[1] + height, grip[2] + z * t];
}

/** Integrate consecutive samples, resetting as soon as the signal returns. */
export const campMissingSignalTime = (seconds: number, present: boolean, dt: number) => present ? 0 : seconds + dt;

export function campPalmTouches(target: Vec3, tolerance: number) {
  const palm = campPropHand.palm;
  return !!palm && Math.hypot(palm[0] - target[0], palm[1] - target[1], palm[2] - target[2]) <= tolerance;
}

/** Same five lanes as the authored bilingual labels and peg centres. */
export const CAMP_TOOL_GRIPS = [
  { en: 'Hammer', zh: '锤子', y: -.235 },
  { en: 'Wrench', zh: '扳手', y: -.16 },
  { en: 'Screwdriver', zh: '螺丝刀', y: -.092 },
  { en: 'Handsaw', zh: '手锯', y: -.058 },
  { en: 'Pliers', zh: '钳子', y: -.225 },
] as const;

export function nearestCampToolLane(z: number, centres: readonly number[]) {
  let closest = 0;
  for (let i = 1; i < centres.length; i++) {
    if (Math.abs(centres[i] - z) < Math.abs(centres[closest] - z)) closest = i;
  }
  return closest;
}

const SUITCASE_TOW_FORWARD = .09;
const SUITCASE_TOW_RIGHT = .60;
const SUITCASE_TOW_RADIUS = Math.hypot(SUITCASE_TOW_FORWARD, SUITCASE_TOW_RIGHT);
const SUITCASE_TOW_ANGLE = Math.atan2(SUITCASE_TOW_RIGHT, SUITCASE_TOW_FORWARD);
const limit = (value: number, magnitude: number) => Math.max(-magnitude, Math.min(magnitude, value));

/** Steer around the capsule. A target too far around the arc pulls through the player
 * along the chord and can wedge there, so limit each target to the next section. */
export function campSuitcaseTowTarget(caseX: number, caseZ: number, actorYaw: number) {
  const bearing = Math.atan2(caseZ, caseX);
  const next = bearing + limit(angleDelta(bearing, SUITCASE_TOW_ANGLE - actorYaw), .50);
  return { x: SUITCASE_TOW_RADIUS * Math.cos(next), z: SUITCASE_TOW_RADIUS * Math.sin(next) };
}

/** Move along the actual horizontal handle, keeping the palm clear of the side mounts. */
export function campSuitcaseHandleZ(caseX: number, caseZ: number, rotation: Rotation, actorYaw: number, previousZ: number, dt: number) {
  const [x, , z] = rotateVector([.16, 0, .37], yawRotation(actorYaw));
  const [, , alongHandle] = rotateVector([x - caseX, 0, z - caseZ],
    { x: -rotation.x, y: -rotation.y, z: -rotation.z, w: rotation.w });
  const target = Math.max(-.075, Math.min(.105, alongHandle));
  return previousZ + limit(target - previousZ, .65 * dt);
}

/** Keep the handle facing the actor using a bounded torque impulse on the dynamic body. */
export function campSuitcaseTurn(caseYaw: number, actorToCaseX: number, actorToCaseZ: number, omega: number, inertia: number, dt: number) {
  const desiredYaw = Math.atan2(-actorToCaseZ, actorToCaseX);
  const desiredOmega = limit(angleDelta(caseYaw, desiredYaw) * 8, 4.8);
  return limit(desiredOmega - omega, 24 * dt) * inertia;
}

/** Bounded horizontal correction with actor velocity feed-forward. Rapier owns gravity and contacts. */
export function campSuitcasePull(dx: number, dz: number, vx: number, vz: number, mass: number, dt: number, actorVx = 0, actorVz = 0) {
  const desiredX = dx * 7 + actorVx, desiredZ = dz * 7 + actorVz;
  const gain = Math.min(1, 3.2 / Math.max(.001, Math.hypot(desiredX, desiredZ)));
  const changeX = desiredX * gain - vx, changeZ = desiredZ * gain - vz;
  // Overcome rolling contact at the first step of a tow. Velocity still caps at 3.2 m/s.
  const acceleration = Math.min(1, 24 * dt / Math.max(.001, Math.hypot(changeX, changeZ)));
  return { x: changeX * acceleration * mass, y: 0, z: changeZ * acceleration * mass };
}
