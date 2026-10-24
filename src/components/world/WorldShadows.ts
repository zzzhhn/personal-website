import { Box3, BufferAttribute, BufferGeometry, DynamicDrawUsage, Frustum, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Object3D, OrthographicCamera, ShaderChunk, Sphere, Vector3, Vector4, type Camera, type DirectionalLight, type Material, type PerspectiveCamera, type WebGLRenderer } from 'three';
import { SunLight } from 'three/examples/jsm/lights/SunLight.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import type { SunLightShadow } from 'three/examples/jsm/lights/SunLightShadow.js';
import { SHADOW_BUDGET, budgetZoneOf, type ShadowTier } from './WorldQuality';
import { setQaRenderer, worldLightsFrame } from './WorldLights';

/**
 * Sun shadow (shadows v4.1, spec v3 §14.2): three FIXED-SIZE cascades plus per-pass caster culling.
 *
 * The sun direction is fixed per light tier (dusk key light from the west-south-west, ~19.8 deg
 * elevation, §11.1); free camera yaw/pitch is what turns shadows on screen. Moving bodies update
 * their shadow every frame (casters are re-rendered each frame; nothing is baked).
 *
 * Windows. Each cascade is a fixed light-space rectangle (half extents never change at runtime, so
 * orbit/zoom never re-select a texel size); only its centre moves, texel-snapped, so static shadows
 * are never re-sampled (no crawl). The centres follow the body, shifted toward the camera's ground
 * look direction:
 *   c0 near    [9, 6.5] m   shift 4 m        (high: 0.72 cm across / 1.53 cm along the sun on ground)
 *   c1 default [18.5, 12.5] shift 12 m       (high: 1.48 / 2.95 cm; covers the whole default 10 m view)
 *   c2 far     [48, 26]     centred on the visible ground span (high: 3.8 / 6.1 cm; fades out at its edge)
 * The atlas is 3 x 2508^2 (high) / 3 x 1254^2 (balanced): the same texel total as v4's 2 x 3072^2 /
 * 2 x 1536^2 (§14.3 budget). Selection is by window, not view depth: a fragment uses the finest
 * cascade whose window contains it, blended over the outer 12 % of each window (shader below).
 *
 * Per-pass casters. An orthographic sun maps a caster and every receiver it shadows to the same
 * light-space (r, u), so a cascade only needs casters whose footprint overlaps its window and is
 * not entirely inside a finer cascade's fully-weighted interior. Instanced casters (the whole camp
 * is instanced; one bounding sphere spans the island, so three never culls them) are drawn through
 * per-cascade proxy InstancedMeshes holding only the selected instances. c2 also skips instances
 * smaller than 0.6 m (their far shadows fade in through the c1 band). Culling only changes which
 * casters each shadow pass draws; the main pass and every shadow that can be sampled are unchanged.
 * The campfire's point-light faces use the same machinery with a fixed whitelist (WorldLights).
 *
 * Integration: WorldEnvironment keeps driving its DirectionalLight (colour, intensity, night fade)
 * and calls fitSunShadow every frame. The DirectionalLight becomes the controller: it is hidden and
 * a SunLight companion with the same colour/intensity/direction does the lighting and shadowing.
 */

// ------------------------------------------------------------------------------------------- shader
// Window-based selection over three cascades + receiver-plane depth bias (WORLD_SUN_WINDOW). Each
// cascade vector is (atlas x0, atlas x1, atlas y inset, normal offset m). Each PCF tap compares against
// the receiver's own depth plane extrapolated to the tap (gradient from screen derivatives), so flat or
// sloped receivers do not self-shadow however wide the filter, and only a half-texel slope bias plus a
// 2 mm constant remain: the lit gap at a contact point stays near zero (the old constant bias opened
// ~3.6 cm at this 19.8 deg sun). Derivatives are taken in uniform control flow.
{
  const store = ShaderChunk as unknown as Record<string, string>;
  store.__worldShadowParsOriginal ??= ShaderChunk.shadowmap_pars_fragment;
  // Match code tokens only: the published build strips comments and blank lines from shader chunks.
  const chunk = store.__worldShadowParsOriginal.replace(/#define SUN_LIGHT_CASCADES 2\b/, '#define SUN_LIGHT_CASCADES 3');
  const fnAt = chunk.indexOf('float getSunShadow(');
  const offsetAt = chunk.indexOf('int cascadeOffset = shadowIndex * SUN_LIGHT_CASCADES;', fnAt);
  const start = chunk.indexOf('float shadow = 1.0;', offsetAt);
  const end = chunk.indexOf('return shadow;', start);
  if (fnAt > 0 && offsetAt > fnAt && start > offsetAt && end > start && chunk.includes('#define SUN_LIGHT_CASCADES 3')) {
    const pcf = `
#if defined( SHADOWMAP_TYPE_PCF )
\t\tfloat worldSunPcf( sampler2DShadow map, vec2 size, float intensity, float bias, float radius, vec4 c, vec2 g ) {
\t\t\tc.xyz /= c.w;
\t\t\tvec2 texel = vec2( 1.0 ) / size;
\t\t\tg = clamp( g, vec2( -8.0 ), vec2( 8.0 ) );
\t\t\tc.z += bias - 0.5 * ( abs( g.x ) * texel.x + abs( g.y ) * texel.y );
\t\t\tif ( c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0 ) return 1.0;
\t\t\tfloat phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
\t\t\tfloat s = 0.0;
\t\t\tfor ( int k = 0; k < 5; k ++ ) { vec2 o = vogelDiskSample( k, 5, phi ) * radius * texel; s += texture( map, vec3( c.xy + o, c.z + dot( g, o ) ) ); }
\t\t\treturn mix( 1.0, s * 0.2, intensity );
\t\t}
\t\t#endif
`;
    const body = `float shadow = 1.0; // WORLD_SUN_WINDOW
      vec4 cs[ 3 ]; vec4 ps[ 3 ]; vec2 gs[ 3 ]; float es[ 3 ];
      for ( int i = 0; i < 3; i ++ ) {
        vec4 c = sunShadowCascade[ cascadeOffset + i ];
        vec4 p = sunShadowMatrix[ cascadeOffset + i ] * vec4( vSunShadowWorldPosition.xyz + vSunShadowWorldNormal * c.w, 1.0 );
        vec3 dx = dFdx( p.xyz ), dy = dFdy( p.xyz ); float det = dx.x * dy.y - dx.y * dy.x;
        vec2 g = abs( det ) > 1e-14 ? vec2( dy.y * dx.z - dx.y * dy.z, dx.x * dy.z - dy.x * dx.z ) / det : vec2( 0.0 );
        vec2 l = vec2( ( p.x - c.x ) / ( c.y - c.x ), ( p.y - c.z ) / ( 1.0 - 2.0 * c.z ) );
        cs[ i ] = c; ps[ i ] = p; gs[ i ] = g; es[ i ] = min( min( l.x, 1.0 - l.x ), min( l.y, 1.0 - l.y ) );
      }
      float w0 = smoothstep( 0.0, 0.06, es[ 0 ] ), w1 = smoothstep( 0.0, 0.06, es[ 1 ] ), f2 = smoothstep( 0.0, 0.08, es[ 2 ] );
      #if defined( SHADOWMAP_TYPE_PCF )
        #define WORLD_SUN_TAP( i ) worldSunPcf( shadowMap, sunLightShadow.shadowMapSize, sunLightShadow.shadowIntensity, sunLightShadow.shadowBias, sunLightShadow.shadowRadius, ps[ i ], gs[ i ] )
      #else
        #define WORLD_SUN_TAP( i ) getShadow( shadowMap, sunLightShadow.shadowMapSize, sunLightShadow.shadowIntensity, sunLightShadow.shadowBias, sunLightShadow.shadowRadius, ps[ i ] )
      #endif
      float s2 = ( w0 < 1.0 && w1 < 1.0 && f2 > 0.0 ) ? mix( 1.0, WORLD_SUN_TAP( 2 ), f2 ) : 1.0;
      float s1 = ( w0 < 1.0 && w1 > 0.0 ) ? WORLD_SUN_TAP( 1 ) : 1.0;
      float s0 = w0 > 0.0 ? WORLD_SUN_TAP( 0 ) : 1.0;
      #undef WORLD_SUN_TAP
      shadow = mix( mix( s2, s1, w1 ), s0, w0 );
      `;
    ShaderChunk.shadowmap_pars_fragment = chunk.slice(0, fnAt) + pcf + chunk.slice(fnAt, start) + body + chunk.slice(end);
  } else console.warn('[world-shadows] sun shadow chunk layout changed; window selection not installed');
}

// -------------------------------------------------------------------------------------- constants
export const SUN_OFFSET = new Vector3(-90, 40, 65);
const LIGHT_Z = SUN_OFFSET.clone().normalize();
// Same basis as Object3D.lookAt for a camera at target + SUN_OFFSET with world-up +Y.
const LIGHT_RIGHT = new Vector3(0, 1, 0).cross(LIGHT_Z).normalize();
const LIGHT_UP = new Vector3().crossVectors(LIGHT_Z, LIGHT_RIGHT).normalize();
const SIN_ELEVATION = LIGHT_Z.y;
const LIGHT_NEAR = 1;
const CASCADES = 3;
/** Fixed cascade windows: light-space half extents (m) and ground shift toward the look direction (m). */
export const CASCADE_WINDOWS: readonly { half: readonly [number, number]; shift: readonly [number, number] }[] = [
  { half: [9, 6.5], shift: [4, 4] },
  { half: [18.5, 12.5], shift: [12, 12] },
  { half: [48, 26], shift: [0, 0] }, // centred on the visible ground span instead (updateCascades)
];
/** Inner fraction of a window where it has full weight (outer 12 % blends to the next cascade). */
const INTERIOR = .88;
/** Instances smaller than this (bounding radius, m) do not cast into the far cascade. */
const FAR_MIN_RADIUS = .6;
/** Extra radius for vertex-animated casters (wind sway <= .13 m, cloth, pushed bushes <= .32 m). */
const ANIMATED_MARGIN = .35;
const ISLAND_BOX = new Box3(new Vector3(-86, -2, -82), new Vector3(96, 17.5, 62));

export interface ShadowFitOptions {
  /** Legacy single-map size from WorldEnvironment (4096 high / 2048 balanced); selects the tier. */
  mapSize: number;
  /** Fixed evidence shots use the whole-island window. */
  wide: boolean;
  /** Walker/vehicle position (window centre). */
  focus: readonly number[];
  /** Unused since v4.1 (kept for the WorldEnvironment call signature). */
  receivers?: readonly [number, number];
  tallReceivers?: readonly Box3[];
  maxDistance?: number;
  /** PCF radius in shadow texels. */
  radiusTexels?: number;
}
type CascadeInfo = { halfExtent_m: [number, number]; centre_ru: [number, number]; lightTexel_m: [number, number];
  groundTexel_m: { acrossSun: number; alongSun: number }; texelsPerMetre: { acrossSun: number; alongSun: number }; normalBias_m: number };
export interface ShadowTelemetry {
  mode: 'fixed-windows' | 'wide';
  tier: ShadowTier;
  mapSize: number;
  atlas: [number, number];
  centre: number[];
  /** Near cascade (the one covering the body), kept in the v3 field names. */
  halfExtent_m: [right: number, up: number];
  lightTexel_m: [right: number, up: number];
  groundTexel_m: { acrossSun: number; alongSun: number };
  cascades: CascadeInfo[];
  sunElevation_deg: number;
  pcfRadiusTexels: number;
  normalBias_m: number;
  bias: number;
  bias_m: number;
  updates: number;
  passes: Record<string, { casters: number; proxies: number; instances: number }>;
  groups?: unknown; groupErrors?: string[]; chunks?: unknown;
  applied?: unknown;
}

type CascadeShadow = SunLightShadow & { _cameras: OrthographicCamera[]; _matrices: Matrix4[]; _frustums: Frustum[]; _viewports: Vector4[]; _cascadeData: Vector4[];
  _viewportCount: number; _frameExtents: { x: number; y: number; set(x: number, y: number): void };
  _updateMatrix(camera: OrthographicCamera, matrix: Matrix4, frustum: Frustum, viewport: Vector4): void };

const point = new Vector3(), probe = new Vector3(), forward = new Vector3(), centre = new Vector3();
let telemetry: ShadowTelemetry | null = null;
let updates = 0;
let sun: SunLight | null = null;
let controller: DirectionalLight | null = null;
let fit: ShadowFitOptions | null = null;
let tier: ShadowTier = 'high';
/** QA only (contact-gap diagnosis): override the depth bias (m along the light) and/or the normal offset (m). */
export const shadowBiasQa: { bias_m: number | null; normal_m: number | null } = { bias_m: null, normal_m: null };

const islandLight = (() => {
  let minR = Infinity, maxR = -Infinity, minU = Infinity, maxU = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < 8; i++) {
    point.set(i & 1 ? ISLAND_BOX.max.x : ISLAND_BOX.min.x, i & 2 ? ISLAND_BOX.max.y : ISLAND_BOX.min.y, i & 4 ? ISLAND_BOX.max.z : ISLAND_BOX.min.z);
    const r = point.dot(LIGHT_RIGHT), u = point.dot(LIGHT_UP), z = point.dot(LIGHT_Z);
    minR = Math.min(minR, r); maxR = Math.max(maxR, r); minU = Math.min(minU, u); maxU = Math.max(maxU, u); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  return { centre: [(minR + maxR) / 2, (minU + maxU) / 2, (minZ + maxZ) / 2], half: [(maxR - minR) / 2 + 1, (maxU - minU) / 2 + 1] as [number, number], depthHalf: (maxZ - minZ) / 2 };
})();
/** Casters up to this far above the island top can still shadow it (light near plane margin). */
const DEPTH_MARGIN = 20;
/** Snapped light-space windows of the current frame (centre r, u and half extents). */
const windows = Array.from({ length: CASCADES }, () => ({ r: 0, u: 0, hr: 1, hu: 1 }));

// ------------------------------------------------------------------------------------ caster passes
type Caster = {
  mesh: Mesh;
  instanced: boolean;
  /** World spheres (centre x, y, z, radius) per instance for instanced casters; refreshed on rescan. */
  spheres: Float32Array;
  /** Guide/skinned: fixed sphere around this root. */
  root: Object3D | null;
  animated: boolean;
  /** The scene's own castShadow flag, captured when a shadow render begins and restored after it. */
  cast: boolean;
  proxies: InstancedMesh[];
  /** Fire whitelist kind (null = not a fire caster). */
  fire: 'guide' | 'vehicle' | 'static' | null;
  /** Rigid caster drawn through the merged sun chunks instead of its own proxies. */
  merged: boolean;
  /** Wind-animated instanced part drawn through its asset's merged part group (one proxy per cascade per asset). */
  grouped: boolean;
  /** Moves at runtime (Rapier instanced bodies, moved meshes, userData.shadowDynamic): never baked into chunks. */
  dynamic: boolean;
  /** World-matrix checksum at the last scan and how many consecutive scans it stayed the same. */
  sum: number; stable: number;
};
const casters = new Map<Mesh, Caster>();
// Vehicles keep exact near shadows; the two coarser sun cascades reuse their authored LOD1.
// Geometry is borrowed only within a depth pass and restored before fire/main rendering.
const geometryBeforeShadow = new Map<Mesh, BufferGeometry>();
function restoreShadowGeometry() {
  for (const [mesh, geometry] of geometryBeforeShadow) mesh.geometry = geometry;
  geometryBeforeShadow.clear();
}
const proxyGroup = new Object3D();
proxyGroup.name = 'world-shadow-proxies';
proxyGroup.visible = false;
proxyGroup.userData.shadowProxy = true;
proxyGroup.matrixAutoUpdate = false; proxyGroup.matrixWorldAutoUpdate = false; // proxy matrices are set per pass
let scanFrame = -1e9, frameNo = 0, inShadowRender = false;
const passStats: Record<string, { casters: number; proxies: number; instances: number }> = {};
const sphere = new Sphere(), m4 = new Matrix4(), sv = new Vector3();

function assetOf(o: Object3D | null): { assetId: string | null; vehicle: boolean; guide: boolean; proxy: boolean; movable: boolean } {
  let assetId: string | null = null, vehicle = false, guide = false, proxy = false, movable = false;
  for (let p: Object3D | null = o; p; p = p.parent) {
    const u = p.userData;
    if (u.shadowProxy) proxy = true;
    // Pushable / knockable bodies and anything that opts in: shadows must follow them, so never baked.
    if (u.obstacle || u.knockable || u.pushable || u.shadowDynamic) movable = true;
    if (u.vehicle || u.vehicleId) vehicle = true;
    if (p.name === 'world-guide-G24' || u.assetId === 'G24') guide = true;
    if (!assetId && typeof u.assetId === 'string') assetId = u.assetId;
  }
  return { assetId, vehicle, guide, proxy, movable };
}
const guideRoot = (o: Object3D) => { for (let p: Object3D | null = o; p; p = p.parent) if (p.name === 'world-guide-G24') return p; return o; };
const FIRE_STATIC = new Set(['C05', 'C06']);

/** Shadow-only simple model for the far cascade: convex hull of a wind-animated vegetation part (crown
 * shell, trunk, bush layer), keeping the per-vertex _wind data so it sways with the same depth material.
 * Rigid parts of >= 120 triangles (rocks) get a hull too. Cloth (tent canvas) never does: it would close
 * the door opening. Only used by cascade 2 (3.8 x 6.1 cm ground texels), where a crown shell's outline is
 * ~60 texels and the leaf notches inside it are near the texel size. */
const hulls = new WeakMap<BufferGeometry, BufferGeometry | null>();
const HULL_MIN_TRIS = 400;
function farHull(g: BufferGeometry): BufferGeometry | null {
  if (hulls.has(g)) return hulls.get(g)!;
  const pos = g.getAttribute('position'), wind = g.getAttribute('_wind');
  const tris = (g.index ? g.index.count : pos.count) / 3;
  let out: BufferGeometry | null = null;
  if (tris >= (wind ? HULL_MIN_TRIS : 120) && !g.getAttribute('_cloth')) {
    const pts: Vector3[] = [], key = new Map<string, number>();
    for (let i = 0; i < pos.count; i++) {
      const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
      if (key.has(k)) continue;
      key.set(k, i); pts.push(new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
    }
    const hull = new ConvexGeometry(pts), hp = hull.getAttribute('position');
    if (wind) {
      const w = new Float32Array(hp.count * 4);
      for (let i = 0; i < hp.count; i++) {
        const src = key.get(`${hp.getX(i).toFixed(4)},${hp.getY(i).toFixed(4)},${hp.getZ(i).toFixed(4)}`) ?? 0;
        w.set([wind.getX(src), wind.getY(src), wind.getZ(src), wind.getW(src)], i * 4);
      }
      hull.setAttribute('_wind', new BufferAttribute(w, 4));
    }
    hull.deleteAttribute('normal');
    hull.computeVertexNormals();
    hull.boundingSphere = g.boundingSphere ?? (g.computeBoundingSphere(), g.boundingSphere);
    out = hull;
  }
  hulls.set(g, out);
  return out;
}

function instanceSpheres(mesh: InstancedMesh, animated: boolean) {
  const g = mesh.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
  const local = g.boundingSphere!, n = mesh.count, out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    mesh.getMatrixAt(i, m4); m4.premultiply(mesh.matrixWorld);
    sphere.copy(local).applyMatrix4(m4);
    out.set([sphere.center.x, sphere.center.y, sphere.center.z, sphere.radius + (animated ? ANIMATED_MARGIN : 0)], i * 4);
  }
  return out;
}
function disposeCaster(c: Caster) {
  for (const p of c.proxies) { proxyGroup.remove(p); p.dispose(); }
}

const STABLE_SCANS = 2;
const tri = (g: BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
/** Cheap transform checksum (world matrix, plus every instance matrix for instanced meshes). */
function matrixSum(mesh: Mesh) {
  let s = 0;
  const e = mesh.matrixWorld.elements;
  for (let i = 0; i < 16; i++) s += e[i] * (i + 1);
  const im = mesh as InstancedMesh;
  if (im.isInstancedMesh) { const a = im.instanceMatrix.array as Float32Array, n = im.count * 16; for (let i = 0; i < n; i++) s += a[i] * ((i % 16) + 1) * (1 + (i >> 4) * 1e-3); s += im.count * 7919; }
  return s;
}

/** Rescan shadow casters (outside rendering, so castShadow flags are the scene's own). */
function rescan(scene: Object3D) {
  const seen = new Set<Mesh>();
  scene.updateMatrixWorld();
  scene.traverse(o => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || (!mesh.castShadow && !casters.has(mesh))) return;
    const meta = assetOf(mesh);
    if (meta.proxy) return;
    seen.add(mesh);
    const g = mesh.geometry, animated = !!(g.getAttribute('_wind') || g.getAttribute('_cloth') || (mesh as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh);
    let c = casters.get(mesh);
    const instanced = !!(mesh as InstancedMesh).isInstancedMesh;
    if (!c) {
      c = { mesh, instanced, spheres: new Float32Array(0), root: meta.guide ? guideRoot(mesh) : null, animated, cast: true, proxies: [], fire: null, merged: false, grouped: false, dynamic: false, sum: NaN, stable: 0 };
      c.fire = meta.guide ? 'guide' : meta.vehicle ? 'vehicle' : meta.assetId && FIRE_STATIC.has(meta.assetId) ? 'static' : null;
      casters.set(mesh, c);
      if (instanced) {
        const src = mesh as InstancedMesh, cap = src.instanceMatrix.count;
        for (let k = 0; k < CASCADES; k++) {
          // Full geometry in c0/c1 (crown shells span ~150 c1 texels: their leaf notches stay visible).
          const p = new InstancedMesh(k === 2 ? farHull(g) ?? g : g, mesh.material as Material, cap);
          p.name = `${mesh.name || mesh.parent?.name || 'caster'}#sun${k}`;
          p.frustumCulled = false; p.matrixAutoUpdate = false; p.matrixWorldAutoUpdate = false;
          p.castShadow = false; p.receiveShadow = false; p.userData.shadowProxy = true; p.userData.budgetSource = mesh; p.count = 0;
          proxyGroup.add(p); c.proxies.push(p);
        }
      }
    }
    // Static detection: a caster is baked only after its transforms stayed identical for STABLE_SCANS scans (~1 s);
    // anything that ever moves (or is a Rapier instanced body, DynamicDrawUsage) stays dynamic for the session.
    const sum = matrixSum(mesh);
    if (sum === c.sum) c.stable++; else { if (c.stable >= STABLE_SCANS) c.dynamic = true; c.stable = 0; c.sum = sum; }
    if (meta.movable || meta.vehicle || (instanced && (mesh as InstancedMesh).instanceMatrix.usage === DynamicDrawUsage) || (mesh as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh) c.dynamic = true;
    if (instanced) {
      const src = mesh as InstancedMesh;
      c.spheres = instanceSpheres(src, animated);
      for (const p of c.proxies) {
        p.material = mesh.material; p.customDepthMaterial = mesh.customDepthMaterial; p.customDistanceMaterial = mesh.customDistanceMaterial;
        p.matrixWorld.copy(mesh.matrixWorld);
      }
    }
  });
  for (const [mesh, c] of casters) if (!seen.has(mesh) || !mesh.parent) { disposeCaster(c); casters.delete(mesh); }
  rebuildFireStatic();
  rebuildGroups();
  rebuildChunks();
  if (proxyGroup.parent !== scene) scene.add(proxyGroup);
}

/** The fire whitelist's static casters (fire ring C05, benches C06) merged into ONE shadow-only mesh in
 * world space (positions + index only; they are rigid, so the default distance material is exact).
 * One draw per cube face instead of one per part and instance. Rebuilt when those assets change. */
const fireStatic = new Mesh();
fireStatic.name = 'world-fire-static-casters';
fireStatic.matrixAutoUpdate = false; fireStatic.matrixWorldAutoUpdate = false; fireStatic.frustumCulled = false;
fireStatic.castShadow = false; fireStatic.receiveShadow = false; fireStatic.userData.shadowProxy = true; fireStatic.userData.budgetZone = 'camp';
proxyGroup.add(fireStatic);
let fireStaticKey = '';
function rebuildFireStatic() {
  const parts = [...casters.values()].filter(c => c.fire === 'static');
  const key = parts.map(c => `${c.mesh.uuid}:${(c.mesh as InstancedMesh).count ?? 1}`).join('|');
  if (key === fireStaticKey) return;
  fireStaticKey = key;
  const positions: number[] = [], indices: number[] = [];
  const v = new Vector3();
  for (const c of parts) {
    const g = c.mesh.geometry, pos = g.getAttribute('position'), idx = g.index;
    const n = c.instanced ? (c.mesh as InstancedMesh).count : 1;
    for (let i = 0; i < n; i++) {
      if (c.instanced) { (c.mesh as InstancedMesh).getMatrixAt(i, m4); m4.premultiply(c.mesh.matrixWorld); } else m4.copy(c.mesh.matrixWorld);
      const base = positions.length / 3;
      for (let j = 0; j < pos.count; j++) { v.fromBufferAttribute(pos, j).applyMatrix4(m4); positions.push(v.x, v.y, v.z); }
      if (idx) for (let j = 0; j < idx.count; j++) indices.push(base + idx.getX(j));
      else for (let j = 0; j < pos.count; j++) indices.push(base + j);
    }
  }
  fireStatic.geometry.dispose();
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  g.setIndex(indices);
  g.computeBoundingSphere();
  fireStatic.geometry = g;
  fireStatic.matrixWorld.identity();
}

/** Asset part groups. A camp tree is 3-4 wind-animated InstancedMeshes (crown shells + trunk) that share one set of
 * instance matrices and the same wind depth program; per cascade they become ONE proxy with the parts' geometry
 * concatenated (position + _wind, local frame unchanged), so the depth shader, phase, push and sway are bit-identical.
 * Parts are grouped by asset group, material side and depth program. Cascade geometry:
 *   c0 / c1 leaf-cluster hulls (clusterHull, GROUP_CLUSTER_M bins; meshoptimizer was tested and removes < 7 % of these
 *   disconnected leaf cards within a 1-5 cm cap); c2 per-part convex hulls. */
type Group = { key: string; members: Caster[]; proxies: InstancedMesh[]; spheres: Float32Array; full: BufferGeometry; lods: BufferGeometry[]; far: BufferGeometry };
let groups: Group[] = [];
let groupKey = '';
const MID_RATIO = .45;
function concatParts(parts: BufferGeometry[]) {
  let nv = 0, ni = 0;
  for (const g of parts) { nv += g.getAttribute('position').count; ni += g.index ? g.index.count : g.getAttribute('position').count; }
  const pos = new Float32Array(nv * 3), wind = new Float32Array(nv * 4), idx = new Uint32Array(ni);
  let v = 0, i = 0;
  for (const g of parts) {
    const p = g.getAttribute('position'), w = g.getAttribute('_wind'), x = g.index;
    for (let j = 0; j < p.count; j++) { pos.set([p.getX(j), p.getY(j), p.getZ(j)], (v + j) * 3); if (w) wind.set([w.getX(j), w.getY(j), w.getZ(j), w.getW(j)], (v + j) * 4); }
    if (x) for (let j = 0; j < x.count; j++) idx[i++] = v + x.getX(j); else for (let j = 0; j < p.count; j++) idx[i++] = v + j;
    v += p.count;
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(pos, 3));
  out.setAttribute('_wind', new BufferAttribute(wind, 4));
  out.setIndex(new BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  if (out.boundingSphere) out.boundingSphere.radius += ANIMATED_MARGIN;
  return out;
}
const groupErrors: string[] = [];
/** Shadow-only leaf-cluster proxy for wind-animated foliage: leaf cards are binned by their centroid into `cell`-metre
 * cubes (part-local), and each bin becomes the convex hull of its cards. Gaps wider than a bin survive (dappled light),
 * gaps inside a bin fill. Hull vertices are a subset of the source vertices, so each keeps its exact _wind weights and
 * sways with the same depth material. Cards are connected components of the welded mesh. */
const clusters = new Map<string, BufferGeometry>();
export const GROUP_CLUSTER_M = [0, .6] as const;
// Only the middle cascade uses these clusters. Keep the closest cascade's exact leaves.
// Select original extreme vertices (including their exact wind weights), rather than creating
// arbitrary vertices that would sway differently in the depth pass.
const CLUSTER_AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1], [0, 1, 1], [0, 1, -1]].map(a => new Vector3(...a).normalize());
function clusterExtremes(points: Vector3[]) {
  if (points.length <= 18) return points;
  const selected = new Set<Vector3>();
  for (const axis of CLUSTER_AXES) {
    let lo = points[0], hi = points[0], min = Infinity, max = -Infinity;
    for (const p of points) {
      const d = p.dot(axis);
      if (d < min) { min = d; lo = p; }
      if (d > max) { max = d; hi = p; }
    }
    selected.add(lo); selected.add(hi);
  }
  return [...selected];
}
function clusterHull(g: BufferGeometry, cell: number): BufferGeometry {
  const id = `${g.uuid}:${cell}`, cached = clusters.get(id);
  if (cached) return cached;
  const pos = g.getAttribute('position'), wind = g.getAttribute('_wind'), idx = g.index;
  const key = new Map<string, number>(), weld = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) { const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`; let w = key.get(k); if (w === undefined) { w = i; key.set(k, i); } weld[i] = w; }
  const parent = Int32Array.from({ length: pos.count }, (_, i) => i);
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const n = idx ? idx.count : pos.count, at = (j: number) => weld[idx ? idx.getX(j) : j];
  for (let j = 0; j < n; j += 3) { const a = find(at(j)), b = find(at(j + 1)), c = find(at(j + 2)); parent[b] = a; parent[find(c)] = a; }
  // Component centroids -> bins.
  const comp = new Map<number, { sx: number; sy: number; sz: number; n: number; verts: Set<number> }>();
  for (let i = 0; i < pos.count; i++) {
    if (weld[i] !== i) continue;
    const r = find(i); let c = comp.get(r);
    if (!c) { c = { sx: 0, sy: 0, sz: 0, n: 0, verts: new Set() }; comp.set(r, c); }
    c.sx += pos.getX(i); c.sy += pos.getY(i); c.sz += pos.getZ(i); c.n++; c.verts.add(i);
  }
  const bins = new Map<string, number[]>();
  for (const c of comp.values()) {
    const k = `${Math.floor(c.sx / c.n / cell)},${Math.floor(c.sy / c.n / cell)},${Math.floor(c.sz / c.n / cell)}`;
    const list = bins.get(k) ?? []; for (const v of c.verts) list.push(v); bins.set(k, list);
  }
  const P: number[] = [], W: number[] = [], I: number[] = [];
  for (const verts of bins.values()) {
    const pts = verts.map(i => new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
    let hp: BufferAttribute | null = null;
    if (verts.length >= 4) { try { const h = new ConvexGeometry(clusterExtremes(pts)); hp = h.getAttribute('position') as BufferAttribute; h.dispose(); } catch { hp = null; } }
    // A closed hull around a few flat leaves can cost more than the original leaves. Keep those
    // leaves unchanged instead; apply this decision per cluster, not only after merging the asset.
    const set = new Set(verts);
    let binTriangles = 0;
    for (let j = 0; j < n; j += 3) if (set.has(at(j)) && set.has(at(j + 1)) && set.has(at(j + 2))) binTriangles++;
    if (hp && hp.count >= binTriangles * 3) hp = null;
    const base = P.length / 3;
    if (hp && hp.count >= 4) {
      for (let i = 0; i < hp.count; i++) {
        P.push(hp.getX(i), hp.getY(i), hp.getZ(i));
        const src = key.get(`${hp.getX(i).toFixed(4)},${hp.getY(i).toFixed(4)},${hp.getZ(i).toFixed(4)}`) ?? verts[0];
        if (wind) W.push(wind.getX(src), wind.getY(src), wind.getZ(src), wind.getW(src));
        I.push(base + i);
      }
    } else {
      // Degenerate (single flat card): keep its own triangles.
      const map = new Map<number, number>();
      for (let j = 0; j < n; j += 3) {
        const tri = [at(j), at(j + 1), at(j + 2)];
        if (!tri.every(v => set.has(v))) continue;
        for (const v of tri) { let m = map.get(v); if (m === undefined) { m = P.length / 3; map.set(v, m); P.push(pos.getX(v), pos.getY(v), pos.getZ(v)); if (wind) W.push(wind.getX(v), wind.getY(v), wind.getZ(v), wind.getW(v)); } I.push(m); }
      }
    }
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(new Float32Array(P), 3));
  if (wind) out.setAttribute('_wind', new BufferAttribute(new Float32Array(W), 4));
  out.setIndex(I);
  out.boundingSphere = g.boundingSphere ?? (g.computeBoundingSphere(), g.boundingSphere);
  // Keep whichever is cheaper (a part that is already a few big cards gains nothing).
  const result = I.length < n ? out : g;
  clusters.set(id, result);
  return result;
}
function rebuildGroups() {
  const byKey = new Map<string, Caster[]>();
  for (const c of casters.values()) {
    c.grouped = false;
    const m = c.mesh as InstancedMesh;
    if (!c.instanced || c.dynamic || c.fire || !m.geometry.getAttribute('_wind') || m.geometry.getAttribute('_cloth') || !m.customDepthMaterial || Array.isArray(m.material)) continue;
    const prog = (m.customDepthMaterial as Material & { customProgramCacheKey: () => string }).customProgramCacheKey();
    // Sides may mix (two-sided crowns + one-sided trunk): the group draws two-sided, harmless for closed trunks.
    const k = `${m.parent?.uuid}|${prog}|${m.count}`;
    // Identical instance layout required (same asset placements): compare against the first member.
    const list = byKey.get(k) ?? [];
    if (list.length && !sameInstances(list[0].mesh as InstancedMesh, m)) continue;
    list.push(c); byKey.set(k, list);
  }
  const live = [...byKey.entries()].filter(([, l]) => l.length > 1);
  const key = live.map(([k, l]) => k + ':' + l.map(c => c.mesh.uuid).join(',')).join('|');
  for (const [, l] of live) for (const c of l) c.grouped = true;
  if (key === groupKey) return;
  groupKey = key;
  for (const gr of groups) for (const p of gr.proxies) { proxyGroup.remove(p); p.dispose(); }
  for (const gr of groups) { gr.full.dispose(); gr.far.dispose(); gr.lods.forEach(l => { if (l !== gr.full) l.dispose(); }); }
  groups = live.map(([k, members]) => {
    members.sort((a, b) => ((b.mesh.material as Material).side === 2 ? 1 : 0) - ((a.mesh.material as Material).side === 2 ? 1 : 0));
    const lead = members[0].mesh as InstancedMesh, parts = members.map(c => c.mesh.geometry);
    const full = concatParts(parts), far = concatParts(parts.map(g => farHull(g) ?? g));
    // c0 keeps the full parts (0.7 cm texels resolve every leaf notch); c1 bins at 0.6 m (finer bins save nothing: the hull
    // of a few flat cards has more triangles than the cards), so gaps wider than ~0.6 m survive as dappled light.
    const lods = GROUP_CLUSTER_M.map(cell => cell > 0 ? concatParts(parts.map(g => g.getAttribute('_wind') && (g.index ? g.index.count : g.getAttribute('position').count) / 3 >= 200 ? clusterHull(g, cell) : g)) : full);
    const gr: Group = { key: k, members, proxies: [], spheres: new Float32Array(0), full, lods, far };
    // Instance spheres from the concatenated bounds (already padded for sway).
    const n = lead.count, local = full.boundingSphere!, sp = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { lead.getMatrixAt(i, m4); m4.premultiply(lead.matrixWorld); sphere.copy(local).applyMatrix4(m4); sp.set([sphere.center.x, sphere.center.y, sphere.center.z, sphere.radius], i * 4); }
    gr.spheres = sp;
    for (let c = 0; c < CASCADES; c++) {
      const p = new InstancedMesh(c === 2 ? far : lods[c], lead.material as Material, lead.instanceMatrix.count);
      p.name = `${lead.parent?.name || lead.name}#group-sun${c}`;
      p.frustumCulled = false; p.matrixAutoUpdate = false; p.matrixWorldAutoUpdate = false;
      p.castShadow = false; p.receiveShadow = false; p.count = 0;
      p.customDepthMaterial = lead.customDepthMaterial;
      p.userData.shadowProxy = true; p.userData.budgetSource = lead;
      proxyGroup.add(p); gr.proxies.push(p);
    }
    return gr;
  });
}
function sameInstances(a: InstancedMesh, b: InstancedMesh) {
  if (a.count !== b.count || !a.matrixWorld.equals(b.matrixWorld)) return false;
  const x = a.instanceMatrix.array, y = b.instanceMatrix.array;
  for (let i = 0; i < a.count * 16; i++) if (Math.abs(x[i] - y[i]) > 1e-5) return false;
  return true;
}

/** Rigid instanced casters (rocks, props, benches, fire ring, tent frames, greybox blocks: no wind, no cloth,
 * no custom depth material) are merged per 8 m ground cell and material side into shadow-only world-space
 * meshes, in two variants: full geometry for c0/c1 and a far variant (instances >= FAR_MIN_RADIUS, convex
 * hulls where available) for c2. One draw per cell instead of one per part, which is what bounds the
 * shadow pass draw calls; each cascade only draws the cells whose light-space footprint it needs. */
type Chunk = { mesh: Mesh; cascade: 0 | 1 | 2; sphere: Sphere; lightBounds: [number, number, number, number] };
let chunks: Chunk[] = [];
let chunkKey = '';
/** Light-space cells per cascade (m). Spatial batches keep district-wide merged decks/buildings from
 * entering every nearby cascade; each chunk is culled by its actual light-space rectangle. */
const CHUNK_CELL = [12, 20, 32] as const;
const sideMaterials = new Map<number, Material>();
const sideMaterial = (side: number) => { let m = sideMaterials.get(side); if (!m) { m = new MeshBasicMaterial({ side: side as 0 | 1 | 2 }); sideMaterials.set(side, m); } return m; };
function makeChunkMesh(positions: number[], indices: number[], side: number, name: string) {
  if (!indices.length) return null;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  g.setIndex(indices);
  g.computeBoundingSphere();
  const m = new Mesh(g, sideMaterial(side));
  m.name = name; m.matrixAutoUpdate = false; m.matrixWorldAutoUpdate = false; m.matrixWorld.identity(); m.frustumCulled = false;
  m.castShadow = false; m.receiveShadow = false; m.userData.shadowProxy = true;
  proxyGroup.add(m);
  return m;
}
function rebuildChunks() {
  // Static, rigid, default-depth casters only: never animated, skinned, dynamic, guide/vehicle, or custom depth.
  // Multi-material meshes merge by their first material's side (GLB buildings: all opaque, same side in practice).
  const plainDepth = (c: Caster) => {
    const g = c.mesh.geometry, mats = Array.isArray(c.mesh.material) ? c.mesh.material : [c.mesh.material];
    // Anything the default depth material would render differently stays on its own draw: alpha cutouts, displacement,
    // clipping, morph targets, and multi-material meshes whose groups disagree on the side.
    return !g.morphAttributes.position && mats.every(m => { const x = m as Material & { alphaTest?: number; map?: unknown; alphaMap?: unknown; displacementMap?: unknown; clippingPlanes?: unknown[] | null };
      return !(x.alphaTest && (x.map || x.alphaMap)) && !x.displacementMap && !x.clippingPlanes?.length && x.side === mats[0].side && x.visible; });
  };
  const rigid = [...casters.values()].filter(c => c.cast && !c.animated && !c.dynamic && c.stable >= STABLE_SCANS && !c.fire?.match(/guide|vehicle/) && !c.mesh.customDepthMaterial && !c.root && plainDepth(c));
  const key = rigid.map(c => `${c.mesh.uuid}:${c.sum}`).join('|');
  for (const c of casters.values()) c.merged = false;
  for (const c of rigid) c.merged = true;
  if (key === chunkKey) return;
  chunkKey = key;
  for (const ch of chunks) { proxyGroup.remove(ch.mesh); ch.mesh.geometry.dispose(); }
  type Bucket = { side: number; cascade: 0 | 1 | 2; data: [number[], number[]]; zones: Map<string, number> };
  const buckets = new Map<string, Bucket>();
  // Budget attribution (QA): each merged chunk reports the zone that contributes most of its triangles.
  const top = (zones: Map<string, number>) => [...zones.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other';
  const v = new Vector3();
  const push = (g: BufferGeometry, matrix: Matrix4, cascade: 0 | 1 | 2, side: number, zone: string) => {
    const pos = g.getAttribute('position'), idx = g.index, world = new Float32Array(pos.count * 3);
    for (let j = 0; j < pos.count; j++) {
      v.fromBufferAttribute(pos, j).applyMatrix4(matrix); world.set([v.x, v.y, v.z], j * 3);
    }
    const cell = CHUNK_CELL[cascade], count = idx ? idx.count : pos.count;
    // A batched district can span the island. Bin its triangles, rather than putting the entire
    // mesh in its centre's cell: the latter makes every nearby cascade redraw distant buildings/decks.
    for (let j = 0; j + 2 < count; j += 3) {
      const a = (idx ? idx.getX(j) : j) * 3, b = (idx ? idx.getX(j + 1) : j + 1) * 3, c = (idx ? idx.getX(j + 2) : j + 2) * 3;
      v.set((world[a] + world[b] + world[c]) / 3, (world[a + 1] + world[b + 1] + world[c + 1]) / 3, (world[a + 2] + world[b + 2] + world[c + 2]) / 3);
      const key = `${cascade}:${Math.floor(v.dot(LIGHT_RIGHT) / cell)},${Math.floor(v.dot(LIGHT_UP) / cell)},${side}`;
      let bucket = buckets.get(key);
      if (!bucket) { bucket = { side, cascade, data: [[], []], zones: new Map() }; buckets.set(key, bucket); }
      const [points, indices] = bucket.data, base = points.length / 3;
      for (const n of [a, b, c]) points.push(world[n], world[n + 1], world[n + 2]);
      indices.push(base, base + 1, base + 2);
      bucket.zones.set(zone, (bucket.zones.get(zone) ?? 0) + 3);
    }
  };
  const one = new Float32Array(4);
  for (const c of rigid) {
    const src = c.mesh as InstancedMesh, mat = Array.isArray(src.material) ? src.material[0] : src.material;
    // userData.shadowGeometry: an asset-supplied simplified shadow proxy (same local frame as the mesh).
    const g = (src.userData.shadowGeometry as BufferGeometry | undefined) ?? src.geometry, hull = farHull(g), side = mat.side, zone = budgetZoneOf(src);
    let s = c.spheres;
    if (!c.instanced) { meshSphere(c, sphere); one.set([sphere.center.x, sphere.center.y, sphere.center.z, sphere.radius]); s = one; }
    const count = c.instanced ? src.count : 1;
    for (let i = 0; i < count; i++) {
      if (c.instanced) { src.getMatrixAt(i, m4); m4.premultiply(src.matrixWorld); } else m4.copy(src.matrixWorld);
      for (const k of [0, 1, 2] as const) {
        if (k === 2 && s[i * 4 + 3] < FAR_MIN_RADIUS) continue;
        const geo = k === 2 ? hull ?? g : g;
        push(geo, m4, k, side, zone);
      }
    }
  }
  chunks = [];
  for (const [key, b] of buckets) {
    const mesh = makeChunkMesh(b.data[0], b.data[1], b.side, `sun-chunk-${key}`);
    if (!mesh) continue;
    mesh.userData.budgetZone = top(b.zones);
    const lightBounds: Chunk['lightBounds'] = [Infinity, -Infinity, Infinity, -Infinity];
    const pos = mesh.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const r = v.dot(LIGHT_RIGHT), u = v.dot(LIGHT_UP);
      lightBounds[0] = Math.min(lightBounds[0], r); lightBounds[1] = Math.max(lightBounds[1], r);
      lightBounds[2] = Math.min(lightBounds[2], u); lightBounds[3] = Math.max(lightBounds[3], u);
    }
    chunks.push({ mesh, cascade: b.cascade, sphere: mesh.geometry.boundingSphere!.clone(), lightBounds });
  }
}

/** World sphere of a non-instanced caster (guide: fixed body sphere around its root). */
function meshSphere(c: Caster, out: Sphere) {
  if (c.root) { c.root.getWorldPosition(out.center); out.center.y += .9; out.radius = 1.3; return out; }
  const g = c.mesh.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
  out.copy(g.boundingSphere!).applyMatrix4(c.mesh.matrixWorld);
  if (c.animated) out.radius += ANIMATED_MARGIN;
  return out;
}
/** View frustum of the frame being shadowed (set in updateCascades). */
const viewFrustum = new Frustum(), viewMatrix = new Matrix4();
let viewValid = false;
/** Fixed QA shots fit every cascade to the whole island: only c0 draws (c1/c2 lie inside it), so it uses the coarse cells. */
let wideMode = false;
const sweepSphere = new Sphere();
/** Can any shadow of this caster be on screen? Its shadow lies along -sun from the caster down to sea
 * level (a receiver is always lower than the caster on the light ray), so the swept sphere from the
 * caster to that depth must touch the view frustum. Sampled with overlapping spheres. */
function shadowVisible(x: number, y: number, z: number, radius: number) {
  if (!viewValid) return true;
  const along = Math.max(0, (y + radius + .7) / SIN_ELEVATION), step = Math.max(radius * 1.5, .5);
  const n = Math.min(40, Math.ceil(along / step));
  sweepSphere.radius = radius + step * .5;
  for (let i = 0; i <= n; i++) {
    const t = Math.min(along, i * step);
    sweepSphere.center.set(x - LIGHT_Z.x * t, y - LIGHT_Z.y * t, z - LIGHT_Z.z * t);
    if (viewFrustum.intersectsSphere(sweepSphere)) return true;
  }
  return false;
}
/** Does a world sphere's light-space footprint belong in cascade k? */
function inCascade(k: number, x: number, y: number, z: number, radius: number, chunk = false) {
  if (k === 2 && !chunk && radius < FAR_MIN_RADIUS) return false;
  sv.set(x, y, z);
  const r = sv.dot(LIGHT_RIGHT), u = sv.dot(LIGHT_UP), w = windows[k], m = radius + .15;
  if (Math.abs(r - w.r) > w.hr + m || Math.abs(u - w.u) > w.hu + m) return false;
  // Entirely inside a finer cascade's full-weight interior: no receiver of it ever samples cascade k.
  for (let j = 0; j < k; j++) {
    const f = windows[j];
    if (Math.abs(r - f.r) + m < f.hr * INTERIOR && Math.abs(u - f.u) + m < f.hu * INTERIOR) return false;
  }
  return shadowVisible(x, y, z, radius);
}

function chunkInCascade(k: number, chunk: Chunk) {
  const [r0, r1, u0, u1] = chunk.lightBounds, w = windows[k], pad = .15;
  if (r1 < w.r - w.hr - pad || r0 > w.r + w.hr + pad || u1 < w.u - w.hu - pad || u0 > w.u + w.hu + pad) return false;
  for (let j = 0; j < k; j++) {
    const f = windows[j];
    if (r0 - pad > f.r - f.hr * INTERIOR && r1 + pad < f.r + f.hr * INTERIOR && u0 - pad > f.u - f.hu * INTERIOR && u1 + pad < f.u + f.hu * INTERIOR) return false;
  }
  const s = chunk.sphere;
  return shadowVisible(s.center.x, s.center.y, s.center.z, s.radius);
}

function applySunPass(k: number) {
  restoreShadowGeometry();
  let nCasters = 0, nProxies = 0, nInstances = 0;
  fireStatic.castShadow = false;
  for (const ch of chunks) {
    ch.mesh.castShadow = ch.cascade === (wideMode && k === 0 ? 2 : k) && chunkInCascade(k, ch);
    if (ch.mesh.castShadow) nProxies++;
  }
  for (const gr of groups) {
    gr.proxies.forEach((p, j) => { if (j !== k) p.castShadow = false; });
    const p = gr.proxies[k], lead = gr.members[0].mesh as InstancedMesh;
    if (!gr.members.every(m => m.cast)) { p.castShadow = false; continue; }
    const src = lead.instanceMatrix.array as Float32Array, dst = p.instanceMatrix.array as Float32Array, s = gr.spheres;
    p.matrixWorld.copy(lead.matrixWorld);
    let n = 0;
    for (let i = 0; i * 4 < s.length; i++) {
      if (!inCascade(k, s[i * 4], s[i * 4 + 1], s[i * 4 + 2], s[i * 4 + 3])) continue;
      dst.set(src.subarray(i * 16, i * 16 + 16), n * 16); n++;
    }
    if (n !== p.count || n) { p.count = n; p.instanceMatrix.needsUpdate = true; }
    p.castShadow = n > 0;
    if (n) { nProxies++; nInstances += n; }
  }
  for (const c of casters.values()) {
    if (!c.cast || c.merged || c.grouped) { c.mesh.castShadow = false; for (const p of c.proxies) p.castShadow = false; continue; }
    if (c.instanced) {
      c.mesh.castShadow = false;
      // Moving instances (knocked props): culling spheres follow them every frame, not every 30 frames.
      if (k === 0 && c.dynamic) c.spheres = instanceSpheres(c.mesh as InstancedMesh, c.animated);
      const src = (c.mesh as InstancedMesh).instanceMatrix.array as Float32Array, s = c.spheres;
      c.proxies.forEach((p, j) => { if (j !== k) p.castShadow = false; });
      const p = c.proxies[k], dst = p.instanceMatrix.array as Float32Array;
      // Dynamic wheel batches can swap LOD geometry without replacing their InstancedMesh.
      // Refresh shadow geometry as well, so distant wheels do not keep submitting the near mesh.
      const shadowLod = c.mesh.userData.shadowLodGeometry as BufferGeometry | undefined;
      p.geometry = k > 0 && shadowLod ? shadowLod : k === 2 ? farHull(c.mesh.geometry) ?? c.mesh.geometry : c.mesh.geometry;
      p.matrixWorld.copy(c.mesh.matrixWorld);
      let n = 0;
      for (let i = 0; i * 4 < s.length; i++) {
        if (!inCascade(k, s[i * 4], s[i * 4 + 1], s[i * 4 + 2], s[i * 4 + 3])) continue;
        dst.set(src.subarray(i * 16, i * 16 + 16), n * 16); n++;
      }
      if (n !== p.count || n) { p.count = n; p.instanceMatrix.needsUpdate = true; }
      p.castShadow = n > 0;
      if (n) { nProxies++; nInstances += n; }
    } else {
      meshSphere(c, sphere);
      c.mesh.castShadow = inCascade(k, sphere.center.x, sphere.center.y, sphere.center.z, sphere.radius);
      const shadowLod = c.mesh.userData.shadowLodGeometry as BufferGeometry | undefined;
      if (k > 0 && c.mesh.castShadow && shadowLod) {
        geometryBeforeShadow.set(c.mesh, c.mesh.geometry);
        c.mesh.geometry = shadowLod;
      }
      if (c.mesh.castShadow) nCasters++;
    }
  }
  passStats[`sun-c${k}`] = { casters: nCasters, proxies: nProxies, instances: nInstances };
}

export interface FirePassSpec { position: Vector3; range: number; }
/** One point-light face: only the fire whitelist within `range` that intersects this face frustum. */
export function applyFirePass(face: number, frustum: Frustum, spec: FirePassSpec) {
  if (!inShadowRender) return;
  restoreShadowGeometry();
  let n = 0;
  const rangeOk = (x: number, z: number) => Math.hypot(x - spec.position.x, z - spec.position.z) <= spec.range;
  for (const c of casters.values()) {
    for (const p of c.proxies) p.castShadow = false;
    if (!c.cast || (c.fire !== 'guide' && c.fire !== 'vehicle')) { c.mesh.castShadow = false; continue; }
    meshSphere(c, sphere);
    c.mesh.castShadow = rangeOk(sphere.center.x, sphere.center.z) && frustum.intersectsSphere(sphere);
    if (c.mesh.castShadow) n++;
  }
  for (const ch of chunks) ch.mesh.castShadow = false;
  for (const gr of groups) for (const p of gr.proxies) p.castShadow = false;
  const gs = fireStatic.geometry.boundingSphere;
  fireStatic.castShadow = !!gs && frustum.intersectsSphere(gs);
  if (fireStatic.castShadow) n++;
  passStats[`fire-${face}`] = { casters: n, proxies: 0, instances: 0 };
}

function beginShadowRender() {
  inShadowRender = true;
  proxyGroup.visible = true;
  for (const k of Object.keys(passStats)) delete passStats[k];
  for (const c of casters.values()) c.cast = c.mesh.castShadow;
}
function endShadowRender() {
  restoreShadowGeometry();
  inShadowRender = false;
  proxyGroup.visible = false;
  for (const c of casters.values()) {
    c.mesh.castShadow = c.cast;
    for (const p of c.proxies) p.castShadow = false;
  }
  fireStatic.castShadow = false;
  for (const ch of chunks) ch.mesh.castShadow = false;
  for (const gr of groups) for (const p of gr.proxies) p.castShadow = false;
}
const wrapped = new WeakSet<object>();
function wrapShadowRender(renderer: WebGLRenderer) {
  const sm = renderer.shadowMap as unknown as { render: (...a: unknown[]) => void };
  if (wrapped.has(sm)) return;
  wrapped.add(sm);
  const original = sm.render;
  sm.render = function (this: unknown, ...args: unknown[]) {
    beginShadowRender();
    try { return original.apply(this, args); } finally { endShadowRender(); }
  };
}

// ----------------------------------------------------------------------------------------- QA reads
/** QA: atlas texel coordinates of world points for each cascade, with the matrices of the last
 * shadow render. Constant fractional parts across frames prove static shadows are not resampled. */
export const shadowTexelsOf = (points: number[][]) => {
  if (!sun) return null;
  const s = sun.shadow as CascadeShadow, w = s.mapSize.x * s._frameExtents.x, h = s.mapSize.y;
  return points.map(p => s._matrices.map(m => { probe.set(p[0], p[1], p[2]).applyMatrix4(m); return [probe.x * w, probe.y * h]; }));
};
/** Last applied fit (QA read-out; values are the ones actually given to the light). */
export const shadowTelemetry = () => telemetry;
/** The light that actually renders the sun (null before the first frame). */
export const worldSun = () => sun;

// ---------------------------------------------------------------------------------------- cascades
/** Called by the renderer (SunLightShadow.updateMatrices) with the camera of this frame. */
function updateCascades(shadow: CascadeShadow, viewCamera: Camera | undefined) {
  const options = fit;
  if (!options || !viewCamera) return;
  const size = shadow.mapSize.x, radius = options.radiusTexels ?? 2;
  shadow.radius = radius;
  const inset = Math.min(.25, (Math.ceil(radius) + 1) / size);
  const resolution = size * (1 - 2 * inset);
  for (let i = 0; i < CASCADES; i++) shadow._viewports[i].set(i + inset, inset, 1 - 2 * inset, 1 - 2 * inset);
  const perspective = viewCamera as PerspectiveCamera;
  const wide = options.wide || !perspective.isPerspectiveCamera;
  const f = options.focus;
  viewCamera.updateMatrixWorld();
  viewMatrix.multiplyMatrices(viewCamera.projectionMatrix, viewCamera.matrixWorldInverse);
  viewFrustum.setFromProjectionMatrix(viewMatrix);
  viewValid = !wide; wideMode = wide;
  // Ground look direction (unit, horizontal) and the visible ground span along it, measured from the camera:
  // bottom-centre and top-centre view rays against the focus height (top capped at 110 m, fog starts at 140 m).
  let gx = 0, gz = 0, nearG = 0, farG = 110;
  if (!wide) {
    perspective.getWorldDirection(forward);
    const gl = Math.hypot(forward.x, forward.z);
    if (gl > 1e-3) { gx = forward.x / gl; gz = forward.z / gl; }
    const h = perspective.position.y - f[1];
    const hit = (ndcY: number) => { probe.set(0, ndcY, .5).unproject(perspective).sub(perspective.position).normalize(); return probe.y < -1e-3 ? Math.hypot(probe.x, probe.z) * h / -probe.y : Infinity; };
    nearG = Math.min(110, hit(-1)); farG = Math.min(110, hit(1));
  }
  const camGround = [perspective.position.x, perspective.position.z];
  const cascades: CascadeInfo[] = [];
  for (let i = 0; i < CASCADES; i++) {
    const spec = CASCADE_WINDOWS[i];
    const [halfR, halfU] = wide ? islandLight.half : spec.half;
    let cR = islandLight.centre[0], cU = islandLight.centre[1];
    if (!wide) {
      if (i < 2) point.set(f[0] + gx * spec.shift[0], f[1], f[2] + gz * spec.shift[0]);
      else {
        // Far window: centred on the visible ground span (from the bottom of the view to at most ~90 m past it).
        const mid = (nearG + Math.min(farG, nearG + 90)) / 2;
        point.set(camGround[0] + gx * mid, f[1], camGround[1] + gz * mid);
      }
      cR = point.dot(LIGHT_RIGHT); cU = point.dot(LIGHT_UP);
    }
    const texelR = 2 * halfR / resolution, texelU = 2 * halfU / resolution;
    cR = Math.round(cR / texelR) * texelR; cU = Math.round(cU / texelU) * texelU;
    Object.assign(windows[i], { r: cR, u: cU, hr: halfR, hu: halfU });
    centre.set(0, 0, 0).addScaledVector(LIGHT_RIGHT, cR).addScaledVector(LIGHT_UP, cU).addScaledVector(LIGHT_Z, islandLight.centre[2]);
    const cam = shadow._cameras[i];
    cam.position.copy(centre).addScaledVector(LIGHT_Z, islandLight.depthHalf + DEPTH_MARGIN);
    cam.up.set(0, 1, 0); cam.lookAt(centre);
    cam.left = -halfR; cam.right = halfR; cam.bottom = -halfU; cam.top = halfU;
    cam.near = LIGHT_NEAR; cam.far = 2 * islandLight.depthHalf + DEPTH_MARGIN + 2;
    cam.coordinateSystem = shadow.camera.coordinateSystem;
    (cam as OrthographicCamera & { _reversedDepth?: boolean })._reversedDepth = (shadow.camera as OrthographicCamera & { _reversedDepth?: boolean })._reversedDepth;
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    shadow._updateMatrix(cam, shadow._matrices[i], shadow._frustums[i], shadow._viewports[i]);
    const along = texelU / SIN_ELEVATION;
    // Half a light texel of normal offset (the receiver-plane bias in the shader handles the filter slope).
    const cascadeBias = shadowBiasQa.normal_m ?? Math.max(.002, .5 * Math.max(texelR, texelU));
    const vp = shadow._viewports[i], fx = shadow._frameExtents.x;
    shadow._cascadeData[i].set(vp.x / fx, (vp.x + vp.z) / fx, vp.y, cascadeBias);
    cascades.push({ halfExtent_m: [halfR, halfU], centre_ru: [cR, cU], lightTexel_m: [texelR, texelU], groundTexel_m: { acrossSun: texelR, alongSun: along },
      texelsPerMetre: { acrossSun: 1 / texelR, alongSun: 1 / along }, normalBias_m: cascadeBias });
  }
  shadow.normalBias = cascades[0].normalBias_m;
  // Constant depth bias: 2 mm along the light (the old -0.00015 over a ~259 m range was ~3.9 cm, which alone
  // opened a ~3.6 cm lit gap between a boot and its shadow at this sun elevation).
  const cam0 = shadow._cameras[0], biasM = shadowBiasQa.bias_m ?? .002;
  shadow.bias = -biasM / (cam0.far - cam0.near);
  updates++;
  const near = cascades[0];
  telemetry = { mode: wide ? 'wide' : 'fixed-windows', tier, mapSize: size, atlas: [size * CASCADES, size],
    centre: shadow._cameras[0].position.toArray(), halfExtent_m: near.halfExtent_m, lightTexel_m: near.lightTexel_m, groundTexel_m: near.groundTexel_m, cascades,
    sunElevation_deg: Math.asin(SIN_ELEVATION) * 180 / Math.PI, pcfRadiusTexels: radius, normalBias_m: shadow.normalBias, bias: shadow.bias, bias_m: biasM, updates,
    passes: passStats,
    groups: groups.map(gr => ({ key: gr.members[0].mesh.parent?.name ?? gr.key, parts: gr.members.map(c => c.mesh.name), instances: (gr.members[0].mesh as InstancedMesh).count,
      tris: { full: tri(gr.full), c0: tri(gr.lods[0]), c1: tri(gr.lods[1]), far: tri(gr.far) } })), groupErrors,
    chunks: { perCascade: [0, 1, 2].map(k => chunks.filter(c => c.cascade === k).length), merged: [...casters.values()].filter(c => c.merged).length, dynamic: [...casters.values()].filter(c => c.dynamic).map(c => c.mesh.name || c.mesh.parent?.name) },
    applied: { cameras: shadow._cameras.map(c => [c.left, c.right, c.bottom, c.top, c.near, c.far]), cascadeData: shadow._cascadeData.map(v => v.toArray()),
      mapAllocated: shadow.map ? [shadow.map.width, shadow.map.height] : null, sunIntensity: sun?.intensity ?? null, sunInScene: !!sun?.parent, casters: casters.size } };
}

function ensureSun(light: DirectionalLight, scene: Object3D) {
  if (!sun) {
    sun = new SunLight(light.color.getHex(), light.intensity);
    sun.name = 'world-sun-cascaded';
    sun.castShadow = true;
    const shadow = sun.shadow as CascadeShadow;
    // Third cascade on the same atlas row (three's SunLightShadow ships two).
    while (shadow._cameras.length < CASCADES) {
      shadow._cameras.push(new OrthographicCamera()); shadow._matrices.push(new Matrix4()); shadow._frustums.push(new Frustum()); shadow._cascadeData.push(new Vector4());
    }
    while (shadow._viewports.length < CASCADES) shadow._viewports.push(new Vector4());
    shadow._viewportCount = CASCADES; shadow._frameExtents.set(CASCADES, 1);
    shadow.updateMatrices = (_light, viewCamera) => updateCascades(shadow, viewCamera);
    shadow.getFrustum = (i = 0) => { if (inShadowRender) applySunPass(i); return shadow._frustums[i]; };
  }
  if (sun.parent !== scene) {
    scene.add(sun);
    const previous = scene.onBeforeRender;
    scene.onBeforeRender = function (this: Object3D, renderer, ...rest) {
      wrapShadowRender(renderer);
      setQaRenderer(renderer); // QA frame breakdown only
      return previous.call(this, renderer, ...rest);
    };
  }
  if (controller !== light) {
    // The DirectionalLight stays the React-owned controller; its own shadow map is released.
    controller = light;
    light.shadow.map?.dispose(); light.shadow.map = null;
  }
  light.castShadow = false; light.visible = false;
  sun.color.copy(light.color); sun.intensity = light.intensity;
  sun.position.copy(SUN_OFFSET);
  const want = SHADOW_BUDGET[tier].sunCascade;
  if (sun.shadow.mapSize.x !== want) {
    sun.shadow.map?.dispose(); sun.shadow.map = null;
    sun.shadow.mapSize.set(want, want);
  }
  // QA renderInfo() reads the DirectionalLight's map size: report the per-cascade size actually used.
  if (light.shadow.mapSize.x !== want) light.shadow.mapSize.set(want, want);
}

/** Call once per frame before render. `target` must be in the scene graph (it anchors the scene). */
export function fitSunShadow(light: DirectionalLight, target: Object3D, camera: Camera, options: ShadowFitOptions) {
  const scene = target.parent ?? light.parent;
  if (!scene) return;
  tier = options.mapSize >= 4096 ? 'high' : 'balanced';
  fit = options;
  ensureSun(light, scene);
  target.position.set(options.focus[0], options.focus[1], options.focus[2]);
  frameNo++;
  if (frameNo - scanFrame >= 30) { scanFrame = frameNo; rescan(scene); }
  worldLightsFrame(scene, camera, tier, sun!, options.focus);
  if (typeof window !== 'undefined' && (window as unknown as { __worldDebug?: Record<string, unknown> }).__worldDebug) {
    // QA page only (the debug object exists solely behind ?qa=1).
    const debug = (window as unknown as { __worldDebug: Record<string, unknown> }).__worldDebug;
    debug.shadowInfo ??= shadowTelemetry;
    debug.shadowTexelsOf ??= shadowTexelsOf;
  }
}

/** Unit vector from a lit point towards the sun (shadow direction on the ground is its negation). */
export const SUN_DIRECTION = LIGHT_Z;
export const SUN_BASIS = { right: LIGHT_RIGHT, up: LIGHT_UP };
