import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import {
  Box3, BoxGeometry, BufferGeometry, Color, ConeGeometry, Euler, Float32BufferAttribute, InstancedMesh, Matrix4, Mesh,
  MeshStandardMaterial, Object3D, Quaternion, Vector3, type Material, type PointLight,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CAMP_CENTER } from './layout';
import { useWorldStore } from './store';
import type { Vec3 } from './types';

/** Camp art slice (C01-C10, G01/G02 camp segment, G16-G23). Physics stays in
 * WorldEnvironment with the original greybox collider shapes; this file is visual only. */
export type CampBlock = { position: Vec3; size: Vec3; color: string; rotation?: Vec3 };
export interface CampLayout { pads: CampBlock[]; padObjects: CampBlock[]; tents: CampBlock[]; benches: CampBlock[]; trees: CampBlock[]; lampHeads: CampBlock[] }
/** tilt rotates about the asset's local X before yaw (re-grounded by bounds); sink buries it. */
type Placement = { position: Vec3; yaw: number; scale?: number; tilt?: number; sink?: number };

const CAMP_RADIUS = 24;
const CAMP_TOP = CAMP_CENTER[1];
const PAD_TOP = 4.9;
/** Ring index (layout order, angle = i*45deg, +Z south) for pad1..pad8. Fable r3 swap: desk
 * west-south-west (pad1, index 3), trophy shelf north-west (pad2, index 5), flags west (pad3,
 * index 4, the only pad whose full flag set fits the default follow frame). The remaining
 * five pads carry the C11-C15 stand-ins. Old pad-object colliders are unchanged. */
const PAD_ORDER = [3, 5, 4, 6, 7, 0, 1, 2];
const PLACEHOLDER_IDS = ['C11', 'C12', 'C13', 'C14', 'C15'];
/** Only the four camp-surface trees are replaced; town/island trees stay greybox. */
const TREE_IDS = ['G17', 'G16', 'G18', 'G16'];
const TREE_YAWS = [0.6, 2.1, 4.0, 5.2];

let draco: DRACOLoader | null = null;
/** Local decoder copy under /assets/world/draco; never the remote CDN default. */
function withDraco(loader: GLTFLoader) {
  if (!draco) { draco = new DRACOLoader(); draco.setDecoderPath('/assets/world/draco/'); }
  loader.setDRACOLoader(draco);
}
const useCampGltf = (id: string) => useLoader(GLTFLoader, `/assets/world/camp/${id}.glb`, withDraco) as GLTF;

const BOX = new BoxGeometry(1, 1, 1);
const BUNDLE = new RoundedBoxGeometry(1, 1, 1, 2, 0.16);
const FLAME = new ConeGeometry(1, 1, 6, 1).translate(0, 0.5, 0);

/** Per-asset error isolation: a missing GLB shows its old greybox look under a
 * camp-fallback-* name so QA can never mistake it for a loaded asset. */
class AssetGuard extends Component<{ id: string; fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error(`[world-camp] ${this.props.id} failed; greybox fallback shown.`, error); }
  render() {
    const { id, fallback, children } = this.props;
    if (this.state.failed) return <group name={`camp-fallback-${id}`}>{fallback}</group>;
    // Loading shows the same greybox stand-in under a distinct name; the world never waits on art.
    return <Suspense fallback={<group name={`camp-loading-${id}`}>{fallback}</group>}>{children}</Suspense>;
  }
}

function Boxes({ items, geometry = BOX, shadow = true, name }: { items: CampBlock[]; geometry?: BufferGeometry; shadow?: boolean; name?: string }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new Object3D(), color = new Color();
    items.forEach((item, i) => {
      dummy.position.set(...item.position);
      const r = item.rotation ?? [0, 0, 0];
      dummy.rotation.set(r[0], r[1], r[2]);
      dummy.scale.set(...item.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.set(item.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  if (!items.length) return null;
  return <instancedMesh name={name} ref={ref} args={[geometry, undefined, items.length]} castShadow={shadow} receiveShadow>
    <meshStandardMaterial roughness={1} />
  </instancedMesh>;
}

type Part = { geometry: BufferGeometry; material: Material | Material[]; matrix: Matrix4 };
type MaterialMap = (material: Material) => Material;
/** Maps each distinct source material once; returns only newly created runtime copies. */
function mapper(map?: MaterialMap) {
  const cache = new Map<Material, Material>(), copies: Material[] = [];
  const one = (m: Material) => {
    if (!map) return m;
    let out = cache.get(m);
    if (!out) { out = map(m); cache.set(m, out); if (out !== m) copies.push(out); }
    return out;
  };
  return { apply: (m: Material | Material[]) => Array.isArray(m) ? m.map(one) : one(m), copies };
}
function collectParts(gltf: GLTF, map?: MaterialMap) {
  gltf.scene.updateMatrixWorld(true);
  const parts: Part[] = [], materials = mapper(map);
  gltf.scene.traverse(object => {
    const mesh = object as Mesh;
    if (mesh.isMesh) parts.push({ geometry: mesh.geometry, material: materials.apply(mesh.material), matrix: mesh.matrixWorld.clone() });
  });
  return { parts, copies: materials.copies };
}
function toMatrix(p: Placement, bounds: Box3) {
  const scale = p.scale ?? 1;
  const rotation = new Quaternion().setFromEuler(new Euler(p.tilt ?? 0, p.yaw, 0, 'YXZ'));
  let lift = 0;
  if (p.tilt) {
    // Lowest rotated bounds corner rests on the ground (conservative; sink covers the gap).
    const tilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), p.tilt), c = new Vector3();
    let minY = Infinity;
    for (let i = 0; i < 8; i++) {
      c.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z).applyQuaternion(tilt);
      minY = Math.min(minY, c.y);
    }
    lift = -minY * scale;
  }
  const position = new Vector3(p.position[0], p.position[1] + lift - (p.sink ?? 0), p.position[2]);
  return new Matrix4().compose(position, rotation, new Vector3().setScalar(scale));
}

function InstancedPart({ part, matrices }: { part: Part; matrices: Matrix4[] }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    matrices.forEach((placement, i) => mesh.setMatrixAt(i, m.multiplyMatrices(placement, part.matrix)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [part, matrices]);
  return <instancedMesh ref={ref} args={[part.geometry, part.material, matrices.length]} castShadow receiveShadow />;
}

/** Repeated static assets: one instanced draw per GLB primitive, shared materials. */
function InstancedAsset({ id, placements, materialMap }: { id: string; placements: Placement[]; materialMap?: MaterialMap }) {
  const gltf = useCampGltf(id);
  const { parts, copies } = useMemo(() => collectParts(gltf, materialMap), [gltf, materialMap]);
  useRegisteredCopies(copies);
  const matrices = useMemo(() => {
    const bounds = new Box3();
    parts.forEach(part => { part.geometry.computeBoundingBox(); bounds.union(part.geometry.boundingBox!.clone().applyMatrix4(part.matrix)); });
    return placements.map(p => toMatrix(p, bounds));
  }, [parts, placements]);
  return <group name={`camp-asset-${id}-x${placements.length}`}>
    {parts.map((part, i) => <InstancedPart key={i} part={part} matrices={matrices} />)}
  </group>;
}

function useCampScene(id: string, materialMap?: MaterialMap) {
  const gltf = useCampGltf(id);
  const { scene, copies } = useMemo(() => {
    const scene = gltf.scene.clone(true), materials = mapper(materialMap);
    scene.traverse(object => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.material = materials.apply(mesh.material);
    });
    return { scene, copies: materials.copies };
  }, [gltf, materialMap]);
  useRegisteredCopies(copies);
  return scene;
}

function SingleAsset({ id, label, placement, materialMap, children }: { id: string; label: string; placement: Placement; materialMap?: MaterialMap; children?: ReactNode }) {
  const scene = useCampScene(id, materialMap);
  return <group name={`camp-asset-${id}-${label}`} position={placement.position} rotation={[0, placement.yaw, 0]}>
    <primitive object={scene} />{children}
  </group>;
}

const isRunning = () => { const s = useWorldStore.getState(); return !s.paused && !s.shot; };

/** C10: pole fixed; flag_01..04 sway about their own hoist pivots (local +Y). */
function FlagPole({ label, placement }: { label: string; placement: Placement }) {
  const scene = useCampScene('C10');
  useEffect(() => {
    const flag = scene.getObjectByName('flag_03') as Mesh | undefined;
    if (!flag?.isMesh || Array.isArray(flag.material)) return;
    const source = flag.material as MeshStandardMaterial, copy = source.clone();
    copy.color.set('#E8803A');
    flag.material = copy;
    return () => { flag.material = source; copy.dispose(); };
  }, [scene]);
  const flags = useMemo(() => ['flag_01', 'flag_02', 'flag_03', 'flag_04']
    .map(name => scene.getObjectByName(name)).filter((f): f is Object3D => !!f)
    .map(object => ({ object, base: object.rotation.y })), [scene]);
  const time = useRef(0);
  useFrame((_, delta) => {
    if (!isRunning()) return;
    time.current += delta;
    const t = time.current;
    flags.forEach(({ object, base }, i) => { object.rotation.y = base + Math.sin(t * 1.5 + i * 0.9) * 0.1 + Math.sin(t * 3.1 + i) * 0.03; });
  });
  return <group name={`camp-asset-C10-${label}`} position={placement.position} rotation={[0, placement.yaw, 0]}><primitive object={scene} /></group>;
}

/** A handful of faceted runtime flame cones in C05's open centre; no particles. */
const FLAMES = [
  { p: [0, 0, 0], r: 0.4, h: 1.4, phase: 0, core: false },
  { p: [0.22, 0, 0.12], r: 0.22, h: 0.75, phase: 1.7, core: false },
  { p: [-0.2, 0, 0.15], r: 0.2, h: 0.68, phase: 3.1, core: false },
  { p: [0.03, 0, -0.23], r: 0.21, h: 0.8, phase: 4.4, core: false },
  { p: [0, 0, 0], r: 0.2, h: 0.8, phase: 2.3, core: true },
] as const;
function CampFire({ position }: { position: Vec3 }) {
  const outer = useMemo(() => new MeshStandardMaterial({ color: '#E8803A', emissive: '#FF8A3A', emissiveIntensity: 1.3, roughness: 1, flatShading: true }), []);
  const core = useMemo(() => new MeshStandardMaterial({ color: '#FFC978', emissive: '#FFC978', emissiveIntensity: 1.6, roughness: 1, flatShading: true }), []);
  useEffect(() => () => { outer.dispose(); core.dispose(); }, [outer, core]);
  const refs = useRef<(Mesh | null)[]>([]);
  const time = useRef(0);
  useFrame((_, delta) => {
    const night = useWorldStore.getState().light === 'night';
    outer.emissiveIntensity += ((night ? 2.2 : 1.3) - outer.emissiveIntensity) * Math.min(1, delta * 2);
    core.emissiveIntensity = outer.emissiveIntensity * 1.25;
    if (!isRunning()) return;
    time.current += delta;
    const t = time.current;
    FLAMES.forEach((f, i) => {
      const mesh = refs.current[i];
      if (!mesh) return;
      const pulse = 1 + Math.sin(t * 7 + f.phase) * 0.13 + Math.sin(t * 12.7 + f.phase * 2) * 0.05;
      mesh.scale.set(f.r * (1.04 - pulse * 0.04), f.h * pulse, f.r * (1.04 - pulse * 0.04));
      mesh.rotation.set(Math.sin(t * 2.3 + f.phase) * 0.06, f.phase + t * 0.4, Math.cos(t * 2.1 + f.phase) * 0.06);
    });
  });
  return <group name="camp-runtime-flame" position={position}>
    {FLAMES.map((f, i) => <mesh key={i} ref={m => { refs.current[i] = m; }} geometry={FLAME} material={f.core ? core : outer}
      position={[f.p[0], f.p[1], f.p[2]]} scale={[f.r, f.h, f.r]} rotation={[0, f.phase, 0]} />)}
  </group>;
}

/** Deterministic hash in [-1, 1] for low-poly edge variation (not per-face shading). */
const hash = (k: number, seed: number) => { const s = Math.sin(k * 12.9898 + seed * 78.233) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };

/** C01 (Fable P1-01): warm sand plaza inside the benches, a lighter sand band carrying the
 * path and the eight pads, two-tone low-frequency grass outside, sandy rim at the cliff.
 * One flat cap exactly at the unchanged camp collider top. */
const GROUND_RINGS = [0, 1.6, 3.0, 4.2, 6, 8, 9.8, 10.4, 13, 15, 17.2, 18.4, 19.6, 20.8, 22, 22.9, CAMP_RADIUS];
const SAND = { pit: new Color('#A58D6A'), trodden: new Color('#B89A6A'), plaza: new Color('#C9A978'), lip: new Color('#BC9C6C'), band: new Color('#D2B98A'), rim: new Color('#B99A6C') };
const GRASS = [new Color('#7E8C3E'), new Color('#8A963F')];
function sandColor(r: number, out: Color) {
  if (r <= 1.6) return out.copy(SAND.pit);
  if (r <= 3.0) return out.copy(SAND.pit).lerp(SAND.trodden, (r - 1.6) / 1.4);
  if (r <= 4.2) return out.copy(SAND.trodden).lerp(SAND.plaza, (r - 3.0) / 1.2);
  if (r < 9.8) return out.copy(SAND.plaza);
  return out.copy(SAND.plaza).lerp(SAND.lip, Math.min(1, (r - 9.8) / 0.6));
}
function createGround(): BufferGeometry {
  const N = 96, [cx, , cz] = CAMP_CENTER;
  const radiusAt = (ring: number, k: number) => {
    const r = GROUND_RINGS[ring];
    return r === 0 || r === CAMP_RADIUS ? r : r + hash(k % N, ring + 11) * Math.min(0.22, r * 0.05);
  };
  const positions: number[] = [], colors: number[] = [];
  const c = new Color(), face = new Color();
  const drift = (x: number, z: number) => 1 + 0.035 * Math.sin(x * 0.31 + z * 0.17) + 0.025 * Math.sin(z * 0.43 - x * 0.12);
  for (let ring = 0; ring < GROUND_RINGS.length - 1; ring++) {
    const zone = GROUND_RINGS[ring] < 10.4 ? 'plaza' : GROUND_RINGS[ring] < 17.2 ? 'band' : GROUND_RINGS[ring] < 22.9 ? 'grass' : 'rim';
    for (let k = 0; k < N; k++) {
      const vertex = (rIndex: number, kk: number) => {
        const a = (kk % N) / N * Math.PI * 2, r = radiusAt(rIndex, kk);
        return [cx + Math.cos(a) * r, CAMP_TOP, cz + Math.sin(a) * r, GROUND_RINGS[rIndex]] as const;
      };
      const quad = [vertex(ring, k), vertex(ring, k + 1), vertex(ring + 1, k), vertex(ring, k + 1), vertex(ring + 1, k + 1), vertex(ring + 1, k)];
      const tris = ring === 0 ? [quad[0], quad[4], quad[2]] : quad;
      if (zone === 'grass') {
        // Two-step patchwork from low-frequency world noise, decided per face.
        const fx = (tris[0][0] + tris[1][0] + tris[2][0]) / 3, fz = (tris[0][2] + tris[1][2] + tris[2][2]) / 3;
        const n = Math.sin(fx * 0.21 + fz * 0.13) + 0.8 * Math.sin(fz * 0.27 - fx * 0.17 + 1.3) + 0.35 * Math.sin((fx + fz) * 0.41);
        face.copy(GRASS[n > 0.15 ? 1 : 0]);
      }
      for (const [x, y, z, nominal] of tris) {
        if (zone === 'grass') c.copy(face);
        else if (zone === 'plaza') sandColor(nominal, c).multiplyScalar(drift(x, z));
        else c.copy(zone === 'band' ? SAND.band : SAND.rim).multiplyScalar(drift(x, z));
        positions.push(x, y, z); colors.push(c.r, c.g, c.b);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(positions.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/** G01 camp segment: layered, faceted stone bands replacing the smooth sand cylinder side.
 * Stays within the old 24 -> 24.7 m flare so nothing new intrudes on the ramp or lower ground. */
function createCliff(): BufferGeometry {
  const N = 72, [cx, , cz] = CAMP_CENTER;
  const levels = [CAMP_TOP, 4.35, 3.45, 2.35, 0.9];
  const base = [CAMP_RADIUS, 24.1, 24.3, 24.45, 24.7];
  const bandColors = ['#A7835A', '#B4A896', '#9A8F82', '#8C8276'].map(c => new Color(c));
  const radius = (level: number, k: number) => level === 0 ? base[0] : base[level] + hash(k, level + 7) * 0.2 - 0.1;
  const point = (level: number, k: number) => { const a = (k % N) / N * Math.PI * 2, r = radius(level, k % N); return [cx + Math.cos(a) * r, levels[level], cz + Math.sin(a) * r]; };
  const positions: number[] = [], colors: number[] = [];
  for (let level = 0; level < levels.length - 1; level++) for (let k = 0; k < N; k++) {
    const t0 = point(level, k), t1 = point(level, k + 1), b0 = point(level + 1, k), b1 = point(level + 1, k + 1);
    const c = bandColors[level];
    for (const v of [t0, t1, b0, t1, b1, b0]) { positions.push(...v); colors.push(c.r, c.g, c.b); }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Night-only cool fill bounded to the camp plateau (distance cutoff, no decay, no shadows), so
 * unlit ground reads blue-grey like the locked night reference while the fire stays the key light. */
function CampNightFill() {
  const ref = useRef<PointLight>(null);
  useFrame((_, delta) => {
    const light = ref.current;
    if (!light) return;
    // decay 0 = flat low fill; the distance window (34 m) keeps it off the town and park.
    const target = useWorldStore.getState().light === 'night' ? 4 : 0;
    light.intensity += (target - light.intensity) * Math.min(1, delta * 1.5);
  });
  return <pointLight name="camp-night-fill" ref={ref} position={[CAMP_CENTER[0], 16, CAMP_CENTER[2] - 4]} color="#6F82B2" intensity={0} distance={34} decay={0} castShadow={false} />;
}

/** Night-only warm spill from the fire with linear falloff so it reaches the benches (6 m)
 * and the nearest pads (15 m); the existing fire point light stays the hot core. */
function CampFireSpill() {
  const ref = useRef<PointLight>(null);
  const level = useRef(0), time = useRef(0);
  useFrame((_, delta) => {
    const light = ref.current;
    if (!light) return;
    level.current += ((useWorldStore.getState().light === 'night' ? 1 : 0) - level.current) * Math.min(1, delta * 1.5);
    if (isRunning()) time.current += delta;
    // decay 1 over 24 m; Fable r2 cut 30% from 11 so the pit, benches and pads read as three
    // brightness steps. The inverse-square fire light in WorldEnvironment stays the hot core.
    light.intensity = level.current * 7.7 * (1 + Math.sin(time.current * 5.3) * 0.05);
  });
  return <pointLight name="camp-fire-spill" ref={ref} position={[CAMP_CENTER[0], CAMP_TOP + 1.6, CAMP_CENTER[2]]} color="#FF9A4A" intensity={0} distance={24} decay={1} castShadow={false} />;
}

/** Night canvas glow on runtime copies only. Fable shelters review: only the orange canvas
 * shell glows; binding, cream trim and groundsheet stay unlit. */
const nightGlow = new Set<MeshStandardMaterial>();
function canvasGlowCopy(material: Material): Material {
  const source = material as MeshStandardMaterial;
  if (source.name !== 'camp_canvas_orange' || !source.isMeshStandardMaterial) return material;
  const copy = source.clone();
  copy.emissive.set('#FF9A4A');
  copy.emissiveIntensity = 0;
  return copy;
}
function useRegisteredCopies(copies: Material[]) {
  useEffect(() => {
    const glow = copies.filter((m): m is MeshStandardMaterial => (m as MeshStandardMaterial).isMeshStandardMaterial);
    glow.forEach(m => nightGlow.add(m));
    return () => glow.forEach(m => { nightGlow.delete(m); m.dispose(); });
  }, [copies]);
}
function CampNightMaterials() {
  const level = useRef(0);
  useFrame((_, delta) => {
    level.current += ((useWorldStore.getState().light === 'night' ? 1 : 0) - level.current) * Math.min(1, delta * 1.5);
    nightGlow.forEach(m => { m.emissiveIntensity = level.current * 0.15; });
  });
  return null;
}

/** Camp exit lamps: own cyan heads (the global cyan material is untouched) and one small
 * warm ground pool between the two posts at night. Posts and colliders stay in WorldEnvironment. */
function CampLamps({ heads }: { heads: CampBlock[] }) {
  const material = useMemo(() => new MeshStandardMaterial({ color: '#4FD1C5', emissive: '#4FD1C5', emissiveIntensity: 0.15, roughness: 1 }), []);
  useEffect(() => () => material.dispose(), [material]);
  const pool = useRef<PointLight>(null);
  const level = useRef(0);
  useFrame((_, delta) => {
    level.current += ((useWorldStore.getState().light === 'night' ? 1 : 0) - level.current) * Math.min(1, delta * 1.5);
    material.emissiveIntensity = 0.15 + level.current * 1.9;
    if (pool.current) pool.current.intensity = level.current * 2.4;
  });
  const mid = heads.length ? heads.reduce((a, h) => [a[0] + h.position[0] / heads.length, a[1], a[2] + h.position[2] / heads.length] as Vec3, [0, CAMP_TOP + 1.5, 0] as Vec3) : null;
  return <group name="camp-exit-lamps">
    {heads.map((h, i) => <mesh key={i} geometry={BOX} material={material} position={h.position} scale={h.size} />)}
    {mid && <pointLight ref={pool} position={mid} color="#FFD08A" intensity={0} distance={6.5} decay={1} castShadow={false} />}
  </group>;
}

function CampTerrain() {
  const ground = useMemo(createGround, []);
  const cliff = useMemo(createCliff, []);
  useEffect(() => () => { ground.dispose(); cliff.dispose(); }, [ground, cliff]);
  return <group name="camp-terrain-C01-G01">
    <mesh geometry={ground} receiveShadow><meshStandardMaterial vertexColors roughness={1} /></mesh>
    <mesh geometry={cliff} receiveShadow><meshStandardMaterial vertexColors roughness={1} flatShading /></mesh>
  </group>;
}

const rotateY = (x: number, z: number, yaw: number): [number, number] => [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];

/** C02: grout slab plus six flagstones whose tops sit exactly on the unchanged pad collider top. */
function padTiles(pads: CampBlock[]): CampBlock[] {
  // Fable P2-02: a cooler grey than the sand so the pads separate from the plaza.
  const tones = ['#8A8580', '#97928B', '#807B75'];
  const widths = [1.1, 0.9, 1.0], depths = [1.3, 1.1], gap = 0.05;
  const items: CampBlock[] = [];
  pads.forEach((pad, p) => {
    const yaw = pad.rotation?.[1] ?? 0;
    items.push({ position: [pad.position[0], 4.835, pad.position[2]], size: [pad.size[0], 0.07, pad.size[2]], color: '#6A6560', rotation: [0, yaw, 0] });
    let x0 = -widths.reduce((a, b) => a + b, 0) / 2;
    widths.forEach((w, c) => {
      let z0 = -depths.reduce((a, b) => a + b, 0) / 2;
      depths.forEach((d, r) => {
        const [ox, oz] = rotateY(x0 + w / 2, z0 + d / 2, yaw);
        items.push({ position: [pad.position[0] + ox, PAD_TOP - 0.035, pad.position[2] + oz], size: [w - gap, 0.07, d - gap], color: tones[(c + r * 2 + p) % 3], rotation: [0, yaw + hash(p * 6 + c * 2 + r, 9) * 0.025, 0] });
        z0 += d;
      });
      x0 += w;
    });
  });
  return items;
}

export default function WorldCamp({ layout }: { layout: CampLayout }) {
  const data = useMemo(() => {
    const yawToCentre = (pad: CampBlock) => Math.PI + (pad.rotation?.[1] ?? 0);
    const padAt = (n: number) => layout.pads[PAD_ORDER[n]];
    const onPad = (n: number): Placement => { const pad = padAt(n); return { position: [pad.position[0], PAD_TOP, pad.position[2]], yaw: yawToCentre(pad) }; };
    const base = (b: CampBlock): Vec3 => [b.position[0], b.position[1] - b.size[1] / 2, b.position[2]];
    // Tents: +X entry turned to world +Z, facing the fire; footprint stays in the old 5.5 x 4.2 cell.
    const tents = layout.tents.map(t => ({ position: base(t), yaw: -Math.PI / 2 }));
    // C06 long axis is GLB +Z; the collider's long axis is its local X.
    // ... and its +X front is turned to face the fire.
    const benches = layout.benches.map(b => ({ position: base(b), yaw: (b.rotation?.[1] ?? 0) - Math.PI / 2 }));
    const trees = layout.trees.map((t, i) => ({ id: TREE_IDS[i], placement: { position: base(t), yaw: TREE_YAWS[i] } }));
    const placeholders = PAD_ORDER.slice(3).map(index => layout.padObjects[index]);
    return { onPad, tents, benches, trees, placeholders, tiles: padTiles(layout.pads) };
  }, [layout]);
  const nature = useMemo(createNature, []);
  const treeGroups = useMemo(() => ['G16', 'G17', 'G18'].map(id => ({ id, placements: data.trees.filter(t => t.id === id).map(t => t.placement) })), [data]);
  const fallbackTree = (id: string) => data.trees.flatMap((t, i) => t.id !== id ? [] : [layout.trees[i], { ...layout.trees[i], position: [layout.trees[i].position[0], CAMP_TOP + 3.6, layout.trees[i].position[2]] as Vec3, size: [3.8, 3.6, 3.8] as Vec3, color: '#6F8A3A' }]);
  const padObject = (n: number) => [layout.padObjects[PAD_ORDER[n]]];
  const firePosition: Vec3 = [CAMP_CENTER[0], CAMP_TOP, CAMP_CENTER[2]];

  return <group name="world-camp-slice">
    <CampTerrain />
    <CampNightFill />
    <CampFireSpill />
    <CampNightMaterials />
    <CampLamps heads={layout.lampHeads} />
    <Boxes name="camp-C02-flagstones" items={data.tiles} shadow={false} />
    {/* Pads 4-8 keep their old collider: low canvas bundles mark C11-C15 as not yet made. */}
    <group name={`camp-placeholder-${PLACEHOLDER_IDS.join('-')}`}>
      <Boxes items={data.placeholders.map(b => ({ ...b, color: '#CDB894', rotation: [0, b.rotation?.[1] ?? 0, 0] }))} geometry={BUNDLE} />
      <Boxes items={data.placeholders.flatMap(b => [-0.25, 0.25].map(o => ({ position: [b.position[0] + o, b.position[1], b.position[2]] as Vec3, size: [0.09, b.size[1] + 0.02, b.size[2] + 0.02] as Vec3, color: '#6E5A44' })))} />
    </group>
    <AssetGuard id="C03" fallback={<Boxes items={[layout.tents[1]]} />}>
      <SingleAsset id="C03" label="large-tent" placement={data.tents[1]} materialMap={canvasGlowCopy} />
    </AssetGuard>
    <AssetGuard id="C04" fallback={<Boxes items={[layout.tents[0], layout.tents[2]]} />}>
      <InstancedAsset id="C04" placements={[data.tents[0], data.tents[2]]} materialMap={canvasGlowCopy} />
    </AssetGuard>
    <AssetGuard id="C05" fallback={<Boxes items={[{ position: [firePosition[0], 4.95, firePosition[2]], size: [3.2, 0.3, 3.2], color: '#8C8276' }]} />}>
      <SingleAsset id="C05" label="fire-pit" placement={{ position: firePosition, yaw: 0 }} />
    </AssetGuard>
    <CampFire position={[firePosition[0], CAMP_TOP + 0.06, firePosition[2]]} />
    <AssetGuard id="C06" fallback={<Boxes items={layout.benches} />}>
      <InstancedAsset id="C06" placements={data.benches} />
    </AssetGuard>
    <AssetGuard id="C07" fallback={<Boxes items={padObject(0)} />}>
      <SingleAsset id="C07" label="pad1" placement={data.onPad(0)}>
        {/* Inside C07's top rectangle x[-0.618,0.122] z[-0.97,0.97], away from the stool side. */}
        <AssetGuard id="C08" fallback={null}>
          <SingleAsset id="C08" label="pad1" placement={{ position: [-0.34, 0.85, 0.5], yaw: 0.16 }} />
        </AssetGuard>
      </SingleAsset>
    </AssetGuard>
    <AssetGuard id="C09" fallback={<Boxes items={padObject(1)} />}>
      <SingleAsset id="C09" label="pad2" placement={data.onPad(1)} />
    </AssetGuard>
    <AssetGuard id="C10" fallback={<Boxes items={padObject(2)} />}>
      {/* West pad, centred: yaw 2.6 turns the cloth plane (local X normal) to the default follow camera. */}
      <FlagPole label="pad3" placement={{ ...data.onPad(2), yaw: 2.6 }} />
    </AssetGuard>
    {treeGroups.map(({ id, placements }) => <AssetGuard key={id} id={id} fallback={<Boxes items={fallbackTree(id)} />}>
      <InstancedAsset id={id} placements={placements} />
    </AssetGuard>)}
    {nature.map(({ id, placements }) => <AssetGuard key={id} id={id} fallback={null}>
      <InstancedAsset id={id} placements={placements} />
    </AssetGuard>)}
  </group>;
}

/** G19-G23: visual-only clusters on the outer meadow (r 20-22.5), clear of the
 * pads, tents, east exit/road, lamp posts and parking bay. No colliders. */
function createNature() {
  const [cx, , cz] = CAMP_CENTER;
  const groups: { deg: number; r: number; items: [string, number, number, number, number?][] }[] = [
    { deg: 150, r: 21, items: [['G21', 0, 0, 0.4], ['G22', 1.6, 1.3, 1.2], ['G23', -0.9, 1.7, 2.0], ['G19', 1.9, -1.3, 0.3]] },
    { deg: 175, r: 21.8, items: [['G21', 0, 0, 2.6, 0.9], ['G23', 1.4, -1.5, 0.8]] },
    { deg: 197, r: 21.5, items: [['G20', 0, 0, 0.3], ['G19', 0.9, 2.0, 1.1, 0.85]] },
    { deg: 228, r: 21, items: [['G20', 0, 0, 2.2], ['G23', 1.3, 0.9, 0.5]] },
    { deg: 318, r: 21.5, items: [['G22', 0, 0, 0.9], ['G23', -1.0, -1.3, 2.4], ['G20', 1.6, 1.4, 1.0, 0.9]] },
    { deg: 112, r: 20.5, items: [['G22', 0, 0, 2.8], ['G23', 1.1, 0.8, 1.3], ['G20', -1.6, -0.4, 1.4]] },
    { deg: 78, r: 21, items: [['G19', 0, 0, 0.2], ['G23', 1.2, -0.3, 1.9], ['G19', -1.4, 0.5, 2.5, 0.8]] },
    { deg: 52, r: 21.5, items: [['G19', 0, 0, 1.7, 0.9], ['G22', 1.3, 0.7, 0.6, 0.8]] },
  ];
  const byId = new Map<string, Placement[]>();
  for (const g of groups) {
    const a = g.deg * Math.PI / 180, gx = cx + Math.cos(a) * g.r, gz = cz + Math.sin(a) * g.r;
    for (const [id, dx, dz, yaw, scale] of g.items) {
      const list = byId.get(id) ?? [];
      // Fable P2: medium rocks lean on their side, small rocks sit half-buried.
      const tilt = id === 'G22' ? 1.2 + (list.length % 2) * 0.25 : undefined;
      const sink = id === 'G22' ? 0.08 : id === 'G23' ? 0.16 * (scale ?? 1) : undefined;
      list.push({ position: [gx + dx, CAMP_TOP, gz + dz], yaw, scale: scale ?? 1, tilt, sink });
      byId.set(id, list);
    }
  }
  return ['G19', 'G20', 'G21', 'G22', 'G23'].map(id => ({ id, placements: byId.get(id) ?? [] }));
}
