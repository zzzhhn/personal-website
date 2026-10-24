import WorldVehicleTestProfiles from './WorldVehicleTestProfiles';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CapsuleCollider, ConvexHullCollider, CuboidCollider, CylinderCollider, RigidBody, useBeforePhysicsStep, useFilterContactPair, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { BoxGeometry, Euler, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { CAMP_SPAWN, VEHICLES, WATER_Y, nearestRoadPoint } from './layout';
import { nearestDryPoint } from './WorldLandform';
import { LAYOUT_V4, zoneAtV4 } from './layout-v4-flag.ts';
import { useWorldStore, type NearbyInteract } from './store';
import { cycleInteractPick, nearestInteractable, type Interactable } from './WorldInteract';
import type { Vec3, VehicleId } from './types';
import WorldGuide, { VEHICLE_TRANSITION_S, worldGuideDebug } from './WorldGuide';
import WorldVehicleVisual from './WorldVehicleVisual';
import { vehicleHulls } from './WorldVehicleAssets';
import { WorldOcclusion } from './WorldOcclusion';
import { CAMERA_DEFAULT_PITCH, CAMERA_DEFAULT_YAW, CAMERA_MAX_DISTANCE, CAMERA_MIN_DISTANCE, CAMERA_PITCH_LIMITS, CAMERA_PRESETS, PHYSICS_STEP, PLAYER_CENTER_HEIGHT, PLAYER_HALF_HEIGHT, PLAYER_RADIUS, RECOVERY_SECONDS, advanceTimer, angleDelta, cameraRelative, configureRaycastVehicle, heading, isUpsideDown, orbitDirection, radialDeadzone, rampAxis, rotateVector, wheelGeometry, yawRotation } from './actor-physics';

type VehicleSpec = (typeof VEHICLES)[number];
type Controller = ReturnType<ReturnType<typeof useRapier>['world']['createVehicleController']>;
type DriveInput = { throttle: number; steer: number; brake?: boolean };
type Car = { body: RapierRigidBody; controller: Controller; spec: VehicleSpec; flipped: number; wet: number; steering: number; guards:(RapierCollider|null)[]; lowCom:boolean;
  /** L1 hull colliders active: suspension rays only rest on fixed bodies (DESIGN 6). */
  hulls: boolean;
  lights: { brake: boolean; reverse: boolean };
  /** Continuous driver inputs after the keyboard ramp (-1..1); QA drive() bypasses the ramp. */
  steerInput: number; throttleInput: number };
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
  vehicles: { id: VehicleId; position: Vec3; velocity: Vec3; mass: number; com: Vec3; inertia: Vec3; inertiaFrame: number[]; wheelContacts: boolean[]; upsideDownSeconds: number; waterSeconds: number; steering: number; steerInput: number; throttleInput: number }[];
};
export type CameraDebug = { yaw: number; pitch: number; distance: number; desiredDistance: number; driveManualZoom: boolean; actualDistance: number; firstPerson: boolean; preset: number; collided: boolean; hitDistance: number|null;
  fov: number; mode: 'walk'|'drive'; recentering: boolean; position: Vec3; target: Vec3; forwardGround: [number,number]; groundBelowCamera: number|null; clearanceAboveGround: number|null; gamepad: boolean;
  /** Static solids overlapping a 0.1 m ball at the camera (near plane), excluding the player and the driven car. */
  nearPlaneOverlaps: string[] };
type ContactMeta = { colliderHandle: number; name: string | null; assetId: string | null; kind: 'surface' | 'solid' | 'vehicle' | 'obstacle' | 'unknown' };
type LaneObstacle = 'post' | 'trunk' | 'wall' | 'profiles';
type ActorContact = { self: 'player' | VehicleId; selfPart?: string|null; other: ContactMeta; normal: Vec3; distance: number; points: Vec3[] };
const playerColliderDimensions = { radius: PLAYER_RADIUS, halfHeight: PLAYER_HALF_HEIGHT, centerHeight: PLAYER_RADIUS + PLAYER_HALF_HEIGHT };
export interface WorldActorDebug {
  snapshot(): ActorSnapshot;
  motionProbe(): unknown;
  surfaceAudit(): unknown;
  wheelFixture(on:boolean, z?:number): boolean;
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
  flip(id?: VehicleId): boolean;
  water(id?: VehicleId): boolean;
  recover(): boolean;
  clearInput(): void;
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
  wheelFixture: (on,z) => debugTarget?.wheelFixture(on,z) ?? false,
  collisionLane: (kind,lateral) => debugTarget?.collisionLane(kind,lateral) ?? false,
  contacts: () => debugTarget?.contacts() ?? [],
  inputState: () => debugTarget?.inputState() ?? [],
  castPlayer: (from,to) => debugTarget?.castPlayer(from,to) ?? {hit:false,toi:1,other:null,normal:null},
  teleportPlayer: (p) => debugTarget?.teleportPlayer(p) ?? false,
  teleportVehicle: (id,p,yaw) => debugTarget?.teleportVehicle(id,p,yaw) ?? false,
  enter: (id) => debugTarget?.enter(id) ?? false,
  exit: () => debugTarget?.exit() ?? false,
  drive: (input,seconds) => debugTarget?.drive(input,seconds),
  flip: (id) => debugTarget?.flip(id) ?? false,
  water: (id) => debugTarget?.water(id) ?? false,
  recover: () => debugTarget?.recover() ?? false,
  clearInput: () => debugTarget?.clearInput(),
};
const asTuple = (v: {x:number;y:number;z:number}): Vec3 => [v.x,v.y,v.z];
const asVector = ([x,y,z]: Vec3) => ({x,y,z});
const clamp = (value:number, low:number, high:number) => Math.min(high,Math.max(low,value));
const UP = new Vector3(0,1,0);
/* Controls tuning (AUTHORED). Keyboard axes ramp instead of jumping: steering reaches full lock in
 * ~0.36 s and recentres in ~0.2 s; throttle reaches full in ~0.33 s. Walking input direction turns at
 * WALK_TURN rad/s between key combinations (reversals > 150 deg snap, so a U-turn is not a sideways arc). */
const STEER_RISE = 2.8, STEER_FALL = 5, THROTTLE_RISE = 3, THROTTLE_FALL = 6, WALK_TURN = 9;
const MOUSE_DRAG = .0055, MOUSE_LOCKED = .0028, PAD_LOOK = 2.8, WHEEL_ZOOM = .0011;
/** Drive camera: seconds without manual look before it eases back behind the car. */
const DRIVE_RECENTER_DELAY = 1.6, DRIVE_RECENTER_RATE = 2.4, DRIVE_PITCH = .3, DRIVE_MIN_DISTANCE = 7;
const CAMERA_RADIUS = .22, CAMERA_GROUND_CLEARANCE = .35;
/** First-person eye probe radius: covers the near-plane corners (near .1 m, FOV <= 70 deg, 16:9 ~ .15 m). */
const EYE_RADIUS = .16, CAMERA_HIT_MARGIN = .05;
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
    const car: Car = {body:body.current,controller,spec,flipped:0,wet:0,steering:0,guards:guards.current,lowCom,hulls:!!hullShapes,steerInput:0,throttleInput:0,lights:lights.current};
    cars.current.set(spec.id,car);
    return () => { cars.current.delete(spec.id); world.removeVehicleController(controller); };
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
    rotation={[0,spec.yaw,0]} colliders={false} linearDamping={0.12} angularDamping={0.65}
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
    <WorldVehicleVisual id={spec.id} size={spec.size} color={spec.color} wheelRadius={geometry.radius} wheelPoints={geometry.points} wheelRest={geometry.rest} wheels={wheels} lights={lights} />
  </RigidBody>;
}

/** Read the current body state at mixer time; React batching must not delay gait
 * acceleration, braking, or contact transitions by several rendered frames. */
/** Guide-only vehicle transition (character session): set by enter()/exit(), read by the guide. 'start' is
 * performance.now() seconds; 'door' is the car's door anchor at that moment (car body + side offset). */
type GuideVehicleTransition = { phase: 'enter'|'exit'; start: number; door: [number,number,number] } | null;
function GuideVisual({ body, grounded, yaw, targetSpeed, intent, jumpSeq, visible, transition }: { body: RefObject<RapierRigidBody | null>; grounded: RefObject<boolean>; yaw: RefObject<number>; targetSpeed: RefObject<number>; intent: RefObject<'idle'|'walk'|'run'>; jumpSeq: RefObject<number>; visible: boolean; transition: RefObject<GuideVehicleTransition> }) {
  const {world,rapier}=useRapier();
  const probeGround=(x:number,z:number,fromY:number)=>{
    const hit=world.castRayAndGetNormal(new rapier.Ray({x,y:fromY,z},{x:0,y:-1,z:0}),3,true,
      undefined,undefined,undefined,body.current??undefined,c=>!c.isSensor()&&(!c.parent()||c.parent()!.isFixed()));
    return hit&&hit.normal.y>.55?{y:fromY-hit.timeOfImpact,nx:hit.normal.x,ny:hit.normal.y,nz:hit.normal.z}:null;
  };
  const readMotion = () => {
    const v = body.current?.linvel();
    return { speedMps: v ? Math.hypot(v.x, v.z) : 0, grounded: grounded.current, facing: yaw.current, targetSpeedMps:targetSpeed.current,
      intent:intent.current,verticalSpeedMps:v?.y??0,jumpSeq:jumpSeq.current,probeGround,...guideStates() };
  };
  // Seat (store.seat) and vehicle step-in/out timing for the guide's sit / enter / exit clips. Driving hides
  // the guide only after the enter transition; during exit it fades in from the door.
  const guideStates=()=>{
    const st=useWorldStore.getState(),tr=transition.current;
    let vehicle:null|{phase:'enter'|'exit';t:number;door:[number,number,number]}=null;
    if(tr){const t=(performance.now()/1000-tr.start)/VEHICLE_TRANSITION_S;if(t<1)vehicle={phase:tr.phase,t:Math.max(0,t),door:tr.door};else transition.current=null;}
    return {seat:st.seat?{position:st.seat.position,yaw:st.seat.yaw}:null,vehicle,hidden:!!st.activeVehicle&&!vehicle};
  };
  return <WorldGuide speedMps={0} grounded facing={0} visible={visible} readMotion={readMotion} />;
}

export default function WorldActors() {
  const player = useRef<RapierRigidBody>(null);
  const guideYaw = useRef(0);
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
  const actions = useRef({interact:false,jump:false,recover:false});
  const debugDrive = useRef<{input:DriveInput;remaining:number}|null>(null);
  const grounded = useRef(false);
  const moveIntent=useRef<'idle'|'walk'|'run'>('idle');
  const jumpSeq=useRef(0);
  const guideTransition=useRef<GuideVehicleTransition>(null);
  const physicsSteps = useRef(0);
  const wetPlayer = useRef(0);
  const lastRecover = useRef(useWorldStore.getState().recoverRequest);
  const publishedTime = useRef(0);
  const activeVehicle = useWorldStore(s=>s.activeVehicle);
  const firstPerson = useWorldStore(s=>s.zoom===3);
  const { world, rapier, colliderStates } = useRapier();
  const { camera, scene, gl } = useThree();
  const target = useRef(new Vector3(...CAMP_SPAWN));
  const cameraReady = useRef(false);
  const impact = useRef(0);
  const cam = useRef<CameraRig>({ yaw: CAMERA_DEFAULT_YAW, pitch: CAMERA_DEFAULT_PITCH, distance: CAMERA_PRESETS[Math.min(2, useWorldStore.getState().zoom)],
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

  function clearInput() { keys.current.clear(); actions.current={interact:false,jump:false,recover:false}; debugDrive.current=null; moveIntent.current='idle'; guideTargetSpeed.current=0; moveInput.current=[0,0]; cars.current.forEach(c=>{c.steerInput=0;c.throttleInput=0;}); }
  function resetBody(body: RapierRigidBody, position: Vec3, yaw=0) {
    body.setTranslation(asVector(position),true); body.setRotation(yawRotation(yaw),true);
    body.setLinvel({x:0,y:0,z:0},true); body.setAngvel({x:0,y:0,z:0},true);
    body.resetForces(true); body.resetTorques(true);
  }
  function enter(id: VehicleId) {
    const car = cars.current.get(id);
    if (!car || !player.current || useWorldStore.getState().activeVehicle) return false;
    {
      // guide step-in: door anchor = the car side nearer the player, 0.6 m out from the body centre line
      const c=car.body.translation(),r=car.body.rotation(),p=player.current.translation();
      const side=rotateVector([0,0,car.spec.size[2]/2+.25],r),toP=[p.x-c.x,p.z-c.z];
      const sg=side[0]*toP[0]+side[2]*toP[1]>=0?1:-1;
      guideTransition.current={phase:'enter',start:performance.now()/1000,door:[c.x+sg*side[0],p.y,c.z+sg*side[2]]};
    }
    clearInput(); player.current.setEnabled(false);
    useWorldStore.setState({activeVehicle:id,nearbyVehicle:null,canRecover:false});
    return true;
  }
  function exit() {
    const state=useWorldStore.getState();
    const car=state.activeVehicle && cars.current.get(state.activeVehicle);
    if (!car || !player.current) return false;
    const center=car.body.translation(), rotation=car.body.rotation();
    // Try both doors, then behind. A downward ground ray and capsule overlap reject
    // water, walls, parked vehicles and narrow gaps before the player is enabled.
    const offsets: Vec3[] = [[0,0,car.spec.size[2]/2+.9],[0,0,-car.spec.size[2]/2-.9],[-car.spec.size[0]/2-1,0,0]];
    for (const offset of offsets) {
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
      // guide step-out starts at the door edge (car centre + side offset toward the exit spot) and walks to the spot
      {const toC=[center.x-candidate.x,center.z-candidate.z],d=Math.hypot(toC[0],toC[1])||1,k=Math.max(0,d-car.spec.size[2]/2-.25)/d;
        guideTransition.current={phase:'exit',start:performance.now()/1000,door:[candidate.x+toC[0]*k,candidate.y-PLAYER_CENTER_HEIGHT,candidate.z+toC[1]*k]};}
      resetBody(player.current,asTuple(candidate)); player.current.setEnabled(true);
      clearInput(); wetPlayer.current=0;
      useWorldStore.setState({activeVehicle:null,canRecover:false,speed:0}); return true;
    }
    return false;
  }
  function recover() {
    const state=useWorldStore.getState();
    const car=state.activeVehicle && cars.current.get(state.activeVehicle);
    if (!car || car.flipped<RECOVERY_SECONDS) return false;
    const p=car.body.translation();
    resetBody(car.body,[p.x,p.y+wheelGeometry(car.spec.size).height*.8,p.z],heading(car.body.rotation()));
    car.flipped=0; car.wet=0; clearInput(); useWorldStore.setState({canRecover:false,speed:0}); return true;
  }

  /** Surface metadata (terrain, road, slab) on the collider's object chain or its body. */
  function isSurface(col: RapierCollider){
    for(let o=colliderStates.get(col.handle)?.object;o;o=o.parent??undefined)if(o.userData.surface)return true;
    return !!(col.parent()?.userData as {surface?:boolean}|undefined)?.surface;
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
      if (event.metaKey || event.ctrlKey || event.altKey || state.paused || state.shot || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement)?.tagName ?? '')) return;
      if (['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','Space','KeyE','KeyR','KeyV'].includes(event.code)) event.preventDefault();
      keys.current.add(event.code);
      if (!event.repeat) {
        if (event.code==='KeyE') actions.current.interact=true;
        if (event.code==='Space') actions.current.jump=true;
        if (event.code==='KeyR') actions.current.recover=true;
        if (event.code==='KeyV') cycleCamera();
      }
    };
    const up=(event:KeyboardEvent)=>keys.current.delete(event.code);
    // Continuous scroll zoom (exponential, ~12 % per notch). Scrolling out of first person returns to the
    // nearest third-person distance; scrolling never enters first person (V does).
    const wheel=(event:WheelEvent)=>{
      const state=useWorldStore.getState(); if(state.paused || state.shot) return;
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
    const blocked=()=>{const st=useWorldStore.getState();return st.paused||!!st.shot;};
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
      if(state.paused!==previous.paused || state.shot!==previous.shot){clearInput();if(state.paused&&document.pointerLockElement===gl.domElement)document.exitPointerLock?.();}
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
      wheelFixture:(on,z=41.1)=>{
        clearWheelFixture();
        if(!on)return true;
        if(new URLSearchParams(window.location.search).get('qa')!=='1')return false;
        const body=world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(-42,5.1,z));
        body.userData={solid:true,assetId:'QA-wheel-post'};
        world.createCollider(rapier.ColliderDesc.cuboid(.12,.3,.06),body);
        const mesh=new Mesh(new BoxGeometry(.24,.6,.12),new MeshStandardMaterial({color:'#e34949'}));
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
        const down=world.castRay(new rapier.Ray({x:camera.position.x,y:200,z:camera.position.z},{x:0,y:-1,z:0}),400,true,undefined,undefined,undefined,undefined,
          col=>!col.isSensor()&&identifyCollider(col).kind==='surface');
        const ground=down?200-down.timeOfImpact:null;
        return {yaw:c.yaw,pitch:c.pitch,distance:c.distance,desiredDistance:c.desiredDistance,driveManualZoom:c.driveManualZoom,actualDistance:c.actual,firstPerson:c.firstPerson,preset:useWorldStore.getState().zoom,collided:c.collided,hitDistance:c.hitDistance,
          fov:camera instanceof PerspectiveCamera?camera.fov:0,mode:c.mode,recentering:c.recentering,position:camera.position.toArray() as Vec3,target:target.current.toArray() as Vec3,
          forwardGround:(()=>{const m=Math.hypot(dir.x,dir.z)||1;return [dir.x/m,dir.z/m] as [number,number];})(),groundBelowCamera:ground,
          clearanceAboveGround:ground===null?null:camera.position.y-ground,gamepad:pad.current.connected,
          nearPlaneOverlaps:(()=>{const out:string[]=[];const act=useWorldStore.getState().activeVehicle,carBody=act?cars.current.get(act)?.body:undefined;
            world.intersectionsWithShape({x:camera.position.x,y:camera.position.y,z:camera.position.z},{x:0,y:0,z:0,w:1},new rapier.Ball(.1),col=>{const m=identifyCollider(col);out.push(m.assetId??m.name??String(m.colliderHandle));return true;},
              undefined,undefined,undefined,carBody??player.current??undefined,col=>!col.isSensor()&&col.parent()?.handle!==player.current?.handle&&!(col.parent()?.userData as {obstacle?:boolean}|undefined)?.obstacle);
            return out;})()};
      },
      snapshot:()=>({player:player.current?asTuple(player.current.translation()):null,activeVehicle:useWorldStore.getState().activeVehicle,
        canRecover:useWorldStore.getState().canRecover,grounded:grounded.current,
        playerVelocity:player.current?asTuple(player.current.linvel()):null,playerCollider:playerColliderDimensions,
        playerYaw:guideYaw.current,physicsStep:physicsSteps.current,
        vehicles:[...cars.current.values()].map(car=>({id:car.spec.id,position:asTuple(car.body.translation()),velocity:asTuple(car.body.linvel()),
          mass:car.body.mass(),com:asTuple(car.body.localCom()),inertia:asTuple(car.body.principalInertia()),inertiaFrame:(()=>{const q=car.body.principalInertiaLocalFrame();return [q.x,q.y,q.z,q.w];})(),wheelContacts:[0,1,2,3].map(i=>car.controller.wheelIsInContact(i)),upsideDownSeconds:car.flipped,waterSeconds:car.wet,
          steering:car.controller.wheelSteering(0)??0,steerInput:car.steerInput,throttleInput:car.throttleInput}))}),
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
      teleportPlayer:(p)=>{if(!player.current)return false;if(useWorldStore.getState().activeVehicle)useWorldStore.setState({activeVehicle:null,canRecover:false});player.current.setEnabled(true);resetBody(player.current,p);wetPlayer.current=0;clearInput();return true;},
      teleportVehicle:(id,p,yaw=0)=>{const car=cars.current.get(id);if(!car)return false;resetBody(car.body,p,yaw);car.wet=0;car.flipped=0;return true;},
      enter,exit,clearInput,recover,
      drive:(input,seconds=1)=>{debugDrive.current={input,remaining:seconds};},
      flip:(id=useWorldStore.getState().activeVehicle ?? 'offroad')=>{const car=cars.current.get(id);if(!car)return false;const q=new Quaternion().setFromEuler(new Euler(Math.PI,heading(car.body.rotation()),0,'YXZ'));car.body.setRotation(q,true);car.body.setTranslation({...car.body.translation(),y:car.body.translation().y+1},true);car.body.setLinvel({x:0,y:0,z:0},true);car.body.setAngvel({x:0,y:0,z:0},true);car.flipped=0;return true;},
      water:(id)=>{if(id || useWorldStore.getState().activeVehicle){const car=cars.current.get(id ?? useWorldStore.getState().activeVehicle!);if(!car)return false;resetBody(car.body,[110,WATER_Y-1,85]);car.wet=0;return true;}if(!player.current)return false;resetBody(player.current,[110,WATER_Y-1,85]);wetPlayer.current=0;return true;},
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
    const state=useWorldStore.getState(); if(state.paused || state.shot || !player.current) return;
    physicsSteps.current++;
    const dt=world.timestep || PHYSICS_STEP;
    let active=state.activeVehicle?cars.current.get(state.activeVehicle):undefined;
    // Evaluate proximity at physics frequency; UI publication is throttled separately.
    let nearby:VehicleId|null=null,nearest=3.8;
    const playerPosition=player.current.translation();
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
    const reach=active||seated||carded?null:nearestInteractable(playerPosition.x,playerPosition.y,playerPosition.z,sight,state.interactPick);
    if(!active)nearest=nearby?Math.hypot(cars.current.get(nearby)!.body.translation().x-playerPosition.x,cars.current.get(nearby)!.body.translation().z-playerPosition.z):Infinity;
    if(reach&&nearby&&nearest<reach.distance)nearbyItem.current=null;else{nearbyItem.current=reach?.item??null;if(reach)nearby=null;}
    if(seated||carded)nearby=null;
    const interactNow=(item:Interactable|null)=>{
      const now=useWorldStore.getState();
      if(now.seat){useWorldStore.setState({seat:null});return;}
      if(now.card){useWorldStore.setState({card:null});return;}
      if(active)exit();else if(item){item.onInteract();}else if(nearby)enter(nearby);
      active=useWorldStore.getState().activeVehicle?cars.current.get(useWorldStore.getState().activeVehicle!):undefined;
    };
    if(actions.current.interact){interactNow(nearbyItem.current);actions.current.interact=false;}
    if(actions.current.recover || state.recoverRequest!==lastRecover.current){recover();lastRecover.current=state.recoverRequest;actions.current.recover=false;}
    // Gamepad (standard mapping): buttons as edges. A jump, Y enter/leave, B flip back, Back camera, Start pause.
    const before=pad.current.buttons,gp=readPad(pad.current);pad.current=gp;
    const edge=(i:number)=>!!gp.buttons[i]&&!before[i];
    if(gp.connected){
      if(edge(12))cycleInteractPick(-1);
      if(edge(13))cycleInteractPick(1);
      if(edge(0))actions.current.jump=true;
      if(edge(3))interactNow(nearbyItem.current);
      if(edge(1))actions.current.recover=true;
      if(edge(8))cycleCamera();
      if(edge(9))useWorldStore.setState({paused:true});
    }
    const debug=debugDrive.current;
    // Keyboard: W/S and A/D ramp toward +-1 (held = gradually full, released = back to 0). Gamepad: right
    // trigger throttle, left trigger brake/reverse, left stick steering, all analogue and used directly.
    if(active&&!debug){
      const keyThrottle=Number(keys.current.has('KeyW'))-Number(keys.current.has('KeyS'));
      const keySteer=Number(keys.current.has('KeyA'))-Number(keys.current.has('KeyD'));
      const padThrottle=gp.throttle-gp.brake,padSteer=-gp.move[0];
      active.throttleInput=keyThrottle!==0||padThrottle===0?rampAxis(active.throttleInput,keyThrottle,dt,THROTTLE_RISE,THROTTLE_FALL):padThrottle;
      active.steerInput=keySteer!==0||padSteer===0?rampAxis(active.steerInput,keySteer,dt,STEER_RISE,STEER_FALL):padSteer;
    }
    cars.current.forEach(car=>{if(car!==active){car.steerInput=0;car.throttleInput=0;}});
    const throttle=debug?clamp(debug.input.throttle,-1,1):active?.throttleInput??0;
    const steer=debug?clamp(debug.input.steer,-1,1):active?.steerInput??0;
    if(debug){debug.remaining-=dt;if(debug.remaining<=0)debugDrive.current=null;}
    cars.current.forEach(car=>{
      const driven=active===car,velocity=car.body.linvel();
      const front=rotateVector([1,0,0],car.body.rotation());
      const speed=velocity.x*front[0]+velocity.z*front[2];
      const braking=driven && ((debug?.input.brake ?? (keys.current.has('Space')||!!gp.buttons[5])) || throttle*speed<-.8);
      const maxSteer=car.spec.id==='van'?.38:car.spec.id==='coupe'?(car.lowCom?.60:.52):.47;
      const desired=driven?steer*maxSteer/(1+Math.abs(speed)*.045):0;
      // Ramped driver input (keyboard ramp / analogue stick) already limits the steering rate, so it drives the
      // wheels directly; stacking the old per-vehicle exponential filter on top doubled the lag (the van
      // overshot the coast-road corner). QA drive() inputs and the undriven return keep the old filter.
      if(driven&&!debug)car.steering=desired;
      else car.steering+=(desired-car.steering)*Math.min(1,dt*(car.spec.id==='van'?3.5:6));
      car.lights.brake=!!braking&&driven;car.lights.reverse=driven&&throttle<-.05&&speed<.5;
      for(let i=0;i<4;i++){
        car.controller.setWheelSteering(i,i<2?car.steering:0);
        const force=driven && !braking && Math.abs(speed)<(throttle<0?9:car.spec.id==='coupe'?29:car.spec.id==='van'?18:22)?throttle*car.spec.engineForce/4:0;
        car.controller.setWheelEngineForce(i,force);
        car.controller.setWheelBrake(i,braking?car.spec.mass*.028:!driven?car.spec.mass*.035:Math.abs(throttle)<.02?car.spec.mass*.0015:0);
        car.controller.setWheelFrictionSlip(i,car.spec.grip*(car.spec.id==='coupe' && i>=2 && Math.abs(steer)>.45 && Math.abs(speed)>7?.68:1));
      }
      car.controller.updateVehicle(dt,undefined,undefined,c=>{
        if(c.isSensor() || c.parent()?.handle===car.body.handle || c.parent()?.handle===player.current?.handle)return false;
        // L1: the suspension only rests on the static world. A knocked-over roadblock or another car under
        // a wheel used to become a road surface and jack the body up (spec 10.2 roadblock lift); the body
        // hulls handle those contacts instead.
        if(car.hulls){const b=c.parent();return !b||b.isFixed();}
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
      car.flipped=advanceTimer(car.flipped,isUpsideDown(car.body.rotation()),dt);
      // In water once the chassis floor is submerged (wheels fully under, >5 cm into the hull), not only
      // when the body centre sinks: v4 beaches shelve gently, and a car parked in ~1 m of sea must still
      // be returned to dry land after RECOVERY_SECONDS. Driving through shallow surf stays possible.
      const p=car.body.translation(),floor=p.y+rotateVector([0,-car.spec.size[1]*.29,0],car.body.rotation())[1];
      car.wet=advanceTimer(car.wet,p.y<WATER_Y||floor<WATER_Y-.05,dt);
      if(car.wet>=RECOVERY_SECONDS || p.y< -80){const dry=nearestDryPoint(p.x,p.z),road=dry??nearestRoadPoint(asTuple(p));resetBody(car.body,[road[0],road[1]+wheelGeometry(car.spec.size).height+.2,road[2]],heading(car.body.rotation()));car.wet=0;car.flipped=0;}
    });
    if(!active){
      const p=player.current.translation(),velocity=player.current.linvel();
      const ground=world.castRayAndGetNormal(new rapier.Ray(p,{x:0,y:-1,z:0}),PLAYER_CENTER_HEIGHT+.12,true,undefined,undefined,undefined,player.current,c=>!c.isSensor());
      grounded.current=!!ground && ground.normal.y>.55 && velocity.y<1;
      // Raw input in camera space (x right, z forward): keys plus the left stick (analogue magnitude).
      let rx=Number(keys.current.has('KeyD'))-Number(keys.current.has('KeyA'));
      let rz=Number(keys.current.has('KeyW'))-Number(keys.current.has('KeyS'));
      if(gp.connected){rx+=gp.move[0];rz-=gp.move[1];}
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
      // stands up: the body returns to where it sat down from (a free spot it reached on foot), or, if that
      // spot is now blocked, to the first clear spot around the seat.
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
        seatHeld.current=null;seatBody.current=null;
        const from=seatFrom.current;seatFrom.current=null;
        const free=(q:Vec3)=>{let blocked=false;world.intersectionsWithShape({x:q[0],y:q[1],z:q[2]},{x:0,y:0,z:0,w:1},new rapier.Capsule(PLAYER_HALF_HEIGHT,PLAYER_RADIUS),
          ()=>{blocked=true;return false;},undefined,undefined,undefined,player.current??undefined,c=>!c.isSensor());return !blocked;};
        let spot=from&&free(from)?from:null;
        if(!spot&&from)for(let k=0;k<8&&!spot;k++){const a=k*Math.PI/4,q:Vec3=[from[0]+Math.cos(a)*.9,from[1]+.05,from[2]+Math.sin(a)*.9];if(free(q))spot=q;}
        if(spot)resetBody(player.current,spot);
        player.current.setEnabled(true);
      }
      const speed=(seat?0:running?6.2:3.6)*magnitude;
      moveIntent.current=magnitude>.05?(running?'run':'walk'):'idle';
      // Movement is relative to the camera's current ground heading (GTA style), any angle.
      const [wx,wz]=magnitude>.05?cameraRelative(mv[0]/magnitude,mv[1]/magnitude,cam.current.yaw):[0,0];
      let vx=wx*speed,vz=wz*speed;
      if (magnitude>.05) {
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
      const response=grounded.current?12:3;
      const factor=1-Math.exp(-response*dt),mass=player.current.mass();
      player.current.applyImpulse({x:(vx-velocity.x)*mass*factor,y:0,z:(vz-velocity.z)*mass*factor},true);
      // Local 12.5 m/s² gravity and 5 m/s launch give an approximately 1 m,
      // 0.8 s hop. Horizontal momentum is retained at the input edge.
      if(actions.current.jump && grounded.current){player.current.setLinvel({x:velocity.x,y:5,z:velocity.z},true);grounded.current=false;jumpSeq.current++;}
      wetPlayer.current=advanceTimer(wetPlayer.current,p.y<WATER_Y,dt);
      if(wetPlayer.current>=RECOVERY_SECONDS || p.y< -80){const dry=nearestDryPoint(p.x,p.z),road=dry??nearestRoadPoint(asTuple(p));resetBody(player.current,[road[0],road[1]+PLAYER_CENTER_HEIGHT,road[2]]);wetPlayer.current=0;}
    }
    actions.current.jump=false;
    const body=active?.body ?? player.current,p=body.translation(),v=body.linvel();
    publishedTime.current+=dt;
    if(publishedTime.current>.09){
      publishedTime.current=0;
      const item=nearbyItem.current,prev=useWorldStore.getState().nearbyInteract;
      const nearbyInteract:NearbyInteract|null=item&&!active?(prev?.id===item.id?prev:{id:item.id,label:item.label,kind:item.kind}):null;
      useWorldStore.setState({position:asTuple(p),speed:active?Math.hypot(v.x,v.z)*3.6:0,nearbyVehicle:active?null:nearby,nearbyInteract,canRecover:!!active && active.flipped>=RECOVERY_SECONDS,zone:LAYOUT_V4?zoneAtV4(p.x,p.z):p.x>35?'park':p.x< -15?'camp':'town'});
    }
  });

  useFrame((_,delta)=>{
    const state=useWorldStore.getState();
    if (state.shot) {
      // Fixed evidence cameras retain their original projection.
      if (camera instanceof PerspectiveCamera && camera.fov !== 50) {
        camera.fov = 50; camera.updateProjectionMatrix();
      }
      return;
    }
    if (state.paused) return;
    const c=cam.current,driving=!!state.activeVehicle;
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
    const targetFov=c.firstPerson?70:driving?55+Math.min(10,speed*.35):50;
    c.fov+= (targetFov-c.fov)*(1-Math.exp(-delta*6));
    if (camera instanceof PerspectiveCamera && Math.abs(camera.fov-c.fov)>.01) { camera.fov=c.fov; camera.updateProjectionMatrix(); }
    // Pivot: head height on foot, roof height in a car; first person sits at eye height.
    const eye=car?car.spec.size[1]*.38:.3;   // above the body centre: driver's eye / helmet visor height
    const cameraSeat=!car?useWorldStore.getState().seat:null;
    // The disabled seated capsule stays a standing body-height above the seat. Aim at the actual
    // seated helmet instead: fresh GLB runtime bounds put its centre 0.884-0.956 m above the seat.
    const targetY=cameraSeat?cameraSeat.position[1]+.92:Math.max(p.y,WATER_Y)+(c.firstPerson?eye:car?car.spec.size[1]*.6:.65);
    const desiredTarget=new Vector3(p.x,targetY,p.z);
    if(!cameraReady.current){target.current.copy(desiredTarget);cameraReady.current=true;}
    target.current.lerp(desiredTarget,c.firstPerson?1:1-Math.exp(-delta*10));
    const dir=orbitDirection(c.yaw,c.pitch);
    const exclude=car?.body??player.current??undefined;
    // Sphere cast from `from` along unit `d` for `len` m against static ground and solid bodies (not the
    // player, the driven car, sensors or knockable props). Returns the free distance (len if clear).
    const probe=(from:{x:number;y:number;z:number},d:{x:number;y:number;z:number},len:number,radius:number)=>{
      if(len<1e-4)return {free:len,hit:null as number|null};
      const h=world.castShape(from,{x:0,y:0,z:0,w:1},d,new rapier.Ball(radius),0,len,true,undefined,undefined,undefined,exclude,
        col=>{if(col.isSensor())return false;const b=col.parent();if(!b)return true;if(b.handle===player.current?.handle)return false;
          const ud=b.userData as {vehicle?:string;obstacle?:boolean}|undefined;return !ud?.obstacle&&!(ud?.vehicle&&b.handle===car?.body.handle);});
      return {free:h?Math.max(0,h.time_of_impact-CAMERA_HIT_MARGIN):len,hit:h?h.time_of_impact:null};
    };
    if(c.firstPerson){
      c.actual=0;c.desiredDistance=0;
      if(car){const f=rotateVector([car.spec.size[0]*.05,0,0],car.body.rotation());target.current.x+=f[0];target.current.z+=f[2];}
      // On foot the eye sits just in front of the visor (near plane .1 m) so the helmet shell is not in view.
      const eyePos=target.current.clone();
      if(!car){const m=Math.hypot(dir[0],dir[2])||1;eyePos.x-=dir[0]/m*.3;eyePos.z-=dir[2]/m*.3;}
      // Near-wall guard: sweep an EYE_RADIUS ball from the body centre (inside the excluded capsule / car)
      // to the eye; if a wall or roof is closer, the eye stops in front of it, so the near plane never
      // enters geometry when standing against a wall or looking out of a car beside one.
      const origin={x:p.x,y:Math.max(p.y,WATER_Y),z:p.z},span=new Vector3(eyePos.x-origin.x,eyePos.y-origin.y,eyePos.z-origin.z),len=span.length();
      const r=probe(origin,len>1e-4?{x:span.x/len,y:span.y/len,z:span.z/len}:{x:0,y:1,z:0},len,EYE_RADIUS);
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
      const r=probe(from,{x:dir[0],y:dir[1],z:dir[2]},want,CAMERA_RADIUS);
      c.hitDistance=r.hit;
      const limit=r.free;
      c.collided=r.hit!==null&&limit<want-.01;
      // Pull in immediately (no frame inside a wall), ease back out.
      c.actual=limit<c.actual?limit:c.actual+(limit-c.actual)*(1-Math.exp(-delta*4));
      const pos=new Vector3(target.current.x+dir[0]*c.actual,target.current.y+dir[1]*c.actual,target.current.z+dir[2]*c.actual);
      // Ground floor: never below the walkable surface under the camera.
      // Only walkable surfaces (terrain, roads, slabs) count: a roof or canopy above the camera must not lift it.
      const down=world.castRay(new rapier.Ray({x:pos.x,y:pos.y+40,z:pos.z},{x:0,y:-1,z:0}),80,true,undefined,undefined,undefined,exclude,
        col=>!col.isSensor()&&isSurface(col));
      if(down){const floor=pos.y+40-down.timeOfImpact+CAMERA_GROUND_CLEARANCE;if(pos.y<floor)pos.y=floor;}
      pos.y=Math.max(pos.y,WATER_Y+.3);
      camera.position.copy(pos);
      impact.current *= Math.exp(-delta * 12);
      if (impact.current > .001) camera.position.y += Math.sin(performance.now() * .07) * impact.current;
      camera.up.copy(UP);camera.lookAt(target.current);
    }
    occlusion.current.update(scene,camera,target.current,delta);
  });

  return <>
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
    <RigidBody ref={player} colliders={false} position={CAMP_SPAWN} enabledRotations={[false,false,false]} gravityScale={12.5/9.81} linearDamping={.2} ccd softCcdPrediction={.1} canSleep={false}>
      {/* Zero/min friction prevents low curbs and walls from pinning the round foot.
          Horizontal impulse control handles braking; 10 cm soft CCD predicts landing contact. */}
      <CapsuleCollider name="player-capsule" args={[PLAYER_HALF_HEIGHT,PLAYER_RADIUS]} mass={72} friction={0} frictionCombineRule={rapier.CoefficientCombineRule.Min} restitution={0}/>
      <group position={[0,-(PLAYER_RADIUS+PLAYER_HALF_HEIGHT),0]}>
        <GuideVisual body={player} grounded={grounded} yaw={guideYaw} targetSpeed={guideTargetSpeed} intent={moveIntent} jumpSeq={jumpSeq} visible={!firstPerson} transition={guideTransition} />
      </group>
    </RigidBody>
  </>;
}
