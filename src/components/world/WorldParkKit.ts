import { BufferAttribute, BufferGeometry, Color, Euler, Matrix3, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { Vec3 } from './types';

/**
 * Park static batch kit. Every static park part (GLB nodes and runtime-procedural decks) is converted
 * to one attribute layout (position, normal, color, aEmit) and merged, so the whole district draws
 * with one matte vertex-coloured material. Emission is per vertex: emissive = color * (aEmit.x +
 * aEmit.y * night), driven by the shared dusk/night clock. Art Lock light-tech stays the cyan booth
 * strip only; everything else that glows is warm (bulbs, lanterns, frosted windows, hut interiors).
 */
let draco: DRACOLoader | null = null;
export function withDraco(loader: GLTFLoader) {
  if (!draco) { draco = new DRACOLoader(); draco.setDecoderPath('/assets/world/draco/'); }
  loader.setDRACOLoader(draco);
}
export const parkUrl = (id: string) => `/assets/world/park/${id}.glb`;
export type { GLTF };

/** Blender material name -> sRGB colour and [dusk, night] emission factors. */
/** emit = [dusk, night, warm]: warm 1 tints the emission toward the Art Lock window gold #FFC978. */
export type Emit = [number, number, number?];
export const PARK_MATERIALS: Record<string, { color: string; emit?: Emit }> = {
  park_slate_paint: { color: '#4E647D' }, park_roof_slate: { color: '#3A4A5C' },
  park_cream_paint: { color: '#E6DCCB', emit: [0, 0.22, 1] },
  park_wood_light: { color: '#B99469' }, park_wood_mid: { color: '#8E6E55' }, park_wood_dark: { color: '#5A4634' }, park_wood_deck: { color: '#9C7A58' },
  park_stone: { color: '#8A8580' }, park_stone_dark: { color: '#8C8276' }, park_stone_light: { color: '#B4A896' },
  park_brass_matte: { color: '#B8975A' }, park_iron_matte: { color: '#5E5B57' }, park_rubber: { color: '#2B2A29' },
  park_canvas_cream: { color: '#E6DCCB' }, park_canvas_olive: { color: '#7E8C3E' }, park_canvas_orange: { color: '#E8803A' },
  park_glass_frosted: { color: '#D9D2C2', emit: [0, 0.85, 1] }, park_screen: { color: '#1C2A33' }, park_chalkboard: { color: '#2F3D38' },
  park_accent_slate: { color: '#4E647D' }, park_accent_olive: { color: '#8AA24A' }, park_accent_orange: { color: '#E8803A' }, park_accent_brick: { color: '#8E6E55' },
  park_vinyl: { color: '#1E1D1C' },
  // Booth border strip (Art Lock light-tech #4): barely lit at dusk, medium at night.
  park_cyan_glow: { color: '#4FD1C5', emit: [0.18, 1.5] },
  park_bulb_warm: { color: '#FFE2B0', emit: [0.35, 2.2] },
};

export const parkNight = { value: 0 };
let sharedMaterial: MeshStandardMaterial | null = null;
/** One matte material for all static park geometry (roughness by Art Lock: matte, no gloss). */
export function parkMaterial() {
  if (sharedMaterial) return sharedMaterial;
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
  m.name = 'park-static-matte';
  m.onBeforeCompile = shader => {
    shader.uniforms.uParkNight = parkNight;
    shader.vertexShader = 'attribute vec3 aEmit;\nvarying vec3 vEmit;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vEmit = aEmit;');
    shader.fragmentShader = 'uniform float uParkNight;\nvarying vec3 vEmit;\n' + shader.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n  vec3 parkEmit = mix(diffuseColor.rgb, vec3(1.0, 0.79, 0.47) * max(max(diffuseColor.r, diffuseColor.g), 0.55), vEmit.z);\n  totalEmissiveRadiance += parkEmit * (vEmit.x + vEmit.y * uParkNight);');
  };
  m.customProgramCacheKey = () => 'park-static-matte-v2';
  sharedMaterial = m;
  return m;
}

const tmpColor = new Color();
/** Non-indexed geometry with the batch layout, baked into world space by `matrix`. */
function toBatch(source: BufferGeometry, matrix: Matrix4, color: string, emit: Emit = [0, 0, 0], jitter = 0, seed = 0) {
  const g = (source.index ? source.toNonIndexed() : source.clone());
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  g.applyMatrix4(matrix);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3), em = new Float32Array(n * 3);
  tmpColor.set(color);
  const k = jitter ? 1 + jitter * (hash(seed) * 2 - 1) : 1;
  for (let i = 0; i < n; i++) { col[i * 3] = tmpColor.r * k; col[i * 3 + 1] = tmpColor.g * k; col[i * 3 + 2] = tmpColor.b * k; em[i * 3] = emit[0]; em[i * 3 + 1] = emit[1]; em[i * 3 + 2] = emit[2] ?? 0; }
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setAttribute('aEmit', new BufferAttribute(em, 3));
  return g;
}
export const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/** Convert GLB meshes under `root` (optionally filtered by top node name) into batch pieces. */
export function gltfPieces(root: Object3D, placement: Matrix4, keep: (node: string) => boolean = () => true) {
  root.updateMatrixWorld(true);
  const out: BufferGeometry[] = [], m = new Matrix4();
  root.traverse(o => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const node = topName(mesh, root);
    if (!keep(node)) return;
    const name = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material).name;
    const spec = PARK_MATERIALS[name] ?? { color: '#FF00FF' };
    out.push(toBatch(mesh.geometry, m.multiplyMatrices(placement, mesh.matrixWorld), spec.color, spec.emit));
  });
  return out;
}
/** Name of the child of `root` that contains `o` (GLB part node). */
export function topName(o: Object3D, root: Object3D) {
  let n: Object3D = o, name = o.name;
  while (n.parent && n.parent !== root) { n = n.parent; if (n.name) name = n.name; }
  return n.name || name;
}

/** World-space triangle soup of GLB nodes for fixed trimesh colliders (same matrices as the visual). */
export function gltfTrimesh(root: Object3D, placement: Matrix4, keep: (node: string) => boolean) {
  root.updateMatrixWorld(true);
  const pos: number[] = [], m = new Matrix4(), v = new Vector3();
  root.traverse(o => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || !keep(topName(mesh, root))) return;
    m.multiplyMatrices(placement, mesh.matrixWorld);
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); pos.push(v.x, v.y, v.z); }
    if (g !== mesh.geometry) g.dispose();
  });
  const vertices = new Float32Array(pos), indices = new Uint32Array(pos.length / 3);
  for (let i = 0; i < indices.length; i++) indices[i] = i;
  return { vertices, indices };
}

export function mergeBatch(pieces: BufferGeometry[]) {
  const merged = mergeGeometries(pieces, false);
  pieces.forEach(p => p.dispose());
  if (!merged) throw new Error('park batch merge failed');
  merged.computeBoundingSphere(); merged.computeBoundingBox();
  return merged;
}

export const yawMatrix = (p: Vec3, yaw: number) => new Matrix4().compose(new Vector3(...p), new Quaternion().setFromEuler(new Euler(0, yaw, 0)), new Vector3(1, 1, 1));

/**
 * Procedural parts with the batch layout. Boxes may get a chamfered top (`inset`), a per-piece colour
 * jitter (deterministic by `seed`) and a world transform. Prisms (`cyl`) are faceted posts / piles.
 */
export class ParkGeo {
  pieces: BufferGeometry[] = [];
  triangles = 0;
  private push(g: BufferGeometry, matrix: Matrix4, color: string, emit?: Emit, jitter = 0, seed = 0) {
    const b = toBatch(g, matrix, color, emit, jitter, seed); g.dispose();
    this.triangles += b.getAttribute('position').count / 3; this.pieces.push(b);
  }
  /** Box of `size` centred at `center` in the frame `frame` (default identity), optional top inset. */
  box(center: Vec3, size: Vec3, color: string, o: { frame?: Matrix4; yaw?: number; pitch?: number; inset?: number; jitter?: number; seed?: number; emit?: Emit } = {}) {
    const [sx, sy, sz] = size.map(v => v / 2), i = Math.min(o.inset ?? 0, sx * 0.45, sz * 0.45);
    const P = [[-sx, -sy, -sz], [sx, -sy, -sz], [sx, -sy, sz], [-sx, -sy, sz], [-sx + i, sy, -sz + i], [sx - i, sy, -sz + i], [sx - i, sy, sz - i], [-sx + i, sy, sz - i]];
    const F = [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
    const pos: number[] = [];
    for (const f of F) for (const t of [[f[0], f[1], f[2]], [f[0], f[2], f[3]]]) for (const k of t) pos.push(...P[k]);
    // Quads above are counter-clockwise seen from outside (checked: bottom -Y, top +Y, sides outward).
    const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3)); g.computeVertexNormals();
    const local = new Matrix4().compose(new Vector3(...center), new Quaternion().setFromEuler(new Euler(o.pitch ?? 0, o.yaw ?? 0, 0, 'YXZ')), new Vector3(1, 1, 1));
    this.push(g, o.frame ? new Matrix4().multiplyMatrices(o.frame, local) : local, color, o.emit, o.jitter ?? 0, o.seed ?? 0);
  }
  /** Faceted frustum between two points (posts, piles, rails). */
  cyl(a: Vec3, b: Vec3, r0: number, r1: number, sides: number, color: string, o: { frame?: Matrix4; emit?: Emit; jitter?: number; seed?: number; smooth?: boolean } = {}) {
    const A = new Vector3(...a), B = new Vector3(...b), d = B.clone().sub(A), L = d.length();
    const pos: number[] = [], ring = (r: number, y: number) => Array.from({ length: sides }, (_, k) => [Math.cos((k + .5) / sides * Math.PI * 2) * r, y, Math.sin((k + .5) / sides * Math.PI * 2) * r]);
    const lo = ring(r0, 0), hi = ring(r1, L);
    for (let k = 0; k < sides; k++) {
      const j = (k + 1) % sides;
      pos.push(...lo[k], ...hi[k], ...hi[j], ...lo[k], ...hi[j], ...lo[j]);
      pos.push(0, L, 0, ...hi[j], ...hi[k]); pos.push(0, 0, 0, ...lo[k], ...lo[j]);
    }
    const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    if (o.smooth) {
      const n: number[] = [];
      for (let t = 0; t < pos.length; t += 3) { const y = pos[t + 1], cap = Math.abs(pos[t]) < 1e-6 && Math.abs(pos[t + 2]) < 1e-6; n.push(...(cap ? [0, y > L / 2 ? 1 : -1, 0] : [pos[t], 0, pos[t + 2]])); }
      // Cap rims share positions with sides; give cap triangles flat normals.
      for (let t = 0; t < pos.length; t += 9) { const tri = t / 9 % 4; if (tri >= 2) { const up = tri === 2 ? 1 : -1; for (let c = 0; c < 3; c++) { n[t + c * 3] = 0; n[t + c * 3 + 1] = up; n[t + c * 3 + 2] = 0; } } }
      for (let t = 0; t < n.length; t += 3) { const l = Math.hypot(n[t], n[t + 1], n[t + 2]) || 1; n[t] /= l; n[t + 1] /= l; n[t + 2] /= l; }
      g.setAttribute('normal', new BufferAttribute(new Float32Array(n), 3));
    } else g.computeVertexNormals();
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize());
    const local = new Matrix4().compose(A, q, new Vector3(1, 1, 1));
    this.push(g, o.frame ? new Matrix4().multiplyMatrices(o.frame, local) : local, color, o.emit, o.jitter ?? 0, o.seed ?? 0);
  }
  /** Raw world-space triangle list (flat normals). */
  raw(pos: number[], color: string, emit?: Emit, jitter = 0, seed = 0) {
    if (!pos.length) return;
    const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3)); g.computeVertexNormals();
    this.push(g, new Matrix4(), color, emit, jitter, seed);
  }
  build() { return mergeBatch(this.pieces); }
}

export const normalMatrix = (m: Matrix4) => new Matrix3().getNormalMatrix(m);

const DECK_TONES = ['#9C7A58', '#A98660', '#8E6E55', '#9C7A58', '#B08B63'];
/**
 * Plank deck along a -> b (planks run across the walk direction), top surface at a[1]. Real planks with
 * 1.5 cm gaps, chamfered tops, +-8 mm height and +-0.6 deg yaw jitter, five wood tones; two edge
 * stringers underneath. `trimStart` / `trimEnd` skip planks near the ends (joins). Returns tri count.
 */
export function plankDeck(geo: ParkGeo, a: Vec3, b: Vec3, width: number, seed: number, o: { pitch?: number; stringers?: boolean; from?: number; to?: number } = {}) {
  const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
  const frame = yawMatrix(a, yaw), pitch = o.pitch ?? 0.28, start = o.from ?? 0, end = L - (o.to ?? 0);
  let n = 0;
  for (let s = start + pitch / 2; s <= end - pitch / 2 + 1e-3; s += pitch, n++) {
    const r = hash(seed * 97 + n);
    geo.box([((r * 2 - 1) * 0.03), -0.03 - r * 0.008, s], [width - 0.02 * hash(seed + n * 3), 0.06, pitch - 0.016], DECK_TONES[Math.floor(hash(seed * 13 + n * 7) * DECK_TONES.length)],
      { frame, yaw: (hash(seed * 5 + n) - 0.5) * 0.02, inset: 0.008, jitter: 0.05, seed: seed * 31 + n });
  }
  if (o.stringers !== false) for (const x of [-width / 2 + 0.16, width / 2 - 0.16]) geo.box([x, -0.16, L / 2], [0.12, 0.2, L], '#6E563F', { frame });
  return frame;
}

/* ------------------------------------------------------------------ 2D convex polygon decks */
export type P2 = [number, number];
/** Sutherland-Hodgman clip of a convex polygon by the half-plane n.p >= c. */
export function clipHalf(poly: P2[], n: P2, c: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = n[0] * a[0] + n[1] * a[1] - c, db = n[0] * b[0] + n[1] * b[1] - c;
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
const area2 = (p: P2[]) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };

export interface SlabOptions { inset?: number; jitter?: number; seed?: number; emit?: Emit; bottom?: boolean }
/** Extruded convex polygon (XZ) between yBot and yTop; top optionally inset toward the centroid. */
export function slab(geo: ParkGeo, poly: P2[], yTop: number, yBot: number, color: string, o: SlabOptions = {}) {
  if (poly.length < 3 || Math.abs(area2(poly)) < 1e-4) return;
  // Make the polygon clockwise in (x, z) so its top fan faces +Y.
  const p = area2(poly) > 0 ? [...poly].reverse() : poly;
  const cx = p.reduce((s, q) => s + q[0], 0) / p.length, cz = p.reduce((s, q) => s + q[1], 0) / p.length;
  const ins = o.inset ?? 0;
  const top = p.map(([x, z]) => { const dx = cx - x, dz = cz - z, l = Math.hypot(dx, dz) || 1, k = Math.min(ins, l * 0.4); return [x + dx / l * k, yTop, z + dz / l * k]; });
  const bot = p.map(([x, z]) => [x, yBot, z]);
  const side = p.map(([x, z]) => [x, yTop - ins, z]);
  const pos: number[] = [];
  for (let i = 1; i < p.length - 1; i++) { pos.push(...top[0], ...top[i], ...top[i + 1]); if (o.bottom) pos.push(...bot[0], ...bot[i + 1], ...bot[i]); }
  for (let i = 0; i < p.length; i++) {
    const j = (i + 1) % p.length;
    pos.push(...bot[i], ...side[i], ...side[j], ...bot[i], ...side[j], ...bot[j]);
    if (ins) pos.push(...side[i], ...top[i], ...top[j], ...side[i], ...top[j], ...side[j]);
  }
  geo.raw(pos, color, o.emit, o.jitter ?? 0, o.seed ?? 0);
}
/**
 * Plank deck filling a convex polygon: strips of `pitch` (gap 1.5 cm) perpendicular to `across`'s
 * normal, i.e. planks run along `across`. Five wood tones, +-6 mm top jitter, chamfered tops.
 */
export function plankPoly(geo: ParkGeo, poly: P2[], across: P2, yTop: number, seed: number, pitch = 0.28, thick = 0.06) {
  const v: P2 = [-across[1], across[0]];
  const proj = poly.map(q => q[0] * v[0] + q[1] * v[1]);
  const lo = Math.min(...proj), hi = Math.max(...proj);
  let n = 0;
  for (let s = Math.floor(lo / pitch) * pitch; s < hi; s += pitch, n++) {
    let q = clipHalf(poly, v, s + 0.0075);
    q = clipHalf(q, [-v[0], -v[1]], -(s + pitch - 0.0075));
    const key = Math.round(s / pitch) + seed * 1000;
    const tone = DECK_TONES[Math.floor(hash(key * 7.3) * DECK_TONES.length)];
    const y = yTop - hash(key * 3.1) * 0.006;
    slab(geo, q, y, y - thick, tone, { inset: 0.008, jitter: 0.05, seed: key });
  }
  return n;
}
