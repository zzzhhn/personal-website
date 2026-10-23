import { memo, Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import {
  AdditiveBlending, Box3, BoxGeometry, BufferGeometry, Color, DoubleSide, Euler, Float32BufferAttribute, InstancedMesh, Matrix4, Mesh,
  MeshStandardMaterial, Object3D, Quaternion, ShaderMaterial, Sphere, UniformsLib, UniformsUtils, Vector3, type Material, type PointLight,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js';
import { CampColliders, BlockColliders, SoftBushDrag, campShapes } from './WorldCampPhysics';
import { rockPlacements } from './WorldLandform';
import { attachNatureWind } from './WorldNatureMotion';
import { applyTentWind, markTentCloth, windUniforms, isWorldRunning } from './WorldWind';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CAMP_CENTER } from './layout';
import { isClaimed } from './WorldVisualClaims';
import { useWorldStore } from './store';
import type { Vec3 } from './types';

/** Camp visuals and fitted physics share the same GLB and placement matrices. */
export type CampBlock = { position: Vec3; size: Vec3; color: string; rotation?: Vec3 };
export interface CampLayout { pads: CampBlock[]; padObjects: CampBlock[]; tents: CampBlock[]; benches: CampBlock[]; trees: CampBlock[]; lampHeads: CampBlock[] }
/** tilt rotates about the asset's local X before yaw (re-grounded by bounds); sink buries it. */
type Placement = { position: Vec3; yaw: number; scale?: number; tilt?: number; sink?: number };

const CAMP_TOP = CAMP_CENTER[1];
const PAD_TOP = 4.9;
/** Ring index (layout order, angle = i*45deg, +Z south) for pad1..pad8. Fable r3 swap: desk
 * west-south-west (pad1, index 3), trophy shelf north-west (pad2, index 5), flags west (pad3,
 * index 4, the only pad whose full flag set fits the default follow frame). The remaining
 * five pads carry the C11-C15 stand-ins. Each visible object owns its fitted collision shape. */
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

function Boxes({ items, geometry = BOX, shadow = true, name, collisionId }: { items: CampBlock[]; geometry?: BufferGeometry; shadow?: boolean; name?: string; collisionId?: string }) {
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
  return <>{collisionId && <BlockColliders id={collisionId} blocks={items} />}<instancedMesh name={name} ref={ref} args={[geometry, undefined, items.length]} castShadow={shadow} receiveShadow>
    <meshStandardMaterial roughness={1} />
  </instancedMesh></>;
}

type Part = { geometry: BufferGeometry; material: Material | Material[]; matrix: Matrix4; name: string; depth?: Material; ownedGeometry?: boolean };
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
function collectParts(gltf: GLTF, id: string, map?: MaterialMap) {
  gltf.scene.updateMatrixWorld(true);
  const parts: Part[] = [], materials = mapper(map);
  gltf.scene.traverse(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    let geometry = mesh.geometry;
    let material = materials.apply(mesh.material);
    let depth: Material | undefined;
    let ownedGeometry = false;
    // Additional vertices serve cloth bending; no smoothing of hard props or budget padding.
    if ((id === 'C03' || id === 'C04') && !Array.isArray(material) && material.name === 'camp_canvas_orange') {
      const data = gltf.scene.getObjectByName(id)?.userData;
      const params = typeof data?.tentParams === 'string' ? JSON.parse(data.tentParams) : data?.tentParams;
      if (params) {
        geometry = new TessellateModifier(.42, 8).modify(mesh.geometry);
        markTentCloth(geometry, params);
        geometry.computeBoundingBox(); geometry.boundingBox?.expandByScalar(.04);
        geometry.computeBoundingSphere(); if (geometry.boundingSphere) geometry.boundingSphere.radius += .04;
        ownedGeometry = true;
        depth = applyTentWind(material as MeshStandardMaterial, id, params);
      }
    }
    parts.push({ geometry, material, matrix: mesh.matrixWorld.clone(), name: mesh.name, depth, ownedGeometry });
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

function InstancedPart({ part, matrices, id }: { part: Part; matrices: Matrix4[]; id: string }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const detach = attachNatureWind(mesh, id === 'G19' || id === 'G20');
    const m = new Matrix4();
    matrices.forEach((placement, i) => mesh.setMatrixAt(i, m.multiplyMatrices(placement, part.matrix)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    return detach;
  }, [part, matrices]);
  const soft = id === 'G19' || id === 'G20';
  return <instancedMesh name={`camp-mesh-${id}-${part.name}`} userData={soft ? { assetId: id, softBush: true, semantic: part.name } : { assetId: id, solid: true, semantic: part.name }} ref={ref} args={[part.geometry, part.material, matrices.length]} customDepthMaterial={part.depth} castShadow receiveShadow />;
}

/** Repeated static assets: one instanced draw per GLB primitive, shared materials. */
function InstancedAsset({ id, placements, materialMap, label = "instances" }: { id: string; placements: Placement[]; materialMap?: MaterialMap; label?: string }) {
  const gltf = useCampGltf(id);
  const { parts, copies } = useMemo(() => collectParts(gltf, id, materialMap), [gltf, id, materialMap]);
  useRegisteredCopies(copies);
  const matrices = useMemo(() => {
    const bounds = new Box3();
    parts.forEach(part => { part.geometry.computeBoundingBox(); bounds.union(part.geometry.boundingBox!.clone().applyMatrix4(part.matrix)); });
    return placements.map(p => toMatrix(p, bounds));
  }, [parts, placements]);
  const shapes = useMemo(() => campShapes(id, gltf), [id, gltf]);
  useEffect(() => () => parts.forEach(p => { if (p.ownedGeometry) p.geometry.dispose(); p.depth?.dispose(); }), [parts]);
  if (!shapes) throw new Error(`Missing fitted collision recipe for ${id}`);
  return <group name={`camp-asset-${id}-${label}`}>
    {parts.map((part, i) => <InstancedPart key={i} part={part} matrices={matrices} id={id} />)}
    <CampColliders id={id} label={label} shapes={shapes} matrices={matrices} />
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

function SingleAsset({ id, label, placement, materialMap }: { id: string; label: string; placement: Placement; materialMap?: MaterialMap }) {
  const placements = useMemo(() => [placement], [placement]);
  return <InstancedAsset id={id} label={label} placements={placements} materialMap={materialMap} />;
}
const isRunning = isWorldRunning;

/** C10: pole fixed; flag_01..04 sway about their own hoist pivots (local +Y). */
function FlagPole({ label, placement }: { label: string; placement: Placement }) {
  const scene = useCampScene('C10');
  const gltf = useCampGltf('C10');
  const shapes = useMemo(() => campShapes('C10', gltf), [gltf]);
  const matrices = useMemo(() => [toMatrix(placement, new Box3().setFromObject(scene))], [placement, scene]);
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
  useFrame((_, delta) => {
    if (!isRunning()) return;
    const t = windUniforms.uWindTime.value;
    flags.forEach(({ object, base }, i) => { object.rotation.y = base + (Math.sin(t * 1.8 + i * 0.9) * 0.1 + Math.sin(t * 3.1 + i) * 0.03) * windUniforms.uWindStrength.value; });
  });
  return <group name={`camp-asset-C10-${label}`}>
    <group position={placement.position} rotation={[0, placement.yaw, 0]} userData={{ assetId: 'C10', solid: true }}><primitive object={scene} /></group>
    {shapes && <CampColliders id="C10" label={label} shapes={shapes} matrices={matrices} />}
  </group>;
}

/** nature-v4 camp fire (quality-v3 spec 11.2). Old: 5 faceted cones = 60 triangles, opaque.
 * New: 5 layered tongues (outer ring + inner core, 2 bands + tip fan, 5 sides = 25 tris each,
 * 125 total) in ONE opaque draw whose shader scrolls a flame field upward: it bends the tongues,
 * quantises the colour in low-poly bands and cuts ragged, rising tips by discard, so the fire
 * reads as many licking tongues without transparent overdraw. Plus 28 additive ember points (one
 * transparent draw, ~4-9 px each). All motion uses the shared wind clock, so Esc / evidence shots
 * freeze it and reduced motion stills it. Not shadow casting, as before. */
const TONGUES = [
  { p: [0.02, -0.01], r: 0.3, h: 1.55, lean: [0.04, -0.03], seed: 0.1, core: 0 },
  { p: [0.3, 0.12], r: 0.17, h: 1.0, lean: [0.14, 0.06], seed: 1.7, core: 0 },
  { p: [-0.28, 0.16], r: 0.16, h: 0.9, lean: [-0.13, 0.08], seed: 3.1, core: 0 },
  { p: [0.03, -0.31], r: 0.17, h: 1.08, lean: [0.0, -0.14], seed: 4.4, core: 0 },
  { p: [0.0, 0.03], r: 0.13, h: 1.15, lean: [0.0, 0.0], seed: 2.3, core: 1 },
] as const;
export const FIRE_STATS = { baselineTriangles: 60, tongues: TONGUES.length, sides: 5, triangles: 0, embers: 28, drawCalls: 2, transparentDraws: 1 };
function fireGeometry() {
  const pos: number[] = [], t: number[] = [], seed: number[] = [], core: number[] = [];
  const S = 5, rings = [[0, 1], [0.4, 0.78], [0.72, 0.42]] as const;
  for (const g of TONGUES) {
    const ring = (k: number) => Array.from({ length: S }, (_, i) => {
      const [ty, rs] = rings[k], a = (i / S) * Math.PI * 2 + g.seed + k * .45;
      return [g.p[0] + g.lean[0] * ty + Math.cos(a) * g.r * rs, ty * g.h, g.p[1] + g.lean[1] * ty + Math.sin(a) * g.r * rs, ty];
    });
    const R = [ring(0), ring(1), ring(2)], tip = [g.p[0] + g.lean[0] * 1.25, g.h, g.p[1] + g.lean[1] * 1.25, 1];
    const tri = (...v: number[][]) => v.forEach(q => { pos.push(q[0], q[1], q[2]); t.push(q[3]); seed.push(g.seed); core.push(g.core); });
    for (let k = 0; k < 2; k++) for (let i = 0; i < S; i++) {
      const a = R[k][i], b = R[k][(i + 1) % S], c = R[k + 1][(i + 1) % S], d = R[k + 1][i];
      tri(a, b, c); tri(a, c, d);
    }
    for (let i = 0; i < S; i++) tri(R[2][i], R[2][(i + 1) % S], tip);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.setAttribute('aT', new Float32BufferAttribute(t, 1));
  geometry.setAttribute('aSeed', new Float32BufferAttribute(seed, 1));
  geometry.setAttribute('aCore', new Float32BufferAttribute(core, 1));
  geometry.computeBoundingSphere(); if (geometry.boundingSphere) geometry.boundingSphere.radius += .3;
  FIRE_STATS.triangles = pos.length / 9;
  return geometry;
}
const FIRE_VERT = /* glsl */`
attribute float aT; attribute float aSeed; attribute float aCore;
uniform float uWindTime; uniform float uWindStrength;
varying float vT; varying float vSeed; varying float vCore; varying vec3 vLocal;
#include <fog_pars_vertex>
void main() {
  float t = uWindTime, m = uWindStrength;
  vec3 p = position;
  // Licks travel up the tongue: phase rises with height, amplitude grows toward the tip.
  float w = aT * aT;
  p.x += m * w * (0.07 * sin(t * 6.3 - aT * 5.0 + aSeed * 2.1) + 0.03 * sin(t * 11.0 + aSeed));
  p.z += m * w * (0.07 * cos(t * 5.7 - aT * 4.6 + aSeed * 1.3) + 0.03 * cos(t * 9.4 + aSeed * 2.0));
  p.y *= 1.0 + m * aT * (0.12 * sin(t * 7.0 + aSeed * 3.0) + 0.05 * sin(t * 13.1 + aSeed));
  vT = aT; vSeed = aSeed; vCore = aCore; vLocal = p;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FIRE_FRAG = /* glsl */`
uniform float uWindTime; uniform float uWindStrength; uniform float uGlow;
varying float vT; varying float vSeed; varying float vCore; varying vec3 vLocal;
#include <fog_pars_fragment>
void main() {
  float t = uWindTime * mix(0.25, 1.0, uWindStrength);
  // Upward-scrolling flame field (two octaves) -> ragged tips that detach and rise.
  float n = 0.5 * sin(vLocal.y * 9.0 - t * 8.0 + vSeed * 3.0 + vLocal.x * 7.0)
          + 0.5 * sin(vLocal.y * 15.0 - t * 12.5 + vLocal.z * 11.0 + vSeed);
  float edge = 0.8 + 0.16 * n - 0.06 * vCore;
  if (vT > 0.5 && vT > edge) discard;
  // Low-poly colour bands: ember base -> camp orange -> warm gold -> pale core tip.
  float band = floor(clamp(vT + 0.12 * n, 0.0, 0.999) * 4.0) / 3.0;
  // Display-referred camp orange family (#E8803A / #FF8A3A / #FFC978 neighbours); toneMapped off.
  vec3 c0 = vec3(0.80, 0.24, 0.06), c1 = vec3(0.95, 0.43, 0.12), c2 = vec3(1.0, 0.64, 0.24), c3 = vec3(1.0, 0.84, 0.50);
  vec3 col = band < 0.34 ? mix(c0, c1, band * 3.0) : band < 0.67 ? mix(c1, c2, band * 3.0 - 1.0) : mix(c2, c3, band * 3.0 - 2.0);
  col = mix(col, c3, vCore * 0.35 * vT);
  gl_FragColor = vec4(min(col * uGlow, vec3(1.0)), 1.0);
  #include <fog_fragment>
}`;
const EMBER_VERT = /* glsl */`
attribute float aSeed;
uniform float uWindTime; uniform float uWindStrength; uniform float uPixel;
varying float vLife;
void main() {
  float life = fract(uWindTime * (0.38 + 0.2 * fract(aSeed * 7.3)) + aSeed);
  float a = aSeed * 40.0 + life * 3.5;
  float r = 0.12 + life * (0.25 + 0.2 * fract(aSeed * 3.1));
  vec3 p = vec3(cos(a) * r, 0.25 + life * (1.9 + 0.9 * fract(aSeed * 5.7)), sin(a) * r);
  vLife = uWindStrength < 0.02 ? 1.0 : life;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPixel * (1.0 - life * 0.6) * (0.06 / max(0.5, -mv.z)) * 140.0;
}`;
const EMBER_FRAG = /* glsl */`
varying float vLife;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  if (dot(d, d) > 0.25 || vLife > 0.97) discard;
  vec3 col = mix(vec3(1.0, 0.8, 0.45), vec3(0.95, 0.38, 0.1), vLife);
  gl_FragColor = vec4(col, (1.0 - vLife) * 0.9);
}`;
function CampFire({ position }: { position: Vec3 }) {
  const gl = useThree(s => s.gl);
  const { flame, embers, flameMat, emberMat } = useMemo(() => {
    const flame = fireGeometry();
    const embers = new BufferGeometry();
    embers.setAttribute('position', new Float32BufferAttribute(new Float32Array(FIRE_STATS.embers * 3), 3));
    embers.setAttribute('aSeed', new Float32BufferAttribute(Array.from({ length: FIRE_STATS.embers }, (_, i) => (i * 0.618034) % 1), 1));
    embers.boundingSphere = new Sphere(new Vector3(0, 1.4, 0), 2);
    // Colours are authored display-referred: no tone mapping / colour-space conversion, so the
    // ACES curve cannot wash the bands to white.
    const flameMat = new ShaderMaterial({ vertexShader: FIRE_VERT, fragmentShader: FIRE_FRAG, fog: true, side: DoubleSide, toneMapped: false,
      uniforms: UniformsUtils.merge([UniformsLib.fog, { uGlow: { value: 1 } }]) });
    flameMat.uniforms.uWindTime = windUniforms.uWindTime; flameMat.uniforms.uWindStrength = windUniforms.uWindStrength;
    const emberMat = new ShaderMaterial({ vertexShader: EMBER_VERT, fragmentShader: EMBER_FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false,
      uniforms: { uPixel: { value: 1 } } });
    emberMat.uniforms.uWindTime = windUniforms.uWindTime; emberMat.uniforms.uWindStrength = windUniforms.uWindStrength;
    return { flame, embers, flameMat, emberMat };
  }, []);
  useEffect(() => () => { flame.dispose(); embers.dispose(); flameMat.dispose(); emberMat.dispose(); }, [flame, embers, flameMat, emberMat]);
  useFrame((_, delta) => {
    const night = useWorldStore.getState().light === 'night';
    const glow = flameMat.uniforms.uGlow;
    glow.value += ((night ? 1.08 : 0.96) - glow.value) * Math.min(1, delta * 2);
    emberMat.uniforms.uPixel.value = gl.getPixelRatio() * gl.domElement.height / 1080;
  });
  return <group name="camp-runtime-flame" position={position} userData={{ fireStats: FIRE_STATS }}>
    <mesh name="camp-fire-tongues" geometry={flame} material={flameMat} />
    <points name="camp-fire-embers" geometry={embers} material={emberMat} frustumCulled={false} renderOrder={2} />
  </group>;
}

/** Deterministic hash in [-1, 1] for low-poly edge variation (not per-face shading). */
const hash = (k: number, seed: number) => { const s = Math.sin(k * 12.9898 + seed * 78.233) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };

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
  const level = useRef(0);
  useFrame((_, delta) => {
    const light = ref.current;
    if (!light) return;
    level.current += ((useWorldStore.getState().light === 'night' ? 1 : 0) - level.current) * Math.min(1, delta * 1.5);
    // decay 1 over 24 m; Fable r2 cut 30% from 11 so the pit, benches and pads read as three
    // brightness steps. The inverse-square fire light in WorldEnvironment stays the hot core.
    light.intensity = level.current * 7.7 * (1 + Math.sin(windUniforms.uWindTime.value * 5.3) * 0.05 * windUniforms.uWindStrength.value);
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
    const glow = copies.filter((m): m is MeshStandardMaterial => (m as MeshStandardMaterial).isMeshStandardMaterial && m.name === 'camp_canvas_orange');
    glow.forEach(m => nightGlow.add(m));
    return () => { glow.forEach(m => nightGlow.delete(m)); copies.forEach(m => m.dispose()); };
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

const rotateY = (x: number, z: number, yaw: number): [number, number] => [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];

/** QA-only (?qa=1) close evidence camera for nature/fire before-after stills. It uses a
 * dedicated shot id, so the normal follow camera, physics and motion clocks freeze exactly as
 * in the existing evidence shots; the follow camera forces fov 50 in shot mode. */
const QA_CLOSE_SHOT = 'camp-qa-close';
function CampQACamera() {
  const camera = useThree(s => s.camera);
  const view = useRef<{ p: Vec3; t: Vec3 } | null>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('qa') !== '1') return;
    const api = {
      close: (p: Vec3, t: Vec3) => { view.current = { p, t }; useWorldStore.setState({ shot: QA_CLOSE_SHOT }); },
      release: () => { view.current = null; useWorldStore.setState({ shot: null }); },
    };
    Object.assign(window, { __worldCampQA: api });
    return () => { delete (window as unknown as Record<string, unknown>).__worldCampQA; };
  }, []);
  useFrame(() => {
    const v = view.current;
    if (!v || useWorldStore.getState().shot !== QA_CLOSE_SHOT) return;
    camera.position.set(...v.p); camera.up.set(0, 1, 0); camera.lookAt(...v.t);
  });
  return null;
}

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

export default memo(function WorldCamp({ layout }: { layout: CampLayout }) {
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
    const placeholders = PAD_ORDER.slice(3).map(index => {
      const b = layout.padObjects[index];
      // The north pad lies in front of C03's real door. Keep this unfinished bundle
      // on its side of the pad, with the same visual/collider dimensions and a clear aisle.
      return index === 6 ? { ...b, position: [b.position[0] + .85, b.position[1], b.position[2]] as Vec3,
        size: [.7, b.size[1], b.size[2]] as Vec3 } : b;
    });
    const desk = onPad(0), offset = rotateY(-.34, .5, desk.yaw);
    const bookStack: Placement = { position: [desk.position[0] + offset[0], PAD_TOP + .85, desk.position[2] + offset[1]], yaw: desk.yaw + .16 };
    return { onPad, tents, benches, trees, placeholders, bookStack, tiles: padTiles(layout.pads) };
  }, [layout]);
  const nature = useMemo(createNature, []);
  const treeGroups = useMemo(() => ['G16', 'G17', 'G18'].map(id => ({ id, placements: data.trees.filter(t => t.id === id).map(t => t.placement) })), [data]);
  const fallbackTree = (id: string) => data.trees.flatMap((t, i) => t.id !== id ? [] : [layout.trees[i], { ...layout.trees[i], position: [layout.trees[i].position[0], CAMP_TOP + 3.6, layout.trees[i].position[2]] as Vec3, size: [3.8, 3.6, 3.8] as Vec3, color: '#6F8A3A' }]);
  const padObject = (n: number) => [layout.padObjects[PAD_ORDER[n]]];
  const firePosition: Vec3 = [CAMP_CENTER[0], CAMP_TOP, CAMP_CENTER[2]];

  return <group name="world-camp-slice">
    {/* Plateau ground, flanks and rock terraces are the island terrain (WorldTerrain). */}
    <CampQACamera />
    <SoftBushDrag />
    <CampNightFill />
    <CampFireSpill />
    <CampNightMaterials />
    {!isClaimed('camp-lamps') && <CampLamps heads={layout.lampHeads} />}
    <Boxes name="camp-C02-flagstones" items={data.tiles} shadow={false} />
    {/* Pads 4-8 keep their old collider: low canvas bundles mark C11-C15 as not yet made. */}
    {!isClaimed('camp-placeholder') && <group name={`camp-placeholder-${PLACEHOLDER_IDS.join('-')}`}>
      <BlockColliders id="C11-C15" blocks={data.placeholders} />
      <Boxes items={data.placeholders.map(b => ({ ...b, color: '#CDB894', rotation: [0, b.rotation?.[1] ?? 0, 0] }))} geometry={BUNDLE} />
      <Boxes items={data.placeholders.flatMap(b => [-0.25, 0.25].map(o => ({ position: [b.position[0] + o, b.position[1], b.position[2]] as Vec3, size: [0.09, b.size[1] + 0.02, b.size[2] + 0.02] as Vec3, color: '#6E5A44' })))} />
    </group>}
    <AssetGuard id="C03" fallback={<Boxes collisionId="C03" items={[layout.tents[1]]} />}>
      <SingleAsset id="C03" label="large-tent" placement={data.tents[1]} materialMap={canvasGlowCopy} />
    </AssetGuard>
    <AssetGuard id="C04" fallback={<Boxes collisionId="C04" items={[layout.tents[0], layout.tents[2]]} />}>
      <InstancedAsset id="C04" placements={[data.tents[0], data.tents[2]]} materialMap={canvasGlowCopy} />
    </AssetGuard>
    <AssetGuard id="C05" fallback={<Boxes collisionId="C05" items={[{ position: [firePosition[0], 4.95, firePosition[2]], size: [3.2, 0.3, 3.2], color: '#8C8276' }]} />}>
      <SingleAsset id="C05" label="fire-pit" placement={{ position: firePosition, yaw: 0 }} />
    </AssetGuard>
    <CampFire position={[firePosition[0], CAMP_TOP + 0.06, firePosition[2]]} />
    <AssetGuard id="C06" fallback={<Boxes collisionId="C06" items={layout.benches} />}>
      <InstancedAsset id="C06" placements={data.benches} />
    </AssetGuard>
    <AssetGuard id="C07" fallback={<Boxes collisionId="C07" items={padObject(0)} />}>
      <SingleAsset id="C07" label="pad1" placement={data.onPad(0)} />
    </AssetGuard>
    <AssetGuard id="C08" fallback={null}>
      <SingleAsset id="C08" label="pad1" placement={data.bookStack} />
    </AssetGuard>
    <AssetGuard id="C09" fallback={<Boxes collisionId="C09" items={padObject(1)} />}>
      <SingleAsset id="C09" label="pad2" placement={data.onPad(1)} />
    </AssetGuard>
    <AssetGuard id="C10" fallback={<Boxes collisionId="C10" items={padObject(2)} />}>
      {/* West pad, centred: yaw 2.6 turns the cloth plane (local X normal) to the default follow camera. */}
      <FlagPole label="pad3" placement={{ ...data.onPad(2), yaw: 2.6 }} />
    </AssetGuard>
    {treeGroups.map(({ id, placements }) => <AssetGuard key={id} id={id} fallback={<Boxes collisionId={id} items={fallbackTree(id)} />}>
      <InstancedAsset id={id} placements={placements} />
    </AssetGuard>)}
    {nature.map(({ id, placements }) => <AssetGuard key={id} id={id} fallback={null}>
      <InstancedAsset id={id} placements={placements} />
    </AssetGuard>)}
  </group>;
});

/** G19-G23: fitted solid clusters on the outer meadow (r 20-22.5), clear of the
 * pads, tents, east exit/road, lamp posts and parking bay. Placement matrices also drive collision. */
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
  // quality-v3: scaled G21-G23 groups dress the steep plateau terraces and seawall ends;
  // each is seated on the terrain (WorldLandform) and keeps its fitted collider.
  for (const r of rockPlacements()) {
    const list = byId.get(r.id) ?? [];
    list.push({ position: r.position, yaw: r.yaw, scale: r.scale, tilt: r.tilt, sink: r.sink });
    byId.set(r.id, list);
  }
  return ['G19', 'G20', 'G21', 'G22', 'G23'].map(id => ({ id, placements: byId.get(id) ?? [] }));
}
