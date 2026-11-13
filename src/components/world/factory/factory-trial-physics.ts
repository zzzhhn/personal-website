import type * as Rapier from '@dimforge/rapier3d-compat';
import type { FactoryConfiguration, FactoryConditions, FactoryMeasurement } from './factory-game.ts';
import { FACTORY_COURSE_LOCAL, FACTORY_LANE_OFFSET, type FactoryPoint } from './factory-layout.ts';

type Vector = { x: number; y: number; z: number };
type Rotation = Vector & { w: number };
export interface FactoryTrialWheel {
  connection: Vector;
  suspensionLength: number;
  steering: number;
  rotation: number;
  radius: number;
  grounded: boolean;
}
export interface FactoryTrialReading extends FactoryMeasurement {
  position: Vector;
  quaternion: Rotation;
  elapsedS: number;
  status: 'running' | 'completed' | 'incomplete';
  reason: string | null;
  paused: boolean;
  wheels: FactoryTrialWheel[];
}
export interface FactoryTrialRigOptions {
  world: Rapier.World;
  rapier: Pick<typeof Rapier, 'RigidBodyDesc'|'ColliderDesc'|'RigidBodyType'|'QueryFilterFlags'>;
  configuration: Pick<FactoryConfiguration, 'kind'>;
  conditions: FactoryConditions;
  lane: 0 | 1;
  /** World translation of factory-local geometry. Use FACTORY.origin in the scene. */
  origin: readonly [number, number, number];
}
export interface FactoryTrialRig {
  body: Rapier.RigidBody;
  controller: Rapier.DynamicRayCastVehicleController;
  route: readonly FactoryPoint[];
  /** Model root is its tyre-contact plane. Apply this local offset below the body transform. */
  visualOffset: Vector;
  advance(dt: number): FactoryTrialReading;
  read(): FactoryTrialReading;
  setPaused(paused: boolean): void;
  dispose(): void;
}

const active = new WeakMap<Rapier.World, Set<FactoryTrialRig>>();
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const distance = (a: Vector, b: readonly number[]) => Math.hypot(a.x - b[0], a.z - b[2]);
const angle = (n: number) => Math.atan2(Math.sin(n), Math.cos(n));
const rotate = (v: Vector, q: Rotation): Vector => {
  const tx = 2 * (q.y * v.z - q.z * v.y), ty = 2 * (q.z * v.x - q.x * v.z), tz = 2 * (q.x * v.y - q.y * v.x);
  return { x: v.x + q.w * tx + q.y * tz - q.z * ty, y: v.y + q.w * ty + q.z * tx - q.x * tz, z: v.z + q.w * tz + q.x * ty - q.y * tx };
};
const cloneReading = (reading: FactoryTrialReading): FactoryTrialReading => structuredClone(reading);

/** Route choice changes the physical section under test; load still uses the full hill. */
export function factoryTrialRoute(conditions: FactoryConditions, lane: 0 | 1, origin: readonly number[]): FactoryPoint[] {
  const section = conditions.testKind === 'rumble' ? FACTORY_COURSE_LOCAL.slice(5) : FACTORY_COURSE_LOCAL.slice(0, 5);
  return section.map(p => [p[0] + lane * FACTORY_LANE_OFFSET + origin[0], p[1] + origin[1], p[2] + origin[2]]);
}

/** Four real raycast suspension contacts drive one dynamic chassis. This never sets a
 * path translation or prescribed tilt. Call advance once immediately before world.step;
 * read after the step for a fresh actual pose. The caller owns the world timestep. */
export function createFactoryTrialRig(options: FactoryTrialRigOptions): FactoryTrialRig {
  const { world, rapier: R, lane, origin } = options;
  const conditions = structuredClone(options.conditions), configuration = structuredClone(options.configuration);
  if ((lane !== 0 && lane !== 1) || !['nimble', 'steady'].includes(configuration.kind)
    || !['slope', 'rumble', 'load'].includes(conditions.testKind)
    || !Number.isFinite(conditions.loadKg) || conditions.loadKg < 0 || conditions.loadKg > 1000
    || !Number.isFinite(conditions.durationLimitS) || conditions.durationLimitS <= 0 || conditions.durationLimitS > 3600
    || origin.length !== 3 || !origin.every(Number.isFinite)) throw new TypeError('Invalid factory trial rig options');
  const rigs = active.get(world) ?? new Set<FactoryTrialRig>();
  if (rigs.size >= 2) throw new RangeError('At most two factory trial rigs may run in one world');
  const route = factoryTrialRoute(conditions, lane, origin);
  const steady = configuration.kind === 'steady', radius = steady ? .14 : .13;
  const width = steady ? .12 : .095, wheelX = .325 - width / 2;
  const rest = .15, hardpointHeight = radius + rest;
  const baseMass = steady ? 18 : 12, mass = baseMass + conditions.loadKg;
  const yaw = Math.atan2(route[1][0] - route[0][0], route[1][2] - route[0][2]);
  const body = world.createRigidBody(R.RigidBodyDesc.dynamic()
    .setTranslation(route[0][0], route[0][1] + hardpointHeight + .025, route[0][2])
    .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
    .setCanSleep(false).setCcdEnabled(true).setLinearDamping(.14).setAngularDamping(.9)
    .setAdditionalMassProperties(mass, { x: 0, y: (baseMass * (steady ? -.045 : .015) + conditions.loadKg * .21) / mass, z: 0 },
      { x: mass * (.36 ** 2 + .8 ** 2) / 12, y: mass * (.44 ** 2 + .8 ** 2) / 12, z: mass * (.44 ** 2 + .36 ** 2) / 12 },
      { x: 0, y: 0, z: 0, w: 1 }));
  body.userData = { factoryTrial: true, lane, configuration: configuration.kind };
  const controller = world.createVehicleController(body);
  try {
    // This hull reaches the visible body, while the four wheel rays own tyre contact.
    world.createCollider(R.ColliderDesc.cuboid(.22, .18, .4).setTranslation(0, .14, 0)
      .setMass(0).setFriction(.18).setRestitution(0), body);
    controller.indexUpAxis = 1; controller.setIndexForwardAxis = 2;
    for (const z of [.275, -.275]) for (const side of [-1, 1]) {
      const i = controller.numWheels();
      controller.addWheel({ x: side * wheelX, y: 0, z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, rest, radius);
      // Rapier stiffness is normalized by chassis mass: keep the actual spring rate
      // fixed when payload is added, so carrying weight changes real deflection.
      controller.setWheelSuspensionStiffness(i, (steady ? 190 : 155) * baseMass / mass);
      controller.setWheelSuspensionCompression(i, steady ? 5.4 : 4.8);
      controller.setWheelSuspensionRelaxation(i, steady ? 7.5 : 6.8);
      controller.setWheelMaxSuspensionTravel(i, .1);
      controller.setWheelMaxSuspensionForce(i, baseMass * 18);
      controller.setWheelFrictionSlip(i, steady ? 2.2 : 1.8);
      controller.setWheelSideFrictionStiffness(i, .8);
    }
    body.recomputeMassPropertiesFromColliders();
  } catch (error) { world.removeVehicleController(controller); world.removeRigidBody(body); throw error; }
  const lengths = route.slice(1).map((p, i) => Math.hypot(p[0] - route[i][0], p[2] - route[i][2]));
  const totalLength = lengths.reduce((sum, n) => sum + n, 0);
  let segment = 0, elapsedS = 0, status: FactoryTrialReading['status'] = 'running', reason: string | null = null;
  let disposed = false, paused = false, tippedS = 0, stalledS = 0, bestDistance = 0;
  let resumeVelocity: { linear: Vector; angular: Vector } | null = null;
  let lastReading: FactoryTrialReading;

  const stop = (newStatus: 'completed' | 'incomplete', stopReason: string | null) => {
    status = newStatus; reason = stopReason;
    for (let i = 0; i < 4; i++) { controller.setWheelEngineForce(i, 0); controller.setWheelBrake(i, mass * .2); }
    // Safety stop dissipates motion at the actual stop location. No reset/teleport.
    body.setLinvel({ x: 0, y: 0, z: 0 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.setBodyType(R.RigidBodyType.Fixed, true);
  };
  const routePosition = (position: Vector) => {
    const a = route[segment], b = route[segment + 1], dx = b[0] - a[0], dz = b[2] - a[2], length = lengths[segment];
    const fraction = clamp(((position.x - a[0]) * dx + (position.z - a[2]) * dz) / (length * length), 0, 1);
    const travelled = lengths.slice(0, segment).reduce((sum, n) => sum + n, 0) + fraction * length;
    const crossTrack = Math.hypot(position.x - a[0] - dx * fraction, position.z - a[2] - dz * fraction);
    return { fraction, travelled, crossTrack };
  };
  const read = (): FactoryTrialReading => {
    if (disposed) return cloneReading(lastReading);
    const position = body.translation(), quaternion = body.rotation();
    const course = routePosition(position);
    const tiltDeg = Math.acos(clamp(1 - 2 * (quaternion.x ** 2 + quaternion.z ** 2), -1, 1)) * 180 / Math.PI;
    // Only an observed arrival after the preceding checkpoints can finish the test.
    if (!paused && status === 'running' && segment === route.length - 2 && distance(position, route.at(-1)!) <= .28
      && Math.abs(position.y - route.at(-1)![1] - hardpointHeight) < .35 && tiltDeg < 55) stop('completed', null);
    lastReading = {
      position: { ...position }, quaternion: { ...quaternion }, elapsedS,
      progress: status === 'completed' ? 1 : Math.min(.999, course.travelled / totalLength),
      speedMps: Math.hypot(body.linvel().x, body.linvel().y, body.linvel().z), tiltDeg,
      loadKg: conditions.loadKg, status, reason, paused,
      wheels: Array.from({ length: 4 }, (_, i) => ({
        connection: { ...controller.wheelChassisConnectionPointCs(i)! },
        suspensionLength: controller.wheelSuspensionLength(i) ?? rest,
        steering: controller.wheelSteering(i) ?? 0, rotation: controller.wheelRotation(i) ?? 0,
        radius, grounded: controller.wheelIsInContact(i),
      })),
    };
    return cloneReading(lastReading);
  };
  const advance = (dt: number): FactoryTrialReading => {
    if (disposed || paused || status !== 'running' || !Number.isFinite(dt) || dt <= 0) return read();
    if (dt > 1 / 15) { stop('incomplete', 'physics-step-too-large'); return read(); }
    const reading = read();
    if (status !== 'running') return reading;
    elapsedS += dt;
    const position = body.translation();
    if (distance(position, route[segment + 1]) < .6 && segment < route.length - 2) segment += 1;
    const course = routePosition(position);
    tippedS = reading.tiltDeg > 75 ? tippedS + dt : 0;
    if (course.travelled > bestDistance + .035) { bestDistance = course.travelled; stalledS = 0; } else stalledS += dt;
    const minimumY = Math.min(...route.map(p => p[1]));
    if (elapsedS >= conditions.durationLimitS) stop('incomplete', 'timeout');
    else if (position.y < minimumY - 1.2 || course.crossTrack > 2.2) stop('incomplete', 'out-of-bounds');
    else if (tippedS > .3) stop('incomplete', 'overturned');
    else if (stalledS > 9) stop('incomplete', 'stalled');
    if (status !== 'running') return read();
    const a = route[segment], b = route[segment + 1];
    // Pure pursuit targets a point ahead, but steering/traction alone move the body.
    const lookAhead = .65;
    const t = Math.min(1, course.fraction + lookAhead / lengths[segment]);
    const targetX = a[0] + (b[0] - a[0]) * t, targetZ = a[2] + (b[2] - a[2]) * t;
    const forward = rotate({ x: 0, y: 0, z: 1 }, body.rotation());
    const heading = Math.atan2(forward.x, forward.z);
    const error = angle(Math.atan2(targetX - position.x, targetZ - position.z) - heading);
    const steering = clamp(Math.atan2(2 * .55 * Math.sin(error), lookAhead), -.58, .58);
    const speed = body.linvel().x * forward.x + body.linvel().y * forward.y + body.linvel().z * forward.z;
    const targetSpeed = (steady ? 1.25 : 1.65) * (Math.abs(error) > .45 ? .48 : 1);
    const effort = clamp((targetSpeed - speed) * .9, -.5, 1);
    for (let i = 0; i < 4; i++) {
      controller.setWheelSteering(i, i < 2 ? steering : 0);
      controller.setWheelEngineForce(i, effort > 0 ? effort * baseMass * 8 / 4 : 0);
      controller.setWheelBrake(i, effort < 0 ? -effort * mass * .015 : 0);
    }
    controller.updateVehicle(dt, R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, collider => collider.parent()?.handle !== body.handle && !((collider.parent()?.userData as { factoryTrial?: boolean } | undefined)?.factoryTrial));
    return read();
  };
  const rig: FactoryTrialRig = {
    body, controller, route, visualOffset: { x: 0, y: -hardpointHeight, z: 0 }, advance, read,
    setPaused(value: boolean) {
      if (disposed || status !== 'running' || value === paused) return;
      paused = value;
      if (paused) {
        resumeVelocity = { linear: { ...body.linvel() }, angular: { ...body.angvel() } };
        body.setBodyType(R.RigidBodyType.Fixed, true);
      } else {
        body.setBodyType(R.RigidBodyType.Dynamic, true);
        if (resumeVelocity) { body.setLinvel(resumeVelocity.linear, true); body.setAngvel(resumeVelocity.angular, true); }
      }
    },
    dispose() {
      if (disposed) return;
      if (status === 'running') stop('incomplete', 'disposed');
      read(); disposed = true;
      world.removeVehicleController(controller);
      if (body.isValid()) world.removeRigidBody(body);
      rigs.delete(rig);
    },
  };
  rigs.add(rig); active.set(world, rigs); read();
  return rig;
}
