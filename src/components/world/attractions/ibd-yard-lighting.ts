import { BufferGeometry, Float32BufferAttribute, MeshStandardMaterial } from 'three';
import type { V3 } from '../WorldStreetGeometry.ts';
import { IBD_CONCRETE_GLSL, IBD_CONCRETE_COLOR } from './ibd-concrete-surface.ts';
import { IBD_GROUND_CONTACT_GLSL } from './ibd-ground-contact.ts';

export interface IbdFixture {
  at: V3; reach: number; power: number; pendant?: boolean;
  mount?: 'bench' | 'strip' | 'truck'; baseY?: number; aim?: V3;
}
/** Housings, static work-face fill and the bounded live pair use these exact centres. */
export const IBD_FIXTURES: readonly IbdFixture[] = [
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
  { at: [-10, 6.3, -.6], reach: 9, power: 1, pendant: true, mount: 'strip', aim: [-12, 2.35, -2.65] },
  { at: [-10, 6.3, -5.6], reach: 9, power: 1, pendant: true, mount: 'strip', aim: [-12, 2.35, -7.65] },
  { at: [10, 4.8, -9.3], reach: 7, power: .65, pendant: true, mount: 'strip', aim: [10, 1.2, -12] },
  { at: [18, 4.8, -9.3], reach: 7, power: .65, pendant: true, mount: 'strip', aim: [18, 1.2, -12] },
  { at: [5, 4.8, -16.1], reach: 7, power: .65, pendant: true, mount: 'strip', aim: [5, 1.2, -18.8] },
  { at: [26, 4.8, -16.1], reach: 7, power: .65, pendant: true, mount: 'strip', aim: [26, 1.2, -18.8] },
  { at: [-6.65, 2.45, 18.6], reach: 5.5, power: .48, mount: 'bench', baseY: 1.18, aim: [-6, 1.2, 19] },
  { at: [-3.65, 2.15, 25.6], reach: 5.5, power: .48, mount: 'bench', baseY: .88, aim: [-3, .9, 26] },
  { at: [16, 3.805, 10.5], reach: 5.8, power: .6, mount: 'truck', aim: [16, 1.6, 10.5] },
  { at: [16, 3.805, 14.5], reach: 5.8, power: .6, mount: 'truck', aim: [16, 1.6, 14.5] },
];

function direction(fixture: IbdFixture, dx: number, dy: number, dz: number, distance: number) {
  if (!fixture.aim) return .35 + .65 * Math.max(0, dy) / Math.max(.01, distance);
  const [x, y, z] = fixture.aim, ax = fixture.at[0] - x, ay = fixture.at[1] - y, az = fixture.at[2] - z;
  return Math.max(0, (dx * ax + dy * ay + dz * az) / Math.max(.01, distance * Math.hypot(ax, ay, az))) ** 2;
}

/** Once-only static sample, also usable by geometric work-surface checks. */
export function ibdWorkLight(x: number, y: number, z: number, nx: number, ny: number, nz: number) {
  let warm = 0;
  for (const fixture of IBD_FIXTURES) {
    const dx = fixture.at[0] - x, dy = fixture.at[1] - y, dz = fixture.at[2] - z, d = Math.hypot(dx, dy, dz);
    if (d >= fixture.reach) continue;
    const facing = Math.max(0, (dx * nx + dy * ny + dz * nz) / Math.max(.01, d));
    warm += fixture.power * (1 - d / fixture.reach) ** 2 * facing * direction(fixture, dx, dy, dz, d);
  }
  return Math.min(1.35, warm * 2.4);
}

/** Static local irradiance, evaluated once per vertex. No textures, shadow maps or per-frame uploads. */
export function bakeIbdLight(geometry: BufferGeometry) {
  const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), values = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const sky = .075 + Math.max(0, n.getY(i)) * .065;
    const warm = ibdWorkLight(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i));
    values.set([sky * .66 + warm, sky * .82 + warm * .69, sky + warm * .36], i * 3);
  }
  geometry.setAttribute('aIbdBake', new Float32BufferAttribute(values, 3));
  return geometry;
}

/** Keep PBR material differences in the merged draw; only the authored night fill is emissive. */
export function createIbdMaterial(baked: boolean, nightUniform: { value: number }) {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: .78, metalness: .1 });
  material.customProgramCacheKey = () => `ibd-industrial-v4-${baked ? 'static' : 'moving'}`;
  material.onBeforeCompile = shader => {
    shader.uniforms.uIbdNight = nightUniform;
    shader.vertexShader = `attribute vec4 aMat; varying vec4 vIbdSurface; varying vec3 vIbdBake; ${baked ? 'attribute vec3 aIbdBake; varying vec2 vIbdPavingXZ;' : ''}\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvIbdSurface = aMat; vIbdBake = ${baked ? 'aIbdBake; vIbdPavingXZ = position.xz' : 'vec3(0.075, 0.09, 0.12) * (0.7 + 0.3 * max(normal.y, 0.0))'};`);
    shader.fragmentShader = `uniform float uIbdNight; varying vec4 vIbdSurface; varying vec3 vIbdBake;${baked ? `varying vec2 vIbdPavingXZ;\n${IBD_CONCRETE_GLSL}\n${IBD_GROUND_CONTACT_GLSL}` : ''}\n${shader.fragmentShader}`
      .replace('#include <color_fragment>', `#include <color_fragment>\n${baked ? `${IBD_CONCRETE_COLOR}\nfloat ibdGroundVisibility = vIbdSurface.w > 1.5 ? ibdTruckGroundVisibility(vIbdPavingXZ) : 1.0;` : ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${baked ? 'if (vIbdSurface.w > 1.5) normal = ibdConcreteNormal(-vViewPosition, normal, ibdConcreteHeight, faceDirection);' : ''}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vIbdSurface.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vIbdSurface.y;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += uIbdNight * (diffuseColor.rgb * vIbdBake ${baked ? '* ibdGroundVisibility' : ''} + vec3(1.0, 0.68, 0.3) * step(0.5, vIbdSurface.z) * 1.6);`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>\n${baked ? 'reflectedLight.indirectDiffuse *= ibdGroundVisibility; reflectedLight.indirectSpecular *= ibdGroundVisibility;' : ''}`);
  };
  return material;
}

/** Caller owns the two indices; selection is allocation-free and never creates another light. */
export function nearestIbdFixtures(x: number, z: number, out: number[], y = 1.3) {
  const priorA = out[0], priorB = out[1];
  let a = 0, b = 0; out[0] = -1; out[1] = -1;
  for (let i = 0; i < IBD_FIXTURES.length; i++) {
    const f = IBD_FIXTURES[i], dx = f.at[0] - x, dy = f.at[1] - y, dz = f.at[2] - z, d = Math.hypot(dx, dy, dz);
    if (d >= f.reach) continue;
    // Predicted local contribution gives the bench/inside-truck lamps priority
    // over a horizontally closer pole on the other side of a working surface.
    const score = f.power * (1 - d / f.reach) ** 2 * direction(f, dx, dy, dz, d) / Math.max(1, d * d);
    if (score > a) { b = a; out[1] = out[0]; a = score; out[0] = i; }
    else if (score > b) { b = score; out[1] = i; }
  }
  // Keep a retained fixture on its existing live light. Crossing the equal-
  // contribution line must not reset both intensities merely to swap slots.
  if ((out[1] >= 0 && out[1] === priorA) || (out[0] >= 0 && out[0] === priorB)) {
    const first = out[0]; out[0] = out[1]; out[1] = first;
  }
}
