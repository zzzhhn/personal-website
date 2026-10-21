import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CapsuleCollider, CuboidCollider, RigidBody, useBeforePhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier';
import { Euler, Group, Material, Mesh, PerspectiveCamera, Quaternion, Raycaster, Vector3 } from 'three';
import { CAMP_SPAWN, VEHICLES, WATER_Y, nearestRoadPoint } from './layout';
import { useWorldStore } from './store';
import type { Vec3, VehicleId } from './types';
import WorldGuide, { worldGuideDebug } from './WorldGuide';
import { PHYSICS_STEP, PLAYER_CENTER_HEIGHT, PLAYER_HALF_HEIGHT, PLAYER_RADIUS, RECOVERY_SECONDS, advanceTimer, cameraDistance, configureRaycastVehicle, heading, isUpsideDown, rotateVector, wheelGeometry, yawRotation } from './actor-physics';

type VehicleSpec = (typeof VEHICLES)[number];
type Controller = ReturnType<ReturnType<typeof useRapier>['world']['createVehicleController']>;
type DriveInput = { throttle: number; steer: number; brake?: boolean };
type Car = { body: RapierRigidBody; controller: Controller; spec: VehicleSpec; flipped: number; wet: number; steering: number };
type ActorSnapshot = {
  player: Vec3 | null; activeVehicle: VehicleId | null; canRecover: boolean; grounded: boolean;
  playerVelocity: Vec3 | null; playerCollider: { radius: number; halfHeight: number; centerHeight: number };
  playerYaw: number; physicsStep: number;
  vehicles: { id: VehicleId; position: Vec3; velocity: Vec3; mass: number; wheelContacts: boolean[]; upsideDownSeconds: number; waterSeconds: number }[];
};
type ContactMeta = { colliderHandle: number; name: string | null; assetId: string | null; kind: 'surface' | 'solid' | 'vehicle' | 'obstacle' | 'unknown' };
type ActorContact = { self: 'player' | VehicleId; other: ContactMeta; normal: Vec3; distance: number; points: Vec3[] };
const playerColliderDimensions = { radius: PLAYER_RADIUS, halfHeight: PLAYER_HALF_HEIGHT, centerHeight: PLAYER_RADIUS + PLAYER_HALF_HEIGHT };
export interface WorldActorDebug {
  snapshot(): ActorSnapshot;
  actor(): ReturnType<typeof worldGuideDebug>;
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

function Vehicle({ spec, cars, impact }: { spec: VehicleSpec; cars: RefObject<Map<VehicleId,Car>>; impact: RefObject<number> }) {
  const body = useRef<RapierRigidBody>(null);
  const wheels = useRef<(Group | null)[]>([]);
  const { world } = useRapier();
  const geometry = wheelGeometry(spec.size);
  const bodyData = useMemo(() => ({ vehicle: spec.id }), [spec.id]);
  useEffect(() => {
    if (!body.current) return;
    const controller = world.createVehicleController(body.current);
    configureRaycastVehicle(controller,spec.size,spec.mass,spec.grip,spec.suspension / spec.mass);
    const car: Car = {body:body.current,controller,spec,flipped:0,wet:0,steering:0};
    cars.current.set(spec.id,car);
    return () => { cars.current.delete(spec.id); world.removeVehicleController(controller); };
  },[world,spec,cars]);
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
  return <RigidBody ref={body} position={[spec.position[0],spec.position[1]+geometry.height,spec.position[2]]}
    rotation={[0,spec.yaw,0]} colliders={false} linearDamping={0.12} angularDamping={0.65}
    canSleep={false} ccd userData={bodyData} onCollisionEnter={({ other }) => {
      if (useWorldStore.getState().activeVehicle === spec.id && other.rigidBodyObject?.userData.solid && body.current) {
        const v = body.current.linvel(); impact.current = Math.min(.35, Math.hypot(v.x, v.z) * .025);
      }
    }}>
    <CuboidCollider name={`vehicle-${spec.id}-chassis`} args={[length/2,height*.29,width/2]} mass={spec.mass*.78} friction={0.65} restitution={0.18} />
    <CuboidCollider name={`vehicle-${spec.id}-cabin`} args={[length*.25,height*.2,width*.43]} position={[-length*.08,height*.42,0]} mass={spec.mass*.22} friction={0.6} restitution={0.12}/>
    <mesh castShadow receiveShadow><boxGeometry args={[length,height*.58,width]}/><meshStandardMaterial color={spec.color} roughness={0.92}/></mesh>
    <mesh position={[-length*.08,height*.42,0]} castShadow><boxGeometry args={[length*.5,height*.4,width*.86]}/><meshStandardMaterial color={spec.id==='offroad'?'#E8803A':'#4E647D'} roughness={0.96}/></mesh>
    <mesh position={[length/2+.015,0,0]}><boxGeometry args={[.05,.17,width*.7]}/><meshStandardMaterial color="#E6DCCB"/></mesh>
    <mesh position={[-length/2-.015,.05,0]}><boxGeometry args={[.04,.12,width*.75]}/><meshStandardMaterial color="#63BEB3" emissive="#63BEB3" emissiveIntensity={0.4}/></mesh>
    {geometry.points.map((point,i) => <group key={i} ref={(node)=>{wheels.current[i]=node;}} position={[point[0],point[1]-geometry.rest,point[2]]}>
      <group><mesh rotation={[Math.PI/2,0,0]} castShadow><cylinderGeometry args={[geometry.radius,geometry.radius,.3,10]}/><meshStandardMaterial color="#33383C" roughness={1}/></mesh>
        <mesh position={[0,0,i%2===0?.17:-.17]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[geometry.radius*.46,geometry.radius*.46,.025,6]}/><meshStandardMaterial color="#E6DCCB" roughness={.9}/></mesh></group>
    </group>)}
  </RigidBody>;
}

/** Read the current body state at mixer time; React batching must not delay gait
 * acceleration, braking, or contact transitions by several rendered frames. */
function GuideVisual({ body, grounded, yaw, targetSpeed, visible }: { body: RefObject<RapierRigidBody | null>; grounded: RefObject<boolean>; yaw: RefObject<number>; targetSpeed: RefObject<number>; visible: boolean }) {
  const readMotion = () => {
    const v = body.current?.linvel();
    return { speedMps: v ? Math.hypot(v.x, v.z) : 0, grounded: grounded.current, facing: yaw.current, targetSpeedMps:targetSpeed.current };
  };
  return <WorldGuide speedMps={0} grounded facing={0} visible={visible} readMotion={readMotion} />;
}

export default function WorldActors() {
  const player = useRef<RapierRigidBody>(null);
  const guideYaw = useRef(0);
  const guideTargetSpeed = useRef(0);
  const turnBeforeMove = useRef(false);
  const cars = useRef(new Map<VehicleId,Car>());
  const keys = useRef(new Set<string>());
  const actions = useRef({interact:false,jump:false,recover:false});
  const debugDrive = useRef<{input:DriveInput;remaining:number}|null>(null);
  const grounded = useRef(false);
  const physicsSteps = useRef(0);
  const wetPlayer = useRef(0);
  const lastRecover = useRef(useWorldStore.getState().recoverRequest);
  const publishedTime = useRef(0);
  const activeVehicle = useWorldStore(s=>s.activeVehicle);
  const { world, rapier, colliderStates } = useRapier();
  const { camera, scene, gl } = useThree();
  const target = useRef(new Vector3(...CAMP_SPAWN));
  const cameraReady = useRef(false);
  const impact = useRef(0);
  const cameraRay = useRef(new Raycaster());
  const faded = useRef(new Map<Material,{opacity:number;transparent:boolean;depthWrite:boolean}>());
  const occluders = useRef<Mesh[]>([]);
  const scanTime = useRef(0);

  function clearInput() { keys.current.clear(); actions.current={interact:false,jump:false,recover:false}; debugDrive.current=null; }
  function resetBody(body: RapierRigidBody, position: Vec3, yaw=0) {
    body.setTranslation(asVector(position),true); body.setRotation(yawRotation(yaw),true);
    body.setLinvel({x:0,y:0,z:0},true); body.setAngvel({x:0,y:0,z:0},true);
    body.resetForces(true); body.resetTorques(true);
  }
  function enter(id: VehicleId) {
    const car = cars.current.get(id);
    if (!car || !player.current || useWorldStore.getState().activeVehicle) return false;
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

  useEffect(() => {
    const down=(event:KeyboardEvent) => {
      const state=useWorldStore.getState();
      if (event.metaKey || event.ctrlKey || event.altKey || state.paused || state.shot || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement)?.tagName ?? '')) return;
      if (['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','Space','KeyE','KeyR'].includes(event.code)) event.preventDefault();
      keys.current.add(event.code);
      if (!event.repeat) {
        if (event.code==='KeyE') actions.current.interact=true;
        if (event.code==='Space') actions.current.jump=true;
        if (event.code==='KeyR') actions.current.recover=true;
      }
    };
    const up=(event:KeyboardEvent)=>keys.current.delete(event.code);
    const wheel=(event:WheelEvent)=>{
      const state=useWorldStore.getState(); if(state.paused || state.shot) return;
      event.preventDefault();
      useWorldStore.setState({zoom:clamp(state.zoom+(event.deltaY>0?1:-1),0,2) as 0|1|2});
    };
    const hidden=()=>{if(document.hidden) clearInput();};
    window.addEventListener('keydown',down); window.addEventListener('keyup',up); window.addEventListener('blur',clearInput);
    document.addEventListener('visibilitychange',hidden); gl.domElement.addEventListener('wheel',wheel,{passive:false});
    const unsubscribe=useWorldStore.subscribe((state,previous)=>{if(state.paused!==previous.paused || state.shot!==previous.shot) clearInput();});
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
      snapshot:()=>({player:player.current?asTuple(player.current.translation()):null,activeVehicle:useWorldStore.getState().activeVehicle,
        canRecover:useWorldStore.getState().canRecover,grounded:grounded.current,
        playerVelocity:player.current?asTuple(player.current.linvel()):null,playerCollider:playerColliderDimensions,
        playerYaw:guideYaw.current,physicsStep:physicsSteps.current,
        vehicles:[...cars.current.values()].map(car=>({id:car.spec.id,position:asTuple(car.body.translation()),velocity:asTuple(car.body.linvel()),
          mass:car.body.mass(),wheelContacts:[0,1,2,3].map(i=>car.controller.wheelIsInContact(i)),upsideDownSeconds:car.flipped,waterSeconds:car.wet}))}),
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
              result.push({self:active??'player',other:meta,
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
      if(debugTarget===api)debugTarget=null;
      faded.current.forEach((original,material)=>{Object.assign(material,original);material.needsUpdate=true;});faded.current.clear();
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
    if(actions.current.interact){if(active)exit();else if(nearby)enter(nearby);actions.current.interact=false;active=useWorldStore.getState().activeVehicle?cars.current.get(useWorldStore.getState().activeVehicle!):undefined;}
    if(actions.current.recover || state.recoverRequest!==lastRecover.current){recover();lastRecover.current=state.recoverRequest;actions.current.recover=false;}
    const debug=debugDrive.current;
    const throttle=debug?clamp(debug.input.throttle,-1,1):Number(keys.current.has('KeyW'))-Number(keys.current.has('KeyS'));
    const steer=debug?clamp(debug.input.steer,-1,1):Number(keys.current.has('KeyA'))-Number(keys.current.has('KeyD'));
    if(debug){debug.remaining-=dt;if(debug.remaining<=0)debugDrive.current=null;}
    cars.current.forEach(car=>{
      const driven=active===car,velocity=car.body.linvel();
      const front=rotateVector([1,0,0],car.body.rotation());
      const speed=velocity.x*front[0]+velocity.z*front[2];
      const braking=driven && ((debug?.input.brake ?? keys.current.has('Space')) || throttle*speed<-.8);
      const maxSteer=car.spec.id==='van'?.38:car.spec.id==='coupe'?.52:.47;
      const desired=driven?steer*maxSteer/(1+Math.abs(speed)*.045):0;
      car.steering+=(desired-car.steering)*Math.min(1,dt*(car.spec.id==='van'?3.5:6));
      for(let i=0;i<4;i++){
        car.controller.setWheelSteering(i,i<2?car.steering:0);
        const force=driven && !braking && Math.abs(speed)<(throttle<0?9:car.spec.id==='coupe'?29:car.spec.id==='van'?18:22)?throttle*car.spec.engineForce/4:0;
        car.controller.setWheelEngineForce(i,force);
        car.controller.setWheelBrake(i,braking?car.spec.mass*.028:!driven?car.spec.mass*.035:throttle===0?car.spec.mass*.0015:0);
        car.controller.setWheelFrictionSlip(i,car.spec.grip*(car.spec.id==='coupe' && i>=2 && Math.abs(steer)>.45 && Math.abs(speed)>7?.68:1));
      }
      car.controller.updateVehicle(dt,undefined,undefined,c=>!c.isSensor() && c.parent()?.handle!==car.body.handle && c.parent()?.handle!==player.current?.handle);
      car.flipped=advanceTimer(car.flipped,isUpsideDown(car.body.rotation()),dt);
      const p=car.body.translation();car.wet=advanceTimer(car.wet,p.y<WATER_Y,dt);
      if(car.wet>=RECOVERY_SECONDS || p.y< -80){const road=nearestRoadPoint(asTuple(p));resetBody(car.body,[road[0],road[1]+wheelGeometry(car.spec.size).height+.2,road[2]],heading(car.body.rotation()));car.wet=0;car.flipped=0;}
    });
    if(!active){
      const p=player.current.translation(),velocity=player.current.linvel();
      const ground=world.castRayAndGetNormal(new rapier.Ray(p,{x:0,y:-1,z:0}),PLAYER_CENTER_HEIGHT+.12,true,undefined,undefined,undefined,player.current,c=>!c.isSensor());
      grounded.current=!!ground && ground.normal.y>.55 && velocity.y<1;
      const x=Number(keys.current.has('KeyD'))-Number(keys.current.has('KeyA'));
      const z=Number(keys.current.has('KeyW'))-Number(keys.current.has('KeyS'));
      const magnitude=Math.hypot(x,z),speed=keys.current.has('ShiftLeft')||keys.current.has('ShiftRight')?4.2:1.8;
      // Movement follows the fixed camera's ground axes.
      let vx=magnitude?(.8*x-.6*z)/magnitude*speed:0;
      let vz=magnitude?(-.6*x-.8*z)/magnitude*speed:0;
      if (magnitude) {
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
      if(actions.current.jump && grounded.current){player.current.setLinvel({x:velocity.x,y:5.7,z:velocity.z},true);grounded.current=false;}
      wetPlayer.current=advanceTimer(wetPlayer.current,p.y<WATER_Y,dt);
      if(wetPlayer.current>=RECOVERY_SECONDS || p.y< -80){const road=nearestRoadPoint(asTuple(p));resetBody(player.current,[road[0],road[1]+PLAYER_CENTER_HEIGHT,road[2]]);wetPlayer.current=0;}
    }
    actions.current.jump=false;
    const body=active?.body ?? player.current,p=body.translation(),v=body.linvel();
    publishedTime.current+=dt;
    if(publishedTime.current>.09){publishedTime.current=0;useWorldStore.setState({position:asTuple(p),speed:active?Math.hypot(v.x,v.z)*3.6:0,nearbyVehicle:active?null:nearby,canRecover:!!active && active.flipped>=RECOVERY_SECONDS,zone:p.x>35?'park':p.x< -15?'camp':'town'});}
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
    if (camera instanceof PerspectiveCamera) {
      const targetFov = [40, 50, 60][state.zoom];
      // Reach roughly 95% of the optical zoom target in 0.3 seconds.
      const nextFov = Math.abs(targetFov-camera.fov) < .01 ? targetFov : camera.fov+(targetFov-camera.fov)*(1-Math.exp(-delta*10));
      if (nextFov !== camera.fov) { camera.fov = nextFov; camera.updateProjectionMatrix(); }
    }
    const body=state.activeVehicle?cars.current.get(state.activeVehicle)?.body:player.current;if(!body)return;
    const p=body.translation(),velocity=body.linvel();
    // Keep the fixed-angle follow view above water while the body completes
    // its existing two-second recovery timer below the surface.
    const desiredTarget=new Vector3(p.x,Math.max(p.y,WATER_Y)+.65,p.z);
    const distance=cameraDistance(!!state.activeVehicle,state.zoom,Math.hypot(velocity.x,velocity.z));
    if(!cameraReady.current){target.current.copy(desiredTarget);cameraReady.current=true;}
    target.current.lerp(desiredTarget,1-Math.exp(-delta*7));
    const desired=target.current.clone().add(new Vector3(.6/Math.SQRT2,1/Math.SQRT2,.8/Math.SQRT2).multiplyScalar(distance));
    if(camera.position.distanceTo(desired)>60)camera.position.copy(desired);else camera.position.lerp(desired,1-Math.exp(-delta*6));
    impact.current *= Math.exp(-delta * 12);
    if (impact.current > .001) camera.position.y += Math.sin(performance.now() * .07) * impact.current;
    camera.up.copy(UP);camera.lookAt(target.current);
    scanTime.current+=delta;
    if(scanTime.current>.5 || !occluders.current.length){scanTime.current=0;const found:Mesh[]=[];scene.traverse(object=>{if(object instanceof Mesh){let parent:typeof object.parent=object;while(parent){if(parent.userData.occluder){found.push(object);break;}parent=parent.parent;}}});occluders.current=found;}
    cameraRay.current.set(camera.position,target.current.clone().sub(camera.position).normalize());
    cameraRay.current.far=camera.position.distanceTo(target.current)-.6;
    const hitMaterials=new Set<Material>();
    cameraRay.current.intersectObjects(occluders.current,false).forEach(hit=>{const material=(hit.object as Mesh).material;(Array.isArray(material)?material:[material]).forEach(m=>hitMaterials.add(m));});
    hitMaterials.forEach(material=>{if(!faded.current.has(material)){faded.current.set(material,{opacity:material.opacity,transparent:material.transparent,depthWrite:material.depthWrite});material.needsUpdate=true;}});
    faded.current.forEach((original,material)=>{
      const opacity=hitMaterials.has(material)?.24:original.opacity;
      material.opacity+=(opacity-material.opacity)*Math.min(1,delta*9);material.transparent=true;material.depthWrite=false;
      if(!hitMaterials.has(material) && Math.abs(material.opacity-original.opacity)<.01){Object.assign(material,original);material.needsUpdate=true;faded.current.delete(material);}
    });
  });

  return <>
    {VEHICLES.map(spec=><Vehicle key={spec.id} spec={spec} cars={cars} impact={impact}/>)}
    <RigidBody ref={player} colliders={false} position={CAMP_SPAWN} enabledRotations={[false,false,false]} linearDamping={.2} ccd softCcdPrediction={.1} canSleep={false}>
      {/* Zero/min friction prevents low curbs and walls from pinning the round foot.
          Horizontal impulse control handles braking; 10 cm soft CCD predicts landing contact. */}
      <CapsuleCollider name="player-capsule" args={[PLAYER_HALF_HEIGHT,PLAYER_RADIUS]} mass={72} friction={0} frictionCombineRule={rapier.CoefficientCombineRule.Min} restitution={0}/>
      <group position={[0,-(PLAYER_RADIUS+PLAYER_HALF_HEIGHT),0]}>
        <GuideVisual body={player} grounded={grounded} yaw={guideYaw} targetSpeed={guideTargetSpeed} visible={!activeVehicle} />
      </group>
    </RigidBody>
  </>;
}
