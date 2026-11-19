import { Component, memo, Suspense, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { ConvexHullCollider, useRapier, type RapierCollider } from '@react-three/rapier';
import { AdditiveBlending, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Sphere, Vector3 } from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { VehicleId } from './types';
import { useWorldStore } from './store';
import { night } from './WorldNight';
import { VEHICLE_ASSETS, adaptVehicleSeats, bakeNode, headlightTexture, vehicleHulls, vehicleMaterial } from './WorldVehicleAssets';
import { createVehicleBoostExhaust, createVehicleDoorControls, refineCoupeWheel, refineVehicleBody, updateVehicleBoostExhaust } from './WorldVehicleDetail';
import { readDrivingTelemetry } from './vehicle-telemetry';
import type { VehicleDoorState, DoorSide } from './WorldVehicleDoors';
import { retainedVehicleRoofSource, vanBeaconId, VEHICLE_HULL_FRICTION, VEHICLE_HULL_RESTITUTION, vehicleBodySources, vehicleContactHull, vehicleDoorId, vehicleHullId, vehicleLeafPose, vehicleRoofContactBlocks, vehicleTyreId, vehicleWheelSource } from './world-vehicle-contact';

export interface VehicleWalkContacts {
  tyres: (RapierCollider|null)[];
  leaves: (RapierCollider|null)[];
  beacon: RapierCollider|null;
}
const surface=(surfaceId:string)=>({worldCollision:'solid',surfaceId});
const detail=(worldCollisionReason:string)=>({worldCollision:'none',worldCollisionReason});

/**
 * Vehicle visuals (owner: vehicles session). Rendered inside the vehicle rigid body, in body space:
 * +X forward, +Y up, origin at the chassis collider centre. Driving and the raycast suspension
 * stay in WorldActors; contacts depending on visible asset details mount here. `wheels` receives one group per wheel
 * (front-right, front-left, rear-right, rear-left as wheelGeometry().points); WorldActors positions
 * each group at the suspended wheel centre and steers it about +Y every frame, and rotates the
 * group's first child about local Z for rolling. `lights` exposes brake / reverse state for tail lamps.
 *
 * L1 cars (VEHICLE_ASSETS): the fixed GLB body and two hinged doors are baked separately (vertex colour + role attributes, one
 * shared shader) placed with its ground-plane origin at the measured rest ground height (bodyY), and
 * the four wheels are one InstancedMesh that copies the wheel groups' transforms each frame.
 * Lamps glow from per-car uniforms. Loading or a failed load shows the greybox car with the
 * corresponding chassis and tyre shape fitted to the currently displayed model.
 */
export interface VehicleVisualProps {
  id: VehicleId;
  size: [number, number, number];
  color: string;
  wheelRadius: number;
  wheelPoints: [number, number, number][];
  wheelRest: number;
  wheels: RefObject<(Group | null)[]>;
  lights: RefObject<{ brake: boolean; reverse: boolean }>;
  doors: RefObject<VehicleDoorState>;
  authoredHull: boolean;
  walkContacts: RefObject<VehicleWalkContacts> | null;
}

let draco: DRACOLoader | null = null;
function withDraco(loader: GLTFLoader) {
  if (!draco) { draco = new DRACOLoader(); draco.setDecoderPath('/assets/world/draco/'); }
  loader.setDRACOLoader(draco);
}

function WheelAnchors({ wheelPoints, wheelRest, wheels }: Pick<VehicleVisualProps, 'wheelPoints' | 'wheelRest' | 'wheels'>) {
  return <>{wheelPoints.map((point, i) => <group key={i} ref={node => { if (wheels.current) wheels.current[i] = node; }} position={[point[0], point[1] - wheelRest, point[2]]}><group /></group>)}</>;
}

function TyreContacts({id,points,rest,hull,contacts}:{id:VehicleId;points:VehicleVisualProps['wheelPoints'];rest:number;hull:Float32Array;contacts:VehicleWalkContacts}){
  const {rapier}=useRapier();
  return <>{points.map(([x,y,z],i)=><ConvexHullCollider key={i} name={vehicleTyreId(id,i)} args={[hull]} position={[x,y-rest,z]}
    mass={0} friction={0} restitution={0} ref={collider=>{contacts.tyres[i]=collider;collider?.setActiveHooks(rapier.ActiveHooks.FILTER_CONTACT_PAIRS);}}/>)}</>;
}

function Greybox({ id, size: [length, height, width], color, wheelRadius, wheelPoints, wheelRest, wheels, authoredHull, walkContacts }: VehicleVisualProps) {
  const {rapier}=useRapier();
  const hull=authoredHull?vehicleHulls(id):null;
  const rack=useMemo(()=>hull?.hulls.find(part=>part.part==='rack'),[hull]);
  const rackPoints=useMemo(()=>rack?Float32Array.from(rack.points):null,[rack]);
  const parts=useMemo(()=>hull?.hulls.map(({part,points})=>({id:vehicleHullId(id,part),geometry:new ConvexGeometry(
    Array.from({length:points.length/3},(_,i)=>new Vector3().fromArray(points,i*3)))})),[hull,id]);
  const tyre=useMemo(()=>new Float32Array(Array.from({length:20},(_,i)=>{
    const a=(i%10)*Math.PI/5;return [wheelRadius*Math.sin(a),wheelRadius*Math.cos(a),i<10?-.15:.15];
  }).flat()),[wheelRadius]);
  useEffect(()=>()=>parts?.forEach(({geometry})=>geometry.dispose()),[parts]);
  return <group name={`vehicle-greybox-${id}`}>
    {hull&&rackPoints&&<ConvexHullCollider name={vehicleHullId(id,'rack')} args={[rackPoints]} position={[0,hull.bodyY,0]}
      mass={0} friction={VEHICLE_HULL_FRICTION} restitution={VEHICLE_HULL_RESTITUTION}
      frictionCombineRule={rapier.CoefficientCombineRule.Min} restitutionCombineRule={rapier.CoefficientCombineRule.Min}/>}
    {hull&&parts?<group position={[0,hull.bodyY,0]}>{parts.map(part=><mesh key={part.id} name={`${part.id}-fallback`} geometry={part.geometry} userData={surface(part.id)} castShadow receiveShadow>
      <meshStandardMaterial color={part.id.endsWith('cabin')||part.id.endsWith('cab')?(id==='offroad'?'#E8803A':'#4E647D'):color} roughness={.92}/>
    </mesh>)}</group>:<>
      <mesh userData={surface(`vehicle-${id}-chassis`)} castShadow receiveShadow><boxGeometry args={[length,height*.58,width]}/><meshStandardMaterial color={color} roughness={.92}/></mesh>
      <mesh userData={surface(`vehicle-${id}-cabin`)} position={[-length*.08,height*.42,0]} castShadow><boxGeometry args={[length*.5,height*.4,width*.86]}/><meshStandardMaterial color={id==='offroad'?'#E8803A':'#4E647D'} roughness={.92}/></mesh>
    </>}
    <mesh position={[length / 2 + .015, 0, 0]} userData={detail('Headlight lens trim on the fallback model')}><boxGeometry args={[.05, .17, width * .7]} /><meshStandardMaterial color="#E6DCCB" /></mesh>
    <mesh position={[-length / 2 - .015, .05, 0]} userData={detail('Tail light lens trim on the fallback model')}><boxGeometry args={[.04, .12, width * .75]} /><meshStandardMaterial color="#63BEB3" emissive="#63BEB3" emissiveIntensity={0.4} /></mesh>
    {walkContacts&&<TyreContacts id={id} points={wheelPoints} rest={wheelRest} hull={tyre} contacts={walkContacts.current}/>}
    {wheelPoints.map((point, i) => <group key={i} ref={node => { if (wheels.current) wheels.current[i] = node; }} position={[point[0], point[1] - wheelRest, point[2]]}>
      <group><mesh rotation={[Math.PI / 2, 0, 0]} userData={walkContacts?surface(vehicleTyreId(id,i)):detail('Wheel visual follows the suspension ray on the comparison setup')} castShadow><cylinderGeometry args={[wheelRadius, wheelRadius, .3, 10]} /><meshStandardMaterial color="#33383C" roughness={1} /></mesh>
        <mesh position={[0, 0, i % 2 === 0 ? .17 : -.17]} rotation={[Math.PI / 2, 0, 0]} userData={detail('Small cosmetic fallback hub cap')}><cylinderGeometry args={[wheelRadius * .46, wheelRadius * .46, .025, 6]} /><meshStandardMaterial color="#E6DCCB" roughness={.9} /></mesh></group>
    </group>)}
  </group>;
}

class VisualGuard extends Component<{ id: string; fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error(`[world-vehicles] ${this.props.id} failed; greybox shown.`, error); }
  render() { return this.state.failed ? this.props.fallback : <Suspense fallback={this.props.fallback}>{this.props.children}</Suspense>; }
}

const _w = new Matrix4(), _flip = new Matrix4().makeRotationY(Math.PI);
const _vehiclePosition = new Vector3();
const lodReaders = new Map<VehicleId, () => Record<string, unknown>>();
/** Read-only tooling view of the actual meshes; importing it does not force a LOD or move a camera. */
export function vehicleLodSnapshot() { return Object.fromEntries([...lodReaders].map(([id, read]) => [id, read()])); }
/** Tail-lamp / beacon behaviour per car (DESIGN 4). */
const LAMPS: Record<VehicleId, { tailParked: number; beacon: boolean }> = {
  offroad: { tailParked: 0, beacon: false },
  coupe: { tailParked: 1, beacon: false }, // full-width cyan bar: one of the six light-tech places, faint at dusk
  van: { tailParked: 0, beacon: true },
};

function L1Visual(props: VehicleVisualProps & { asset: string }) {
  const { id, asset, wheels, lights, wheelPoints, wheelRest, authoredHull, walkContacts } = props;
  const gltfs = useLoader(GLTFLoader, [`/assets/world/vehicles/${asset}.glb`, `/assets/world/vehicles/${asset}-lod1.glb`], withDraco) as GLTF[];
  const hull = vehicleHulls(id)!;
  const {rapier}=useRapier();
  const visual = useRef<Group>(null), bodyMesh = useRef<Mesh>(null);
  const built = useMemo(() => {
    const geometries = gltfs.map((gltf, level) => {
      const body = gltf.scene.getObjectByName(`${asset}_body`), wheel = gltf.scene.getObjectByName('wheel-front-left') as Mesh | undefined;
      if (!body || !wheel) throw new Error(`[world-vehicles] ${asset}.glb lacks body or wheel nodes`);
      const rawBody = bakeNode(body), seatedBody=adaptVehicleSeats(id,rawBody),bodyGeometry = level === 0 ? refineVehicleBody(id, seatedBody) : seatedBody;
      bodyGeometry.userData.seatAdaptation=seatedBody.userData.seatAdaptation;
      if(bodyGeometry!==seatedBody)seatedBody.dispose();if(seatedBody!==rawBody)rawBody.dispose();
      // Both levels retain the same wheel-local origin and axle, so suspension/steer/roll are shared.
      const holder = new Group(); const clone = wheel.clone(); clone.position.set(0, 0, 0); clone.rotation.set(0, 0, 0); clone.scale.set(1, 1, 1); holder.add(clone);
      const rawWheel = bakeNode(holder), wheelGeometry = level === 0 && id === 'coupe' ? refineCoupeWheel(rawWheel) : rawWheel;
      if (wheelGeometry !== rawWheel) rawWheel.dispose();
      const doors = (['door-left', 'door-right'] as const).map(name => {
        const node = gltf.scene.getObjectByName(name);
        if (!node) throw new Error(`[world-vehicles] ${asset} lacks ${name}`);
        return { geometry: bakeNode(node), position: node.position.clone(), side: (name === 'door-left' ? -1 : 1) as DoorSide };
      });
      const bodySources=authoredHull?vehicleBodySources(id,bodyGeometry,hull):[{id:`${id}-legacy-body`,firstVertex:0,
        vertexCount:bodyGeometry.attributes.position.count,collision:'solid' as const,surfaceId:`vehicle-${id}-chassis`}];
      return { body: bodyGeometry, bodySources, wheel: wheelGeometry, doors };
    });
    const material = vehicleMaterial();
    const instanced = new InstancedMesh(geometries[0].wheel, material, 4);
    instanced.userData.shadowLodGeometry = geometries[1].wheel;
    instanced.castShadow = true; instanced.receiveShadow = true; instanced.name = `vehicle-${id}-wheels`;
    const wheelMatrices=wheelPoints.map(([x,y,z])=>{
      const matrix=new Matrix4().makeTranslation(x,y-wheelRest,z);
      return z>0?matrix.multiply(_flip):matrix;
    });
    wheelMatrices.forEach((matrix,i)=>instanced.setMatrixAt(i,matrix));
    Object.assign(instanced.userData,walkContacts?{worldCollision:'solid',worldCollisionInstances:vehicleWheelSource(id,wheelMatrices,true)}
      :detail('Wheel visual follows the suspension ray on the comparison setup'));
    instanced.boundingSphere = new Sphere(new Vector3(), Math.hypot(wheelPoints[0][0], wheelPoints[0][2]) + hull.wheelRadius + .4);
    const pool = new Mesh(new PlaneGeometry(9, 4.5), new MeshBasicMaterial({ map: headlightTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, opacity: 0, toneMapped: false }));
    pool.rotation.x = -Math.PI / 2; pool.visible = false; pool.renderOrder = 2; pool.name = `vehicle-${id}-headlight-pool`;
    pool.userData.noOcclusionFade = true;
    Object.assign(pool.userData,detail('Headlight illumination on the road'));
    const exhaust = id === 'coupe' ? createVehicleBoostExhaust(hull.bodyY) : null;
    if(exhaust)Object.assign(exhaust.userData,detail('Boost exhaust light and heat plume'));
    const doors = geometries[0].doors.map((door, i) => {
      const mesh = new Mesh(door.geometry, material);
      mesh.position.copy(door.position); mesh.position.y += hull.bodyY;
      mesh.name = `vehicle-${id}-${door.side < 0 ? 'left' : 'right'}-door`;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.shadowLodGeometry = geometries[1].doors[i].geometry;
      // A moving part must keep its own transform, including in the shadow budget pass.
      mesh.userData.vehicle = id;
      Object.assign(mesh.userData,walkContacts?surface(vehicleDoorId(id,door.side)):detail('Animated door with its transfer clearance sweep'));
      return mesh;
    });
    const doorControls=createVehicleDoorControls(id,hull.bodyY);
    if(doorControls)Object.assign(doorControls.userData,detail('Recessed cabin switches with hand contact targets'));
    // These bodies carry CCD. Keep each closed part convex, especially the
    // individual rails and spare-tyre sectors leaving the rack openings intact.
    const leafShapes=walkContacts&&geometries[0].doors.map(({geometry})=>vehicleContactHull(geometry));
    const tyreShape=walkContacts&&vehicleContactHull(geometries[0].wheel);
    const rack=authoredHull?vehicleRoofContactBlocks(geometries[0].body,geometries[0].bodySources,vehicleHullId(id,'rack')):[];
    const beacon=walkContacts&&id==='van'&&vehicleRoofContactBlocks(geometries[0].body,geometries[0].bodySources,vanBeaconId)[0];
    const retained=authoredHull&&retainedVehicleRoofSource(id,geometries[0].body,geometries[0].bodySources,geometries[1].bodySources);
    return { geometries, material, instanced, wheelMatrices, pool, exhaust, doors, doorControls, leafShapes, tyreShape, rack, beacon, retained, level: 0, distance: 0 };
  }, [gltfs, asset, id, wheelPoints, wheelRest, hull, authoredHull, walkContacts]);
  useEffect(() => {
    const triangles = (g: typeof built.geometries[number]) => (g.body.attributes.position.count + 4 * g.wheel.attributes.position.count + g.doors.reduce((n,d) => n + d.geometry.attributes.position.count, 0)) / 3;
    const proxies = () => {
      const rows: Record<string, unknown>[] = [];
      let scene: Group | null = visual.current;
      while (scene?.parent) scene = scene.parent as Group;
      scene?.traverse(o => {
        if (o.userData.budgetSource !== built.instanced) return;
        const p = o as InstancedMesh;
        rows.push({ name: p.name, geometry: p.geometry.uuid, triangles: (p.geometry.index?.count ?? p.geometry.attributes.position.count) / 3,
          worldMatrix: [...p.matrixWorld.elements], count: p.count, matrices: Array.from(p.instanceMatrix.array).slice(0, p.count * 16) });
      });
      return rows;
    };
    const read = () => ({ level: built.level, distance: built.distance, thresholds: { outward: 60, inward: 58 },
      l0Triangles: triangles(built.geometries[0]), l1Triangles: triangles(built.geometries[1]),
      bodyGeometry: bodyMesh.current?.geometry.uuid, wheelGeometry: built.instanced.geometry.uuid,
      bodyNearGeometry: built.geometries[0].body.uuid, bodyLodGeometry: built.geometries[1].body.uuid,
      shadowLodWheelGeometry: built.geometries[1].wheel.uuid,
      bodyUuid: bodyMesh.current?.uuid, wheelUuid: built.instanced.uuid, center: visual.current?.getWorldPosition(new Vector3()).toArray(),
      wheelMatrices: Array.from(built.instanced.instanceMatrix.array), wheelWorldMatrix: [...built.instanced.matrixWorld.elements], shadowProxies: proxies(),
      materialUuid: built.material.uuid, roles: built.geometries.map(g => [...new Set(Array.from(g.body.attributes.aRole.array))].sort()),
      detailTriangles: built.geometries[0].body.userData.detailTriangles,
      seats:built.geometries.map(g=>g.body.userData.seatAdaptation??null),
      rotorTriangles: built.geometries[0].wheel.userData.detailTriangles ?? 0, boostExhaustVisible: built.exhaust?.visible ?? false,
      doors: built.doors.map((d,i) => ({side: built.geometries[0].doors[i].side, quaternion:d.quaternion.toArray(), vertices:d.geometry.attributes.position.count})),
      glow: [...built.material.userData.glow.value] });
    lodReaders.set(id, read);
    return () => { if (lodReaders.get(id) === read) lodReaders.delete(id); };
  }, [id, built]);
  useEffect(() => () => {
    built.geometries.forEach(g => { g.body.dispose(); g.wheel.dispose(); g.doors.forEach(d => d.geometry.dispose()); }); built.material.dispose();
    built.pool.geometry.dispose(); (built.pool.material as MeshBasicMaterial).dispose();
    built.exhaust?.geometry.dispose(); (built.exhaust?.material as MeshBasicMaterial | undefined)?.dispose();
    if(built.retained)built.retained.geometry.dispose();
    if(built.doorControls){const materials=new Set(built.doorControls.children.flatMap(o=>(o as Mesh).material));built.doorControls.children.forEach(o=>(o as Mesh).geometry.dispose());materials.forEach(m=>m.dispose());}
  }, [built]);
  const length = props.size[0];
  useFrame(({ camera, clock }) => {
    if (visual.current && bodyMesh.current) {
      visual.current.getWorldPosition(_vehiclePosition);
      built.distance = camera.position.distanceTo(_vehiclePosition);
      const level = built.distance >= 60 ? 1 : built.distance < 58 ? 0 : built.level;
      if (level !== built.level) {
        bodyMesh.current.geometry = built.geometries[level].body;
        bodyMesh.current.userData.worldCollisionSources=built.geometries[level].bodySources;
        built.instanced.geometry = built.geometries[level].wheel;
        built.doors.forEach((door,i) => { door.geometry = built.geometries[level].doors[i].geometry; });
        built.level = level;
      }
    }
    built.doors.forEach((door,i) => { vehicleLeafPose(id,built.geometries[0].doors[i].side,props.doors.current,door.quaternion); });
    if(built.doorControls)built.doorControls.visible=built.distance<35;
    const groups = wheels.current;
    for (let i = 0; i < 4; i++) {
      const g = groups?.[i], roll = g?.children[0];
      if (!g || !roll) continue;
      g.updateMatrix(); roll.updateMatrix();
      _w.multiplyMatrices(g.matrix, roll.matrix);
      if (wheelPoints[i][2] > 0) _w.multiply(_flip);
      built.wheelMatrices[i].copy(_w);
      built.instanced.setMatrixAt(i, _w);
    }
    built.instanced.instanceMatrix.needsUpdate = true;
    const driving = useWorldStore.getState().activeVehicle === id, n = night.value, l = lights.current, lamp = LAMPS[id];
    if (built.exhaust) updateVehicleBoostExhaust(built.exhaust,
      driving && !useWorldStore.getState().paused && readDrivingTelemetry()?.boosting === true, clock.elapsedTime);
    const glow = built.material.userData.glow.value;
    glow[0] = driving ? .25 + 1.1 * n : 0;
    glow[1] = l?.brake ? 1.25 : driving ? .3 + .35 * n : lamp.tailParked * (.18 + .42 * n);
    glow[2] = l?.reverse ? .9 : 0;
    glow[3] = lamp.beacon ? .25 + .75 * n : 0;
    const poolOpacity = driving ? n * .55 : 0;
    built.pool.visible = poolOpacity > .01;
    (built.pool.material as MeshBasicMaterial).opacity = poolOpacity;
  });
  return <group ref={visual} name={`vehicle-${id}-visual`} userData={{ vehicle: id, assetId: asset }}>
    <WheelAnchors wheelPoints={wheelPoints} wheelRest={wheelRest} wheels={wheels} />
    <mesh ref={bodyMesh} name={`vehicle-${id}-body`} geometry={built.geometries[0].body} material={built.material} position={[0, hull.bodyY, 0]}
      userData={{shadowLodGeometry:built.geometries[1].body,worldCollisionSources:built.geometries[0].bodySources}} castShadow receiveShadow />
    {built.retained&&<mesh visible={false} name={`vehicle-${id}-roof-near-contact-source`} geometry={built.retained.geometry}
      material={built.material} position={[0,hull.bodyY,0]} userData={{worldCollisionSources:built.retained.ranges}}/>}
    {built.rack.map(part=><ConvexHullCollider key={part.id} name={part.id} args={[part.points]} position={[0,hull.bodyY,0]}
      mass={0} friction={VEHICLE_HULL_FRICTION} restitution={VEHICLE_HULL_RESTITUTION}
      frictionCombineRule={rapier.CoefficientCombineRule.Min} restitutionCombineRule={rapier.CoefficientCombineRule.Min}/>)}
    {built.beacon&&walkContacts&&<ConvexHullCollider name={vanBeaconId} args={[built.beacon.points]} position={[0,hull.bodyY,0]}
      mass={0} friction={0} restitution={0} ref={collider=>{walkContacts.current.beacon=collider;collider?.setActiveHooks(rapier.ActiveHooks.FILTER_CONTACT_PAIRS);}}/>}
    {walkContacts&&built.tyreShape&&<TyreContacts id={id} points={wheelPoints} rest={wheelRest} hull={built.tyreShape} contacts={walkContacts.current}/>}
    {walkContacts&&built.leafShapes&&built.leafShapes.map((points,i)=>
      <ConvexHullCollider key={i} name={vehicleDoorId(id,built.geometries[0].doors[i].side)} args={[points]}
        position={built.doors[i].position.toArray()} mass={0} friction={0} restitution={0}
        ref={collider=>{walkContacts.current.leaves[i]=collider;collider?.setActiveHooks(rapier.ActiveHooks.FILTER_CONTACT_PAIRS);}}/>)}
    {built.doors.map(door => <primitive key={door.name} object={door} />)}
    <primitive object={built.instanced} />
    {built.exhaust && <primitive object={built.exhaust} />}
    {built.doorControls && <primitive object={built.doorControls} />}
    <primitive object={built.pool} position={[length / 2 + 4.2, hull.bodyY + .03, 0]} />
  </group>;
}

export default memo(function WorldVehicleVisual(props: VehicleVisualProps) {
  const asset = VEHICLE_ASSETS[props.id];
  if (!asset || !vehicleHulls(props.id)) return <Greybox {...props} />;
  return <VisualGuard id={asset} fallback={<Greybox {...props} />}><L1Visual {...props} asset={asset} /></VisualGuard>;
});
