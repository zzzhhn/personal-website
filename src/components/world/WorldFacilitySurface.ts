/** Shared batch-6 surface treatment. Physical slots ride the existing sign
 * attribute as negative values; positive sign-atlas flags remain untouched. */
import { RepeatWrapping, ShaderChunk, SRGBColorSpace, TextureLoader, type BufferGeometry, type MeshStandardMaterial, type Texture } from 'three';
import type { Builder } from './WorldStreetGeometry';
import { night } from './WorldNight';

export const FACILITY_SURFACE = { wood: 1, paint: 2, metal: 3, glass: 4, roof: 5 } as const;
// Original scan is .7m wide; the reused crop is 466 of its 1024 vertical pixels.
export const FACILITY_WOOD_TILE = [.7, .7 * 466 / 1024] as const;
export const facilityCraftEnabled = () => typeof window === 'undefined'
  || new URLSearchParams(window.location.search).get('craft6') !== 'baseline';
const textureRoot = '/assets/world/craft-batch6-facilities/';
let shared: ReturnType<typeof loadSurfaces> | null = null;
function loadSurfaces() {
  const load = (name: string, color = false) => {
    const texture = typeof document === 'undefined' || !facilityCraftEnabled() ? null : new TextureLoader().load(textureRoot + name);
    if (texture) {
      if (color) texture.colorSpace = SRGBColorSpace;
      texture.flipY = false; // Manufactured UVs and retained glTF UVs use the glTF image convention.
      texture.wrapS = texture.wrapT = RepeatWrapping; texture.anisotropy = 4;
    }
    return { value: texture };
  };
  return { uFacilityWood: load('wood-color.png', true), uFacilityRough: load('wood-rough.png'), uFacilityNormal: load('wood-normal.png'), uFacilityNight: night };
}
/** Borrowed by shared park/street materials. Never disposed by a mesh or LOD. */
export const facilitySurfaceUniforms = () => shared ??= loadSurfaces();
const variants = new Set<MeshStandardMaterial>();
let borrowedEnvironment: Texture | null = null;
/** Only references the existing renderer-scoped PMREM; does not create or own it. */
export function registerFacilityMaterial(material: MeshStandardMaterial) {
  if (!facilityCraftEnabled()) return material;
  variants.add(material); material.envMap = borrowedEnvironment; material.envMapIntensity = .35;
  material.addEventListener('dispose', () => variants.delete(material));
  return material;
}
export function setFacilityEnvironment(map: Texture | null) {
  borrowedEnvironment = map;
  for (const material of variants) if (material.envMap !== map) { material.envMap = map; material.needsUpdate = true; }
}
/** Environment is evaluated per surface, so unreviewed slot-0 street/park faces
 * keep their original zero-IBL response despite sharing an opaque batch. */
export const facilityEnvironmentChunk = ShaderChunk.envmap_physical_pars_fragment
  .replaceAll('#ifdef ENVMAP_TYPE_CUBE_UV', 'if (vFacilityKind < .5) return vec3(0.0);\n #ifdef ENVMAP_TYPE_CUBE_UV')
  .replaceAll('envMapIntensity', '(envMapIntensity * step(.5, vFacilityKind) * (1.0 - .90 * uFacilityNight))');

export function tagShelterSurfaces(B: Builder) {
  if (!facilityCraftEnabled()) return;
  for (const part of B.parts) {
    const end = part.end < 0 ? B.pos.length / 3 : part.end;
    for (let i = part.start; i < end; i++) {
      const at = i * 4, rough = B.mat[at], metal = B.mat[at + 1];
      if (B.mat[at + 3] > .5 || B.mat[at + 2] > 0) continue;
      const kind = Math.abs(rough - .74) < .001 && metal === 0 ? 1
        : Math.abs(rough - .38) < .001 && metal === 0 ? 4
          : Math.abs(rough - .58) < .001 && Math.abs(metal - .3) < .001 ? 3
            : part.name.startsWith('roof.folded') ? 5 : metal > .1 ? 2 : 0;
      if (!kind) continue;
      B.mat[at + 3] = -kind;
      // Seat slats run along local Z; long grain cannot cross the board width.
      B.suv[i * 2] = B.pos[i * 3 + 2] / FACILITY_WOOD_TILE[0] + part.start * .013;
      B.suv[i * 2 + 1] = B.pos[i * 3] / FACILITY_WOOD_TILE[1];
    }
  }
}

export function parkSurfaceSlot(name: string) {
  if (!facilityCraftEnabled()) return 0;
  if (/wood/.test(name)) return 1;
  if (/roof/.test(name)) return 5;
  if (/paint|slate/.test(name)) return 2;
  if (/iron|brass/.test(name)) return 3;
  if (/glass/.test(name)) return 4;
  return 0;
}

export const facilitySurfaceHead = /* glsl */`
uniform sampler2D uFacilityWood;
uniform sampler2D uFacilityRough;
uniform sampler2D uFacilityNormal;
uniform float uFacilityNight;
varying vec2 vFacilityUv;
varying vec3 vFacilityPoint;
varying float vFacilityKind;
float facilityNoise(vec3 p) {
  return sin(p.x * 7.3 + sin(p.z * 2.7)) * sin(p.y * 5.1 + p.z * 3.2);
}
`;
export const facilitySurfaceColor = /* glsl */`
float facilityKind = floor(vFacilityKind + .5);
float facilityBroad = facilityNoise(vFacilityPoint * .9);
if (facilityKind == 1.0) {
  vec3 grain = texture2D(uFacilityWood, vFacilityUv).rgb / .8;
  diffuseColor.rgb *= grain;
} else if (facilityKind == 2.0 || facilityKind == 5.0) {
  diffuseColor.rgb *= 1.0 + .012 * facilityBroad;
} else if (facilityKind == 3.0) diffuseColor.rgb *= 1.0 + .035 * facilityBroad;
`;
export const facilitySurfaceRough = /* glsl */`
if (facilityKind == 1.0) roughnessFactor = clamp(texture2D(uFacilityRough, vFacilityUv).r, .66, .9);
else if (facilityKind == 2.0) { roughnessFactor = .43 + .07 * facilityBroad; metalnessFactor = .08; }
else if (facilityKind == 3.0) { roughnessFactor = .3 + .10 * facilityBroad; metalnessFactor = .72; }
else if (facilityKind == 4.0) { roughnessFactor = .23; metalnessFactor = 0.0; }
else if (facilityKind == 5.0) { roughnessFactor = .38 + .08 * facilityBroad; metalnessFactor = .24; }
`;
export const facilitySurfaceNormal = /* glsl */`
if (vFacilityKind > .5 && vFacilityKind < 1.5) {
  vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition);
  vec2 st0 = dFdx(vFacilityUv), st1 = dFdy(vFacilityUv);
  vec3 q1p = cross(q1, normal), q0p = cross(normal, q0);
  vec3 T = q1p * st0.x + q0p * st1.x, B = q1p * st0.y + q0p * st1.y;
  float scale = inversesqrt(max(max(dot(T,T), dot(B,B)), 1e-8));
  vec3 detail = texture2D(uFacilityNormal, vFacilityUv).xyz * 2.0 - 1.0;
  detail.xy *= .18;
  normal = normalize(mat3(T * scale, B * scale, normal) * normalize(detail));
}
`;

/** Same attribute contract for old and new GLB pieces. Authored source UV is
 * copied before world-space placement; other batches receive an inert slot. */
export function addParkSurfaceAttributes(g: BufferGeometry, slot: number, uv: Float32Array) {
  const count = g.getAttribute('position').count;
  return { mat: Float32Array.from({ length: count * 4 }, (_, i) => i % 4 === 0 ? .86 : i % 4 === 3 ? -slot : 0), uv };
}
