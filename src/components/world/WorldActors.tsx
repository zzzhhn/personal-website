import WorldVehicleTestProfiles from './WorldVehicleTestProfiles';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CapsuleCollider, ConvexHullCollider, CuboidCollider, CylinderCollider, RigidBody, useBeforePhysicsStep, useFilterContactPair, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { BoxGeometry, Euler, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { CAMP_SPAWN, ROAD_POINTS, VEHICLES, WATER_Y } from './layout';
import { advanceMineAction, cancelMineAction, mineActor, mineBusy, putDownMineOre, useAlphaMineStore } from './alpha-mine-state';
import { ALPHA_MINE_ORIGIN } from './alpha-mine-layout';
import { ALPHA_EXCHANGE_ORIGIN } from './alpha-exchange-layout';
import { nearestDryPoint, terrainHeight } from './WorldLandform';
import { LAYOUT_V4, zoneAtV4 } from './layout-v4-flag.ts';
import { useWorldStore, type NearbyInteract } from './store';
import { CLUB, CLUB_POOL } from './djc-club-layout';
import { IBD_YARD, INTENT_COASTER, ATTRACTION_ROADS } from './attractions/attraction-layout';
import { attractionRide, endAttractionRide } from './attractions/attraction-ride';
import { clubAudio } from './WorldClubAudio';
import { cycleInteractPick, nearestInteractable, type Interactable } from './WorldInteract';
import type { Vec3, VehicleId } from './types';
import WorldGuide, { VEHICLE_TRANSITION_S, worldGuideDebug } from './WorldGuide';
import WorldVehicleVisual from './WorldVehicleVisual';
import { playerSupport, followPlayerGround } from './player-ground';
import { createPlayerClearance, findLowVault, playerRouteClear, playerVelocityChange, sweptPlayerVelocity } from './player-motion';
import { findRailVault, railVaultVelocity, type RailVault } from './player-vault';
import { findSafePlayerLanding, findSafeVehicleLanding, updateHeadSubmersion } from './safe-landing';
import { roadLandingCandidates, portalRearmed } from './world-travel';
import { WORLD_PORTALS, portalCrossing } from './world-portals';
import { vehicleHulls } from './WorldVehicleAssets';
import { VEHICLE_DOORS, vehicleDoorStanding, vehicleDoorQuaternion, vehicleDoorUpright, type DoorSide, type VehicleDoorState } from './WorldVehicleDoors';
import { guideVehicleProgress, guideVehicleSample, guideVehicleOrientation, type GuideVehicleFrame } from './WorldGuideVehicle';
import { WorldOcclusion } from './WorldOcclusion';
import { cameraCollisionRadius, cameraLookTarget, cameraOverlapsGuide, sweepCamera } from './camera-collision';
import { returnPlayerToCamp } from './world-recovery';
import { configureCoupeSuspension, createDrivingState, stepCoupeDrive, type DrivingInput, type DrivingState } from './vehicle-driving';
import { publishDrivingTelemetry } from './vehicle-telemetry';
import WorldDrivingFeedback from './WorldDrivingFeedback';
import { CAMERA_DEFAULT_PITCH, CAMERA_DEFAULT_YAW, CAMERA_MAX_DISTANCE, CAMERA_MIN_DISTANCE, CAMERA_PITCH_LIMITS, CAMERA_PRESETS, PHYSICS_STEP, PLAYER_CENTER_HEIGHT, PLAYER_HALF_HEIGHT, PLAYER_RADIUS, RECOVERY_SECONDS, advanceTimer, angleDelta, cameraRelative, configureRaycastVehicle, heading, needsVehicleRighting, orbitDirection, radialDeadzone, rampAxis, resetActorBody, rotateVector, wheelGeometry, yawRotation } from './actor-physics';

type VehicleSpec = (typeof VEHICLES)[number];
const attractionRecoveryRoads=ATTRACTION_ROADS.map(path=>path.map(([x,z])=>[x,1.04,z] as Vec3));
function allRoadLandingCandidates(p:Vec3){
  return [roadLandingCandidates(p,ROAD_POINTS),...attractionRecoveryRoads.map(path=>roadLandingCandidates(p,path))].flat()
    .sort((a,b)=>Math.hypot(a.position[0]-p[0],a.position[2]-p[2])-Math.hypot(b.position[0]-p[0],b.position[2]-p[2]));
}
type Controller = ReturnType<ReturnType<typeof useRapier>['world']['createVehicleController']>;
type DriveInput = DrivingInput;
type Car = { body: RapierRigidBody; controller: Controller; spec: VehicleSpec; flipped: number; wet: number; steering: number; guards:(RapierCollider|null)[]; lowCom:boolean;
  /** L1 hull colliders active: suspension rays only rest on fixed bodies (DESIGN 6). */
  hulls: boolean;
  lights: { brake: boolean; reverse: boolean };
  doors: VehicleDoorState; driverSide: DoorSide;
  /** Continuous driver inputs after the keyboard ramp (-1..1); QA drive() bypasses the ramp. */
  steerInput: number; throttleInput: number; driving: DrivingState };
function cabinAnchor(car:Car,side:number):Vec3 {
  const seat=VEHICLE_DOORS[car.spec.id].seat;
  const offset=rotateVector([seat[0],seat[1]+(vehicleHulls(car.spec.id)?.bodyY??0),side*seat[2]],car.body.rotation()),p=car.body.translation();
  return [p.x+offset[0],p.y+offset[1],p.z+offset[2]];
}
function cabinFrame(car:Car,side:DoorSide):GuideVehicleFrame {
  const r=car.body.rotation(),p=car.body.translation(),offset=rotateVector([0,vehicleHulls(car.spec.id)?.bodyY??0,0],r);
  return {id:car.spec.id,side,position:[p.x+offset[0],p.y+offset[1],p.z+offset[2]],rotation:[r.x,r.y,r.z,r.w]};
}
/** Free orbit / first-person camera state (yaw, pitch in radians; distances in metres). */
type CameraRig = { yaw: number; pitch: number; distance: number; actual: number; lastManual: number; firstPerson: boolean; collided: boolean; hitDistance: number|null; fov: number; mode: 'walk'|'drive'; recentering: boolean;
  /** Driving: true once the player scrolls in the car; then the 7 m comfort floor no longer applies. */
  driveManualZoom: boolean; desiredDistance: number };
/** Pad state read once per physics step (standard mapping). */
type PadState = { connected: boolean; move: [number,number]; look: [number,number]; throttle: number; brake: number; sprint: boolean; buttons: boolean[] };
type ActorSnapshot = {
  player: Vec3 | null; activeVehicle: VehicleId | null; canRecover: boolean; grounded: boolean;
  playerVelocity: Vec3 | null; playerCollider: { radius: number; halfHeight: number; centerHeight: number };
  playerYaw: number; physicsStep: number;
  vehicles: { id: VehicleId; position: Vec3; velocity: Vec3; yaw: number; entering: boolean; mass: number; com: Vec3; inertia: Vec3; inertiaFrame: number[]; wheelContacts: boolean[]; upsideDownSeconds: number; waterSeconds: number; steering: number; steerInput: number; throttleInput: number; driving: DrivingState|null }[];
};
export type CameraDebug = { yaw: number; pitch: number; distance: number; desiredDistance: number; driveManualZoom: boolean; actualDistance: number; firstPerson: boolean; preset: number; collided: boolean; hitDistance: number|null;
  fov: number; mode: 'walk'|'drive'; recentering: boolean; position: Vec3; target: Vec3; forwardGround: [number,number]; groundBelowCamera: number|null; clearanceAboveGround: number|null; gamepad: boolean;
  /** Camera near-plane envelope, plus the draw-only self-occlusion guard. */
  nearPlaneRadius: number; guideHidden: boolean;
  nearPlaneOverlaps: string[] };
type ContactMeta = { colliderHandle: number; name: string | null; assetId: string | null; kind: 'surface' | 'solid' | 'vehicle' | 'obstacle' | 'unknown' };
type LaneObstacle = 'post' | 'trunk' | 'wall' | 'profiles';
type ActorContact = { self: 'player' | VehicleId; selfPart?: string|null; other: ContactMeta; normal: Vec3; distance: number; points: Vec3[] };
const playerColliderDimensions = { radius: PLAYER_RADIUS, halfHeight: PLAYER_HALF_HEIGHT, centerHeight: PLAYER_RADIUS + PLAYER_HALF_HEIGHT };
export interface WorldActorDebug {
  snapshot(): ActorSnapshot;
  motionProbe(): unknown;
  surfaceAudit(): unknown;
  wheelFixture(on:boolean, z?:number, span?:number): boolean;
  collisionLane(kind:LaneObstacle|null, lateral?:number): boolean;
  actor(): ReturnType<typeof worldGuideDebug>;
  camera(): CameraDebug|null;
  contacts(): ActorContact[];
  inputState(): string[];
  castPlayer(from: Vec3, to: Vec3): { hit: boolean; toi: number; other: ContactMeta | null; normal: Vec3 | null };
  teleportPlayer(position: Vec3): boolean;
  teleportVehicle(id: VehicleId, position: Vec3, yaw?: number): boolean;
  enter(id: VehicleId): boolean;
  exit(): boolean;
  drive(input: DriveInput, seconds?: number): void;
  flip(id?: VehicleId, side?: boolean): boolean;
  water(id?: VehicleId): boolean;
  recover(): boolean;
  clearInput(): void;
  holdVehicleTransition(progress:number|null): boolean;
}
let debugTarget: WorldActorDebug | null = null;
/** Runtime attaches this only behind its explicit debug query parameter. */
export const worldActorDebug: WorldActorDebug = {
  snapshot: () => debugTarget?.snapshot() ?? { player: null, vehicles: [], activeVehicle: null, canRecover: false, grounded: false,
    playerVelocity: null, playerCollider: playerColliderDimensions, playerYaw: 0, physicsStep: 0 },
  actor: worldGuideDebug,
  camera: () => debugTarget?.camera() ?? null,
  motionProbe: () => debugTarget?.motionProbe() ?? null,
  surfaceAudit: () => debugTarget?.surfaceAudit() ?? [],
  wheelFixture: (on,z,span) => debugTarget?.wheelFixture(on,z,span) ?? false,
  collisionLane: (kind,lateral) => debugTarget?.collisionLane(kind,lateral) ?? false,
  contacts: () => debugTarget?.contacts() ?? [],
  inputState: () => debugTarget?.inputState() ?? [],
  castPlayer: (from,to) => debugTarget?.castPlayer(from,to) ?? {hit:false,toi:1,other:null,normal:null},
  teleportPlayer: (p) => debugTarget?.teleportPlayer(p) ?? false,
  teleportVehicle: (id,p,yaw) => debugTarget?.teleportVehicle(id,p,yaw) ?? false,
  enter: (id) => debugTarget?.enter(id) ?? false,
  exit: () => debugTarget?.exit() ?? false,
  drive: (input,seconds) => debugTarget?.drive(input,seconds),
  flip: (id,side) => debugTarget?.flip(id,side) ?? false,
  water: (id) => debugTarget?.water(id) ?? false,
  recover: () => debugTarget?.recover() ?? false,
  clearInput: () => debugTarget?.clearInput(),
  holdVehicleTransition: progress => debugTarget?.holdVehicleTransition(progress)??false,
};
const asTuple = (v: {x:number;y:number;z:number}): Vec3 => [v.x,v.y,v.z];
const asVector = ([x,y,z]: Vec3) => ({x,y,z});
const clamp = (value:number, low:number, high:number) => Math.min(high,Math.max(low,value));
const UP = new Vector3(0,1,0);
const actorNotice=(zh:string,en:string)=>useWorldStore.setState({toast:{zh,en,at:performance.now()}});
/* Controls tuning (AUTHORED). Keyboard axes ramp instead of jumping: steering reaches full lock in
 * ~0.36 s and recentres in ~0.2 s; throttle reaches full in ~0.33 s. Walking input direction turns at
 * WALK_TURN rad/s between key combinations (reversals > 150 deg snap, so a U-turn is not a sideways arc). */
const STEER_RISE = 2.8, STEER_FALL = 5, THROTTLE_RISE = 3, THROTTLE_FALL = 6, WALK_TURN = 9;
const MOUSE_DRAG = .0055, MOUSE_LOCKED = .0028, PAD_LOOK = 2.8, WHEEL_ZOOM = .0011;
/** Drive camera: seconds without manual look before it eases back behind the car. */
const DRIVE_RECENTER_DELAY = 1.6, DRIVE_RECENTER_RATE = 2.4, DRIVE_PITCH = .3, DRIVE_MIN_DISTANCE = 7;
const CAMERA_RADIUS = .22;
/** First-person eye probe radius: covers the near-plane corners (near .1 m, FOV <= 70 deg, 16:9 ~ .15 m). */
const EYE_RADIUS = .16;
function readPad(previous: PadState): PadState {
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  const g = [...(pads ?? [])].find(x => x && x.connected && x.mapping === 'standard') ?? [...(pads ?? [])].find(x => x && x.connected);
  if (!g) return { connected: false, move: [0,0], look: [0,0], throttle: 0, brake: 0, sprint: false, buttons: previous.buttons.map(() => false) };
  const a = (i: number) => g.axes[i] ?? 0, b = (i: number) => g.buttons[i] ?? { pressed: false, value: 0 };
  return { connected: true, move: radialDeadzone(a(0), a(1)), look: radialDeadzone(a(2), a(3), .14),
    throttle: b(7).value > .05 ? b(7).value : 0, brake: b(6).value > .05 ? b(6).value : 0, sprint: b(2).pressed || b(10).pressed,
    buttons: g.buttons.map(x => x.pressed) };
}

/** L1 COM drop per car in metres (docs/world/vehicles/DESIGN.md 6; gated by the handling A/B). */
const COM_DROP: Record<VehicleId, number> = { offroad: .5, coupe: .2, van: .5 };
function Vehicle({ spec, cars, impact }: { spec: VehicleSpec; cars: RefObject<Map<VehicleId,Car>>; impact: RefObject<number> }) {
  const body = useRef<RapierRigidBody>(null);
  const wheels = useRef<(Group | null)[]>([]);
  /** Brake / reverse state for tail-lamp visuals (WorldVehicleVisual). */
  const lights = useRef({ brake: false, reverse: false });
  const doors = useRef<VehicleDoorState>({ side: 1, openness: 0 });
  const guards = useRef<(RapierCollider|null)[]>([]);
  const { world,rapier,colliderStates } = useRapier();
  // Isolated architecture candidate until reviewer decision; normal entry stays unchanged.
  const guardMode = typeof window!=='undefined' ? new URLSearchParams(window.location.search).get('qaWheelGuards') : null;
  const wheelGuards = guardMode==='1'||guardMode==='box';
  const lowCom = typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('qaLowCom')==='1';
  // L1 body = GLB-derived convex hulls (docs/world/vehicles/DESIGN.md 6). ?qaVehicleLegacy=1 restores the
  // old box colliders and unfiltered suspension rays for A/B; the isolated tyre-guard candidate keeps them too.
  const legacy = typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('qaVehicleLegacy')==='1';
  const hullEntry = !legacy && !wheelGuards ? vehicleHulls(spec.id) : null;
  const qaParams = typeof window!=='undefined' ? new URLSearchParams(window.location.search) : null;
  // Centre of mass drop with L1 hulls (spec 10.3 mechanism: a low body contact far below a 1.1-1.2 m high COM
  // tips the car over a post). Mass, inertia tensor, engine, springs, grip and steering limits are unchanged.
  const hullComDrop = Number(qaParams?.get('qaComDrop') ?? COM_DROP[spec.id]);
  // Low friction / restitution (Min combine) on the body hulls: a grazed post or trunk slides along the flank
  // instead of gripping it and climbing the car up (measured: 0.65 friction lifted the 4x4 33 cm at 10 m/s).
  const hullFriction = .1, hullRestitution = .1;
  const hullShapes = useMemo(() => hullEntry?.hulls.map(h => ({ part: h.part, points: new Float32Array(h.points) })) ?? null, [hullEntry]);
  useFilterContactPair((a,b)=>{
    const own=guards.current.some(c=>c?.handle===a)?a:guards.current.some(c=>c?.handle===b)?b:null;
    if(own===null)return null;
    // Read cached JS metadata only during Rapier's solver callback (no nested WASM query).
    for(let o=colliderStates.get(own===a?b:a)?.object;o;o=o.parent??undefined){
      if(o.userData.surface || o.userData.obstacle || o.name==='player-capsule')return rapier.SolverFlags.EMPTY;
    }
    return rapier.SolverFlags.COMPUTE_IMPULSE;
  });
  const geometry = wheelGeometry(spec.size);
  const bodyData = useMemo(() => ({ vehicle: spec.id }), [spec.id]);
  useEffect(() => {
    if (!body.current) return;
    const controller = world.createVehicleController(body.current);
    configureRaycastVehicle(controller,spec.size,spec.mass,spec.grip,spec.suspension / spec.mass);
    if(spec.id==='coupe')configureCoupeSuspension(controller);
    const car: Car = {body:body.current,controller,spec,flipped:0,wet:0,steering:0,guards:guards.current,lowCom,hulls:!!hullShapes,steerInput:0,throttleInput:0,lights:lights.current,doors:doors.current,driverSide:1,driving:createDrivingState()};
    cars.current.set(spec.id,car);
    return () => { cars.current.delete(spec.id); world.removeVehicleController(controller); if(spec.id==='coupe')publishDrivingTelemetry(null); };
  },[world,spec,cars,lowCom,hullShapes]);
  useFrame(() => {
    const car = cars.current.get(spec.id);
    if (!car) return;
    wheels.current.forEach((wheel,i) => {
      if (!wheel) return;
      const point = geometry.points[i];
      wheel.position.set(point[0],point[1]-(car.controller.wheelSuspensionLength(i) ?? geometry.rest),point[2]);
      wheel.rotation.set(0,car.controller.wheelSteering(i) ?? 0,0);
      const rolling = wheel.children[0];
      if (rolling) rolling.rotation.z = -(car.controller.wheelRotation(i) ?? 0);
    });
  });
  const [length,height,width] = spec.size;
  const comDrop=lowCom?(spec.id==='coupe'?.3:.5):hullShapes?hullComDrop:0;
  const massProps=(mass:number,x:number,y:number,z:number)=>comDrop>0?{massProperties:{mass,centerOfMass:{x:0,y:-comDrop,z:0},principalAngularInertia:{x:mass*(y*y+z*z)/12,y:mass*(x*x+z*z)/12,z:mass*(x*x+y*y)/12},angularInertiaLocalFrame:{x:0,y:0,z:0,w:1}}}:{mass};
  return <RigidBody ref={body} position={[spec.position[0],spec.position[1]+geometry.height,spec.position[2]]}
    rotation={[0,spec.yaw,0]} colliders={false} linearDamping={spec.id==='coupe'?.025:.12} angularDamping={0.65}
    canSleep={false} ccd softCcdPrediction={wheelGuards?.25:0} additionalSolverIterations={wheelGuards?4:0} userData={bodyData} onCollisionEnter={({ other }) => {
      if (useWorldStore.getState().activeVehicle === spec.id && other.rigidBodyObject?.userData.solid && body.current) {
        const v = body.current.linvel(); impact.current = Math.min(.35, Math.hypot(v.x, v.z) * .025);
      }
    }}>
    {/* With L1 hulls the two original boxes stay as contact-free mass carriers (sensor, no collision groups),
        so total mass, centre of mass and inertia are exactly the tuned values; the zero-mass hulls collide. */}
    <CuboidCollider name={`vehicle-${spec.id}-chassis`} args={[length/2,height*.29,width/2]} {...massProps(spec.mass*.78,length,height*.58,width)} friction={0.65} restitution={0.18} {...(hullShapes?{sensor:true,collisionGroups:0}:{})} />
    <CuboidCollider name={`vehicle-${spec.id}-cabin`} args={[length*.25,height*.2,width*.43]} position={[-length*.08,height*.42,0]} {...massProps(spec.mass*.22,length*.5,height*.4,width*.86)} friction={0.6} restitution={0.12} {...(hullShapes?{sensor:true,collisionGroups:0}:{})}/>
    {hullShapes?.map(h=><ConvexHullCollider key={h.part} name={`vehicle-${spec.id}-hull-${h.part}`} args={[h.points]} position={[0,hullEntry!.bodyY,0]} mass={0} friction={hullFriction} frictionCombineRule={rapier.CoefficientCombineRule.Min} restitution={hullRestitution} restitutionCombineRule={rapier.CoefficientCombineRule.Min}/>)}
    {wheelGuards && geometry.points.map((p,i)=>guardMode==='box'?<CuboidCollider key={i} name={`vehicle-${spec.id}-tyre-guard-${i}`}
      ref={c=>{guards.current[i]=c;if(c)c.setActiveHooks(rapier.ActiveHooks.FILTER_CONTACT_PAIRS);}}
      args={[geometry.radius,.15,geometry.radius]} position={[p[0],p[1]-geometry.rest,p[2]]} rotation={[Math.PI/2,0,0]}
      mass={0} friction={0} restitution={0} contactSkin={.015} />:<CylinderCollider key={i} name={`vehicle-${spec.id}-tyre-guard-${i}`}
      ref={c=>{guards.current[i]=c;if(c)c.setActiveHooks(rapier.ActiveHooks.FILTER_CONTACT_PAIRS);}}
      args={[.15,geometry.radius]} position={[p[0],p[1]-geometry.rest,p[2]]} rotation={[Math.PI/2,0,0]}
      mass={0} friction={0} restitution={0} contactSkin={.015} />)}
    <WorldVehicleVisual id={spec.id} size={spec.size} color={spec.color} wheelRadius={geometry.radius} wheelPoints={geometry.points} wheelRest={geometry.rest} wheels={wheels} lights={lights} doors={doors} />
  </RigidBody>;
}

/** Read the current body state at mixer time; React batching must not delay gait
 * acceleration, braking, or contact transitions by several rendered frames. */
/** Guide-only door transfer. Physics advances elapsed, so pause freezes the interaction too.
 * 'door' is the car's door anchor at entry/exit (car body + side offset). */
type GuideVehicleTransition = { id: VehicleId; side: DoorSide; phase: 'enter'|'exit'; elapsed: number; door: Vec3; cabin: Vec3; yaw: number; approach?:Vec3[]; approachSeconds?:number; duration?:number; exitPosition?:Vec3 } | null;
function GuideVisual({ cars, body, grounded, yaw, targetSpeed, intent, jumpSeq, visible, transition, supportDecision, movementLock, vault, railVault, resetId }: { cars: RefObject<Map<VehicleId,Car>>; body: RefObject<RapierRigidBody | null>; grounded: RefObject<boolean>; yaw: RefObject<number>; targetSpeed: RefObject<number>; intent: RefObject<'idle'|'walk'|'run'>; jumpSeq: RefObject<number>; visible: boolean; transition: RefObject<GuideVehicleTransition>; supportDecision: RefObject<Record<string, unknown> | null>; movementLock: RefObject<boolean>; vault: RefObject<ReturnType<typeof findLowVault> & { remaining: number } | null>; railVault: RefObject<(RailVault & { elapsed: number }) | null>; resetId: number }) {
  const {world,rapier}=useRapier();
  const supportQA = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('qa') === '1' && new URLSearchParams(window.location.search).get('qaPhysicsSupport') === '1';
  const probeGround=(x:number,z:number,fromY:number)=>{
    const hit=world.castRayAndGetNormal(new rapier.Ray({x,y:fromY,z},{x:0,y:-1,z:0}),3,true,
      undefined,undefined,undefined,body.current??undefined,c=>!c.isSensor()&&(!c.parent()||c.parent()!.isFixed()));
    return hit&&hit.normal.y>.55?{y:fromY-hit.timeOfImpact,nx:hit.normal.x,ny:hit.normal.y,nz:hit.normal.z}:null;
  };
  const readMotion = () => {
    const v = body.current?.linvel();
    return { speedMps: v ? Math.hypot(v.x, v.z) : 0, grounded: grounded.current, facing: yaw.current, targetSpeedMps:targetSpeed.current,
      intent:intent.current,verticalSpeedMps:v?.y??0,jumpSeq:jumpSeq.current,probeGround,vault:!!vault.current||!!railVault.current,railVault:railVault.current,
      ...(supportQA ? { physicsSupportQA: (root: number[], soles: number[][]) => {
        const b = body.current; if (!b) return null;
        const p = b.translation(), q = b.rotation(), velocity = b.linvel();
        const staticTop = (c: RapierCollider) => !c.isSensor() && (!c.parent() || c.parent()!.isFixed());
        const capsule = new rapier.Capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS);
        const cast = world.castShape(p, q, {x:0,y:-1,z:0}, capsule, 0, .30, true, undefined, undefined, undefined, b, staticTop);
        const contact = cast?.collider.contactShape(capsule, p, q, .35);
        const freshRay = world.castRayAndGetNormal(new rapier.Ray(p,{x:0,y:-1,z:0}),PLAYER_CENTER_HEIGHT+.12,true,undefined,undefined,undefined,b,c=>!c.isSensor());
        const contacts: unknown[] = [];
        if (b.numColliders()) world.contactPairsWith(b.collider(0), c => {
          if (!staticTop(c)) return;
          world.contactPair(b.collider(0), c, (m, flipped) => contacts.push({handle:c.handle,flipped,normal:asTuple(m.normal()),
            distances:Array.from({length:m.numContacts()},(_,i)=>m.contactDist(i)),
            impulses:Array.from({length:m.numContacts()},(_,i)=>m.contactImpulse(i)),
            solverDistances:Array.from({length:m.numSolverContacts()},(_,i)=>m.solverContactDist(i))}));
        });
        return { body:asTuple(p), velocity:asTuple(velocity), rotation:[q.x,q.y,q.z,q.w],
          capsule:{halfHeight:PLAYER_HALF_HEIGHT,radius:PLAYER_RADIUS,bottomY:p.y-PLAYER_HALF_HEIGHT-PLAYER_RADIUS,spawnClearanceHeight:PLAYER_CENTER_HEIGHT},
          gameplayGrounded:grounded.current,jumpSeq:jumpSeq.current,lastPhysicsDecision:supportDecision.current,
          freshGameplayRay:freshRay?{distance:freshRay.timeOfImpact,normal:asTuple(freshRay.normal),wouldGround:freshRay.normal.y>.55&&velocity.y<1}:null,
          bodyGround:probeGround(p.x,p.z,p.y),renderRoot:root,rootGround:probeGround(root[0],root[2],p.y),
          soleGround:soles.map(s=>({xz:s,hit:probeGround(s[0],s[1],p.y)})),
          capsuleDownCast:cast?{distance:cast.time_of_impact,collider:cast.collider.handle,contact:contact?{distance:contact.distance,normal:asTuple(contact.normal1),surfacePoint:asTuple(contact.point1),capsulePoint:asTuple(contact.point2)}:null}:null,
          staticContactManifolds:contacts };
      } } : {}),...guideStates() };
  };
  // The guide keeps a live seat contact while driving, including before the exit door opens.
  const guideStates=()=>{
    const st=useWorldStore.getState(),tr=transition.current;
    let vehicle:null|{id:VehicleId;phase:'enter'|'exit';t:number;door:Vec3;cabin:Vec3;yaw:number;approach?:Vec3[];frame?:GuideVehicleFrame}=null;
    if(tr){const car=cars.current.get(tr.id);vehicle={id:tr.id,phase:tr.phase,t:guideVehicleProgress(tr.phase,tr.elapsed,tr.approachSeconds),door:tr.door,cabin:car?cabinAnchor(car,tr.side):tr.cabin,yaw:tr.yaw,approach:tr.approach,frame:car?{...cabinFrame(car,tr.side),groundY:tr.door[1]}:undefined};}
    else if(st.activeVehicle){const car=cars.current.get(st.activeVehicle);if(car){const cabin=cabinAnchor(car,car.driverSide);vehicle={id:car.spec.id,phase:'enter',t:1,door:cabin,cabin,yaw:heading(car.body.rotation()),frame:cabinFrame(car,car.driverSide)};}}
    const ride=attractionRide.active?attractionRide.pose:null;
    return {seat:ride?{position:ride.seat,yaw:ride.yaw,orientation:ride.orientation}:st.seat?{position:st.seat.position,yaw:st.seat.yaw}:null,vehicle,hidden:false,
      dance:st.clubMode==='dance'&&clubAudio.energy()>0?st.danceStep:null,danceBeat:clubAudio.beat()};
  };
  return <WorldGuide key={resetId} speedMps={0} grounded facing={0} visible={visible} readMotion={readMotion} onMovementLock={locked=>{movementLock.current=locked;}} />;
}

export default function WorldActors() {
  const player = useRef<RapierRigidBody>(null);
  const rideHeld=useRef(false);
  const qaStart=import.meta.env.DEV&&new URLSearchParams(window.location.search).get('qa')==='1'?new URLSearchParams(window.location.search).get('start'):null;
  const qaPortal=WORLD_PORTALS.find(g=>qaStart===`portal-${g.id}`);
  const clubArrival=new URLSearchParams(window.location.search).get('start')?.startsWith('club')??false;
  const attractionArrival=['ibd','coaster'].includes(new URLSearchParams(window.location.search).get('start')??'');
  const qaFacing=qaPortal?Math.PI/2+qaPortal.yaw:qaStart==='brain-rail'||attractionArrival?Math.PI/2:clubArrival?-Math.PI/2:0;
  const guideYaw = useRef(qaFacing);
  const guideTargetSpeed = useRef(0);
  const turnBeforeMove = useRef(false);
  const cars = useRef(new Map<VehicleId,Car>());
  /** Interactable in reach this physics step (set before E handling). */
  const nearbyItem = useRef<Interactable|null>(null);
  /** Seat id the body was last snapped to (store.seat), where it sat down from, and the seated body point. */
  const seatHeld = useRef<string|null>(null);
  const seatFrom = useRef<Vec3|null>(null);
  const seatBody = useRef<Vec3|null>(null);
  const keys = useRef(new Set<string>());
  const releasedKeys = useRef(new Set<string>());
  const resetPad = useRef(false);
  const actions = useRef({interact:false,jump:false,recover:false});
  const debugDrive = useRef<{input:DriveInput;remaining:number}|null>(null);
  const grounded = useRef(false);
  const supportDecision = useRef<Record<string, unknown> | null>(null);
  const moveIntent=useRef<'idle'|'walk'|'run'>('idle');
  const jumpSeq=useRef(0);
  const guideMovementLock=useRef(false);
  const vault=useRef<(NonNullable<ReturnType<typeof findLowVault>> & { remaining: number }) | null>(null);
  const railVault=useRef<(RailVault & { elapsed: number }) | null>(null);
  const vaultPreview=useRef<{elapsed:number;plan:RailVault|null;x:number;z:number;yaw:number;colliders:number}>({elapsed:0,plan:null,x:Infinity,z:Infinity,yaw:Infinity,colliders:0});
  const guideTransition=useRef<GuideVehicleTransition>(null);
  const holdDoorForQA=useRef(false);
  const pendingVehicleExit=useRef(false);
  const [guideResetId,setGuideResetId]=useState(0);
  const physicsSteps = useRef(0);
  const wetPlayer = useRef(0);
  const rescueRetry = useRef(new Map<string,number>());
  const portalTravel = useRef<{previous:Vec3|null;cooldown:number;armed:boolean}>({previous:null,cooldown:0,armed:true});
  const lastRecover = useRef(useWorldStore.getState().recoverRequest);
  const publishedTime = useRef(0);
  const activeVehicle = useWorldStore(s=>s.activeVehicle);
  const firstPerson = useWorldStore(s=>s.zoom===3);
  const { world, rapier, colliderStates } = useRapier();
  const { camera, scene, gl } = useThree();
  const clearance = useRef<ReturnType<typeof createPlayerClearance> | null>(null);
  useEffect(() => {
    const controller = createPlayerClearance(world); clearance.current = controller;
    return () => { clearance.current = null; world.removeCharacterController(controller); };
  }, [world]);
  const arrival = useMemo<Vec3>(()=>{
    const start=new URLSearchParams(window.location.search).get('start');
    if(start==='ibd'||start==='coaster'){
      const p=(start==='ibd'?IBD_YARD:INTENT_COASTER).entrance;
      return [p[0],p[1]+PLAYER_CENTER_HEIGHT,p[2]];
    }
    if(start==='club')return [CLUB.spawn[0],1+PLAYER_CENTER_HEIGHT,CLUB.spawn[2]];
    if(import.meta.env.DEV&&start==='club-dance')return [CLUB.dance[0],CLUB.dance[1]+PLAYER_CENTER_HEIGHT,CLUB.dance[2]];
    if(import.meta.env.DEV&&start==='club-decks')return [31,2+PLAYER_CENTER_HEIGHT,55];
    if(import.meta.env.DEV&&start==='club-view')return [CLUB.terrace[0],terrainHeight(CLUB.terrace[0],55)+PLAYER_CENTER_HEIGHT,55];
    if(import.meta.env.DEV&&start==='club-water')return [CLUB.pool[0],CLUB_POOL.floorHeight(CLUB.pool[0],55)+PLAYER_CENTER_HEIGHT,55];
    if(qaPortal){const p=qaPortal.entryApproachCandidates[0];return [p[0],p[1]+PLAYER_CENTER_HEIGHT,p[2]];}
    if(qaStart==='wade')return [-26,-.3,106];
    if(qaStart==='exchange-gallery')return [57.05,6.36,-81.99];
    // Reproduce the reported low-floor exit through the visible QA URL, without moving a live player.
    if(import.meta.env.DEV&&start==='brain-exit'&&new URLSearchParams(window.location.search).get('qa')==='1')return [-81.23,1.82,-90.28];
    if(import.meta.env.DEV&&start==='brain-rail'&&new URLSearchParams(window.location.search).get('qa')==='1')return [ALPHA_MINE_ORIGIN[0]+8,ALPHA_MINE_ORIGIN[1]+PLAYER_CENTER_HEIGHT,ALPHA_MINE_ORIGIN[2]+.16];
    if(import.meta.env.DEV&&start==='camp-bench'&&new URLSearchParams(window.location.search).get('qa')==='1')return [-37.05,6.5,33.535];
    if(start==='alpha'||start==='brain')return [ALPHA_MINE_ORIGIN[0],ALPHA_MINE_ORIGIN[1]+PLAYER_CENTER_HEIGHT,ALPHA_MINE_ORIGIN[2]+.5];
    if(start==='exchange')return [ALPHA_EXCHANGE_ORIGIN[0],ALPHA_EXCHANGE_ORIGIN[1]+PLAYER_CENTER_HEIGHT,ALPHA_EXCHANGE_ORIGIN[2]+.5];
    if(import.meta.env.DEV&&['coupe','offroad','van'].includes(start??'')){
      const coupe=VEHICLES.find(v=>v.id===start)!;
      return [coupe.position[0],coupe.position[1]+PLAYER_CENTER_HEIGHT,coupe.position[2]+2];
    }
    return CAMP_SPAWN;
  },[]);
  useEffect(() => {
    // Paused arrivals and fixed shots have no physics publication to activate nearby facilities.
    useWorldStore.setState({ position: [...arrival], zone: LAYOUT_V4 ? zoneAtV4(arrival[0], arrival[2]) : 'camp' });
  }, [arrival]);
  const target = useRef(new Vector3(...arrival));
  const cameraReady = useRef(false);
  const guideView=useRef<Group>(null),guideCameraFoot=useRef(new Vector3());
  const impact = useRef(0);
  const cam = useRef<CameraRig>({ yaw: qaPortal?Math.PI/2-qaPortal.yaw:qaStart==='exchange-gallery'?4.7113:qaStart==='brain-rail'||attractionArrival?Math.PI/2:qaStart==='club-view'?0:clubArrival?-Math.PI/2:CAMERA_DEFAULT_YAW, pitch: qaStart==='exchange-gallery'?.4554:clubArrival?.4:CAMERA_DEFAULT_PITCH, distance: CAMERA_PRESETS[Math.min(2, useWorldStore.getState().zoom)],
    actual: CAMERA_PRESETS[Math.min(2, useWorldStore.getState().zoom)], lastManual: -Infinity, firstPerson: useWorldStore.getState().zoom === 3, collided: false, hitDistance: null, fov: 50, mode: 'walk', recentering: false, driveManualZoom: false, desiredDistance: CAMERA_PRESETS[Math.min(2, useWorldStore.getState().zoom)] });
  const pad = useRef<PadState>({ connected: false, move: [0,0], look: [0,0], throttle: 0, brake: 0, sprint: false, buttons: [] });
  const moveInput = useRef<[number,number]>([0,0]);
  const lastCarYaw = useRef<number|null>(null);
  const enteredAt = useRef(0);
  const occlusion = useRef(new WorldOcclusion());
  const wheelFixture=useRef<{body:RapierRigidBody;mesh:Mesh}|null>(null);
  const [lane, setLane] = useState<{kind:LaneObstacle; lateral:number}|null>(null);

  function clearWheelFixture(){
    const fixture=wheelFixture.current;if(!fixture)return;
    world.removeRigidBody(fixture.body);scene.remove(fixture.mesh);
    fixture.mesh.geometry.dispose();(fixture.mesh.material as MeshStandardMaterial).dispose();wheelFixture.current=null;
  }

  function clearInput() {
    keys.current.forEach(key=>releasedKeys.current.add(key));keys.current.clear();resetPad.current=true;
    pad.current.move=[0,0];pad.current.look=[0,0];pad.current.throttle=0;pad.current.brake=0;pad.current.sprint=false;
    actions.current={interact:false,jump:false,recover:false};debugDrive.current=null;moveIntent.current='idle';guideTargetSpeed.current=0;moveInput.current=[0,0];
    cars.current.forEach(c=>{c.steerInput=0;c.throttleInput=0;c.driving.power=0;c.driving.boosting=false;c.driving.handbrake=false;});publishDrivingTelemetry(null);
  }
  function clearPlayerMotion(hardCut=false) {
    vault.current=null;railVault.current=null;vaultPreview.current.plan=null;useWorldStore.setState({canVault:false});guideMovementLock.current=false;turnBeforeMove.current=false;
    if(!hardCut)return;
    guideTransition.current=null;pendingVehicleExit.current=false;holdDoorForQA.current=false;
    cars.current.forEach(car=>{car.doors.openness=0;});
    seatHeld.current=null;seatFrom.current=null;seatBody.current=null;
    useWorldStore.setState({seat:null});
    // Recovery is a cut: rebuild only the guide state from the cached GLTF, so old Sit/Air
    // phases, root offsets and IK anchors cannot re-arm the movement lock at the new position.
    setGuideResetId(id=>id+1);
  }
  function relocatePlayer(position:Vec3) {
    if(!player.current)return;
    endAttractionRide();rideHeld.current=false;
    clearPlayerMotion(true);clearInput();grounded.current=false;
    player.current.setEnabled(true);resetBody(player.current,position);wetPlayer.current=0;
    portalTravel.current.previous=position;
    cameraReady.current=false;target.current.set(...position);supportDecision.current=null;
  }
  function resetBody(body: RapierRigidBody, position: Vec3, yaw=0) {
    resetActorBody(body,position,yaw);
  }
  function doorSweepClear(car:Car,side:DoorSide) {
    const spec=VEHICLE_DOORS[car.spec.id] as typeof VEHICLE_DOORS.coupe & {doorBounds?:{min:number[];max:number[]}};
    if(!spec.doorBounds)return false;
    const {min,max}=spec.doorBounds;
    const half=new Vector3(...max as Vec3).sub(new Vector3(...min as Vec3)).multiplyScalar(.5);
    const localCentre=new Vector3(...min as Vec3).add(new Vector3(...max as Vec3)).multiplyScalar(.5);
    localCentre.z*=side;
    const hinge=new Vector3(spec.hinge[0],spec.hinge[1]+(vehicleHulls(car.spec.id)?.bodyY??0),spec.hinge[2]*side);
    const bodyQ=new Quaternion().copy(car.body.rotation()),doorQ=new Quaternion(),centre=new Vector3();
    const position=car.body.translation(),shape=new rapier.Cuboid(half.x+.025,half.y+.025,half.z+.025);
    // A finite sweep runs only on an E request, never as UI polling or per-frame physics.
    for(let i=0;i<=12;i++){
      vehicleDoorQuaternion(car.spec.id,side,i/12,doorQ);
      centre.copy(localCentre).applyQuaternion(doorQ).add(hinge).applyQuaternion(bodyQ).add(position);
      doorQ.premultiply(bodyQ);
      let blocked=false;
      world.intersectionsWithShape(centre,doorQ,shape,()=>{blocked=true;return false;},undefined,undefined,undefined,player.current??undefined,
        collider=>!collider.isSensor()&&collider.parent()?.handle!==car.body.handle);
      if(blocked)return false;
    }
    return true;
  }
  function returnToCamp() {
    endAttractionRide();rideHeld.current=false;
    const vehicle=useWorldStore.getState().activeVehicle;
    return returnPlayerToCamp(player.current,vehicle?cars.current.get(vehicle)?.body:undefined,()=>{
      clearPlayerMotion(true);clearInput();grounded.current=false;wetPlayer.current=0;supportDecision.current=null;
      nearbyItem.current=null;guideYaw.current=0;publishedTime.current=0;
      portalTravel.current={previous:CAMP_SPAWN,cooldown:2,armed:false};
      cars.current.forEach(car=>{for(let i=0;i<4;i++){car.controller.setWheelEngineForce(i,0);car.controller.setWheelBrake(i,0);}});
    },()=>{
      cameraReady.current=false;target.current.set(...CAMP_SPAWN);impact.current=0;lastCarYaw.current=null;
      if(guideView.current)guideView.current.visible=true;
      Object.assign(cam.current,{yaw:CAMERA_DEFAULT_YAW,pitch:CAMERA_DEFAULT_PITCH,actual:CAMERA_PRESETS[1],distance:CAMERA_PRESETS[1],desiredDistance:CAMERA_PRESETS[1],
        firstPerson:false,collided:false,hitDistance:null,mode:'walk',recentering:false,driveManualZoom:false,lastManual:-Infinity,fov:50});
      if(camera instanceof PerspectiveCamera){camera.fov=50;camera.updateProjectionMatrix();}
    });
  }
  function enter(id: VehicleId) {
    if (useAlphaMineStore.getState().carried || mineBusy()) {
      actorNotice('先按 F 放下矿石，再上车。', 'Press F to put the ore down before entering.');
      return false;
    }
    const car = cars.current.get(id);
    if (!car || !player.current || useWorldStore.getState().activeVehicle || useWorldStore.getState().seat || guideTransition.current) return false;
    if(Math.hypot(car.body.linvel().x,car.body.linvel().z)>.8){actorNotice('等车停稳再上车。','Wait for the vehicle to stop.');return false;}
    if(!vehicleDoorUpright(car.body.rotation())){actorNotice('车辆倾覆，先扶正再上车。','Right the tipped vehicle before entering.');return false;}
    {
      // Visible arms extend beyond the physical capsule: keep the standing anchor 65 cm outside.
      const c=car.body.translation(),r=car.body.rotation(),p=player.current.translation();
      const side=rotateVector([0,0,car.spec.size[2]/2+.65],r),toP=[p.x-c.x,p.z-c.z];
      const preferred=side[0]*toP[0]+side[2]*toP[1]>=0?1:-1;
      for(const sg of [preferred,-preferred] as DoorSide[]){
        if(!doorSweepClear(car,sg))continue;
        const localDoor=rotateVector(vehicleDoorStanding(id,sg),r);
        const door={x:c.x+localDoor[0],y:p.y,z:c.z+localDoor[2]};
        let route=[door];
        if(!playerRouteClear(world,rapier,player.current,p,door)){
          const local=rotateVector([p.x-c.x,p.y-c.y,p.z-c.z],{x:-r.x,y:-r.y,z:-r.z,w:r.w});
          const end=(local[0]>=0?1:-1)*(car.spec.size[0]/2+.75);
          route=[[end,0,local[2]],[end,0,vehicleDoorStanding(id,sg)[2]]].map(q=>{const v=rotateVector(q as Vec3,r);return{x:c.x+v[0],y:p.y,z:c.z+v[2]};});route.push(door);
          let previous=p,clear=true;
          for(const point of route){if(!playerRouteClear(world,rapier,player.current,previous,point)){clear=false;break;}previous=point;}
          if(!clear)continue;
        }
        let distance=0,previous=p;for(const point of route){distance+=Math.hypot(point.x-previous.x,point.z-previous.z);previous=point;}
        const approachSeconds=Math.max(VEHICLE_TRANSITION_S*.3,distance/1.7);
        car.driverSide=sg;car.doors.side=sg;
        guideTransition.current={id,side:sg,phase:'enter',elapsed:0,door:[door.x,p.y-PLAYER_CENTER_HEIGHT,door.z],cabin:cabinAnchor(car,sg),yaw:heading(r),approach:route.slice(0,-1).map(v=>[v.x,v.y-PLAYER_CENTER_HEIGHT,v.z]),approachSeconds,duration:approachSeconds+VEHICLE_TRANSITION_S*.7};
        break;
      }
      if(!guideTransition.current){actorNotice('车门通道被挡住了，请走近空旷的一侧。','The door path is obstructed. Approach a clear side.');return false;}
    }
    clearPlayerMotion();pendingVehicleExit.current=false;
    const held=[...keys.current].filter(code=>['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','KeyX','Space'].includes(code));
    clearInput();held.forEach(code=>keys.current.add(code));player.current.setEnabled(false);
    useWorldStore.setState({activeVehicle:id,nearbyVehicle:null,canRecover:false});
    return true;
  }
  function exit() {
    const state=useWorldStore.getState();
    const car=state.activeVehicle && cars.current.get(state.activeVehicle);
    if (!car || !player.current) return false;
    // E during entry is remembered; finish the door transfer before reversing it.
    if(guideTransition.current?.phase==='enter'){pendingVehicleExit.current=true;return true;}
    if(guideTransition.current?.phase==='exit')return true;
    if(Math.hypot(car.body.linvel().x,car.body.linvel().z)>.8){actorNotice('先刹停，再下车。','Stop the vehicle before getting out.');return false;}
    if(!vehicleDoorUpright(car.body.rotation())){actorNotice('车辆倾覆，按 R 扶正后再下车，或返回营地。','The vehicle is tipped. Press R to right it before exiting, or return to camp.');return false;}
    const center=car.body.translation(), rotation=car.body.rotation();
    // Try both doors. A downward ground ray and capsule overlap reject
    // water, walls, parked vehicles and narrow gaps before the player is enabled.
    const offsets: Vec3[] = [car.driverSide,-car.driverSide].map(side=>vehicleDoorStanding(car.spec.id,side as DoorSide));
    for (const offset of offsets) {
      const side:DoorSide=offset[2]<0?-1:1;
      if(!doorSweepClear(car,side))continue;
      const local=rotateVector(offset,rotation);
      const origin={x:center.x+local[0],y:center.y+3,z:center.z+local[2]};
      const hit=world.castRayAndGetNormal(new rapier.Ray(origin,{x:0,y:-1,z:0}),10,true,undefined,undefined,undefined,player.current,
        collider=>!collider.isSensor() && collider.parent()?.handle!==car.body.handle);
      if (!hit || hit.normal.y<.65) continue;
      const ground=origin.y-hit.timeOfImpact;
      if (ground<WATER_Y+.15) continue;
      const candidate={x:origin.x,y:ground+PLAYER_CENTER_HEIGHT,z:origin.z};
      let blocked=false;
      world.intersectionsWithShape(candidate,{x:0,y:0,z:0,w:1},new rapier.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),
        ()=>{blocked=true;return false;},undefined,undefined,undefined,player.current,collider=>!collider.isSensor());
      if (blocked) continue;
      // Check the door-to-spot corridor as well as its endpoint. The vehicle itself is the transfer
      // frame; every other solid, including a wall between two free endpoints, blocks that route.
      const door={x:candidate.x,y:candidate.y,z:candidate.z};
      if (!playerRouteClear(world,rapier,player.current,door,candidate,car.body)) continue;
      car.doors.side=side;car.driverSide=side;
      guideTransition.current={id:car.spec.id,side,phase:'exit',elapsed:0,door:[door.x,door.y-PLAYER_CENTER_HEIGHT,door.z],cabin:cabinAnchor(car,side),yaw:heading(rotation),exitPosition:asTuple(candidate),duration:VEHICLE_TRANSITION_S*.7};
      // The parked destination is only the visual reference until both feet have left the sill.
      // Keep capsule disabled and the vehicle selected/braked through closing the door.
      clearPlayerMotion();resetBody(player.current,asTuple(candidate)); player.current.setEnabled(false);
      portalTravel.current.previous=asTuple(candidate);
      clearInput(); wetPlayer.current=0;
      useWorldStore.setState({canRecover:false,speed:0}); return true;
    }
    actorNotice('车门周围没有安全的下车空间，请换个停车位置。','No clear space to open the door. Move to an open parking spot.');
    return false;
  }
  function recover() {
    const state=useWorldStore.getState();
    const car=state.activeVehicle && cars.current.get(state.activeVehicle);
    if (!car || car.flipped<RECOVERY_SECONDS) return false;
    const p=car.body.translation();
    resetBody(car.body,[p.x,p.y+wheelGeometry(car.spec.size).height*.8,p.z],heading(car.body.rotation()));
    car.flipped=0; car.wet=0; clearPlayerMotion(true);clearInput(); useWorldStore.setState({canRecover:false,speed:0}); return true;
  }

  /** Suspension and recovery belong to the world, even when the player is on a ride. */
  function stepWorldVehicles(dt:number,active?:Car,throttle=0,steer=0,transitioning=false,debugging=false,brake=false,handbrake=false,boost=false) {
    cars.current.forEach(car=>{
      const driven=active===car,velocity=car.body.linvel();
      const front=rotateVector([1,0,0],car.body.rotation());
      const speed=velocity.x*front[0]+velocity.z*front[2];
      if(car.spec.id==='coupe'){
        stepCoupeDrive(car.body,car.controller,car.driving,{throttle,steer,
          brake:transitioning||brake,
          handbrake:!transitioning&&handbrake,
          boost:!transitioning&&boost},car.spec.mass,car.spec.size[0]*.68,dt,driven);
        car.steering=car.driving.steering;
        car.lights.brake=driven&&(car.driving.braking||car.driving.handbrake);
        car.lights.reverse=driven&&throttle<-.05&&speed<.5;
      } else {
        const braking=driven && (transitioning||brake || throttle*speed<-.8);
        const maxSteer=car.spec.id==='van'?.38:.47;
        const desired=driven?steer*maxSteer/(1+Math.abs(speed)*.045):0;
        // Keyboard / analogue input already limits the steering rate. Keep the existing offroad/van
        // response; QA drive() inputs and the undriven return retain their old filter.
        if(driven&&!debugging)car.steering=desired;
        else car.steering+=(desired-car.steering)*Math.min(1,dt*(car.spec.id==='van'?3.5:6));
        car.lights.brake=!!braking&&driven;car.lights.reverse=driven&&throttle<-.05&&speed<.5;
        for(let i=0;i<4;i++){
          car.controller.setWheelSteering(i,i<2?car.steering:0);
          const force=driven && !braking && Math.abs(speed)<(throttle<0?9:car.spec.id==='van'?18:22)?throttle*car.spec.engineForce/4:0;
          car.controller.setWheelEngineForce(i,force);
          car.controller.setWheelBrake(i,braking?car.spec.mass*.028:!driven?car.spec.mass*.035:Math.abs(throttle)<.02?car.spec.mass*.0015:0);
          car.controller.setWheelFrictionSlip(i,car.spec.grip);
        }
      }
      // Filter sensor/dynamic shapes in Rapier itself. Calling isSensor() from the ray predicate
      // re-enters the borrowed collider set in this Rapier version and prevents safe world disposal.
      const rayFlags=rapier.QueryFilterFlags.EXCLUDE_SENSORS|(car.hulls?rapier.QueryFilterFlags.EXCLUDE_DYNAMIC|rapier.QueryFilterFlags.EXCLUDE_KINEMATIC:0);
      car.controller.updateVehicle(dt,rayFlags,undefined,c=>{
        if(c.parent()?.handle===car.body.handle || c.parent()?.handle===player.current?.handle)return false;
        // L1: the suspension only rests on the static world. A knocked-over roadblock or another car under
        // a wheel used to become a road surface and jack the body up (spec 10.2 roadblock lift); the body
        // hulls handle those contacts instead.
        if(car.hulls)return true;
        if(!car.guards.some(Boolean))return true;
        // Wheel-side obstacles must not also become suspension supports: a ray
        // landing on a short post used to jack the chassis upward during a graze.
        for(let o=colliderStates.get(c.handle)?.object;o;o=o.parent??undefined)if(o.userData.surface)return true;
        return !!(c.parent()?.userData as {surface?:boolean}|undefined)?.surface;
      });
      const wheelShape=wheelGeometry(car.spec.size);
      car.guards.forEach((guard,i)=>{
        if(!guard)return;const p=wheelShape.points[i];
        guard.setTranslationWrtParent({x:p[0],y:p[1]-(car.controller.wheelSuspensionLength(i)??wheelShape.rest),z:p[2]});
        guard.setRotationWrtParent(new Quaternion().setFromAxisAngle(UP,car.controller.wheelSteering(i)??0)
          .multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),Math.PI/2)));
      });
      car.flipped=advanceTimer(car.flipped,needsVehicleRighting(car.body.rotation()),dt);
      // In water once the chassis floor is submerged (wheels fully under, >5 cm into the hull), not only
      // when the body centre sinks: v4 beaches shelve gently, and a car parked in ~1 m of sea must still
      // be returned to dry land after RECOVERY_SECONDS. Driving through shallow surf stays possible.
      const p=car.body.translation(),floor=p.y+rotateVector([0,-car.spec.size[1]*.29,0],car.body.rotation())[1];
      car.wet=advanceTimer(car.wet,p.y<WATER_Y||floor<WATER_Y-.05,dt);
      if((car.wet>=RECOVERY_SECONDS || p.y< -80)&&!(rescueRetry.current.get(car.spec.id)??0)){
        rescueRetry.current.set(car.spec.id,1);
        const landing=findSafeVehicleLanding(world,rapier,car.body,car.spec.size,allRoadLandingCandidates(asTuple(p)),WATER_Y);
        if(landing){
          if(useWorldStore.getState().activeVehicle===car.spec.id){clearPlayerMotion(true);clearInput();cameraReady.current=false;target.current.set(...landing.position);}
          resetBody(car.body,landing.position,landing.yaw);car.wet=0;car.flipped=0;car.steering=0;car.steerInput=0;car.throttleInput=0;
          car.driving=createDrivingState();
          for(let i=0;i<4;i++){car.controller.setWheelEngineForce(i,0);car.controller.setWheelBrake(i,car.spec.mass*.035);car.controller.setWheelSteering(i,0);}
          if(driven)actorNotice('已回到宽阔路段，可以继续驾驶。','Recovered to a clear road. Ready to drive.');
        }
      }
    });
  }

  /** V cycles near -> mid -> far -> first person -> near. */
  function cycleCamera(){ const z=useWorldStore.getState().zoom; useWorldStore.setState({zoom:((z+1)%4) as 0|1|2|3}); }
  function applyPreset(z:number){
    const c=cam.current;
    const wasFirst=c.firstPerson;c.firstPerson=z===3;
    // Entering first person looks slightly down the path; leaving it restores a readable orbit pitch.
    if(z<3){c.distance=CAMERA_PRESETS[z];c.pitch=wasFirst?.55:clamp(c.pitch,CAMERA_PITCH_LIMITS.third[0],CAMERA_PITCH_LIMITS.third[1]);}
    else c.pitch=.12;
  }
  useEffect(() => {
    const down=(event:KeyboardEvent) => {
      const state=useWorldStore.getState();
      if(attractionRide.active)return;
      if (event.metaKey || event.ctrlKey || event.altKey || state.paused || state.poolInspect || state.shot || (event.repeat&&releasedKeys.current.has(event.code)) || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement)?.tagName ?? '')) return;
      releasedKeys.current.delete(event.code);
      if(state.clubMode==='dance'&&['Digit1','Digit2'].includes(event.code)){
        event.preventDefault();useWorldStore.setState({danceStep:event.code==='Digit1'?0:1});return;
      }
      if(state.clubMode==='dance'&&['KeyW','KeyA','KeyS','KeyD','Space'].includes(event.code))useWorldStore.setState({clubMode:null});
      if(state.clubMode==='dj'&&event.code!=='KeyE')return;
      if (['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','Space','KeyE','KeyR','KeyV'].includes(event.code)||(state.activeVehicle&&event.code==='KeyX')) event.preventDefault();
      keys.current.add(event.code);
      if (!event.repeat) {
        if (event.code === 'KeyF' && !state.card && !state.activeVehicle && player.current) {
          if (putDownMineOre()) event.preventDefault();
        }
        if (event.code==='KeyE') {
          if(!state.clubMode&&['djc-club-dance','djc-club-decks'].includes(state.nearbyInteract?.id??''))void clubAudio.enable();
          actions.current.interact=true;
        }
        if (event.code==='Space') actions.current.jump=true;
        if (event.code==='KeyR') actions.current.recover=true;
        if (event.code==='KeyV') cycleCamera();
      }
    };
    const up=(event:KeyboardEvent)=>{keys.current.delete(event.code);releasedKeys.current.delete(event.code);};
    // Continuous scroll zoom (exponential, ~12 % per notch). Scrolling out of first person returns to the
    // nearest third-person distance; scrolling never enters first person (V does).
    const wheel=(event:WheelEvent)=>{
      const state=useWorldStore.getState(); if(state.paused || state.poolInspect || state.shot || state.clubMode==='dj') return;
      event.preventDefault();
      const c=cam.current;
      if(c.firstPerson){ if(event.deltaY>0) useWorldStore.setState({zoom:0}); return; }
      const step=event.deltaMode===1?event.deltaY*33:event.deltaMode===2?event.deltaY*400:event.deltaY;
      c.distance=clamp(c.distance*Math.exp(step*WHEEL_ZOOM),CAMERA_MIN_DISTANCE,CAMERA_MAX_DISTANCE);
      if(useWorldStore.getState().activeVehicle)c.driveManualZoom=true;
    };
    // Mouse look: drag with any button, or move freely while the pointer is locked (double-click).
    let drag:{id:number;x:number;y:number}|null=null;
    const look=(dx:number,dy:number,k:number)=>{
      const c=cam.current,lim=c.firstPerson?CAMERA_PITCH_LIMITS.first:CAMERA_PITCH_LIMITS.third;
      c.yaw+=dx*k; c.pitch=clamp(c.pitch+dy*k,lim[0],lim[1]); c.lastManual=performance.now()/1000;
    };
    const blocked=()=>{const st=useWorldStore.getState();return st.paused||st.poolInspect||!!st.shot||st.clubMode==='dj'||attractionRide.active;};
    const pointerDown=(e:PointerEvent)=>{if(blocked())return;drag={id:e.pointerId,x:e.clientX,y:e.clientY};gl.domElement.setPointerCapture?.(e.pointerId);};
    const pointerMove=(e:PointerEvent)=>{
      if(blocked())return;
      if(document.pointerLockElement===gl.domElement){look(e.movementX,e.movementY,MOUSE_LOCKED);return;}
      if(!drag||drag.id!==e.pointerId)return;
      look(e.clientX-drag.x,e.clientY-drag.y,MOUSE_DRAG);drag.x=e.clientX;drag.y=e.clientY;
    };
    const pointerUp=(e:PointerEvent)=>{if(drag?.id===e.pointerId){drag=null;gl.domElement.releasePointerCapture?.(e.pointerId);}};
    const dbl=()=>{if(!blocked()&&document.pointerLockElement!==gl.domElement)Promise.resolve(gl.domElement.requestPointerLock?.()).catch(()=>{});};
    const menu=(e:Event)=>e.preventDefault();
    const el=gl.domElement;
    el.addEventListener('pointerdown',pointerDown);el.addEventListener('pointermove',pointerMove);el.addEventListener('pointerup',pointerUp);
    el.addEventListener('pointercancel',pointerUp);el.addEventListener('dblclick',dbl);el.addEventListener('contextmenu',menu);
    const hidden=()=>{if(document.hidden) clearInput();};
    window.addEventListener('keydown',down); window.addEventListener('keyup',up); window.addEventListener('blur',clearInput);
    document.addEventListener('visibilitychange',hidden); gl.domElement.addEventListener('wheel',wheel,{passive:false});
    const unsubscribe=useWorldStore.subscribe((state,previous)=>{
      if(state.campReturnRequest!==previous.campReturnRequest){returnToCamp();return;}
      if(state.paused!==previous.paused || state.poolInspect!==previous.poolInspect || state.shot!==previous.shot || state.clubMode!==previous.clubMode){
        clearInput();drag=null;if((state.paused||state.poolInspect||state.clubMode==='dj')&&document.pointerLockElement===gl.domElement)document.exitPointerLock?.();
      }
      if(state.zoom!==previous.zoom)applyPreset(state.zoom);
    });
    function identifyCollider(other: ReturnType<typeof world.getCollider>): ContactMeta {
      const bodyData=other.parent()?.userData;
      const data:Record<string,unknown>=bodyData && typeof bodyData==='object'?{...bodyData}:{};
      let node=colliderStates.get(other.handle)?.object ?? null;
      let name:string|null=null,assetId:string|null=null;
      while(node){
        if(!name && node.name) name=node.name;
        if(!assetId && typeof node.userData.assetId==='string') assetId=node.userData.assetId;
        Object.assign(data,node.userData);node=node.parent;
      }
      if(!assetId && typeof data.assetId==='string') assetId=data.assetId;
      const kind:ContactMeta['kind']=data.surface?'surface':data.vehicle?'vehicle':data.obstacle?'obstacle':data.solid?'solid':'unknown';
      return {colliderHandle:other.handle,name,assetId,kind};
    }
    const api:WorldActorDebug={
      actor:worldGuideDebug,
      surfaceAudit:()=>{
        const rows:unknown[]=[];
        world.forEachCollider(c=>{
          const meta=identifyCollider(c);if(meta.kind!=='surface')return;
          const normals:number[]=[];const q=c.rotation();
          if(c.shapeType()===rapier.ShapeType.TriMesh){
            const v=c.vertices(),ix=c.indices();
            if(ix)for(let i=0;i<ix.length;i+=3){
              const a=new Vector3().fromArray(v,ix[i]*3),b=new Vector3().fromArray(v,ix[i+1]*3),d=new Vector3().fromArray(v,ix[i+2]*3);
              const n=b.sub(a).cross(d.sub(a)).normalize();normals.push(rotateVector([n.x,n.y,n.z],q)[1]);
            }
          }else if(c.shapeType()===rapier.ShapeType.Cuboid){
            for(const n of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]] as Vec3[])normals.push(rotateVector(n,q)[1]);
          }
          rows.push({...meta,shapeType:c.shapeType(),position:asTuple(c.translation()),normalCount:normals.length,
            minNormalY:normals.length?normals.reduce((m,y)=>Math.min(m,y),Infinity):null,maxNormalY:normals.length?normals.reduce((m,y)=>Math.max(m,y),-Infinity):null,
            verticalOrDown:normals.filter(y=>y<.55).length});
        });return rows;
      },
      collisionLane:(kind,lateral=1.2)=>{
        if(new URLSearchParams(window.location.search).get('qa')!=='1')return false;
        setLane(kind?{kind,lateral}:null);return true;
      },
      wheelFixture:(on,z=41.1,span=.12)=>{
        clearWheelFixture();
        if(!on)return true;
        if(new URLSearchParams(window.location.search).get('qa')!=='1')return false;
        const body=world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(-42,5.1,z));
        body.userData={solid:true,assetId:'QA-wheel-post'};
        const width=clamp(span,.12,3);
        world.createCollider(rapier.ColliderDesc.cuboid(.12,.3,width/2),body);
        const mesh=new Mesh(new BoxGeometry(.24,.6,width),new MeshStandardMaterial({color:'#e34949'}));
        mesh.position.set(-42,5.1,z);mesh.name='QA-wheel-post';mesh.castShadow=true;scene.add(mesh);
        wheelFixture.current={body,mesh};return true;
      },
      // QA-only exact shape queries: these observe visual wheels and deformed soles,
      // never add contact forces or turn a diagnostic fixture into gameplay evidence.
      motionProbe:()=>{
        const actor=worldGuideDebug() as Record<string,unknown>;
        const soles=Object.entries((actor.soles??{}) as Record<string,{position:number[]}|null>).map(([side,sole])=>{
          if(!sole)return {side,clearance:null};
          const [x,y,z]=sole.position;
          const hit=world.castRayAndGetNormal(new rapier.Ray({x,y:y+1,z},{x:0,y:-1,z:0}),4,true,
            undefined,undefined,undefined,player.current??undefined,c=>!c.isSensor());
          return {side,position:sole.position,clearance:hit?hit.timeOfImpact-1:null,normal:hit?asTuple(hit.normal):null};
        });
        const vehicles=[...cars.current.values()].map(car=>{
          const geometry=wheelGeometry(car.spec.size), center=car.body.translation(), rotation=car.body.rotation();
          const wheels=geometry.points.map((point,i)=>{
            const local:Vec3=[point[0],point[1]-(car.controller.wheelSuspensionLength(i)??geometry.rest),point[2]];
            const offset=rotateVector(local,rotation),p={x:center.x+offset[0],y:center.y+offset[1],z:center.z+offset[2]};
            const q=new Quaternion(rotation.x,rotation.y,rotation.z,rotation.w)
              .multiply(new Quaternion().setFromAxisAngle(UP,car.controller.wheelSteering(i)??0))
              .multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),Math.PI/2));
            const halfWidth=(vehicleHulls(car.spec.id)?.wheelWidth??.3)/2;
            const shape=new rapier.Cylinder(halfWidth,geometry.radius),overlaps:unknown[]=[],nearby:unknown[]=[];
            world.intersectionsWithShape(p,q,new rapier.Cylinder(.4,geometry.radius+.25),other=>{
              const contact=other.contactShape(shape,p,q,.25),meta=identifyCollider(other);
              if(contact){nearby.push({other:meta,distance:contact.distance});if(contact.distance<0)overlaps.push({other:meta,depth:-contact.distance});}
              return true;
            },undefined,undefined,undefined,car.body,c=>!c.isSensor()&&c.parent()?.handle!==player.current?.handle&&identifyCollider(c).kind!=='surface');
            return {index:i,position:asTuple(p),radius:geometry.radius,width:halfWidth*2,overlaps,nearby};
          });
          return {id:car.spec.id,position:asTuple(center),rotation:[rotation.x,rotation.y,rotation.z,rotation.w],yaw:heading(rotation),wheels};
        });
        const obstacles:{handle:number;position:Vec3;velocity:Vec3}[]=[];
        world.forEachRigidBody(b=>{if((b.userData as {obstacle?:boolean}|undefined)?.obstacle)obstacles.push({handle:b.handle,position:asTuple(b.translation()),velocity:asTuple(b.linvel())});});
        return {soles,vehicles,obstacles,occlusion:occlusion.current.debug(),camera:camera.position.toArray()};
      },
      camera:()=>{
        const c=cam.current,dir=camera.getWorldDirection(new Vector3());
        const radius=camera instanceof PerspectiveCamera?cameraCollisionRadius(camera.near,camera.fov,camera.aspect,c.firstPerson?EYE_RADIUS:CAMERA_RADIUS):CAMERA_RADIUS;
        const down=world.castRay(new rapier.Ray({x:camera.position.x,y:200,z:camera.position.z},{x:0,y:-1,z:0}),400,true,undefined,undefined,undefined,undefined,
          col=>!col.isSensor()&&identifyCollider(col).kind==='surface');
        const ground=down?200-down.timeOfImpact:null;
        return {yaw:c.yaw,pitch:c.pitch,distance:c.distance,desiredDistance:c.desiredDistance,driveManualZoom:c.driveManualZoom,actualDistance:c.actual,firstPerson:c.firstPerson,preset:useWorldStore.getState().zoom,collided:c.collided,hitDistance:c.hitDistance,
          fov:camera instanceof PerspectiveCamera?camera.fov:0,mode:c.mode,recentering:c.recentering,position:camera.position.toArray() as Vec3,target:target.current.toArray() as Vec3,
          forwardGround:(()=>{const m=Math.hypot(dir.x,dir.z)||1;return [dir.x/m,dir.z/m] as [number,number];})(),groundBelowCamera:ground,
          clearanceAboveGround:ground===null?null:camera.position.y-ground,gamepad:pad.current.connected,
          nearPlaneRadius:radius,guideHidden:guideView.current?.visible===false,
          nearPlaneOverlaps:(()=>{const out:string[]=[];const act=useWorldStore.getState().activeVehicle,carBody=act?cars.current.get(act)?.body:undefined;
            world.intersectionsWithShape({x:camera.position.x,y:camera.position.y,z:camera.position.z},{x:0,y:0,z:0,w:1},new rapier.Ball(radius),col=>{const m=identifyCollider(col);out.push(m.assetId??m.name??String(m.colliderHandle));return true;},
              undefined,undefined,undefined,carBody??player.current??undefined,col=>!col.isSensor()&&col.parent()?.handle!==player.current?.handle&&!(col.parent()?.userData as {obstacle?:boolean}|undefined)?.obstacle);
            return out;})()};
      },
      snapshot:()=>({player:player.current?asTuple(player.current.translation()):null,activeVehicle:useWorldStore.getState().activeVehicle,
        canRecover:useWorldStore.getState().canRecover,grounded:grounded.current,
        playerVelocity:player.current?asTuple(player.current.linvel()):null,playerCollider:playerColliderDimensions,
        playerYaw:guideYaw.current,physicsStep:physicsSteps.current,
        vehicles:[...cars.current.values()].map(car=>({id:car.spec.id,position:asTuple(car.body.translation()),velocity:asTuple(car.body.linvel()),yaw:heading(car.body.rotation()),entering:useWorldStore.getState().activeVehicle===car.spec.id&&guideTransition.current?.phase==='enter',
          mass:car.body.mass(),com:asTuple(car.body.localCom()),inertia:asTuple(car.body.principalInertia()),inertiaFrame:(()=>{const q=car.body.principalInertiaLocalFrame();return [q.x,q.y,q.z,q.w];})(),wheelContacts:[0,1,2,3].map(i=>car.controller.wheelIsInContact(i)),upsideDownSeconds:car.flipped,waterSeconds:car.wet,
          steering:car.controller.wheelSteering(0)??0,steerInput:car.steerInput,throttleInput:car.throttleInput,driving:car.spec.id==='coupe'?{...car.driving,suspension:[...car.driving.suspension]}:null}))}),
      contacts:()=>{
        const active=useWorldStore.getState().activeVehicle;
        const body=active?cars.current.get(active)?.body:player.current;
        const result:ActorContact[]=[];
        if(!body) return result;
        for(let i=0;i<body.numColliders();i++){
          const self=body.collider(i);
          world.contactPairsWith(self,other=>{
            if(other.isSensor()) return;
            const meta=identifyCollider(other);
            world.contactPair(self,other,(manifold,flipped)=>{
              if(!manifold.numContacts() || !manifold.numSolverContacts()) return;
              const normal=manifold.normal(),sign=flipped?1:-1;
              const points:Vec3[]=[];
              let distance=Infinity;
              for(let j=0;j<manifold.numContacts();j++) distance=Math.min(distance,manifold.contactDist(j));
              for(let j=0;j<Math.min(4,manifold.numSolverContacts());j++) points.push(asTuple(manifold.solverContactPoint(j)));
              result.push({self:active??'player',selfPart:colliderStates.get(self.handle)?.object?.name??null,other:meta,
                normal:[normal.x*sign,normal.y*sign,normal.z*sign],distance,points});
            });
          });
        }
        return result;
      },
      inputState:()=>[...keys.current],
      castPlayer:(from,to)=>{
        const hit=world.castShape(asVector(from),{x:0,y:0,z:0,w:1},
          {x:to[0]-from[0],y:to[1]-from[1],z:to[2]-from[2]},new rapier.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),
          .002,1,false,undefined,undefined,undefined,player.current??undefined,c=>!c.isSensor());
        // Shape-cast normals use shape-local frames. Contacts() supplies verified world normals;
        // this fixture API intentionally exposes no guessed normal.
        return {hit:!!hit,toi:hit?.time_of_impact??1,other:hit?identifyCollider(hit.collider):null,normal:null};
      },
      teleportPlayer:(p)=>{if(!player.current)return false;if(useWorldStore.getState().activeVehicle)useWorldStore.setState({activeVehicle:null,canRecover:false});relocatePlayer(p);return true;},
      teleportVehicle:(id,p,yaw=0)=>{const car=cars.current.get(id);if(!car)return false;if(useWorldStore.getState().activeVehicle===id)clearPlayerMotion(true);resetBody(car.body,p,yaw);car.wet=0;car.flipped=0;car.driving=createDrivingState();return true;},
      enter,exit,clearInput,recover,
      holdVehicleTransition:(progress)=>{
        if(!import.meta.env.DEV)return false;
        if(progress===null){holdDoorForQA.current=false;return true;}
        const tr=guideTransition.current;if(!tr)return false;
        holdDoorForQA.current=true;
        tr.elapsed=tr.phase==='enter'?(tr.approachSeconds??VEHICLE_TRANSITION_S*.3)+(progress-.3)*VEHICLE_TRANSITION_S:progress*VEHICLE_TRANSITION_S;
        return true;
      },
      drive:(input,seconds=1)=>{debugDrive.current={input,remaining:seconds};},
      flip:(id=useWorldStore.getState().activeVehicle ?? 'offroad',side=false)=>{const car=cars.current.get(id);if(!car)return false;const q=new Quaternion().setFromEuler(new Euler(side?Math.PI/2:Math.PI,heading(car.body.rotation()),0,'YXZ'));car.body.setRotation(q,true);car.body.setTranslation({...car.body.translation(),y:car.body.translation().y+1},true);car.body.setLinvel({x:0,y:0,z:0},true);car.body.setAngvel({x:0,y:0,z:0},true);car.flipped=0;return true;},
      water:(id)=>{if(id || useWorldStore.getState().activeVehicle){const car=cars.current.get(id ?? useWorldStore.getState().activeVehicle!);if(!car)return false;if(useWorldStore.getState().activeVehicle===car.spec.id)clearPlayerMotion(true);resetBody(car.body,[110,WATER_Y-1,85]);car.wet=0;return true;}if(!player.current)return false;relocatePlayer([110,WATER_Y-1,85]);return true;},
    };
    debugTarget=api;
    return ()=>{
      window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',clearInput);
      document.removeEventListener('visibilitychange',hidden);gl.domElement.removeEventListener('wheel',wheel);unsubscribe();clearInput();
      el.removeEventListener('pointerdown',pointerDown);el.removeEventListener('pointermove',pointerMove);el.removeEventListener('pointerup',pointerUp);
      el.removeEventListener('pointercancel',pointerUp);el.removeEventListener('dblclick',dbl);el.removeEventListener('contextmenu',menu);
      if(document.pointerLockElement===el)document.exitPointerLock?.();
      if(debugTarget===api)debugTarget=null;
      occlusion.current.dispose();
      clearWheelFixture();
    };
  },[world,rapier,gl,colliderStates]);

  useBeforePhysicsStep(()=>{
    const state=useWorldStore.getState(); if(state.paused || state.poolInspect || state.shot || !player.current) return;
    physicsSteps.current++;
    const dt=world.timestep || PHYSICS_STEP;
    for(const [id,seconds] of rescueRetry.current)rescueRetry.current.set(id,Math.max(0,seconds-dt));
    if(attractionRide.active){
      if(!rideHeld.current){
        clearPlayerMotion(true);clearInput();rideHeld.current=true;player.current.setEnabled(false);
        occlusion.current.dispose();
        nearbyItem.current=null;useWorldStore.setState({nearbyInteract:null,nearbyVehicle:null,canVault:false});
      }
      const before=pad.current.buttons,gp=readPad(pad.current);pad.current=gp;
      if(gp.connected&&gp.buttons[9]&&!before[9]){useWorldStore.setState({paused:true});return;}
      if(gp.connected&&gp.buttons[1]&&!before[1])endAttractionRide();
      stepWorldVehicles(dt);
      const pose=attractionRide.pose,p:Vec3=[pose.seat[0],pose.seat[1]+PLAYER_CENTER_HEIGHT,pose.seat[2]];
      resetBody(player.current,p);guideYaw.current=pose.yaw;grounded.current=true;
      guideTargetSpeed.current=0;moveIntent.current='idle';mineActor.available=false;
      publishedTime.current+=dt;
      if(publishedTime.current>.09){publishedTime.current=0;useWorldStore.setState({position:p,speed:0,zone:'coaster'});}
      return;
    }
    if(rideHeld.current){
      const p=attractionRide.exit;
      const landing=findSafePlayerLanding(world,rapier,player.current,[p,[p[0]+2,p[1],p[2]],[p[0]-2,p[1],p[2]]],WATER_Y);
      relocatePlayer(landing??CAMP_SPAWN);
    }
    portalTravel.current.cooldown=Math.max(0,portalTravel.current.cooldown-dt);
    if(guideTransition.current){
      const tr=guideTransition.current;
      if(!holdDoorForQA.current)tr.elapsed+=dt;
      const doorCar=cars.current.get(tr.id);
      if(doorCar)doorCar.doors.openness=guideVehicleSample(tr.phase,guideVehicleProgress(tr.phase,tr.elapsed,tr.approachSeconds)).doorOpen;
      if(guideTransition.current.elapsed>=(guideTransition.current.duration??VEHICLE_TRANSITION_S)){
        if(doorCar)doorCar.doors.openness=0;
        if(tr.phase==='exit'&&tr.exitPosition){
          // Revalidate after the animation: another object may have occupied the exit meanwhile.
          const landing=findSafePlayerLanding(world,rapier,player.current,[tr.exitPosition.map((v,i)=>i===1?v-PLAYER_CENTER_HEIGHT:v) as Vec3],WATER_Y);
          if(landing){
            if(doorCar)guideYaw.current=heading(guideVehicleOrientation(cabinFrame(doorCar,tr.side),guideVehicleSample('exit',.7),Math.PI,new Quaternion()));
            resetBody(player.current,landing);player.current.setEnabled(true);portalTravel.current.previous=landing;useWorldStore.setState({activeVehicle:null,speed:0});
          }
          else actorNotice('下车位置被挡住了，已留在车内，请换个停车位置。','The exit became blocked. You remain seated; choose a clear parking spot.');
        }
        guideTransition.current=null;
        if(pendingVehicleExit.current){pendingVehicleExit.current=false;exit();}
      }
    }
    const currentVehicle=useWorldStore.getState().activeVehicle;
    let active=currentVehicle?cars.current.get(currentVehicle):undefined;
    // Evaluate proximity at physics frequency; UI publication is throttled separately.
    let nearby:VehicleId|null=null,nearest=3.8;
    const playerPosition=player.current.translation();
    mineActor.position = [playerPosition.x, playerPosition.y, playerPosition.z];
    mineActor.yaw = guideYaw.current;
    mineActor.grounded = grounded.current;
    mineActor.available = !active && !state.seat && !state.card && !state.clubMode && !railVault.current;
    if(!active)cars.current.forEach(car=>{const p=car.body.translation();const d=Math.hypot(p.x-playerPosition.x,p.y-playerPosition.y,p.z-playerPosition.z);if(d<nearest){nearest=d;nearby=car.spec.id;}});
    // World interactables (spec §15.3). Only reachable anchors count: within reach and with a clear line
    // of sight from the chest (no wall / floor between), so nothing triggers through a wall or a storey.
    // Anchor distances are compared on the same horizontal metric as the car's (vehicle wins only when
    // its anchor is closer). While seated, a card is open or driving, E belongs to that state.
    const seated=!!state.seat,carded=!!state.card;
    const sight=(item:Interactable)=>{
      const [ix,iy,iz]=item.position,ox=playerPosition.x,oy=playerPosition.y+.45,oz=playerPosition.z;
      const dx=ix-ox,dy=iy+.2-oy,dz=iz-oz,len=Math.hypot(dx,dy,dz);
      if(len<.35)return true;
      const hit=world.castRay(new rapier.Ray({x:ox,y:oy,z:oz},{x:dx/len,y:dy/len,z:dz/len}),len-.3,true,undefined,undefined,undefined,player.current??undefined,
        c=>!c.isSensor()&&!(c.parent()?.userData as {interactable?:string}|undefined)?.interactable&&!(c.parent()?.userData as {vehicle?:string}|undefined)?.vehicle);
      return !hit;
    };
    const reach=active||seated||carded||state.clubMode?null:nearestInteractable(playerPosition.x,playerPosition.y,playerPosition.z,sight,state.interactPick);
    if(!active)nearest=nearby?Math.hypot(cars.current.get(nearby)!.body.translation().x-playerPosition.x,cars.current.get(nearby)!.body.translation().z-playerPosition.z):Infinity;
    if(reach&&nearby&&nearest<reach.distance)nearbyItem.current=null;else{nearbyItem.current=reach?.item??null;if(reach)nearby=null;}
    if(seated||carded)nearby=null;
    const interactNow=(item:Interactable|null)=>{
      const now=useWorldStore.getState();
      if(now.clubMode){useWorldStore.setState({clubMode:null});return;}
      if(now.seat){useWorldStore.setState({seat:null});return;}
      if(now.card){useWorldStore.setState({card:null});return;}
      if (mineBusy() || railVault.current) return;
      if (useAlphaMineStore.getState().carried && item && !item.id.startsWith('alpha-mine-')) {
        actorNotice('先在矿场暂存台按 F 放下矿石，再使用其他设施。', 'Set the ore on a mine shelf with F before using another attraction.');
        return;
      }
      if(active)exit();else if(item){item.onInteract();}else if(nearby)enter(nearby);
      active=useWorldStore.getState().activeVehicle?cars.current.get(useWorldStore.getState().activeVehicle!):undefined;
    };
    if(actions.current.interact){interactNow(nearbyItem.current);actions.current.interact=false;}
    if(useWorldStore.getState().paused||useWorldStore.getState().poolInspect)return;
    if(actions.current.recover || state.recoverRequest!==lastRecover.current){recover();lastRecover.current=state.recoverRequest;actions.current.recover=false;}
    // Gamepad (standard mapping): buttons as edges. A jump, Y enter/leave, B flip back, Back camera, Start pause.
    const before=pad.current.buttons,gp=readPad(pad.current);
    if(resetPad.current){
      const held=Math.hypot(...gp.move)+Math.hypot(...gp.look)+gp.throttle+gp.brake+Number(gp.buttons.some(Boolean));
      if(held<.01)resetPad.current=false;
      else{gp.move=[0,0];gp.look=[0,0];gp.throttle=0;gp.brake=0;gp.sprint=false;gp.buttons=[];}
    }
    pad.current=gp;
    if(useWorldStore.getState().clubMode==='dj'){gp.move=[0,0];gp.look=[0,0];actions.current.jump=false;}
    const edge=(i:number)=>!!gp.buttons[i]&&!before[i];
    if(gp.connected){
      if(edge(12))cycleInteractPick(-1);
      if(edge(13))cycleInteractPick(1);
      if(edge(0)&&useWorldStore.getState().clubMode!=='dj')actions.current.jump=true;
      if(edge(3))interactNow(nearbyItem.current);
      if(edge(1))actions.current.recover=true;
      if(edge(8))cycleCamera();
      if(edge(9)){useWorldStore.setState({paused:true});return;}
    }
    const debug=debugDrive.current;
    // The shared actor transition owns entry/exit duration. Keep the car parked throughout,
    // without freezing its rigid body or storing throttle that can fire after a cancelled entry.
    const transitioning=!!active&&!!guideTransition.current;
    // Keyboard: W/S and A/D ramp toward +-1 (held = gradually full, released = back to 0). Gamepad: right
    // trigger throttle, left trigger brake/reverse, left stick steering, all analogue and used directly.
    if(active&&transitioning){active.throttleInput=0;active.steerInput=0;active.driving.power=0;}
    else if(active&&!debug){
      const keyThrottle=Number(keys.current.has('KeyW'))-Number(keys.current.has('KeyS'));
      const keySteer=Number(keys.current.has('KeyA'))-Number(keys.current.has('KeyD'));
      const padThrottle=gp.throttle-gp.brake,padSteer=-gp.move[0];
      active.throttleInput=keyThrottle!==0||padThrottle===0?rampAxis(active.throttleInput,keyThrottle,dt,THROTTLE_RISE,THROTTLE_FALL):padThrottle;
      active.steerInput=keySteer!==0||padSteer===0?rampAxis(active.steerInput,keySteer,dt,STEER_RISE,STEER_FALL):padSteer;
    }
    cars.current.forEach(car=>{if(car!==active){car.steerInput=0;car.throttleInput=0;}});
    const throttle=transitioning?0:debug?clamp(debug.input.throttle,-1,1):active?.throttleInput??0;
    const steer=transitioning?0:debug?clamp(debug.input.steer,-1,1):active?.steerInput??0;
    if(debug){debug.remaining-=dt;if(debug.remaining<=0)debugDrive.current=null;}
    stepWorldVehicles(dt,active,throttle,steer,transitioning,!!debug,
      debug?.input.brake??(keys.current.has('Space')||!!gp.buttons[5]),
      debug?.input.handbrake??(keys.current.has('KeyX')||!!gp.buttons[2]),
      debug?.input.boost??(keys.current.has('ShiftLeft')||keys.current.has('ShiftRight')||!!gp.buttons[0]));
    publishDrivingTelemetry(active?.spec.id==='coupe'?active.driving:null);
    if(!active){
      const p=player.current.translation(),velocity=player.current.linvel();
      const ground=playerSupport(world,rapier,player.current);
      grounded.current=ground?.grounded??false;
      mineActor.grounded = grounded.current;
      if (new URLSearchParams(window.location.search).get('qaPhysicsSupport') === '1') supportDecision.current={
        step:physicsSteps.current,body:asTuple(p),velocity:asTuple(velocity),grounded:grounded.current,jumpRequested:actions.current.jump,
        capsuleSupport:ground?{gap:ground.gap,normal:asTuple(ground.normal),centerY:ground.centerY}:null};
      // Raw input in camera space (x right, z forward): keys plus the left stick (analogue magnitude).
      let rx=Number(keys.current.has('KeyD'))-Number(keys.current.has('KeyA'));
      let rz=Number(keys.current.has('KeyW'))-Number(keys.current.has('KeyS'));
      if(gp.connected){rx+=gp.move[0];rz-=gp.move[1];}
      if(useWorldStore.getState().clubMode==='dj'){
        rx=0;rz=0;actions.current.jump=false;
        const consoleYaw=Math.atan2(p.z-CLUB.console[2],CLUB.console[0]-p.x);
        guideYaw.current+=clamp(angleDelta(guideYaw.current,consoleYaw),-dt*WALK_TURN,dt*WALK_TURN);
      }
      if(useWorldStore.getState().clubMode==='dance'&&(Math.hypot(rx,rz)>.05||actions.current.jump))useWorldStore.setState({clubMode:null});
      let rm=Math.hypot(rx,rz);if(rm>1){rx/=rm;rz/=rm;rm=1;}
      // Direction smoothing: from rest the input applies at once (A3 turn-before-move still sees the full
      // turn); while moving, the direction turns at WALK_TURN rad/s, so changing keys sweeps through every
      // angle instead of jumping between 45 deg multiples. Reversals (> 150 deg) snap.
      const mv=moveInput.current;
      if(rm<1e-3){mv[0]=0;mv[1]=0;}
      else{
        const cm=Math.hypot(mv[0],mv[1]);
        if(cm<1e-3){mv[0]=rx;mv[1]=rz;}
        else{
          const a0=Math.atan2(mv[1],mv[0]),da=angleDelta(a0,Math.atan2(rz,rx));
          const a=Math.abs(da)>2.6?a0+da:a0+clamp(da,-dt*WALK_TURN,dt*WALK_TURN),m=cm+(rm-cm)*(1-Math.exp(-dt*14));
          mv[0]=Math.cos(a)*m;mv[1]=Math.sin(a)*m;
        }
      }
      const magnitude=Math.min(1,Math.hypot(mv[0],mv[1])),running=keys.current.has('ShiftLeft')||keys.current.has('ShiftRight')||gp.sprint;
      // Seated (store.seat, spec §15.3): the capsule is disabled while seated so the seat keeps its own
      // collider (benches stay solid); the visual sits at the seat point. Any movement input, a jump or E
      // stands up: prefer the nearest clear point in front of the seat. The original approach point
      // remains a fallback; returning there first could force a needless metre-long visual retreat.
      const seat=useWorldStore.getState().seat;
      if(seat&&(magnitude>.05||actions.current.jump)){useWorldStore.setState({seat:null});actions.current.jump=false;}
      else if(seat&&seatHeld.current!==seat.id){
        seatFrom.current=[p.x,p.y,p.z];seatHeld.current=seat.id;guideYaw.current=seat.yaw;
        seatBody.current=[seat.position[0],seat.position[1]+PLAYER_CENTER_HEIGHT,seat.position[2]];
        // A disabled body takes no part in collision, so it can rest at the seat point (inside the
        // bench's collider) without being pushed out; the visual follows the body as usual.
        player.current.setEnabled(false);resetBody(player.current,seatBody.current);
      }
      if(seat){moveIntent.current='idle';guideTargetSpeed.current=0;actions.current.jump=false;}
      if(!seat&&seatHeld.current){
        const seatedAt=seatBody.current,seatFacing=guideYaw.current;
        seatHeld.current=null;seatBody.current=null;
        const from=seatFrom.current;seatFrom.current=null;
        const free=(q:Vec3)=>{let blocked=false;world.intersectionsWithShape({x:q[0],y:q[1],z:q[2]},{x:0,y:0,z:0,w:1},new rapier.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),
          ()=>{blocked=true;return false;},undefined,undefined,undefined,player.current??undefined,c=>!c.isSensor());return !blocked;};
        let spot:Vec3|null=null;
        if(seatedAt&&from)for(const offset of [0,Math.PI/2,-Math.PI/2,Math.PI/4,-Math.PI/4,Math.PI*.75,-Math.PI*.75,Math.PI]){
          for(const d of [.65,.70,.80,.90]){
            const a=seatFacing+offset,q:Vec3=[seatedAt[0]+Math.cos(a)*d,from[1]+.025,seatedAt[2]-Math.sin(a)*d];
            // The approach may have been on the bench or on a higher step. Sample the exit floor
            // instead of reusing that old height and dropping the capsule into the bench's edge.
            const floor=world.castRayAndGetNormal(new rapier.Ray({x:q[0],y:q[1]+.5,z:q[2]},{x:0,y:-1,z:0}),3,true,
              undefined,undefined,undefined,player.current,c=>!c.isSensor()&&(!c.parent()||c.parent()!.isFixed()));
            if(!floor||floor.normal.y<.91)continue;
            const floorY=q[1]+.5-floor.timeOfImpact;if(floorY<WATER_Y+.15)continue;
            q[1]=floorY+PLAYER_HALF_HEIGHT+PLAYER_RADIUS+.01;
            if(free(q)){spot=q;break;}
          }
          if(spot)break;
        }
        if(!spot&&from&&free(from))spot=from;
        if(!spot&&from)for(let k=0;k<8&&!spot;k++){const a=k*Math.PI/4,q:Vec3=[from[0]+Math.cos(a)*.9,from[1]+.05,from[2]+Math.sin(a)*.9];if(free(q))spot=q;}
        if(spot)resetBody(player.current,spot);
        player.current.setEnabled(true);
      }
      const speed=(seat?0:running?6.2:3.6)*magnitude;
      moveIntent.current=magnitude>.05?(running?'run':'walk'):'idle';
      // Movement is relative to the camera's current ground heading (GTA style), any angle.
      const [wx,wz]=magnitude>.05?cameraRelative(mv[0]/magnitude,mv[1]/magnitude,cam.current.yaw):[0,0];
      mineActor.moving = magnitude > .05;
      const mining = useAlphaMineStore.getState().action;
      if (mining && !mining.contact && magnitude > .05) cancelMineAction();
      const locked=guideMovementLock.current || !!guideTransition.current || mineBusy();
      if (mining && mineBusy()) {
        const desired = Math.atan2(-(mining.target[2] - p.z), mining.target[0] - p.x);
        guideYaw.current += clamp(Math.atan2(Math.sin(desired - guideYaw.current), Math.cos(desired - guideYaw.current)), -dt * 10, dt * 10);
      }
      let vx=locked?0:wx*speed,vz=locked?0:wz*speed;
      if (magnitude>.05 && !locked) {
        const desiredYaw=Math.atan2(-vz,vx);
        const difference=Math.atan2(Math.sin(desiredYaw-guideYaw.current),Math.cos(desiredYaw-guideYaw.current));
        if (grounded.current && Math.hypot(velocity.x,velocity.z)<.5 && Math.abs(difference)>Math.PI/3)
          turnBeforeMove.current=true;
        if (!grounded.current) turnBeforeMove.current=false;
        const yawStep=clamp(difference,-dt*(turnBeforeMove.current?24:12),dt*(turnBeforeMove.current?24:12));
        guideYaw.current+=yawStep;
        // Fable A3: low-speed large turns finish before movement accelerates.
        // The same heading drives the visual model, so no second smoothing clock lags it.
        if (Math.abs(difference-yawStep)<Math.PI/9) turnBeforeMove.current=false;
        if (turnBeforeMove.current) { vx=0; vz=0; }
      } else turnBeforeMove.current=false;
      guideTargetSpeed.current=Math.hypot(vx,vz);
      mineActor.yaw = guideYaw.current;
      advanceMineAction(dt);
      // Reuse the actor clock. A bounded preview query runs only while on foot and grounded;
      // pressing Space always revalidates against current collision and landing geometry.
      const eligible=!seat&&!locked&&grounded.current&&!useAlphaMineStore.getState().carried&&!railVault.current;
      vaultPreview.current.elapsed+=dt;
      if(!eligible){vaultPreview.current.plan=null;vaultPreview.current.x=Infinity;}
      else if(vaultPreview.current.elapsed>=.18){
        const preview=vaultPreview.current;
        if(Math.hypot(p.x-preview.x,p.z-preview.z)>.08||Math.abs(guideYaw.current-preview.yaw)>.08||preview.colliders!==world.colliders.len()||(preview.plan&&preview.elapsed>=1)){
          preview.elapsed=0;preview.x=p.x;preview.z=p.z;preview.yaw=guideYaw.current;preview.colliders=world.colliders.len();
          preview.plan=findRailVault(world,rapier,player.current,{x:Math.cos(guideYaw.current),y:0,z:-Math.sin(guideYaw.current)},WATER_Y);
        }
      }
      const canVault=!!vaultPreview.current.plan;
      if(useWorldStore.getState().canVault!==canVault)useWorldStore.setState({canVault});
      if(actions.current.jump&&eligible){
        const plan=findRailVault(world,rapier,player.current,{x:magnitude>.05?wx:Math.cos(guideYaw.current),y:0,z:magnitude>.05?wz:-Math.sin(guideYaw.current)},WATER_Y);
        if(plan){railVault.current={...plan,elapsed:0};vault.current=null;actions.current.jump=false;}
      }
      const transfer=railVault.current;
      if(transfer){
        const next=railVaultVelocity(world,rapier,player.current,transfer,transfer.elapsed,dt);
        if(!next){railVault.current=null;player.current.setLinvel({x:0,y:Math.min(0,player.current.linvel().y),z:0},true);}
        else{
          if(transfer.elapsed<transfer.prepare&&transfer.elapsed+dt>=transfer.prepare)jumpSeq.current++;
          player.current.setLinvel(next,true);transfer.elapsed+=dt;
          guideYaw.current=Math.atan2(-transfer.direction.z,transfer.direction.x);
          guideTargetSpeed.current=Math.hypot(next.x,next.z);moveIntent.current='idle';
          if(transfer.elapsed>=transfer.prepare)grounded.current=false;
          if(transfer.elapsed>=transfer.duration){railVault.current=null;player.current.setLinvel({x:0,y:next.y,z:0},true);}
        }
        actions.current.jump=false;
      }else{
      if(vault.current){
        vault.current.remaining-=dt;
        if(vault.current.remaining<=0 || (grounded.current&&vault.current.remaining<vault.current.duration-.15))vault.current=null;
        else {vx=vault.current.vx;vz=vault.current.vz;guideYaw.current=Math.atan2(-vz,vx);}
      }
      const mass=player.current.mass(),change=playerVelocityChange(velocity,{x:vx,y:0,z:vz},dt,grounded.current);
      const dx=change.x,dz=change.z;
      player.current.applyImpulse({x:dx*mass,y:0,z:dz*mass},true);
      const currentVelocity=player.current.linvel();
      const safeVelocity=clearance.current?sweptPlayerVelocity(clearance.current,player.current,currentVelocity,dt,rapier.QueryFilterFlags.EXCLUDE_SENSORS):currentVelocity;
      if(safeVelocity!==currentVelocity)player.current.setLinvel(safeVelocity,true);
      const follow=seat?null:followPlayerGround(world,rapier,player.current,player.current.linvel(),dt,actions.current.jump&&grounded.current);
      if(supportDecision.current)supportDecision.current.follow=follow;
      // Local 12.5 m/s² gravity and 5 m/s launch give an approximately 1 m,
      // 0.8 s hop. Horizontal momentum is retained at the input edge.
      if(actions.current.jump && grounded.current && !locked){
        const hop=magnitude>.05?findLowVault(world,rapier,player.current,{x:wx,y:0,z:wz},WATER_Y):null;
        vault.current=hop?{...hop,remaining:hop.duration}:null;
        player.current.setLinvel({x:hop?.vx??velocity.x,y:hop?.vy??5,z:hop?.vz??velocity.z},true);
        grounded.current=false;jumpSeq.current++;
      }
      }
      const wet=updateHeadSubmersion(wetPlayer.current,dt,p.y,WATER_Y);
      wetPlayer.current=wet.submergedSeconds;
      if((wet.shouldRescue||p.y< -80)&&!(rescueRetry.current.get('player')??0)){
        rescueRetry.current.set('player',1);
        const dry=nearestDryPoint(p.x,p.z);
        const candidates:Vec3[]=[...(dry?[dry]:[]),...allRoadLandingCandidates(asTuple(p)).map(c=>c.position),[CAMP_SPAWN[0],4.8,CAMP_SPAWN[2]]];
        const landing=findSafePlayerLanding(world,rapier,player.current,candidates,WATER_Y);
        if(landing){relocatePlayer(landing);actorNotice('已回到安全陆地。浅水仍可自由走动。','Back on safe ground. Shallow water is still walkable.');}
      }
      const travel=portalTravel.current,now=asTuple(player.current.translation());
      if(!travel.armed&&portalRearmed(travel.cooldown,now,WORLD_PORTALS))travel.armed=true;
      if(travel.armed&&travel.previous&&!seat&&!locked&&!state.card&&!railVault.current){
        const source=WORLD_PORTALS.find(g=>portalCrossing(g,travel.previous!,now,PLAYER_RADIUS,PLAYER_HALF_HEIGHT));
        if(source){
          const destinations=WORLD_PORTALS.filter(g=>g.id!==source.id),start=Math.floor(Math.random()*destinations.length);
          travel.armed=false;travel.cooldown=2;
          let transferred=false;
          for(let i=0;i<destinations.length;i++){
            const destination=destinations[(i+start)%destinations.length];
            const landing=findSafePlayerLanding(world,rapier,player.current,destination.arrivalCandidates,WATER_Y);
            if(!landing)continue;
            relocatePlayer(landing);guideYaw.current=Math.atan2(-(landing[2]-destination.position[2]),landing[0]-destination.position[0]);
            useWorldStore.setState({position:landing,nearbyInteract:null,nearbyVehicle:null,canVault:false,zone:LAYOUT_V4?zoneAtV4(landing[0],landing[2]):destination.id==='camp'?'camp':'park'});
            const zh={camp:'营地',mine:'WorldQuant 矿场',park:'项目广场',yard:'物资清点场',coaster:'意图过山车'},en={camp:'camp',mine:'WorldQuant quarry',park:'project plaza',yard:'Inventory yard',coaster:'Intent coaster'};
            actorNotice(`已抵达${zh[destination.id]}。离开门口后可再次穿行。`,`Arrived at ${en[destination.id]}. Walk away to rearm the gate.`);
            transferred=true;
            break;
          }
          if(!transferred)actorNotice('出口暂时被挡住了，离开光幕后可再试。','The exits are obstructed. Step away from the veil and try again.');
        }
      }
      travel.previous=asTuple(player.current.translation());
    }
    actions.current.jump=false;
    const body=active?.body ?? player.current,p=body.translation(),v=body.linvel();
    publishedTime.current+=dt;
    if(publishedTime.current>.09){
      publishedTime.current=0;
      const item=nearbyItem.current,prev=useWorldStore.getState().nearbyInteract;
      const nearbyInteract:NearbyInteract|null=item&&!active?(prev?.id===item.id&&prev.label.zh===item.label.zh&&prev.label.en===item.label.en&&prev.kind===item.kind?prev:{id:item.id,label:item.label,kind:item.kind}):null;
      useWorldStore.setState({position:asTuple(p),speed:active?Math.hypot(v.x,v.z)*3.6:0,nearbyVehicle:active?null:nearby,nearbyInteract,canRecover:!!active && active.flipped>=RECOVERY_SECONDS,zone:LAYOUT_V4?zoneAtV4(p.x,p.z):p.x>35?'park':p.x< -15?'camp':'town'});
    }
  });

  useFrame((_,delta)=>{
    const state=useWorldStore.getState();
    if (state.shot) {
      if(guideView.current)guideView.current.visible=true;
      // Fixed evidence cameras retain their original projection.
      if (camera instanceof PerspectiveCamera && camera.fov !== 50) {
        camera.fov = 50; camera.updateProjectionMatrix();
      }
      return;
    }
    if (state.paused || state.poolInspect) return;
    if(attractionRide.active){
      const pose=attractionRide.pose;
      camera.position.set(...pose.cameraPosition);camera.up.set(...(pose.cameraUp??[0,1,0]));camera.lookAt(...pose.cameraTarget);
      if(camera instanceof PerspectiveCamera&&camera.fov!==pose.fov){camera.fov=pose.fov;camera.updateProjectionMatrix();}
      if(guideView.current)guideView.current.visible=!pose.firstPerson;
      cameraReady.current=false;
      return;
    }
    camera.up.set(0,1,0);
    const c=cam.current,driving=!!state.activeVehicle&&guideTransition.current?.phase!=='enter';
    const car=driving?cars.current.get(state.activeVehicle!):undefined;
    const body=car?.body??player.current;if(!body)return;
    const p=body.translation(),velocity=body.linvel(),speed=Math.hypot(velocity.x,velocity.z);
    const now=performance.now()/1000;
    // Right stick look (rad/s), counts as manual input for the drive recentre timer.
    if(pad.current.connected&&(pad.current.look[0]||pad.current.look[1])){
      const lim=c.firstPerson?CAMERA_PITCH_LIMITS.first:CAMERA_PITCH_LIMITS.third;
      c.yaw+=pad.current.look[0]*PAD_LOOK*delta;c.pitch=clamp(c.pitch+pad.current.look[1]*PAD_LOOK*delta,lim[0],lim[1]);c.lastManual=now;
    }
    c.mode=driving?'drive':'walk';
    // Walking: the camera never turns by itself. Driving: after DRIVE_RECENTER_DELAY s without manual look
    // it eases back behind the car (yaw follows the car heading, pitch returns to a low chase angle).
    c.recentering=false;
    if(car){
      const carYaw=heading(car.body.rotation()),behind=-carYaw+Math.PI;   // orbit yaw that puts the camera behind +X
      if(lastCarYaw.current===null){enteredAt.current=now;c.lastManual=-Infinity;c.driveManualZoom=false;}
      lastCarYaw.current=carYaw;
      // Recentre while moving, and for 2 s after entering so the chase view settles behind the car.
      if(now-c.lastManual>DRIVE_RECENTER_DELAY&&(speed>1.2||now-enteredAt.current<2)){
        const k=1-Math.exp(-delta*DRIVE_RECENTER_RATE);
        c.yaw+=angleDelta(c.yaw,behind)*k;
        if(!c.firstPerson)c.pitch+=(DRIVE_PITCH-c.pitch)*k;
        c.recentering=Math.abs(angleDelta(c.yaw,behind))>.02;
      }
    } else lastCarYaw.current=null;
    // FOV: 50 deg on foot, chase view widens with speed (<= +10 deg); first person 70 deg.
    const targetFov=c.firstPerson?70:driving?55+Math.min(10,speed*.35)+(car?.driving.boosting?4:0):50;
    c.fov+= (targetFov-c.fov)*(1-Math.exp(-delta*6));
    if (camera instanceof PerspectiveCamera && Math.abs(camera.fov-c.fov)>.01) { camera.fov=c.fov; camera.updateProjectionMatrix(); }
    // Pivot: head height on foot, roof height in a car; first person sits at eye height.
    const eye=car?car.spec.size[1]*.38:.3;   // above the body centre: driver's eye / helmet visor height
    const cameraSeat=!car?useWorldStore.getState().seat:null;
    // The disabled seated capsule stays a standing body-height above the seat. Aim at the actual
    // seated body instead: fresh GLB runtime samples put the helmet centre at +0.884-0.956 m.
    // Keep the sweep above the chair back; the orbit view frames the chest separately below.
    const targetY=cameraSeat?cameraSeat.position[1]+.92:Math.max(p.y,WATER_Y)+(c.firstPerson?eye:car?car.spec.size[1]*.6:.65);
    const desiredTarget=new Vector3(p.x,targetY,p.z);
    if(!cameraReady.current){target.current.copy(desiredTarget);cameraReady.current=true;}
    target.current.lerp(desiredTarget,c.firstPerson?1:1-Math.exp(-delta*10));
    const dir=orbitDirection(c.yaw,c.pitch);
    const exclude=car?.body??player.current??undefined;
    const radius=camera instanceof PerspectiveCamera
      ?cameraCollisionRadius(camera.near,camera.fov,camera.aspect,c.firstPerson?EYE_RADIUS:CAMERA_RADIUS):CAMERA_RADIUS;
    const solid=(col:RapierCollider)=>{
      if(col.isSensor())return false;const b=col.parent();if(!b)return true;
      if(b.handle===player.current?.handle)return false;
      const ud=b.userData as {vehicle?:string;obstacle?:boolean}|undefined;
      return !ud?.obstacle&&!(ud?.vehicle&&b.handle===car?.body.handle);
    };
    // All corrections share the same physical sweep, including the smoothed pivot itself.
    const probe=(from:{x:number;y:number;z:number},d:{x:number;y:number;z:number},len:number,radius:number)=>{
      const result=sweepCamera(world,rapier,from,{x:from.x+d.x*len,y:from.y+d.y*len,z:from.z+d.z*len},radius,exclude,solid);
      return {free:result.distance,hit:result.hit};
    };
    const origin={x:p.x,y:Math.max(p.y,WATER_Y),z:p.z};
    // A lagging pivot can cut a corner even though the player capsule stayed outside the wall.
    const pivot=sweepCamera(world,rapier,origin,target.current,radius,exclude,solid);
    target.current.set(pivot.position.x,pivot.position.y,pivot.position.z);
    if(c.firstPerson){
      c.actual=0;c.desiredDistance=0;
      if(car){const f=rotateVector([car.spec.size[0]*.05,0,0],car.body.rotation());target.current.x+=f[0];target.current.z+=f[2];}
      // On foot the eye sits just in front of the visor (near plane .1 m) so the helmet shell is not in view.
      const eyePos=target.current.clone();
      if(!car){const m=Math.hypot(dir[0],dir[2])||1;eyePos.x-=dir[0]/m*.3;eyePos.z-=dir[2]/m*.3;}
      // Near-wall guard: sweep an EYE_RADIUS ball from the body centre (inside the excluded capsule / car)
      // to the eye; if a wall or roof is closer, the eye stops in front of it, so the near plane never
      // enters geometry when standing against a wall or looking out of a car beside one.
      const span=new Vector3(eyePos.x-origin.x,eyePos.y-origin.y,eyePos.z-origin.z),len=span.length();
      const r=probe(origin,len>1e-4?{x:span.x/len,y:span.y/len,z:span.z/len}:{x:0,y:1,z:0},len,radius);
      c.hitDistance=r.hit;c.collided=r.free<len-.01;
      if(c.collided)eyePos.set(origin.x,origin.y,origin.z).addScaledVector(span,r.free/len);
      camera.position.copy(eyePos);
      camera.up.copy(UP);camera.lookAt(camera.position.x-dir[0],camera.position.y-dir[1],camera.position.z-dir[2]);
    } else {
      // Manual zoom is honoured in 2.5-30 m. The automatic chase view keeps a 7 m comfort floor (until the
      // player scrolls in the car) and adds up to 4 m with speed, capped at CAMERA_MAX_DISTANCE.
      const base=driving&&!c.driveManualZoom?Math.max(DRIVE_MIN_DISTANCE,c.distance):c.distance;
      const want=Math.min(CAMERA_MAX_DISTANCE,driving?base+Math.min(4,speed*.15):base);
      c.desiredDistance=want;
      // Collision wins over distance: the camera stops CAMERA_HIT_MARGIN in front of the first hit, with no
      // minimum distance that could push it back into the obstacle.
      const from={x:target.current.x,y:target.current.y,z:target.current.z};
      const r=probe(from,{x:dir[0],y:dir[1],z:dir[2]},want,radius);
      c.hitDistance=r.hit;
      const limit=r.free;
      c.collided=r.hit!==null&&limit<want-.01;
      // Pull in immediately (no frame inside a wall), ease back out.
      c.actual=limit<c.actual?limit:c.actual+(limit-c.actual)*(1-Math.exp(-delta*4));
      const pos=new Vector3(target.current.x+dir[0]*c.actual,target.current.y+dir[1]*c.actual,target.current.z+dir[2]*c.actual);
      // Never raycast from above every storey to "lift" the camera: that teleports through cave roofs.
      // If water/shake changes the swept goal, validate the correction too, before applying it.
      const originalY=pos.y;pos.y=Math.max(pos.y,WATER_Y+.3);
      impact.current *= Math.exp(-delta * 12);
      if (impact.current > .001) pos.y += Math.sin(performance.now() * .07) * impact.current;
      if(pos.y!==originalY){const corrected=sweepCamera(world,rapier,from,pos,radius,exclude,solid);
        pos.set(corrected.position.x,corrected.position.y,corrected.position.z);
        if(corrected.hit!==null){c.collided=true;c.hitDistance=corrected.hit;}}
      camera.position.copy(pos);
      camera.up.copy(UP);
      // A tight indoor orbit needs the body centred, while its collision sweep starts safely at
      // head height. This changes the framing without moving the camera into a chair or wall.
      const aim=cameraLookTarget(camera.position,cameraSeat
        ?{x:target.current.x,y:cameraSeat.position[1]+.45,z:target.current.z}:target.current,dir);
      camera.lookAt(aim.x,aim.y,aim.z);
    }
    // Hide drawing only, after final camera placement. Keep the child guide's pose/socket solve alive.
    if(guideView.current){
      const view=guideView.current,foot=view.getWorldPosition(guideCameraFoot.current);
      view.visible=!c.firstPerson&&(!!car||!cameraOverlapsGuide(camera.position,foot,radius,!view.visible));
    }
    occlusion.current.update(scene,camera,target.current,delta);
  });

  return <>
    <WorldDrivingFeedback />
    {/* Explicit QA fixture, outside the playable island. The platform uses the same
        surface metadata as roads so tyre guards cannot provide a second suspension. */}
    {lane && <>
      <RigidBody type="fixed" colliders={false} position={[120,4,120]} userData={{surface:true}}>
        <CuboidCollider args={[60,1,60]}/><mesh receiveShadow><boxGeometry args={[120,2,120]}/><meshStandardMaterial color="#717777"/></mesh>
      </RigidBody>
      {lane.kind==='profiles'?<WorldVehicleTestProfiles/>:<RigidBody key={`${lane.kind}-${lane.lateral}`} type="fixed" colliders={false}
        position={[120,lane.kind==='post'?5.3:lane.kind==='trunk'?6.6:6.2,120+lane.lateral]}
        userData={{solid:true,assetId:`QA-lane-${lane.kind}`}}>
        {lane.kind==='trunk'?<><CylinderCollider args={[1.6,.22]}/><mesh castShadow><cylinderGeometry args={[.22,.22,3.2,24]}/><meshStandardMaterial color="#805a39"/></mesh></>:
          <><CuboidCollider args={lane.kind==='post'?[.12,.3,.06]:[2,1.2,.1]}/><mesh castShadow><boxGeometry args={lane.kind==='post'?[.24,.6,.12]:[4,2.4,.2]}/><meshStandardMaterial color="#b66050"/></mesh></>}
      </RigidBody>}
    </>}
    {VEHICLES.map(spec=><Vehicle key={spec.id} spec={spec} cars={cars} impact={impact}/>)}
    <RigidBody ref={player} colliders={false} position={arrival} enabledRotations={[false,false,false]} gravityScale={12.5/9.81} linearDamping={.2} ccd softCcdPrediction={.1} canSleep={false}>
      {/* Zero/min friction prevents low curbs and walls from pinning the round foot.
          Horizontal impulse control handles braking; 10 cm soft CCD predicts landing contact. */}
      <CapsuleCollider name="player-capsule" args={[PLAYER_HALF_HEIGHT,PLAYER_RADIUS]} mass={72} friction={0} frictionCombineRule={rapier.CoefficientCombineRule.Min} restitution={0}/>
      <group ref={guideView} name="world-guide-camera-visibility" position={[0,-(PLAYER_RADIUS+PLAYER_HALF_HEIGHT),0]}>
        <GuideVisual cars={cars} body={player} grounded={grounded} yaw={guideYaw} targetSpeed={guideTargetSpeed} intent={moveIntent} jumpSeq={jumpSeq} visible={!firstPerson||rideHeld.current} transition={guideTransition} supportDecision={supportDecision} movementLock={guideMovementLock} vault={vault} railVault={railVault} resetId={guideResetId} />
      </group>
    </RigidBody>
  </>;
}
