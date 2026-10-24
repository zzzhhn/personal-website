import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import {
  BufferGeometry, Color, Float32BufferAttribute, IcosahedronGeometry, InstancedMesh, MeshStandardMaterial, Object3D, RepeatWrapping, Sphere, Uint32BufferAttribute, Vector3,
  SRGBColorSpace, TextureLoader, type Material, type Texture,
} from 'three';
import { BUILDINGS, FOUNDATIONS, GROUND_Y } from './layout';
import { LAYOUT_V4, keepOutV4 } from './layout-v4';
import { buildTerrain, createTerrainGeometry, grassCandidateJob, scatterCandidates, SHORE_GLSL, shoreUniforms, terrainColours, type ScatterBlocker } from './WorldLandform';
import { useWorldStore } from './store';
import { buildLodTiles, lodIndices } from './WorldTerrainLod';
import { chunkKey, paveClearance } from './WorldTerrainPaving';
import { useIsClaimed } from './WorldVisualClaims';
import { windUniforms } from './WorldWind';
import WorldGrass, { ActorTracker, actorState, grassDebug } from './WorldGrass';
import { seaSpotDebug } from './WorldSea';

/** quality-v3 island ground: one 0.5 m faceted terrain (WorldLandform) rendered with vertex
 * colours plus world-space detail and swash-driven wet sand, and the same triangles as the
 * Rapier ground (walk/drive tops `surface`, faces steeper than 25 deg `solid`). */

const NOISE = /* glsl */`
float tHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float tNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), u.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

/** Ground look, quality-v4 (Astra ruling, spec §13: PBR detail is the default, procedural v4 is
 * the fallback). Both keep the Art Lock palette and matte intent: per-vertex mottling
 * (WorldLandform), world-space patch noise in hue and value, slope/height material mixing, worn
 * paths, roughness 0.86-1.0 with weakened dielectric specular (F0 0.016, F90 0.4).
 * Default: CC0 ambientCG grass/sand/dirt detail on world-xz UVs, colour-preserving (texture /
 * its mean multiplies the vertex colour, so hue stays Art Lock), normal + roughness channels,
 * two-sample rotated tiling to break repetition, blended by per-vertex material weights. The
 * faceted micro relief is off here (Bobby: origami look up close); the normal map carries detail.
 * Fallback `?groundPbr=0`: no textures; 0.45 m triangular micro facets (<= 5 deg) instead. */
export const GROUND_PBR = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('groundPbr') !== '0';
const PBR_SETS = ['grass', 'sand', 'dirt'] as const;
/** Mean sRGB albedo of each downsized texture (public/assets/world/terrain/SOURCES.json). */
const PBR_MEAN: Record<(typeof PBR_SETS)[number], [number, number, number]> = { grass: [96.4, 108.6, 48.4], sand: [155.7, 138.7, 109.6], dirt: [152.4, 146.8, 87.5] };
const srgbToLinear = (c: number) => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };

function loadPbr() {
  const loader = new TextureLoader(), tex: Texture[] = [];
  for (const k of PBR_SETS) for (const kind of ['albedo.jpg', 'nr.png']) {
    const t = loader.load(`/assets/world/terrain/${k}_${kind}`);
    t.wrapS = t.wrapT = RepeatWrapping; t.anisotropy = 4;
    if (kind === 'albedo.jpg') t.colorSpace = SRGBColorSpace;
    tex.push(t);
  }
  return tex;
}

function createGroundMaterial(pbr: Texture[] | null) {
  const material = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
  material.name = pbr ? 'island-terrain-v4-pbr' : 'island-terrain-v4';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, shoreUniforms(), { uSeaTime: windUniforms.uWindTime, uSeaMotion: windUniforms.uWindStrength });
    if (pbr) {
      PBR_SETS.forEach((k, i) => {
        shader.uniforms[`uAlb${i}`] = { value: pbr[i * 2] }; shader.uniforms[`uNr${i}`] = { value: pbr[i * 2 + 1] };
        shader.uniforms[`uMean${i}`] = { value: PBR_MEAN[k].map(srgbToLinear) };
      });
    }
    shader.vertexShader = 'attribute vec4 groundMix;\nvarying vec4 vGroundMix;\nvarying vec3 vTerrainWorld;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vGroundMix = groundMix;`);
    const pbrHead = pbr ? `
uniform sampler2D uAlb0; uniform sampler2D uAlb1; uniform sampler2D uAlb2;
uniform sampler2D uNr0; uniform sampler2D uNr1; uniform sampler2D uNr2;
uniform vec3 uMean0; uniform vec3 uMean1; uniform vec3 uMean2;
// Anti-tiling: three samples per texture (base, 37 deg rotated + offset at 1.13x, 71 deg
// rotated + offset at 0.87x) with noise weights that change over ~4-9 m, so the repeat
// never forms a visible grid (no square paving read on large plazas).
vec2 rotA(vec2 uv) { return mat2(0.7986, -0.6018, 0.6018, 0.7986) * uv * 1.13 + vec2(0.37, 0.71); }
vec2 rotB(vec2 uv) { return mat2(0.3256, 0.9455, -0.9455, 0.3256) * uv * 0.87 + vec2(0.61, 0.19); }
vec4 tileMix(sampler2D t, vec2 uv, vec3 w) { return texture2D(t, uv) * w.x + texture2D(t, rotA(uv)) * w.y + texture2D(t, rotB(uv)) * w.z; }
` : '';
    shader.fragmentShader = `varying vec3 vTerrainWorld;\nvarying vec4 vGroundMix;\nuniform float uSeaTime; uniform float uSeaMotion;\n${NOISE}${SHORE_GLSL}${pbrHead}` + shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec2 tp = vTerrainWorld.xz;
      // Fade sub-metre terms once a pixel covers more than ~25 cm of ground.
      float tFine = 1.0 - smoothstep(0.08, 0.25, length(fwidth(tp)));
      float tWalk = clamp(vGroundMix.x + vGroundMix.y + vGroundMix.z, 0.0, 1.0);
      // Patch noise: value +-6 % at 1.6 m, +-5 % at 0.45 m, and a 9 m warm/cool hue drift.
      float hue = (tNoise(tp / 9.0 + 3.7) - 0.5) * 0.08;
      diffuseColor.rgb *= (1.0 + (tNoise(tp / 1.6) - 0.5) * 0.12 + (tNoise(tp / 0.45) - 0.5) * 0.1 * tFine) * vec3(1.0 + hue, 1.0, 1.0 - hue);
      // Grass reads cooler and darker in its low hollows, drier on crests (height mixing).
      diffuseColor.rgb *= mix(1.0, 0.92 + 0.12 * smoothstep(0.2, 0.8, tNoise(tp / 4.3 + 9.1)), vGroundMix.x);
      ${pbr ? `
      vec2 puv = tp / 2.5;
      vec3 pm = vec3(tNoise(tp / 4.3 + 21.0), tNoise(tp / 6.1 - 13.0), tNoise(tp / 8.7 + 5.0));
      pm = pm * pm * pm; pm /= pm.x + pm.y + pm.z;
      vec3 gw = vGroundMix.xyz / max(vGroundMix.x + vGroundMix.y + vGroundMix.z, 1e-3);
      // Dirt (Ground037) carries moss: use its luminance only so trodden ground stays Art Lock earth.
      vec3 dirt = tileMix(uAlb2, puv * 1.2, pm).rgb / uMean2;
      dirt = vec3(dot(dirt, vec3(0.299, 0.587, 0.114)));
      vec3 ratio = gw.x * tileMix(uAlb0, puv, pm).rgb / uMean0 + gw.y * tileMix(uAlb1, puv * 1.6, pm).rgb / uMean1 + gw.z * dirt;
      // Colour-preserving detail: the texture modulates the Art Lock vertex colour, faded far away.
      diffuseColor.rgb *= mix(vec3(1.0), clamp(ratio, 0.45, 1.6), tWalk * (0.35 + 0.65 * tFine));
      vec4 nrS = gw.x * tileMix(uNr0, puv, pm) + gw.y * tileMix(uNr1, puv * 1.6, pm) + gw.z * tileMix(uNr2, puv * 1.2, pm);` : ''}
      // Wet sand follows the swash (0-1.5 m), lagging the foam by 0.8 s; not on the seawall.
      vec4 sh = shoreSample(tp);
      float landD = -shoreSigned(sh);
      float tWet = 0.0;
      if (landD > -0.6 && vTerrainWorld.y < ${(GROUND_Y - .02).toFixed(2)}) {
        float reach = 1.5 * shoreSwash(tp, (uSeaTime - 0.8) * step(0.001, uSeaMotion)) + 0.15;
        tWet = (1.0 - smoothstep(reach - 0.35, reach + 0.15, landD)) * (1.0 - sh.b);
        diffuseColor.rgb *= mix(1.0, 0.8, tWet);
      }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      // Matte with variation: 0.86-1.0 (wet sand 0.72) instead of one uniform sheen.
      roughnessFactor = mix(0.86, 1.0, tNoise(tp / 1.1 + 5.3)) ${pbr ? '* mix(1.0, 0.75 + 0.25 * nrS.b, tWalk)' : ''};
      roughnessFactor = mix(roughnessFactor, 0.72, tWet);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        // Fallback only: faceted micro relief on walkable ground (skewed triangular 0.45 m lattice,
        // <= 5 deg hash tilt, calmed by 3 m noise). With PBR its weight is 0 and the texture normal
        // (0.55, faded with distance) gives the near-field relief instead.
        vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
        if (nW.y > 0.82 && tWalk > 0.01) {
          vec2 q = mat2(1.0, 0.0, 0.57735, 1.1547) * (tp / 0.45);
          vec2 cell = floor(q), f = fract(q);
          float upper = step(f.y, f.x);
          vec2 id = cell * 2.0 + vec2(upper, 0.0);
          vec2 tilt = vec2(tHash(id + 17.0), tHash(id + 43.0)) - 0.5;
          float calm = 0.45 + 0.55 * tNoise(tp / 3.0 + 2.0);
          vec3 pert = vec3(tilt.x, 0.0, tilt.y) * ${pbr ? '0.0' : '0.17'} * calm * tFine * tWalk;
          ${pbr ? 'pert += vec3(nrS.r * 2.0 - 1.0, 0.0, -(nrS.g * 2.0 - 1.0)) * 0.55 * tWalk * (0.4 + 0.6 * tFine);' : ''}
          normal = normalize((viewMatrix * vec4(normalize(nW + pert), 0.0)).xyz);
        }
      }`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
      // Weaker dielectric specular for soil/grass: removes the plastic grazing sheen.
      material.specularColor = vec3(0.016); material.specularColorBlended = vec3(0.016); material.specularF90 = 0.4;`);
  };
  material.customProgramCacheKey = () => pbr ? 'island-terrain-v4-pbr' : 'island-terrain-v4';
  return material;
}

/** Footprints where ground detail must not appear (buildings, forecourts, foundations, blocks). */
const SCATTER_BLOCKERS: ScatterBlocker[] = [
  ...BUILDINGS.flatMap(({ position: [x, , z], size: [w, , d] }) => [
    { minX: x - w / 2 - .6, maxX: x + w / 2 + .6, minZ: z - d / 2 - .6, maxZ: z + d / 2 + .6 },
    { minX: x + w / 2, maxX: x + w / 2 + 5.6, minZ: z - d / 2 - 1, maxZ: z + d / 2 + 3.6 },
  ]),
  ...FOUNDATIONS.map(({ position: [x, , z], size: [w, , d] }) => ({ minX: x - w / 2 - .4, maxX: x + w / 2 + .4, minZ: z - d / 2 - .4, maxZ: z + d / 2 + .4 })),
  ...(LAYOUT_V4 ? keepOutV4().map(([minX, minZ, maxX, maxZ]) => ({ minX: minX - .4, maxX: maxX + .4, minZ: minZ - .4, maxZ: maxZ + .4 })) : [
    ...[[-18, 8], [-13, -8], [-12, -24], [-4, -45]].map(([x, z]) => ({ minX: x - 4.4, maxX: x + 4.4, minZ: z - 3.9, maxZ: z + 3.9 })),
    { minX: 16, maxX: 24, minZ: 8, maxZ: 16 }, // coastal parking bay
  ]),
  { minX: -45, maxX: -39, minZ: 27, maxZ: 33 }, // fire pit
  { minX: -31, maxX: -29, minZ: 30, maxZ: 38 }, // camp exit lamps
];

function pebbleGeometry() {
  const g = new IcosahedronGeometry(.11, 0); // 20 triangles
  g.scale(1, .45, .8); g.translate(0, .02, 0);
  return g;
}
const SCATTER_RADIUS = 40;
/** One instanced draw per class; instances are refilled from fixed candidates within 40 m of
 * the camera focus whenever the focus moves more than 2 m (no per-frame matrix uploads). */
function Scatter({ name, data, geometry, material, tint, cap }: { name: string; data: Float32Array; geometry: BufferGeometry; material: Material; tint: (i: number) => Color; cap: number }) {
  const ref = useRef<InstancedMesh>(null);
  const count = data.length / 5;
  const last = useRef<[number, number]>([1e9, 1e9]);
  const refill = (fx: number, fz: number) => {
    const mesh = ref.current; if (!mesh) return;
    const dummy = new Object3D(); let n = 0;
    // Nearest first, capped (grass + pebbles budget); candidates beyond the cap are dropped.
    const near: [number, number][] = [];
    for (let i = 0; i < count; i++) { const d2 = (data[i * 5] - fx) ** 2 + (data[i * 5 + 2] - fz) ** 2; if (d2 <= SCATTER_RADIUS * SCATTER_RADIUS) near.push([d2, i]); }
    if (near.length > cap) { near.sort((a, b) => a[0] - b[0]); near.length = cap; }
    for (const [, i] of near) {
      const x = data[i * 5], z = data[i * 5 + 2];
      const s = .55 + data[i * 5 + 4] * 1.0;
      dummy.position.set(x, data[i * 5 + 1] - .015, z); dummy.rotation.set(0, data[i * 5 + 3], 0); dummy.scale.setScalar(s); dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix); mesh.setColorAt(n, tint(i)); n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  };
  useLayoutEffect(() => { const p = useWorldStore.getState().position; last.current = [p[0], p[2]]; refill(p[0], p[2]); });
  useFrame(({ camera }) => {
    const shot = useWorldStore.getState().shot, p = useWorldStore.getState().position;
    // QA shots look at the whole island: centre on the camera's ground target instead.
    const fx = shot ? camera.position.x - camera.position.y * .6 : p[0], fz = shot ? camera.position.z - camera.position.y * .6 : p[2];
    if (Math.hypot(fx - last.current[0], fz - last.current[1]) < 2) return;
    last.current = [fx, fz]; refill(fx, fz);
  });
  return <instancedMesh ref={ref} name={name} args={[geometry, material, Math.max(1, count)]} receiveShadow frustumCulled={false} />;
}

/** Wall-clock span of the sliced grass build (QA). */
const grassBuild = { ms: 0 };
/** Triangles per pebble (IcosahedronGeometry detail 0). */
const PEBBLE_TRIANGLES = 20;

/** QA entry only: expose ground/grass/sea-spot state (read-only) on window.__worldEnv. */
function EnvDebug() {
  const { scene } = useThree();
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('qa') !== '1') return;
    const w = window as unknown as { __worldEnv?: unknown };
    const hidden: { visible: boolean }[] = [];
    w.__worldEnv = { terrainLod: () => ({ ...terrainLodDebug }), grass: () => ({ ...grassDebug, trampleAt: undefined }), trampleAt: (x: number, z: number) => grassDebug.trampleAt(x, z), sea: () => seaSpotDebug.spots, actors: () => actorState.actors.map(a => ({ ...a })), groundPbr: GROUND_PBR,
      // A/B cost probe only: hide/show the grass draw.
      setGrassVisible: (on: boolean) => { const g = scene.getObjectByName('ground-grass-blades'); if (g) g.visible = on; return !!g; },
      // A/B cost probe only: hide every object whose name matches the RegExp source; restore() undoes it.
      hideByName: (pattern: string) => { const re = new RegExp(pattern), hit: { visible: boolean }[] = []; scene.traverse(o => { if (o.name && re.test(o.name) && o.visible) { o.visible = false; hit.push(o); } }); hidden.push(...hit); return hit.length; },
      restore: () => { for (const o of hidden.splice(0)) o.visible = true; },
      // Ground-detail budget (spec §3: grass + pebbles + other scatter <= 60k visible triangles).
      groundDetail: () => {
        const pebbles = (scene.getObjectByName('ground-pebbles') as InstancedMesh | undefined)?.count ?? 0;
        return { grassTufts: grassDebug.instances, grassTriangles: grassDebug.triangles, pebbles, pebbleTriangles: pebbles * PEBBLE_TRIANGLES,
          totalTriangles: grassDebug.triangles + pebbles * PEBBLE_TRIANGLES, budget: 40000, grassBuildMs: grassBuild.ms };
      } };
    return () => { delete w.__worldEnv; };
  }, [scene]);
  return null;
}

/** Layout v4 (spec §12.4): the visual terrain is four spatial chunks sharing one vertex buffer, each
 * with its own index buffer and culling sphere, and a crack-free render LOD (WorldTerrainLod): 16 m
 * tiles within 28 m of the focus keep the 0.5 m mesh, farther tiles draw 2 m fans stitched to their
 * fine neighbours. Indices are rebuilt only when the focus moves > 6 m. Colliders stay the full
 * 0.5 m trimesh pair (physics is unaffected). */
function TerrainLodChunks({ geometry, material }: { geometry: BufferGeometry; material: Material }) {
  // Blocks fully under opaque field paving (>= 0.6 m inside its outer edge) are skipped while `paved` is
  // claimed, i.e. while WorldTerrainRoads is actually mounted; otherwise the full ground is drawn.
  const tiles = useMemo(() => buildLodTiles(chunkKey, (x, z) => paveClearance(x, z) < -.6), []);
  const open = useIsClaimed('paved');
  const subs = useMemo(() => {
    const pos = geometry.getAttribute('position'), out: BufferGeometry[] = [];
    for (let c = 0; c < 4; c++) {
      const sub = new BufferGeometry();
      for (const name of Object.keys(geometry.attributes)) sub.setAttribute(name, geometry.getAttribute(name));
      // Culling sphere from the chunk's full-resolution tiles (LOD never leaves this box).
      const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity), v = new Vector3();
      for (const T of tiles) if (T.chunk === c) for (const i of T.fine) { v.fromBufferAttribute(pos, i); min.min(v); max.max(v); }
      const centre = min.clone().add(max).multiplyScalar(.5);
      sub.boundingSphere = new Sphere(centre, Number.isFinite(centre.x) ? centre.distanceTo(max) : 0);
      out.push(sub);
    }
    return out;
  }, [geometry, tiles]);
  const last = useRef<[number, number] | null>(null), openRef = useRef(open);
  openRef.current = open;
  const apply = (x: number, z: number) => {
    const L = lodIndices(tiles, x, z, undefined, openRef.current);
    subs.forEach((g, c) => { const idx = L.chunks.get(c) ?? new Uint32Array(0); g.setIndex(new Uint32BufferAttribute(idx, 1)); g.setDrawRange(0, idx.length); });
    terrainLodDebug.triangles = L.triangles; terrainLodDebug.fineTiles = L.fineTiles; terrainLodDebug.updates++;
    last.current = [x, z];
  };
  useLayoutEffect(() => { const p = useWorldStore.getState().position; apply(p[0], p[2]); }, [subs, open]);
  useFrame(({ camera }) => {
    const st = useWorldStore.getState(), p = st.position;
    // QA shots look at the whole island from far away: centre on the camera's ground target.
    const fx = st.shot ? camera.position.x - camera.position.y * .6 : p[0], fz = st.shot ? camera.position.z - camera.position.y * .6 : p[2];
    if (last.current && Math.hypot(fx - last.current[0], fz - last.current[1]) < 6) return;
    apply(fx, fz);
  });
  useEffect(() => () => subs.forEach(g => g.dispose()), [subs]);
  return <>{subs.map((g, i) => <mesh key={i} name={`island-terrain-v4-chunk-${i}`} geometry={g} material={material} receiveShadow />)}</>;
}
/** QA: current render LOD state. */
export const terrainLodDebug = { triangles: 0, fineTiles: 0, updates: 0 };

export function IslandTerrain() {
  const terrain = useMemo(buildTerrain, []);
  const geometry = useMemo(() => {
    const g = createTerrainGeometry();
    const { colours, groundMix } = terrainColours(g.getAttribute('normal').array);
    g.setAttribute('color', new Float32BufferAttribute(colours, 3));
    g.setAttribute('groundMix', new Float32BufferAttribute(groundMix, 4));
    return g;
  }, []);
  const pbr = useMemo(() => GROUND_PBR ? loadPbr() : null, []);
  const material = useMemo(() => createGroundMaterial(pbr), [pbr]);
  const scatter = useMemo(() => scatterCandidates(SCATTER_BLOCKERS), []);
  // Grass candidates (~1 s of CPU in one go) are built in <= 6 ms slices on idle callbacks, so the
  // first frames are not blocked; the grass fades in once the build completes.
  const [blades, setBlades] = useState(() => new Float32Array(0));
  useEffect(() => {
    const job = grassCandidateJob(SCATTER_BLOCKERS), w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    let handle = 0, done = false; const t0 = performance.now();
    const tick = () => {
      if (done) return;
      if (job.step(6)) { done = true; grassBuild.ms = Math.round(performance.now() - t0); setBlades(job.result()); return; }
      handle = w.requestIdleCallback ? w.requestIdleCallback(tick, { timeout: 50 }) : window.setTimeout(tick, 0);
    };
    tick();
    return () => { done = true; if (w.cancelIdleCallback) w.cancelIdleCallback(handle); else window.clearTimeout(handle); };
  }, []);
  const pebble = useMemo(pebbleGeometry, []);
  const pebbleMat = useMemo(() => new MeshStandardMaterial({ vertexColors: false, roughness: 1, flatShading: true }), []);
  const pebbleTint = useMemo(() => { const a = new Color('#8C8276'), b = new Color('#B4A896'), c = new Color(); return (i: number) => c.copy(a).lerp(b, scatter.pebbles[i * 5 + 4]); }, [scatter]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); pebble.dispose(); pebbleMat.dispose(); pbr?.forEach(t => t.dispose()); }, [geometry, material, pebble, pebbleMat, pbr]);
  return <group name="island-terrain-v4">
    {/* Same triangles as the mesh: tops are support-only `surface`, steep faces `solid`. */}
    <RigidBody name="island-terrain-surface" type="fixed" colliders={false} userData={{ surface: true }}>
      <TrimeshCollider name="island-terrain-surface-top" args={[terrain.positions, terrain.surface]} friction={.95} restitution={0} />
    </RigidBody>
    <RigidBody name="island-terrain-solid" type="fixed" colliders={false} userData={{ solid: true }}>
      <TrimeshCollider name="island-terrain-solid-faces" args={[terrain.positions, terrain.solid]} friction={.65} restitution={.05} />
    </RigidBody>
    {LAYOUT_V4 ? <TerrainLodChunks geometry={geometry} material={material} />
      : <mesh name="island-terrain-v3-mesh" geometry={geometry} material={material} receiveShadow />}
    <ActorTracker />
    <EnvDebug />
    <WorldGrass data={blades} />
    <Scatter name="ground-pebbles" data={scatter.pebbles} geometry={pebble} material={pebbleMat} tint={pebbleTint} cap={160} />
  </group>;
}
