import {
  Float32BufferAttribute, MeshDepthMaterial, RGBADepthPacking, Vector4,
  type Material, type Mesh, type MeshStandardMaterial, type Object3D,
} from 'three';

type WindUniforms = { uWindTime: { value: number }; uWindStrength: { value: number } };
const liftsByFlag = new WeakMap<Object3D, { lifts: Vector4; slot: number }>();

/** The crafted C10 lifts in the cloth shader; the legacy prop can still rotate. */
export function setCampFlagLift(flag: Object3D, lift: number): boolean {
  const binding = liftsByFlag.get(flag);
  if (!binding) return false;
  binding.lifts.setComponent(binding.slot, lift);
  flag.userData.campFlagLift = lift;
  return true;
}

// C10's +X is across the cloth, +Y is up, and -Z runs from hoist to fly.
// A quadratic envelope keeps both displacement and slope zero along the whole hoist.
const field = /* glsl */`
uniform float uWindTime;
uniform float uWindStrength;
uniform vec4 uCampFlagLifts;
attribute vec4 aCampFlagBasis; // hoist Z, 1/length, 1/height, flag slot

void campFlagField(vec3 p, out vec2 offset, out vec3 slope) {
  float u = max(0.0, (aCampFlagBasis.x - p.z) * aCampFlagBasis.y);
  float v = -p.y * aCampFlagBasis.z;
  float phase = aCampFlagBasis.w * 0.67;
  float t = uWindTime;
  float gust = 0.68 + 0.20 * sin(1.17 * t + phase) + 0.12 * sin(0.53 * t + 1.6 * phase);
  float fold = 2.8 * t - 7.2 * u + 0.85 * v + phase;
  float flutter = 8.3 * t - 15.8 * u - 1.8 * v + 1.7 * phase;
  float broad = 0.145 * gust;
  float fine = 0.026 * (0.6 + 0.4 * gust);
  float wave = broad * sin(fold) + fine * sin(flutter);
  float envelope = u * u;
  float lift = sin(uCampFlagLifts[int(aCampFlagBasis.w)]) / aCampFlagBasis.y;
  offset = envelope * vec2(uWindStrength * wave, lift);

  float a = broad * cos(fold);
  float b = fine * cos(flutter);
  slope = vec3(
    -aCampFlagBasis.z * uWindStrength * envelope * (0.85 * a - 1.8 * b),
    -aCampFlagBasis.y * uWindStrength * (2.0 * u * wave - envelope * (7.2 * a + 15.8 * b)),
    -aCampFlagBasis.y * 2.0 * u * lift
  );
}`;

export function createCampFlagWind(wind: WindUniforms) {
  const lifts = { value: new Vector4(0, 0, 0, 0) };
  const patched = new Set<MeshStandardMaterial>();

  function patch(material: Material, normals: boolean) {
    const previous = material.onBeforeCompile, key = material.customProgramCacheKey();
    material.onBeforeCompile = function(shader, renderer) {
      previous.call(this, shader, renderer);
      shader.uniforms.uWindTime = wind.uWindTime;
      shader.uniforms.uWindStrength = wind.uWindStrength;
      shader.uniforms.uCampFlagLifts = lifts;
      const sample = 'vec2 campFlagOffset; vec3 campFlagSlope; campFlagField(position, campFlagOffset, campFlagSlope);';
      let vertex = shader.vertexShader.replace('#include <common>', `#include <common>\n${field}`);
      if (normals) {
        // Inverse transpose of (x + dx(y,z), y + dy(z), z), on the authored shell normal.
        vertex = vertex.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          ${sample}
          objectNormal.y -= campFlagSlope.x * objectNormal.x;
          objectNormal.z -= campFlagSlope.y * objectNormal.x + campFlagSlope.z * objectNormal.y;`);
      }
      shader.vertexShader = vertex.replace('#include <begin_vertex>', `#include <begin_vertex>
        ${normals ? '' : sample}
        transformed.xy += campFlagOffset;`);
    };
    material.customProgramCacheKey = () => `${key}-${normals ? 'camp-flag-wind-surface-v1' : 'camp-flag-wind-depth-v1'}`;
    material.needsUpdate = true;
  }

  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  patch(depth, false);

  return {
    depth,
    attach(flag: Mesh, material: MeshStandardMaterial, slot: number) {
      const { hoistTopLocalGLB, lengthM, hoistHeightM } = flag.userData;
      if (!Number.isFinite(hoistTopLocalGLB?.[2]) || !(lengthM > 0 && hoistHeightM > 0)) {
        throw new Error(`C10 ${flag.name} is missing its authored flag dimensions`);
      }
      const geometry = flag.geometry.clone();
      const basis = new Float32Array(geometry.getAttribute('position').count * 4);
      for (let i = 0; i < basis.length; i += 4) {
        basis[i] = hoistTopLocalGLB[2]; basis[i + 1] = 1 / lengthM;
        basis[i + 2] = 1 / hoistHeightM; basis[i + 3] = slot;
      }
      geometry.setAttribute('aCampFlagBasis', new Float32BufferAttribute(basis, 4));
      // Include a full gust and the Languages lift in culling and shadow bounds.
      geometry.computeBoundingBox(); geometry.boundingBox?.expandByScalar(0.48);
      geometry.computeBoundingSphere(); if (geometry.boundingSphere) geometry.boundingSphere.radius += 0.48;
      flag.geometry = geometry;
      flag.customDepthMaterial = depth;
      liftsByFlag.set(flag, { lifts: lifts.value, slot });
      flag.userData.campFlagLift = 0;
      if (!patched.has(material)) {
        patch(material, true);
        patched.add(material);
      }
      return geometry;
    },
  };
}
