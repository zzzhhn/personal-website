import { AdditiveBlending, BufferGeometry, CircleGeometry, DoubleSide, Float32BufferAttribute, MeshStandardMaterial, ShaderMaterial } from 'three';
import { windUniforms } from './WorldWind';
import { PORTAL_THRESHOLD as T } from './world-portals';

export const PORTAL_PARTICLE_COUNT = 28;
/** G28.glb is authored front +X / circle YZ. All portal logic uses front +Z / XY. */
export const PORTAL_FRAME_YAW = -Math.PI / 2;

/** One shared solid threshold: 55 cm top, 1 m landing, 2 m ramps on both sides.
 * Visual and Rapier use these exact indexed triangles. Ramp toe is 12 mm above
 * the site floor to absorb the park's 6 mm flagstone texture without a gap. */
export function createPortalThreshold() {
  const vertices = new Float32Array(16 * 3), indices: number[] = [];
  const zs = [-T.halfLength, -T.halfLanding, T.halfLanding, T.halfLength], tops = [T.toe, T.top, T.top, T.toe];
  zs.forEach((z, i) => {
    vertices.set([-T.width / 2, tops[i], z, T.width / 2, tops[i], z, -T.width / 2, -.06, z, T.width / 2, -.06, z], i * 12);
    if (i === 3) return;
    const a = i * 4, b = a + 4;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
    indices.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
    indices.push(a, a + 2, b, a + 2, b + 2, b);
    indices.push(a + 1, b + 1, a + 3, a + 3, b + 1, b + 3);
  });
  indices.push(0, 1, 2, 1, 3, 2, 12, 14, 13, 13, 14, 15);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const material = new MeshStandardMaterial({ name: 'G28-threshold-stone', color: '#8E8B7C', roughness: .96, flatShading: true });
  return { geometry, material, vertices, indices: new Uint32Array(indices), dispose() { geometry.dispose(); material.dispose(); } };
}

/** Shared by all gates. No framebuffer, texture, light, per-particle object or clock. */
export function createPortalSurface() {
  const curtainGeometry = new CircleGeometry(1.235, 48).translate(0, 1.65, 0);
  const curtainMaterial = new ShaderMaterial({
    name: 'G28-thin-opal-membrane', transparent: true, depthWrite: false,
    side: DoubleSide, forceSinglePass: true, toneMapped: false,
    uniforms: { uTime: windUniforms.uWindTime, uMotion: windUniforms.uWindStrength },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uMotion;
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        float t = uTime * 0.24 * uMotion;
        float edge = smoothstep(0.68, 0.98, r);
        float grain = sin(p.y * 53.0 + sin(p.x * 21.0) * 0.6) * 0.012;
        float weave = sin(p.y * 13.0 + sin(p.x * 6.0 + t) * 1.5 - t * 2.0);
        float thread = pow(0.5 + 0.5 * weave, 12.0);
        float ripple = pow(0.5 + 0.5 * sin(r * 27.0 - t * 3.0), 16.0);
        float rim = pow(smoothstep(0.85, 1.0, r), 3.0);
        vec3 deep = vec3(0.09, 0.34, 0.36);
        vec3 pearl = vec3(0.44, 0.83, 0.77);
        vec3 color = mix(deep, pearl, 0.25 + edge * 0.6 + thread * 0.15);
        float alpha = 0.12 + edge * 0.18 + rim * 0.21 + grain;
        alpha += (thread * 0.08 + ripple * 0.025) * (0.35 + 0.65 * uMotion);
        gl_FragColor = vec4(color, alpha * (1.0 - smoothstep(0.985, 1.0, r)));
      }`,
  });
  const positions: number[] = [], seeds: number[] = [];
  for (let i = 0; i < PORTAL_PARTICLE_COUNT; i++) {
    const a = i * 2.39996323, r = .45 + .7 * ((i * 13 % 29) / 29);
    positions.push(Math.cos(a) * r, 1.65 + Math.sin(a) * r, Math.sin(i * 7.1) * .16);
    seeds.push(i * 1.137);
  }
  const particleGeometry = new BufferGeometry();
  particleGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  particleGeometry.setAttribute('aSeed', new Float32BufferAttribute(seeds, 1));
  particleGeometry.computeBoundingSphere();
  if (particleGeometry.boundingSphere) particleGeometry.boundingSphere.radius += .12;
  const particleMaterial = new ShaderMaterial({
    name: 'G28-bounded-opal-motes', transparent: true, depthWrite: false,
    blending: AdditiveBlending, toneMapped: false,
    uniforms: { uTime: windUniforms.uWindTime, uMotion: windUniforms.uWindStrength },
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform float uMotion;
      attribute float aSeed;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        float t = uTime * 0.5 * uMotion + aSeed;
        p += vec3(sin(t * 0.7), cos(t), sin(t * 0.8)) * 0.055 * uMotion;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(42.0 / max(1.0, -mv.z), 1.0, 4.0);
        vAlpha = 0.24 + 0.15 * sin(t * 1.1);
      }`,
    fragmentShader: /* glsl */`
      varying float vAlpha;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        gl_FragColor = vec4(0.5, 0.94, 0.85, (1.0 - smoothstep(0.15, 0.95, r)) * vAlpha);
      }`,
  });
  return {
    curtainGeometry, curtainMaterial, particleGeometry, particleMaterial,
    dispose() {
      curtainGeometry.dispose(); curtainMaterial.dispose();
      particleGeometry.dispose(); particleMaterial.dispose();
    },
  };
}
