import { Component, memo, Suspense, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { AdditiveBlending, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Sphere, Vector3 } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { VehicleId } from './types';
import { useWorldStore } from './store';
import { night } from './WorldNight';
import { VEHICLE_ASSETS, bakeNode, headlightTexture, vehicleHulls, vehicleMaterial } from './WorldVehicleAssets';

/**
 * Vehicle visuals (owner: vehicles session). Rendered inside the vehicle rigid body, in body space:
 * +X forward, +Y up, origin at the chassis collider centre. Physics, colliders and the raycast
 * suspension stay in WorldActors; this component only draws. `wheels` receives one group per wheel
 * (front-right, front-left, rear-right, rear-left as wheelGeometry().points); WorldActors positions
 * each group at the suspended wheel centre and steers it about +Y every frame, and rotates the
 * group's first child about local Z for rolling. `lights` exposes brake / reverse state for tail lamps.
 *
 * L1 cars (VEHICLE_ASSETS): the GLB body is baked into one mesh (vertex colour + role attributes, one
 * shared shader) placed with its ground-plane origin at the measured rest ground height (bodyY), and
 * the four wheels are one InstancedMesh that copies the wheel groups' transforms each frame.
 * Lamps glow from per-car uniforms; no light sources are added. Loading or a failed load shows the
 * greybox car (colliders are independent of this component).
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
}

let draco: DRACOLoader | null = null;
function withDraco(loader: GLTFLoader) {
  if (!draco) { draco = new DRACOLoader(); draco.setDecoderPath('/assets/world/draco/'); }
  loader.setDRACOLoader(draco);
}

function WheelAnchors({ wheelPoints, wheelRest, wheels }: Pick<VehicleVisualProps, 'wheelPoints' | 'wheelRest' | 'wheels'>) {
  return <>{wheelPoints.map((point, i) => <group key={i} ref={node => { if (wheels.current) wheels.current[i] = node; }} position={[point[0], point[1] - wheelRest, point[2]]}><group /></group>)}</>;
}

function Greybox({ id, size: [length, height, width], color, wheelRadius, wheelPoints, wheelRest, wheels }: VehicleVisualProps) {
  return <group name={`vehicle-greybox-${id}`}>
    <mesh castShadow receiveShadow><boxGeometry args={[length, height * .58, width]} /><meshStandardMaterial color={color} roughness={0.92} /></mesh>
    <mesh position={[-length * .08, height * .42, 0]} castShadow><boxGeometry args={[length * .5, height * .4, width * .86]} /><meshStandardMaterial color={id === 'offroad' ? '#E8803A' : '#4E647D'} roughness={0.96} /></mesh>
    <mesh position={[length / 2 + .015, 0, 0]}><boxGeometry args={[.05, .17, width * .7]} /><meshStandardMaterial color="#E6DCCB" /></mesh>
    <mesh position={[-length / 2 - .015, .05, 0]}><boxGeometry args={[.04, .12, width * .75]} /><meshStandardMaterial color="#63BEB3" emissive="#63BEB3" emissiveIntensity={0.4} /></mesh>
    {wheelPoints.map((point, i) => <group key={i} ref={node => { if (wheels.current) wheels.current[i] = node; }} position={[point[0], point[1] - wheelRest, point[2]]}>
      <group><mesh rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[wheelRadius, wheelRadius, .3, 10]} /><meshStandardMaterial color="#33383C" roughness={1} /></mesh>
        <mesh position={[0, 0, i % 2 === 0 ? .17 : -.17]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[wheelRadius * .46, wheelRadius * .46, .025, 6]} /><meshStandardMaterial color="#E6DCCB" roughness={.9} /></mesh></group>
    </group>)}
  </group>;
}

class VisualGuard extends Component<{ id: string; fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error(`[world-vehicles] ${this.props.id} failed; greybox shown.`, error); }
  render() { return this.state.failed ? this.props.fallback : <Suspense fallback={this.props.fallback}>{this.props.children}</Suspense>; }
}

const _m = new Matrix4(), _w = new Matrix4(), _flip = new Matrix4().makeRotationY(Math.PI);
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
  const { id, asset, wheels, lights, wheelPoints, wheelRest } = props;
  const gltfs = useLoader(GLTFLoader, [`/assets/world/vehicles/${asset}.glb`, `/assets/world/vehicles/${asset}-lod1.glb`], withDraco) as GLTF[];
  const hull = vehicleHulls(id)!;
  const visual = useRef<Group>(null), bodyMesh = useRef<Mesh>(null);
  const built = useMemo(() => {
    const geometries = gltfs.map(gltf => {
      const body = gltf.scene.getObjectByName(`${asset}_body`), wheel = gltf.scene.getObjectByName('wheel-front-left') as Mesh | undefined;
      if (!body || !wheel) throw new Error(`[world-vehicles] ${asset}.glb lacks body or wheel nodes`);
      const bodyGeometry = bakeNode(body);
      // Both levels retain the same wheel-local origin and axle, so suspension/steer/roll are shared.
      const holder = new Group(); const clone = wheel.clone(); clone.position.set(0, 0, 0); clone.rotation.set(0, 0, 0); clone.scale.set(1, 1, 1); holder.add(clone);
      return { body: bodyGeometry, wheel: bakeNode(holder) };
    });
    const material = vehicleMaterial();
    const instanced = new InstancedMesh(geometries[0].wheel, material, 4);
    instanced.userData.shadowLodGeometry = geometries[1].wheel;
    instanced.castShadow = true; instanced.receiveShadow = true; instanced.name = `vehicle-${id}-wheels`;
    for (let i = 0; i < 4; i++) { const p = wheelPoints[i]; _m.makeTranslation(p[0], p[1] - wheelRest, p[2]); if (p[2] > 0) _m.multiply(_flip); instanced.setMatrixAt(i, _m); }
    instanced.boundingSphere = new Sphere(new Vector3(), Math.hypot(wheelPoints[0][0], wheelPoints[0][2]) + hull.wheelRadius + .4);
    const pool = new Mesh(new PlaneGeometry(9, 4.5), new MeshBasicMaterial({ map: headlightTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, opacity: 0, toneMapped: false }));
    pool.rotation.x = -Math.PI / 2; pool.visible = false; pool.renderOrder = 2; pool.name = `vehicle-${id}-headlight-pool`;
    pool.userData.noOcclusionFade = true;
    return { geometries, material, instanced, pool, level: 0, distance: 0 };
  }, [gltfs, asset, id, wheelPoints, wheelRest, hull.wheelRadius]);
  useEffect(() => {
    const triangles = (g: { body: Mesh['geometry']; wheel: Mesh['geometry'] }) => g.body.attributes.position.count / 3 + 4 * g.wheel.attributes.position.count / 3;
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
      bodyUuid: bodyMesh.current?.uuid, wheelUuid: built.instanced.uuid, center: visual.current?.getWorldPosition(new Vector3()).toArray(),
      wheelMatrices: Array.from(built.instanced.instanceMatrix.array), wheelWorldMatrix: [...built.instanced.matrixWorld.elements], shadowProxies: proxies(),
      materialUuid: built.material.uuid, roles: built.geometries.map(g => [...new Set(Array.from(g.body.attributes.aRole.array))].sort()),
      glow: [...built.material.userData.glow.value] });
    lodReaders.set(id, read);
    return () => { if (lodReaders.get(id) === read) lodReaders.delete(id); };
  }, [id, built]);
  const length = props.size[0];
  useFrame(({ camera }) => {
    if (visual.current && bodyMesh.current) {
      visual.current.getWorldPosition(_vehiclePosition);
      built.distance = camera.position.distanceTo(_vehiclePosition);
      const level = built.distance >= 60 ? 1 : built.distance < 58 ? 0 : built.level;
      if (level !== built.level) {
        bodyMesh.current.geometry = built.geometries[level].body;
        built.instanced.geometry = built.geometries[level].wheel;
        built.level = level;
      }
    }
    const groups = wheels.current;
    for (let i = 0; i < 4; i++) {
      const g = groups?.[i], roll = g?.children[0];
      if (!g || !roll) continue;
      g.updateMatrix(); roll.updateMatrix();
      _w.multiplyMatrices(g.matrix, roll.matrix);
      if (wheelPoints[i][2] > 0) _w.multiply(_flip);
      built.instanced.setMatrixAt(i, _w);
    }
    built.instanced.instanceMatrix.needsUpdate = true;
    const driving = useWorldStore.getState().activeVehicle === id, n = night.value, l = lights.current, lamp = LAMPS[id];
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
    <mesh ref={bodyMesh} name={`vehicle-${id}-body`} geometry={built.geometries[0].body} material={built.material} position={[0, hull.bodyY, 0]} userData={{ shadowLodGeometry: built.geometries[1].body }} castShadow receiveShadow />
    <primitive object={built.instanced} />
    <primitive object={built.pool} position={[length / 2 + 4.2, hull.bodyY + .03, 0]} />
  </group>;
}

export default memo(function WorldVehicleVisual(props: VehicleVisualProps) {
  const asset = VEHICLE_ASSETS[props.id];
  if (!asset || !vehicleHulls(props.id)) return <Greybox {...props} />;
  return <VisualGuard id={asset} fallback={<Greybox {...props} />}><L1Visual {...props} asset={asset} /></VisualGuard>;
});
