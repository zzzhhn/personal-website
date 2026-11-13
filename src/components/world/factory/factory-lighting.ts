import { BufferGeometry, Float32BufferAttribute, MeshStandardMaterial } from 'three';
import type { FactoryLamp } from './factory-geometry.ts';
import type { Surf } from '../WorldStreetGeometry.ts';
import { FACTORY } from './factory-layout.ts';

/** Broad workshop bounce for coarse floor triangles that have no vertex near a
 * fixture. Bounded to the existing factory roof, not island/global exposure. */
export const FACTORY_ROOM_FILL = [.18, .19, .2] as const;
/** Match the seven fixed fixtures in factory-production-detail.ts. */
export const FACTORY_TASK_LIGHTS: readonly FactoryLamp[] = [
  ...[-11, 2, 15].flatMap(z => [-1, 1].map(side => ({
    at: [-28.2, 3.36, z + side * 2.65] as [number, number, number], reach: 7, strength: 1.6,
  }))),
  { at: [-38.8, 8.05, -16], reach: 10, strength: 1.8 },
];
/** Bounded analytic irradiance for coarse faces and instanced moving rollers.
 * Its fixtures are actual geometry; this creates no runtime Three lights. */
export function factoryTaskLightWeight(x: number, y: number, z: number) {
  if (x < -49 || x > -21 || z < -27 || z > 25 || y < -1 || y > 17) return 0;
  let fill = 0;
  for (const lamp of FACTORY_TASK_LIGHTS) {
    const distance = Math.hypot(x - lamp.at[0], (y - lamp.at[1]) * 1.2, z - lamp.at[2]);
    fill += lamp.strength * Math.max(0, 1 - distance / lamp.reach) ** 2;
  }
  return Math.min(.95, fill);
}
const smooth = (a: number, b: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a))); return t * t * (3 - 2 * t);
};
export function factoryRoomLightWeight(x: number, y: number, z: number, normalY = 1) {
  const phase = (((z + 31) % 21) + 21) % 21 / 21;
  const ceiling = x < -1 ? 9 + 2.5 * phase : 18 - 3 * Math.abs(x - 22.5) / 23.5;
  return smooth(-46.8, -45.8, x) * (1 - smooth(45.8, 46.8, x))
    * smooth(-31.8, -30.8, z) * (1 - smooth(30.8, 31.8, z))
    * smooth(-.2, -.05, y) * (1 - smooth(ceiling - .5, ceiling - .1, y))
    * (.65 + .35 * Math.max(0, Math.min(1, normalY)));
}

/** A once-only, unoccluded work-light fill, not a shadow/lightmap solver. Lamps
 * and vertices must share factory-local coordinates. Mutates only aFactoryBake;
 * the caller continues to own this geometry and its eventual disposal. */
export function bakeFactoryLight(geometry: BufferGeometry, lamps: readonly FactoryLamp[]) {
  const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal');
  if (!p || !n || p.itemSize < 3 || n.itemSize < 3 || p.count !== n.count)
    throw new TypeError('Factory lighting requires matching position and normal attributes.');
  for (const lamp of lamps) if (lamp.at.length !== 3 || !lamp.at.every(Number.isFinite) || !Number.isFinite(lamp.reach) ||
    lamp.reach <= 0 || !Number.isFinite(lamp.strength) || lamp.strength < 0)
    throw new RangeError('Factory lamps require finite coordinates, positive reach and nonnegative strength.');
  const values = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i), length = Math.hypot(nx, ny, nz);
    if (![x, y, z, length].every(Number.isFinite)) throw new RangeError('Factory lighting vertices must be finite.');
    const normalLength = Math.max(length, 1e-6), up = Math.max(0, ny / normalLength);
    let warm = 0;
    for (const lamp of lamps) {
      const dx = lamp.at[0] - x, dy = lamp.at[1] - y, dz = lamp.at[2] - z, distance = Math.hypot(dx, dy, dz);
      if (distance >= lamp.reach || distance < 1e-6) continue;
      const facing = Math.max(0, (dx * nx + dy * ny + dz * nz) / (distance * normalLength));
      const down = .2 + .8 * Math.max(0, dy) / distance;
      warm += lamp.strength * (1 - distance / lamp.reach) ** 2 * facing * down * 1.8;
    }
    warm = Math.min(.85, warm);
    const sky = .035 + .045 * up;
    values.set([sky * .72 + warm, sky * .86 + warm * .76, sky + warm * .44], i * 3);
  }
  geometry.setAttribute('aFactoryBake', new Float32BufferAttribute(values, 3));
  return geometry;
}

const SURFACE_GLSL = `
float factoryTaskLightWeight(vec3 p) {
  if (p.x < -49.0 || p.x > -21.0 || p.z < -27.0 || p.z > 25.0 || p.y < -1.0 || p.y > 17.0) return 0.0;
  float fill = 0.0;
  ${FACTORY_TASK_LIGHTS.map(lamp => `fill += ${lamp.strength.toFixed(3)} * pow(max(0.0, 1.0 - length((p - vec3(${lamp.at.map(v => v.toFixed(3)).join(', ')})) * vec3(1.0, 1.2, 1.0)) / ${lamp.reach.toFixed(3)}), 2.0);`).join('\n  ')}
  return min(.95, fill);
}
float factoryRoomLightWeight(vec3 p, float up) {
  float wing = 9.0 + 2.5 * fract((p.z + 31.0) / 21.0);
  float atrium = 18.0 - 3.0 * abs(p.x - 22.5) / 23.5;
  float ceiling = mix(wing, atrium, step(-1.0, p.x));
  return smoothstep(-46.8, -45.8, p.x) * (1.0 - smoothstep(45.8, 46.8, p.x))
    * smoothstep(-31.8, -30.8, p.z) * (1.0 - smoothstep(30.8, 31.8, p.z))
    * smoothstep(-.2, -.05, p.y) * (1.0 - smoothstep(ceiling - .5, ceiling - .1, p.y))
    * (.65 + .35 * clamp(up, 0.0, 1.0));
}
float factoryHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float factoryNoise(vec2 p) {
  vec2 cell = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(factoryHash(cell), factoryHash(cell + vec2(1.0, 0.0)), f.x),
    mix(factoryHash(cell + vec2(0.0, 1.0)), factoryHash(cell + vec2(1.0)), f.x), f.y);
}
`;

/** One merged PBR draw with per-face aMat=(rough,metal,glow,sign). Does not own
 * geometry or the shared night uniform. Caller disposes this material normally;
 * no texture, light, render target, timer or per-frame vertex upload is created. */
export function createFactoryMaterial(baked: boolean, nightUniform: { value: number }, surface?: Surf) {
  // Optional surface is for ordinary live Box/Cylinder geometries that do not
  // carry aMat/color. It needs no geometry mutation or extra render pass.
  const material = new MeshStandardMaterial({ vertexColors: !surface, color: surface?.color ?? '#ffffff',
    roughness: surface?.rough ?? .7, metalness: surface?.metal ?? .1 });
  const packed = surface ? [surface.rough, surface.metal, surface.glow ?? 0, surface.sign ? 1 : 0] : null;
  material.customProgramCacheKey = () => `factory-industrial-v5-${baked ? 'baked' : 'moving'}-${packed?.join(',') ?? 'attributes'}`;
  material.onBeforeCompile = shader => {
    shader.uniforms.uFactoryNight = nightUniform;
    shader.vertexShader = `${surface ? '' : 'attribute vec4 aMat;'}
varying vec4 vFactorySurface; varying vec3 vFactoryBake; varying vec3 vFactoryLocal; varying float vFactoryUp;
${baked ? 'attribute vec3 aFactoryBake;' : ''}
${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
vFactorySurface = ${packed ? `vec4(${packed.map(v => v.toFixed(4)).join(', ')})` : 'aMat'}; vFactoryLocal = position; vFactoryUp = clamp(normal.y, 0.0, 1.0);
vFactoryBake = ${baked ? 'aFactoryBake' : 'vec3(.035, .045, .06) * (.7 + .3 * max(normal.y, 0.0))'};`)
      .replace('#include <project_vertex>', `
// Position after skinning; instancing is applied once here for local light
// lookup and once by Three for projection, never twice to gl_Position.
vec4 factoryPoint = vec4(transformed, 1.0);
vec3 factoryLocalNormal = objectNormal;
#ifdef USE_INSTANCING
factoryPoint = instanceMatrix * factoryPoint;
factoryLocalNormal = mat3(instanceMatrix) * factoryLocalNormal;
#endif
vFactoryLocal = (modelMatrix * factoryPoint).xyz - vec3(${FACTORY.origin.map(v => v.toFixed(3)).join(', ')});
vFactoryUp = clamp(normalize(mat3(modelMatrix) * factoryLocalNormal).y, 0.0, 1.0);
${baked ? '' : 'vFactoryBake = vec3(.035, .045, .06) * (.7 + .3 * vFactoryUp);'}
#include <project_vertex>`);
    shader.fragmentShader = `uniform float uFactoryNight;
varying vec4 vFactorySurface; varying vec3 vFactoryBake; varying vec3 vFactoryLocal; varying float vFactoryUp;
${SURFACE_GLSL}
${shader.fragmentShader}`
      .replace('#include <color_fragment>', `#include <color_fragment>
// Rough, nonmetal concrete and painted enamel only; rubber/glass/bare steel
// keep their authored colours. Projection also varies on vertical faces.
float factoryConcrete = step(.84, vFactorySurface.x) * (1.0 - step(.035, vFactorySurface.y))
  * step(.12, dot(diffuseColor.rgb, vec3(.2126, .7152, .0722)));
float factoryEnamel = step(.48, vFactorySurface.x) * (1.0 - step(.74, vFactorySurface.x))
  * step(.05, vFactorySurface.y) * (1.0 - step(.33, vFactorySurface.y));
float factoryUnlitSurface = 1.0 - step(.5, vFactorySurface.z);
factoryConcrete *= factoryUnlitSurface; factoryEnamel *= factoryUnlitSurface;
vec2 factoryUV = vFactoryLocal.xz + vFactoryLocal.y * vec2(.47, .73);
float factoryFootprint = max(length(dFdx(vFactoryLocal)), length(dFdy(vFactoryLocal)));
float factoryDetail = 1.0 - smoothstep(.02, .08, factoryFootprint);
float factoryBroad = factoryNoise(factoryUV * .55) - .5;
float factoryGrain = (factoryNoise(factoryUV * 19.0) - .5) * factoryDetail;
float factoryEnamelGrain = (factoryNoise(factoryUV * 8.0) - .5) * factoryDetail;
diffuseColor.rgb *= 1.0 + factoryConcrete * (.055 * factoryBroad + .022 * factoryGrain)
  + factoryEnamel * .014 * factoryEnamelGrain;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(vFactorySurface.x + factoryConcrete * .025 * factoryGrain
  + factoryEnamel * .018 * factoryEnamelGrain, .06, 1.0);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = clamp(vFactorySurface.y, 0.0, 1.0);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float factoryEmitter = step(.5, vFactorySurface.z) * (1.0 - step(5.5, vFactorySurface.z));
// Workshop lights stay on under the opaque roof in daylight. This is local
// authored fixture fill, not a change to the island's global exposure.
float factoryNight = clamp(uFactoryNight, 0.0, 1.0);
// Evaluate the inexpensive room envelope per fragment. Vertex-only point fill
// misses the middle of a large floor triangle even directly below a fixture.
vec3 factoryRoomFill = vec3(${FACTORY_ROOM_FILL.join(', ')}) * factoryRoomLightWeight(vFactoryLocal, vFactoryUp);
vec3 factoryTaskFill = vec3(1.0, .84, .62) * factoryTaskLightWeight(vFactoryLocal);
totalEmissiveRadiance += diffuseColor.rgb * (mix(.55, 1.0, factoryNight) * vFactoryBake
  + factoryRoomFill + factoryTaskFill + vec3(factoryEmitter * mix(.3, .85, factoryNight)));`);
  };
  return material;
}
