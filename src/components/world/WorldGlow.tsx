import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial, PlaneGeometry, ShaderMaterial, type ColorRepresentation } from 'three';
import { night } from './WorldNight';

/**
 * Shared night-light kit (render session). The island keeps <= 8 point lights (three compiles every light into every lit
 * material), so lamps, windows, signs and screens light the night with these two pieces instead of new lights:
 *
 * 1. glowMaterial(color, opts): a MeshStandardMaterial whose emissive follows the shared night clock (dusk -> night).
 *    Use it for lamp heads, window panes, sign faces. Cached per (color, opts): every caller with the same look shares
 *    one material and one shader program.
 *       const mat = glowMaterial('#FFC978', { dusk: .05, night: 1.6 });
 *
 * 2. <LightPools pools={[{ position: [x, y, z], radius: 3.5, color: '#FFD08A', strength: 1 }, ...]} />: ground light
 *    pools as ONE instanced draw of soft additive discs (radial falloff, slight warm core), fading in with night.value.
 *    No depth write, no shadow, renderOrder 1 so it composites over terrain/paving; y should be the ground height.
 *    Budget: 1 draw call and 2 triangles per pool. Put all of a district's pools in one <LightPools> (one draw).
 *    Set `day` > 0 for pools that should faintly show at dusk too (e.g. the campfire).
 *
 * Both pieces are static in pause/QA-shot mode except for the night transition (no flicker here; add your own if a
 * light should flicker, as the campfire does).
 */
export type GlowOptions = { dusk?: number; night?: number; roughness?: number; metalness?: number; color?: ColorRepresentation };
type GlowMaterial = MeshStandardMaterial & { userData: { glow: { dusk: number; night: number } } };
const glowCache = new Map<string, GlowMaterial>();
export function glowMaterial(emissive: ColorRepresentation, opts: GlowOptions = {}) {
  const key = `${new Color(emissive).getHexString()}|${opts.dusk ?? .05}|${opts.night ?? 1.5}|${opts.roughness ?? .9}|${opts.metalness ?? 0}|${opts.color ?? ''}`;
  let m = glowCache.get(key);
  if (!m) {
    const made = new MeshStandardMaterial({ color: opts.color ?? emissive, emissive, emissiveIntensity: opts.dusk ?? .05, roughness: opts.roughness ?? .9, metalness: opts.metalness ?? 0 }) as GlowMaterial;
    made.name = `world-glow-${key}`;
    made.userData.glow = { dusk: opts.dusk ?? .05, night: opts.night ?? 1.5 };
    glowCache.set(key, made);
    m = made;
  }
  return m;
}
/** Mount once (WorldEnvironment does): drives every glowMaterial from the night clock. */
export function GlowClock() {
  useFrame(() => {
    const n = night.value;
    for (const m of glowCache.values()) m.emissiveIntensity = m.userData.glow.dusk + (m.userData.glow.night - m.userData.glow.dusk) * n;
  });
  return null;
}

export type LightPool = { position: readonly [number, number, number]; radius: number; color?: ColorRepresentation; strength?: number; day?: number };
const poolMaterial = () => new ShaderMaterial({
  uniforms: { uNight: { value: 0 } },
  transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false, toneMapped: true,
  vertexShader: /* glsl */`
    attribute vec4 poolColor; // rgb, strength
    attribute float poolDay;
    uniform float uNight;
    varying vec2 vUv; varying vec3 vColor;
    void main() {
      vUv = uv * 2.0 - 1.0;
      // 0.35 at strength 1: a lamp pool brightens lit ground ~1.5x at night without clipping (additive, pre-tonemap).
      vColor = poolColor.rgb * poolColor.a * 0.35 * mix(poolDay, 1.0, uNight);
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    varying vec2 vUv; varying vec3 vColor;
    void main() {
      float r = length(vUv);
      if (r > 1.0) discard;
      // Smooth inverse-square-like falloff with a soft core; no hard rim.
      float f = pow(1.0 - r * r, 2.0) * (0.75 + 0.25 * (1.0 - smoothstep(0.0, 0.35, r)));
      gl_FragColor = vec4(vColor * f, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
export function LightPools({ pools, name = 'world-light-pools' }: { pools: readonly LightPool[]; name?: string }) {
  const ref = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => { const g = new PlaneGeometry(2, 2); g.rotateX(-Math.PI / 2); return g; }, []);
  const material = useMemo(poolMaterial, []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useLayoutEffect(() => {
    const mesh = ref.current; if (!mesh) return;
    const m = new Matrix4(), c = new Color(), col = new Float32Array(pools.length * 4), day = new Float32Array(pools.length);
    pools.forEach((p, i) => {
      // 3 cm above the ground to stay over paving without z-fighting.
      mesh.setMatrixAt(i, m.makeScale(p.radius, 1, p.radius).setPosition(p.position[0], p.position[1] + .03, p.position[2]));
      c.set(p.color ?? '#FFD08A'); col.set([c.r, c.g, c.b, p.strength ?? 1], i * 4); day[i] = p.day ?? 0;
    });
    geometry.setAttribute('poolColor', new InstancedBufferAttribute(col, 4));
    geometry.setAttribute('poolDay', new InstancedBufferAttribute(day, 1));
    mesh.count = pools.length; mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
  }, [pools, geometry]);
  useFrame(() => { material.uniforms.uNight.value = night.value; ref.current && (ref.current.visible = night.value > .001 || pools.some(p => (p.day ?? 0) > 0)); });
  return <instancedMesh ref={ref} name={name} args={[geometry, material, Math.max(1, pools.length)]} renderOrder={1} frustumCulled />;
}

/** QA demo (?qa=1&glowDemo=1 only): three pools + a glow cube at the south beach walk, for the kit's own visual check. */
export function GlowDemo() {
  const on = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('glowDemo') === '1' && new URLSearchParams(window.location.search).get('qa') === '1';
  const pools = useMemo<LightPool[]>(() => [{ position: [-30, 1.1, 85.5], radius: 3.2 }, { position: [-26, 1.1, 86.8], radius: 3.2, color: '#FFB066' }, { position: [-22, 1.1, 86.6], radius: 2.4, color: '#9FE3FF', strength: .8 }], []);
  if (!on) return null;
  return <group name="world-glow-demo"><LightPools pools={pools} name="world-glow-demo-pools" />
    <mesh position={[-26, 3.2, 87.5]} material={glowMaterial('#FFC978', { dusk: .05, night: 2 })}><boxGeometry args={[.4, .4, .4]} /></mesh></group>;
}
