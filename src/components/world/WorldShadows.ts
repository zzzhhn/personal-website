import { Box3, BufferAttribute, BufferGeometry, Frustum, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Object3D, OrthographicCamera, ShaderChunk, Sphere, Vector3, Vector4, type Camera, type DirectionalLight, type Material, type PerspectiveCamera, type WebGLRenderer } from 'three';
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
  /** Rigid instanced caster drawn through the merged sun chunks instead of its own proxies. */
  merged: boolean;
};
const casters = new Map<Mesh, Caster>();
const proxyGroup = new Object3D();
proxyGroup.name = 'world-shadow-proxies';
proxyGroup.visible = false;
proxyGroup.userData.shadowProxy = true;
proxyGroup.matrixAutoUpdate = false; proxyGroup.matrixWorldAutoUpdate = false; // proxy matrices are set per pass
let scanFrame = -1e9, frameNo = 0, inShadowRender = false;
const passStats: Record<string, { casters: number; proxies: number; instances: number }> = {};
const sphere = new Sphere(), m4 = new Matrix4(), sv = new Vector3();

function assetOf(o: Object3D | null): { assetId: string | null; vehicle: boolean; guide: boolean; proxy: boolean } {
  let assetId: string | null = null, vehicle = false, guide = false, proxy = false;
  for (let p: Object3D | null = o; p; p = p.parent) {
    const u = p.userData;
    if (u.shadowProxy) proxy = true;
    if (u.vehicle || u.vehicleId) vehicle = true;
    if (p.name === 'world-guide-G24' || u.assetId === 'G24') guide = true;
    if (!assetId && typeof u.assetId === 'string') assetId = u.assetId;
  }
  return { assetId, vehicle, guide, proxy };
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
      c = { mesh, instanced, spheres: new Float32Array(0), root: meta.guide ? guideRoot(mesh) : null, animated, cast: true, proxies: [], fire: null, merged: false };
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

/** Rigid instanced casters (rocks, props, benches, fire ring, tent frames, greybox blocks: no wind, no cloth,
 * no custom depth material) are merged per 8 m ground cell and material side into shadow-only world-space
 * meshes, in two variants: full geometry for c0/c1 and a far variant (instances >= FAR_MIN_RADIUS, convex
 * hulls where available) for c2. One draw per cell instead of one per part, which is what bounds the
 * shadow pass draw calls; each cascade only draws the cells whose light-space footprint it needs. */
type Chunk = { full: Mesh | null; far: Mesh | null; sphere: Sphere; farSphere: Sphere };
let chunks: Chunk[] = [];
let chunkKey = '';
/** Merge cell sizes (m): c0/c1 cells stay small so culling still bites near the body; c2 cells are large
 * (the far window spans ~100 m), which is what bounds its draw calls. */
const CHUNK = 8, FAR_CHUNK = 32;
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
  const rigid = [...casters.values()].filter(c => c.instanced && !c.animated && !c.fire?.match(/guide|vehicle/) && !Array.isArray(c.mesh.material) && !c.mesh.customDepthMaterial);
  const key = rigid.map(c => `${c.mesh.uuid}:${(c.mesh as InstancedMesh).count}`).join('|');
  for (const c of casters.values()) c.merged = false;
  for (const c of rigid) c.merged = true;
  if (key === chunkKey) return;
  chunkKey = key;
  for (const ch of chunks) for (const m of [ch.full, ch.far]) if (m) { proxyGroup.remove(m); m.geometry.dispose(); }
  const buckets = new Map<string, { side: number; full: [number[], number[]]; zones: Map<string, number> }>(), farBuckets = new Map<string, { side: number; far: [number[], number[]]; zones: Map<string, number> }>();
  // Budget attribution (QA): each merged chunk reports the zone that contributes most of its triangles.
  const tally = (zones: Map<string, number>, zone: string, g: BufferGeometry) => zones.set(zone, (zones.get(zone) ?? 0) + (g.index ? g.index.count : g.getAttribute('position').count));
  const top = (zones: Map<string, number>) => [...zones.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other';
  const v = new Vector3();
  const push = (dst: [number[], number[]], g: BufferGeometry, matrix: Matrix4) => {
    const pos = g.getAttribute('position'), idx = g.index, base = dst[0].length / 3;
    for (let j = 0; j < pos.count; j++) { v.fromBufferAttribute(pos, j).applyMatrix4(matrix); dst[0].push(v.x, v.y, v.z); }
    if (idx) for (let j = 0; j < idx.count; j++) dst[1].push(base + idx.getX(j)); else for (let j = 0; j < pos.count; j++) dst[1].push(base + j);
  };
  for (const c of rigid) {
    const src = c.mesh as InstancedMesh, g = src.geometry, hull = farHull(g), side = (src.material as Material).side, s = c.spheres, zone = budgetZoneOf(src);
    for (let i = 0; i < src.count; i++) {
      const k = `${Math.floor(s[i * 4] / CHUNK)},${Math.floor(s[i * 4 + 2] / CHUNK)},${side}`;
      let b = buckets.get(k);
      if (!b) { b = { side, full: [[], []], zones: new Map() }; buckets.set(k, b); }
      src.getMatrixAt(i, m4); m4.premultiply(src.matrixWorld);
      push(b.full, g, m4); tally(b.zones, zone, g);
      if (s[i * 4 + 3] < FAR_MIN_RADIUS) continue;
      const fk = `${Math.floor(s[i * 4] / FAR_CHUNK)},${Math.floor(s[i * 4 + 2] / FAR_CHUNK)},${side}`;
      let fb = farBuckets.get(fk);
      if (!fb) { fb = { side, far: [[], []], zones: new Map() }; farBuckets.set(fk, fb); }
      push(fb.far, hull ?? g, m4); tally(fb.zones, zone, hull ?? g);
    }
  }
  chunks = [
    ...[...buckets.entries()].map(([k, b]) => { const full = makeChunkMesh(b.full[0], b.full[1], b.side, `sun-chunk-${k}`); if (full) full.userData.budgetZone = top(b.zones); return { full, far: null, sphere: full?.geometry.boundingSphere?.clone() ?? new Sphere(), farSphere: new Sphere() }; }),
    ...[...farBuckets.entries()].map(([k, b]) => { const far = makeChunkMesh(b.far[0], b.far[1], b.side, `sun-chunk-far-${k}`); if (far) far.userData.budgetZone = top(b.zones); return { full: null, far, sphere: new Sphere(), farSphere: far?.geometry.boundingSphere?.clone() ?? new Sphere() }; }),
  ];
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

function applySunPass(k: number) {
  let nCasters = 0, nProxies = 0, nInstances = 0;
  fireStatic.castShadow = false;
  for (const ch of chunks) {
    if (ch.full) ch.full.castShadow = k < 2 && inCascade(k, ch.sphere.center.x, ch.sphere.center.y, ch.sphere.center.z, ch.sphere.radius, true);
    if (ch.far) ch.far.castShadow = k === 2 && inCascade(k, ch.farSphere.center.x, ch.farSphere.center.y, ch.farSphere.center.z, ch.farSphere.radius, true);
    if (ch.full?.castShadow || ch.far?.castShadow) nProxies++;
  }
  for (const c of casters.values()) {
    if (!c.cast || c.merged) { c.mesh.castShadow = false; for (const p of c.proxies) p.castShadow = false; continue; }
    if (c.instanced) {
      c.mesh.castShadow = false;
      const src = (c.mesh as InstancedMesh).instanceMatrix.array as Float32Array, s = c.spheres;
      c.proxies.forEach((p, j) => { if (j !== k) p.castShadow = false; });
      const p = c.proxies[k], dst = p.instanceMatrix.array as Float32Array;
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
      if (c.mesh.castShadow) nCasters++;
    }
  }
  passStats[`sun-c${k}`] = { casters: nCasters, proxies: nProxies, instances: nInstances };
}

export interface FirePassSpec { position: Vector3; range: number; }
/** One point-light face: only the fire whitelist within `range` that intersects this face frustum. */
export function applyFirePass(face: number, frustum: Frustum, spec: FirePassSpec) {
  if (!inShadowRender) return;
  let n = 0;
  const rangeOk = (x: number, z: number) => Math.hypot(x - spec.position.x, z - spec.position.z) <= spec.range;
  for (const c of casters.values()) {
    for (const p of c.proxies) p.castShadow = false;
    if (!c.cast || (c.fire !== 'guide' && c.fire !== 'vehicle')) { c.mesh.castShadow = false; continue; }
    meshSphere(c, sphere);
    c.mesh.castShadow = rangeOk(sphere.center.x, sphere.center.z) && frustum.intersectsSphere(sphere);
    if (c.mesh.castShadow) n++;
  }
  for (const ch of chunks) { if (ch.full) ch.full.castShadow = false; if (ch.far) ch.far.castShadow = false; }
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
  inShadowRender = false;
  proxyGroup.visible = false;
  for (const c of casters.values()) {
    c.mesh.castShadow = c.cast;
    for (const p of c.proxies) p.castShadow = false;
  }
  fireStatic.castShadow = false;
  for (const ch of chunks) { if (ch.full) ch.full.castShadow = false; if (ch.far) ch.far.castShadow = false; }
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
  viewValid = !wide;
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
