import { BufferGeometry, Float32BufferAttribute, MeshStandardMaterial } from 'three';
import type { V3 } from '../WorldStreetGeometry.ts';

/** The same authored fixture centres drive the visible housings, static bake and two nearby lights. */
export const IBD_FIXTURES: readonly { at: V3; reach: number; power: number; pendant?: boolean }[] = [
  { at: [-23, 7.8, -6], reach: 17, power: 1.4, pendant: true },
  { at: [-10, 7.8, -10], reach: 17, power: 1.4, pendant: true },
  { at: [-22, 7.8, -19], reach: 15, power: 1.1, pendant: true },
  { at: [8, 6.2, -11], reach: 14, power: 1.3, pendant: true },
  { at: [23, 6.2, -11], reach: 14, power: 1.3, pendant: true },
  { at: [15, 6.2, -22], reach: 13, power: 1.2, pendant: true },
  { at: [8, 5.7, 9], reach: 14, power: 1.3, pendant: true },
  { at: [18, 5.7, 24], reach: 14, power: 1.3, pendant: true },
  { at: [-27, 2.3, 5], reach: 10, power: .9 },
  { at: [-7, 2.3, 13], reach: 11, power: .9 },
  { at: [-6, 2.3, 25], reach: 11, power: 1 },
  { at: [6, 2.3, 27], reach: 11, power: 1 },
  { at: [29, 2.3, 27], reach: 10, power: .9 },
  { at: [-29, 2.3, 27], reach: 10, power: .9 },
];

/** Static local irradiance, evaluated once per vertex. No textures, shadow maps or per-frame uploads. */
export function bakeIbdLight(geometry: BufferGeometry) {
  const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), values = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const sky = .075 + Math.max(0, n.getY(i)) * .065;
    let warm = 0;
    for (const fixture of IBD_FIXTURES) {
      const dx = fixture.at[0] - p.getX(i), dy = fixture.at[1] - p.getY(i), dz = fixture.at[2] - p.getZ(i);
      const d = Math.hypot(dx, dy, dz);
      if (d >= fixture.reach) continue;
      const facing = Math.max(0, (dx * n.getX(i) + dy * n.getY(i) + dz * n.getZ(i)) / Math.max(.01, d));
      // Fixtures face down. Exterior roof tops retain the cooler sky fill.
      const down = Math.max(0, dy) / Math.max(.01, d);
      warm += fixture.power * (1 - d / fixture.reach) ** 2 * facing * (.35 + .65 * down);
    }
    warm = Math.min(1.35, warm * 2.4);
    values.set([sky * .66 + warm, sky * .82 + warm * .69, sky + warm * .36], i * 3);
  }
  geometry.setAttribute('aIbdBake', new Float32BufferAttribute(values, 3));
  return geometry;
}

/** Keep PBR material differences in the merged draw; only the authored night fill is emissive. */
export function createIbdMaterial(baked: boolean, nightUniform: { value: number }) {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: .78, metalness: .1 });
  material.customProgramCacheKey = () => `ibd-industrial-v1-${baked ? 'static' : 'moving'}`;
  material.onBeforeCompile = shader => {
    shader.uniforms.uIbdNight = nightUniform;
    shader.vertexShader = `attribute vec4 aMat; varying vec4 vIbdSurface; varying vec3 vIbdBake; ${baked ? 'attribute vec3 aIbdBake;' : ''}\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvIbdSurface = aMat; vIbdBake = ${baked ? 'aIbdBake' : 'vec3(0.075, 0.09, 0.12) * (0.7 + 0.3 * max(normal.y, 0.0))'};`);
    shader.fragmentShader = `uniform float uIbdNight; varying vec4 vIbdSurface; varying vec3 vIbdBake;\n${shader.fragmentShader}`
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vIbdSurface.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vIbdSurface.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uIbdNight * (diffuseColor.rgb * vIbdBake + vec3(1.0, 0.68, 0.3) * step(0.5, vIbdSurface.z) * 1.6);');
  };
  return material;
}

/** Caller owns the two indices; selection is allocation-free and never creates another light. */
export function nearestIbdFixtures(x: number, z: number, out: number[]) {
  let a = Infinity, b = Infinity; out[0] = -1; out[1] = -1;
  for (let i = 0; i < IBD_FIXTURES.length; i++) {
    const f = IBD_FIXTURES[i], d = (f.at[0] - x) ** 2 + (f.at[2] - z) ** 2;
    if (d > f.reach ** 2) continue;
    if (d < a) { b = a; out[1] = out[0]; a = d; out[0] = i; }
    else if (d < b) { b = d; out[1] = i; }
  }
}
