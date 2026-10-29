import { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Float32BufferAttribute, MeshDepthMaterial, RGBADepthPacking, type BufferGeometry, type Material, type MeshStandardMaterial } from 'three';
import { useWorldStore } from './store';

/** One shared wind/motion clock for every runtime-animated surface on the island.
 * uWindTime advances only while the world is running (not paused, not a QA shot);
 * uWindStrength eases to 0 under prefers-reduced-motion and back to 1 otherwise. */
export const windUniforms = { uWindTime: { value: 0 }, uWindStrength: { value: 1 } };
let reducedMotion = false;

export const isWorldRunning = () => { const s = useWorldStore.getState(); return !s.paused && !s.poolInspect && !s.shot; };

/** Mount once inside the Canvas (WorldRuntime). */
export function useWindClock() {
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { reducedMotion = query.matches; };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useFrame((_, delta) => {
    const step = Math.min(delta, 0.1);
    if (isWorldRunning()) windUniforms.uWindTime.value += step;
    const target = reducedMotion ? 0 : 1;
    windUniforms.uWindStrength.value += (target - windUniforms.uWindStrength.value) * Math.min(1, step * 2);
  });
}

export interface TentWindParams { L: number; W: number; hw: number; hr: number; ovs: number; dw: number; jamb: number }

/** Canvas flutter for C03/C04: only the roof field between ridge, eaves and gable ends moves
 * (panel seams, ridge, eaves and gable ends are pinned), displaced along the local roof
 * normal by at most 2.8 cm. Gathered door curtains have their own 1.6 cm mask, pinned at
 * the upper/lower attachment and waist cuff. Bindings, wood and groundsheet remain fixed. Normals are not
 * recomputed (displacement is tiny), which is a deliberate, stated approximation. */
function tentChunk(p: TentWindParams) {
  const f = (n: number) => n.toFixed(4);
  return /* glsl */`#include <begin_vertex>
  {
    float tu = clamp((transformed.x + ${f(p.L / 2)}) / ${f(p.L)}, 0.0, 1.0);
    float ts = clamp(abs(transformed.z) / ${f(p.W + p.ovs)}, 0.0, 1.0);
    float above = smoothstep(${f(p.hw)}, ${f(p.hw + 0.25)}, transformed.y);
    float tw = abs(sin(9.42477796 * tu)) * sin(3.14159265 * ts) * above * (1.0 - _cloth.x);
    vec3 tip = vec3(0.0);
    #ifdef USE_INSTANCING
      tip = instanceMatrix[3].xyz;
    #else
      tip = modelMatrix[3].xyz;
    #endif
    float tph = dot(tip, vec3(0.37, 0.0, 0.21));
    float tt = uWindTime;
    float gust = 0.6 * sin(tt * 1.6 + transformed.x * 1.4 + tph) + 0.4 * sin(tt * 2.7 + transformed.z * 2.2 + tph * 1.7);
    float slope = ${f((p.hr - p.hw) / p.W)};
    vec3 roofN = normalize(vec3(0.0, 1.0, sign(transformed.z) * slope));
    transformed += roofN * (0.028 * uWindStrength * tw * gust);
    transformed.x += 0.016 * uWindStrength * _cloth.y * sin(tt * 2.0 + tph + sign(transformed.z) * 1.2);
  }`;
}

function patch(material: Material, key: string, chunk: string) {
  material.onBeforeCompile = shader => {
    shader.uniforms.uWindTime = windUniforms.uWindTime;
    shader.uniforms.uWindStrength = windUniforms.uWindStrength;
    shader.vertexShader = 'uniform float uWindTime;\nuniform float uWindStrength;\nattribute vec2 _cloth;\n' + shader.vertexShader.replace('#include <begin_vertex>', chunk);
  };
  material.customProgramCacheKey = () => key;
  material.needsUpdate = true;
}

/** Patches a runtime material copy in place and returns the matching shadow depth material. */
export function applyTentWind(material: MeshStandardMaterial, assetId: string, params: TentWindParams) {
  const chunk = tentChunk(params);
  patch(material, `tent-wind-${assetId}`, chunk);
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  patch(depth, `tent-wind-depth-${assetId}`, chunk);
  return depth;
}

/** Identify the two closed gathered-curtain shells by connectivity and declared dimensions.
 * This changes only a runtime attribute, never welds the deliverable or moves fixed bindings. */
export function markTentCloth(geometry: BufferGeometry, params: TentWindParams) {
  const p = geometry.getAttribute('position');
  const parent = Array.from({ length: p.count }, (_, i) => i);
  const root = (n: number): number => { while (parent[n] !== n) { parent[n] = parent[parent[n]]; n = parent[n]; } return n; };
  const join = (a: number, b: number) => { parent[root(a)] = root(b); };
  const same = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)].map(n => Math.round(n * 1e5)).join(',');
    const old = same.get(key); if (old !== undefined) join(i, old); else same.set(key, i);
  }
  const index = geometry.index;
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    const a = index ? index.getX(i) : i, b = index ? index.getX(i + 1) : i + 1, c = index ? index.getX(i + 2) : i + 2;
    join(a, b); join(a, c);
  }
  const components = new Map<number, number[]>();
  for (let i = 0; i < p.count; i++) { const r = root(i), list = components.get(r) ?? []; list.push(i); components.set(r, list); }
  const mask = new Float32Array(p.count * 2);
  let curtainCount = 0;
  for (const list of components.values()) {
    const xs = list.map(i => p.getX(i)), ys = list.map(i => p.getY(i)), zs = list.map(i => p.getZ(i));
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), z0 = Math.min(...zs), z1 = Math.max(...zs);
    if (x1 - x0 > .18 || z1 - z0 > .18 || y1 - y0 < 1 || Math.abs((x0 + x1) / 2 - params.L / 2 - .018) > .04) continue;
    curtainCount++;
    const cuff = params.jamb * .5;
    for (const i of list) {
      const y = p.getY(i), lo = y < cuff ? y0 : cuff + .035, hi = y < cuff ? cuff - .035 : y1;
      const t = Math.max(0, Math.min(1, (y - lo) / Math.max(.01, hi - lo)));
      mask[i * 2] = 1; mask[i * 2 + 1] = Math.sin(Math.PI * t);
    }
  }
  geometry.setAttribute('_cloth', new Float32BufferAttribute(mask, 2));
  geometry.userData.curtainShells = curtainCount;
}
