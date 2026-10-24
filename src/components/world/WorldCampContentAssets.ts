import { useLoader } from '@react-three/fiber';
import { BufferGeometry, CanvasTexture, Color, Euler, Matrix4, Mesh, MeshStandardMaterial, Quaternion, SRGBColorSpace, Vector3, type Material } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { Vec3 } from './types';

/** Camp-content GLB access and the two shared runtime materials (one draw per node). */
let draco: DRACOLoader | null = null;
function withDraco(loader: GLTFLoader) {
  if (!draco) { draco = new DRACOLoader(); draco.setDecoderPath('/assets/world/draco/'); }
  loader.setDRACOLoader(draco);
}
export const CONTENT_IDS = ['C11', 'C12', 'C13', 'C14', 'C15', 'C16', 'L01', 'C06', 'C08'] as const;
export type ContentId = typeof CONTENT_IDS[number];
export function useContentGltfs() {
  const list = useLoader(GLTFLoader, CONTENT_IDS.map(id => `/assets/world/camp/${id}.glb`), withDraco) as GLTF[];
  return Object.fromEntries(CONTENT_IDS.map((id, i) => [id, list[i]])) as Record<ContentId, GLTF>;
}

export interface NodePart { name: string; geometry: BufferGeometry; matrix: Matrix4; glow: boolean }
/** Every mesh node of a GLB with its matrix relative to the asset root (GLB-local frame). */
export function nodeParts(gltf: GLTF): NodePart[] {
  gltf.scene.updateMatrixWorld(true);
  const out: NodePart[] = [];
  gltf.scene.traverse(o => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const name = (m.material as Material).name;
    out.push({ name: m.name, geometry: m.geometry, matrix: m.matrixWorld.clone(), glow: name === 'cc_glow' });
  });
  return out;
}
export const placementMatrix = (position: Vec3, yaw: number, scale = 1) =>
  new Matrix4().compose(new Vector3(...position), new Quaternion().setFromEuler(new Euler(0, yaw, 0)), new Vector3(scale, scale, scale));
/** Geometry transformed into a target frame; drops everything but position / normal / color. */
export function bake(part: NodePart, frame: Matrix4) {
  const g = new BufferGeometry();
  for (const k of ['position', 'normal', 'color']) { const a = part.geometry.getAttribute(k); if (a) g.setAttribute(k, a.clone()); }
  if (part.geometry.index) g.setIndex(part.geometry.index.clone());
  return g.applyMatrix4(new Matrix4().multiplyMatrices(frame, part.matrix));
}
export function localPoints(parts: NodePart[], scale = 1) {
  const out: number[] = [], v = new Vector3();
  for (const p of parts) {
    const pos = p.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(p.matrix).multiplyScalar(scale); out.push(v.x, v.y, v.z); }
  }
  return new Float32Array(out);
}
export function localTrimesh(parts: NodePart[]) {
  const vertices: number[] = [], indices: number[] = [], v = new Vector3();
  for (const p of parts) {
    const pos = p.geometry.getAttribute('position'), idx = p.geometry.index, base = vertices.length / 3;
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(p.matrix); vertices.push(v.x, v.y, v.z); }
    for (let i = 0; i < (idx?.count ?? pos.count); i++) indices.push(base + (idx ? idx.getX(i) : i));
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}

/**
 * Vertex-colour matte material. COLOR_0 rgb is the Art Lock palette colour (linear), alpha is the
 * metal flag authored in cc_lib.py: 0 matte (roughness 0.82, metalness 0), 1 matte metal (0.58 / 0.35,
 * the Art Lock 'matte brass' limits). Alpha never reaches the fragment alpha, so the view-corridor
 * fade (which clones this material and multiplies diffuseColor.a) behaves as on any opaque asset.
 */
export function vertexColourMaterial(name: string) {
  const m = new MeshStandardMaterial({ name, vertexColors: true, roughness: 0.82, metalness: 0 });
  m.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>', '#ifdef USE_COLOR_ALPHA\n float ccMetal = vColor.a; diffuseColor.rgb *= vColor.rgb;\n#else\n float ccMetal = 0.0;\n#include <color_fragment>\n#endif')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(roughness, 0.58, ccMetal);')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = mix(metalness, 0.35, ccMetal);');
  };
  m.customProgramCacheKey = () => 'camp-content-vc-v1';
  return m;
}
/** Glow parts in one draw: lantern globe (vertex alpha 1, warm, night-on) and the exit lamp lens
 * columns (alpha 0, Art Lock cyan, dusk micro-bright). Emissive = vertex colour x the channel level. */
export function glowMaterial() {
  const uWarm = { value: 0.08 }, uCyan = { value: 0.15 };
  const m = new MeshStandardMaterial({ name: 'camp-content-glow', vertexColors: true, roughness: 0.9, metalness: 0 });
  m.onBeforeCompile = shader => {
    shader.uniforms.uWarm = uWarm; shader.uniforms.uCyan = uCyan;
    shader.fragmentShader = 'uniform float uWarm;\nuniform float uCyan;\n' + shader.fragmentShader
      .replace('#include <color_fragment>', '#ifdef USE_COLOR_ALPHA\n float ccWarm = step(0.5, vColor.a); diffuseColor.rgb *= vColor.rgb;\n#else\n float ccWarm = 0.0;\n#include <color_fragment>\n#endif')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance = diffuseColor.rgb * mix(uCyan, uWarm, ccWarm);');
  };
  m.customProgramCacheKey = () => 'camp-content-glow-v2';
  return { material: m, uWarm, uCyan };
}

/** Soft radial light pool (additive ground decal), white so vertex colours tint each pool. */
export function poolTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!, r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.55)'); r.addColorStop(0.7, 'rgba(255,255,255,0.15)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
}

/** Tool-wall label atlas: one row per panel, bilingual text drawn at runtime from i18n.ts. */
export const LABEL_CELL = { w: 512, h: 320 };
export function drawLabels(canvas: HTMLCanvasElement, labels: string[]) {
  canvas.width = LABEL_CELL.w; canvas.height = LABEL_CELL.h * labels.length;
  const g = canvas.getContext('2d')!;
  labels.forEach((text, i) => {
    const y = i * LABEL_CELL.h;
    g.fillStyle = '#E6DCCB'; g.fillRect(0, y, LABEL_CELL.w, LABEL_CELL.h);
    g.strokeStyle = 'rgba(90,70,52,0.35)'; g.lineWidth = 6; g.strokeRect(14, y + 14, LABEL_CELL.w - 28, LABEL_CELL.h - 28);
    let size = 150;
    const font = (s: number) => `700 ${s}px "Avenir Next Condensed", "Avenir Next", "PingFang SC", "Hiragino Sans GB", sans-serif`;
    g.font = font(size);
    while (size > 40 && g.measureText(text).width > LABEL_CELL.w - 70) { size -= 6; g.font = font(size); }
    g.fillStyle = '#3A3530'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, LABEL_CELL.w / 2, y + LABEL_CELL.h / 2 + size * 0.04);
  });
}
export const tint = (hex: string, k: number) => { const c = new Color(hex); return [c.r * k, c.g * k, c.b * k]; };
