import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import {
  BufferGeometry, Color, DataTexture, DoubleSide, Float32BufferAttribute, InstancedMesh, LinearFilter, MeshStandardMaterial, Object3D,
  Quaternion, RepeatWrapping, RGBAFormat, UnsignedByteType, Vector3, Vector4,
} from 'three';
import { VEHICLES } from './layout';
import { useWorldStore } from './store';
import { windUniforms } from './WorldWind';
import type { VehicleId } from './types';

/** quality-v4 ground grass (spec §3 ground detail, Bobby 2026-10-22 "grass bends under people and
 * cars"). One instanced draw of 15-triangle tufts (5 blades x 3 triangles), dense near the focus
 * and thinned with distance and quality. Blades sway with the shared wind clock and are bent by
 * (a) live disturbers (player feet, each vehicle axle: xz, radius, strength) and (b) a decaying
 * trample map, so grass stays down briefly after a body leaves and then slowly recovers.
 * Visual only: no colliders. The actor tracker below is also used by the sea's clear spot. */

/* ------------------------------------------------------------------ actor tracker */

export interface ActorSample { kind: 'player' | 'vehicle'; id: string; x: number; y: number; z: number; radius: number; bottom: number; active: boolean; speed: number }
/** Updated once per frame by <ActorTracker/> (player from the G24 visual, vehicles from Rapier). */
export const actorState: { actors: ActorSample[]; active: ActorSample | null; frame: number } = { actors: [], active: null, frame: 0 };
const VEHICLE_SIZE = new Map<VehicleId, [number, number, number]>(VEHICLES.map(v => [v.id, v.size]));

export function ActorTracker() {
  const { scene } = useThree();
  const { world } = useRapier();
  const guide = useRef<Object3D | null>(null);
  const tmp = useMemo(() => ({ v: new Vector3(), q: new Quaternion(), f: new Vector3() }), []);
  useFrame(() => {
    const out: ActorSample[] = [];
    const activeVehicle = useWorldStore.getState().activeVehicle;
    if (!guide.current || !guide.current.parent) guide.current = scene.getObjectByName('world-guide-G24') ?? null;
    if (guide.current && !activeVehicle) {
      guide.current.getWorldPosition(tmp.v);
      // Guide origin is the capsule foot; body centre ~0.85 m above.
      out.push({ kind: 'player', id: 'player', x: tmp.v.x, y: tmp.v.y + .85, z: tmp.v.z, radius: .45, bottom: tmp.v.y, active: true, speed: 0 });
    }
    world.forEachRigidBody(body => {
      const id = (body.userData as { vehicle?: VehicleId } | undefined)?.vehicle;
      if (!id) return;
      const t = body.translation(), r = body.rotation(), lv = body.linvel(), size = VEHICLE_SIZE.get(id) ?? [4, 1.4, 2];
      tmp.q.set(r.x, r.y, r.z, r.w); tmp.f.set(1, 0, 0).applyQuaternion(tmp.q);
      const half = size[0] * .36;
      // Two axle disturbers per vehicle; the record keeps the centre for the sea spot.
      out.push({ kind: 'vehicle', id, x: t.x, y: t.y, z: t.z, radius: size[2] * .5 + .35, bottom: t.y - size[1] * .5, active: id === activeVehicle, speed: Math.hypot(lv.x, lv.z), axle: [t.x + tmp.f.x * half, t.z + tmp.f.z * half, t.x - tmp.f.x * half, t.z - tmp.f.z * half] } as ActorSample & { axle: number[] });
    });
    actorState.actors = out;
    actorState.active = out.find(a => a.active) ?? null;
    actorState.frame++;
  });
  return null;
}

/* ------------------------------------------------------------------ trample map */

/** World-anchored toroidal map: 256 x 256 texels at 0.25 m (64 m period, RepeatWrapping). It is
 * only read within 30 m of the focus, so the period never aliases visible grass.
 * R = bend amount, G/B = bend direction (x, z) encoded 0..1. Decays ~4.7 s from full; the
 * eased mapping keeps blades mostly down for ~1.5 s, then they rise. */
const TRAMPLE_RES = 256, TRAMPLE_CELL = .25, TRAMPLE_DECAY = .2;
const MAX_DISTURBERS = 8;
function createTrample() {
  const data = new Uint8Array(TRAMPLE_RES * TRAMPLE_RES * 4);
  for (let i = 0; i < data.length; i += 4) { data[i + 1] = 128; data[i + 2] = 128; }
  const texture = new DataTexture(data, TRAMPLE_RES, TRAMPLE_RES, RGBAFormat, UnsignedByteType);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return { data, texture, amount: new Float32Array(TRAMPLE_RES * TRAMPLE_RES), active: new Set<number>() };
}

/* ------------------------------------------------------------------ geometry + material */

const BLADE_H = .42;
/** Five blades, each a two-segment taper (quad + tip = 3 triangles): 15 triangles per tuft.
 * aBlade.x = height fraction 0..1 (bend weight), aBlade.y = blade phase. */
export function grassTuftGeometry() {
  const pos: number[] = [], col: number[] = [], blade: number[] = [];
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2 + .7 * (k % 2), r = .03 + .05 * ((k * 7) % 3) / 2, lean = .16 + .1 * ((k * 3) % 2);
    const h = BLADE_H * (.7 + .3 * ((k * 5) % 4) / 3), w = .035;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r, dx = Math.cos(a) * lean, dz = Math.sin(a) * lean;
    const tx = -Math.sin(a) * w, tz = Math.cos(a) * w;
    const p0 = [bx - tx, 0, bz - tz], p1 = [bx + tx, 0, bz + tz];
    const m0 = [bx - tx * .7 + dx * .35, h * .55, bz - tz * .7 + dz * .35], m1 = [bx + tx * .7 + dx * .35, h * .55, bz + tz * .7 + dz * .35];
    const tip = [bx + dx, h, bz + dz];
    const tris = [p0, p1, m1, p0, m1, m0, m0, m1, tip];
    tris.forEach(v => {
      pos.push(...v);
      const f = v[1] / h;
      blade.push(v[1] / BLADE_H, k / 5);
      col.push(.62 + .5 * f, .66 + .48 * f, .58 + .42 * f);
    });
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setAttribute('aBlade', new Float32BufferAttribute(blade, 2));
  // Up-facing normals: blades light like the ground they grow from (no dark back faces).
  g.setAttribute('normal', new Float32BufferAttribute(Array.from({ length: pos.length / 3 }, () => [0, 1, 0]).flat(), 3));
  g.computeBoundingSphere();
  return g;
}
export const GRASS_TUFT_TRIANGLES = 15;

function grassMaterial(uniforms: Record<string, { value: unknown }>) {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: .95, side: DoubleSide });
  m.name = 'ground-grass-blades';
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `attribute vec2 aBlade;
uniform float uWindTime; uniform float uWindStrength;
uniform vec4 uPush[${MAX_DISTURBERS}];
uniform sampler2D uTrample; uniform vec3 uFocus; uniform vec2 uFade;
varying float vBend;
` + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec3 base = instanceMatrix[3].xyz;
        float s2 = dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz);
        float f = aBlade.x;
        // Distance fade: blades shrink into the ground before they are culled (no popping).
        float fade = 1.0 - smoothstep(uFade.x, uFade.y, distance(base.xz, uFocus.xz));
        // Live disturbers: push away from each centre, strongest inside the radius.
        vec2 dir = vec2(0.0); float bend = 0.0;
        for (int i = 0; i < ${MAX_DISTURBERS}; i++) {
          vec4 d = uPush[i];
          if (d.w <= 0.0) continue;
          vec2 o = base.xz - d.xy; float l = length(o);
          float k = d.w * (1.0 - smoothstep(d.z * 0.55, d.z, l));
          if (k > bend) { bend = k; dir = l > 1e-3 ? o / l : vec2(1.0, 0.0); }
        }
        // Trample memory (decays on the CPU) keeps grass down after the body leaves.
        vec4 tr = texture2D(uTrample, base.xz / ${(TRAMPLE_RES * TRAMPLE_CELL).toFixed(1)});
        float near = 1.0 - smoothstep(26.0, 30.0, distance(base.xz, uFocus.xz));
        float tb = tr.r * near;
        if (tb > bend) { bend = tb; dir = normalize(tr.gb * 2.0 - 1.0 + vec2(1e-4)); }
        bend = clamp(bend, 0.0, 1.0);
        vBend = bend;
        // Wind sway, reduced while flattened.
        float ph = dot(base.xz, vec2(0.37, 0.21)) + aBlade.y * 6.2831;
        vec2 wind = vec2(0.8, 0.6) * (sin(uWindTime * 1.9 + ph) * 0.06 + sin(uWindTime * 3.3 + ph * 1.7) * 0.025) * uWindStrength * (1.0 - bend * 0.85);
        // World-space bend: tip leans along dir and drops (blade length roughly kept).
        float h = position.y;
        vec2 lean = dir * bend * h * 1.15 + wind * h / ${BLADE_H.toFixed(2)};
        vec3 disp = vec3(lean.x, -h * bend * 0.72, lean.y);
        // To instance-local space (instance = translate * yaw * uniform scale).
        transformed += vec3(dot(instanceMatrix[0].xyz, disp), 0.0, dot(instanceMatrix[2].xyz, disp)) / s2 + vec3(0.0, disp.y / sqrt(s2), 0.0);
        transformed *= vec3(1.0, fade, 1.0);
        transformed.y = max(transformed.y, 0.012 * f);
      }`);
    // Both faces use the ground-up normal (DoubleSide would flip back faces dark), and pressed
    // blades read a touch lighter/drier, so a trodden trail shows from the follow camera.
    shader.fragmentShader = 'varying float vBend;\n' + shader.fragmentShader
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
      nonPerturbedNormal = normal;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb *= mix(vec3(1.0), vec3(1.22, 1.18, 1.0), vBend);`);
  };
  m.customProgramCacheKey = () => 'ground-grass-blades-v2';
  return m;
}

/* ------------------------------------------------------------------ component */

export const GRASS_PROFILE = {
  // Caps from the terrain-session budget (SESSION-RULES §5: grass + pebbles <= 2 calls / 40k triangles):
  // 2450 tufts x 15 = 36.75k, pebbles <= 160 x 20 = 3.2k. Nearest tufts are kept first.
  high: { near: 14, far: 34, farKeep: .3, cap: 2450 },
  balanced: { near: 10, far: 26, farKeep: .25, cap: 1800 },
} as const;
/** Exposed for QA: live counts and the trample state. */
export const grassDebug = { instances: 0, triangles: 0, disturbers: 0, trampleActive: 0, maxTrample: 0, profile: 'high' as keyof typeof GRASS_PROFILE,
  /** Trample amount 0..1 at a world point (max over a 0.5 m neighbourhood). */
  trampleAt: (x: number, z: number) => { void x; void z; return 0; } };

/** data stride 6: x, y, z, yaw, size 0..1, keep (lower = kept first). */
export default function WorldGrass({ data }: { data: Float32Array }) {
  const ref = useRef<InstancedMesh>(null);
  const count = data.length / 6;
  const geometry = useMemo(grassTuftGeometry, []);
  const trample = useMemo(createTrample, []);
  const uniforms = useMemo(() => ({
    uWindTime: windUniforms.uWindTime, uWindStrength: windUniforms.uWindStrength,
    uPush: { value: Array.from({ length: MAX_DISTURBERS }, () => new Vector4()) },
    uTrample: { value: trample.texture }, uFocus: { value: new Vector3() }, uFade: { value: [30, 36] },
  }), [trample]);
  const material = useMemo(() => grassMaterial(uniforms), [uniforms]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); trample.texture.dispose(); }, [geometry, material, trample]);
  const state = useRef({ fx: 1e9, fz: 1e9, quality: '', lastTime: -1 });
  // Candidates arrive asynchronously (built over idle frames): force a refill when they do.
  useEffect(() => { state.current.fx = 1e9; }, [data]);
  const tint = useMemo(() => ({ a: new Color('#76863A'), b: new Color('#9DAA4E'), c: new Color() }), []);
  useEffect(() => {
    grassDebug.trampleAt = (x, z) => {
      let m = 0; const cx = Math.floor(x / TRAMPLE_CELL), cz = Math.floor(z / TRAMPLE_CELL);
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
        const ti = (((cz + j) % TRAMPLE_RES) + TRAMPLE_RES) % TRAMPLE_RES, tj = (((cx + i) % TRAMPLE_RES) + TRAMPLE_RES) % TRAMPLE_RES;
        m = Math.max(m, trample.amount[ti * TRAMPLE_RES + tj]);
      }
      return +m.toFixed(3);
    };
  }, [trample]);

  const refill = (fx: number, fz: number, q: keyof typeof GRASS_PROFILE) => {
    const mesh = ref.current; if (!mesh) return;
    const p = GRASS_PROFILE[q], pick: [number, number][] = [];
    for (let i = 0; i < count; i++) {
      const d = Math.hypot(data[i * 6] - fx, data[i * 6 + 2] - fz);
      if (d > p.far) continue;
      const keep = d < p.near ? 1 : 1 + (p.farKeep - 1) * (d - p.near) / (p.far - p.near);
      if (data[i * 6 + 5] > keep * (q === 'balanced' ? .7 : 1)) continue;
      pick.push([d, i]);
    }
    if (pick.length > p.cap) { pick.sort((a, b) => a[0] - b[0]); pick.length = p.cap; }
    const dummy = new Object3D();
    pick.forEach(([, i], n) => {
      const s = .7 + data[i * 6 + 4] * .75;
      dummy.position.set(data[i * 6], data[i * 6 + 1] - .02, data[i * 6 + 2]); dummy.rotation.set(0, data[i * 6 + 3], 0); dummy.scale.setScalar(s); dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix); mesh.setColorAt(n, tint.c.copy(tint.a).lerp(tint.b, data[i * 6 + 4]));
    });
    mesh.count = pick.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    uniforms.uFade.value = [p.far - 6, p.far];
    grassDebug.instances = pick.length; grassDebug.triangles = pick.length * GRASS_TUFT_TRIANGLES; grassDebug.profile = q;
  };

  const stamp = (x: number, z: number, radius: number, strength: number) => {
    const r = Math.ceil(radius / TRAMPLE_CELL), cx = Math.floor(x / TRAMPLE_CELL), cz = Math.floor(z / TRAMPLE_CELL);
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const wx = (cx + i + .5) * TRAMPLE_CELL - x, wz = (cz + j + .5) * TRAMPLE_CELL - z, l = Math.hypot(wx, wz);
      if (l > radius) continue;
      const k = strength * Math.min(1, 1.6 * (1 - l / radius));
      const ti = (((cz + j) % TRAMPLE_RES) + TRAMPLE_RES) % TRAMPLE_RES, tj = (((cx + i) % TRAMPLE_RES) + TRAMPLE_RES) % TRAMPLE_RES;
      const idx = ti * TRAMPLE_RES + tj;
      if (k <= trample.amount[idx]) continue;
      trample.amount[idx] = k;
      const o = idx * 4;
      trample.data[o + 1] = Math.round((wx / Math.max(l, 1e-3) * .5 + .5) * 255);
      trample.data[o + 2] = Math.round((wz / Math.max(l, 1e-3) * .5 + .5) * 255);
      trample.active.add(idx);
    }
  };

  useFrame(({ camera }) => {
    const store = useWorldStore.getState(), q = store.quality;
    // Focus: the tracked actor, or the camera ground target for fixed QA shots.
    const actor = actorState.active;
    const fx = store.shot ? camera.position.x - camera.position.y * .6 : actor?.x ?? store.position[0];
    const fz = store.shot ? camera.position.z - camera.position.y * .6 : actor?.z ?? store.position[2];
    uniforms.uFocus.value.set(fx, 0, fz);
    const s = state.current;
    if (Math.hypot(fx - s.fx, fz - s.fz) > 2 || s.quality !== q) { s.fx = fx; s.fz = fz; s.quality = q; refill(fx, fz, q); }

    // Live disturbers: the player's footprint and every vehicle axle near the focus.
    const push = uniforms.uPush.value; let n = 0;
    for (const a of actorState.actors) {
      if (Math.hypot(a.x - fx, a.z - fz) > 40) continue;
      if (a.kind === 'player' && n < MAX_DISTURBERS) {
        push[n++].set(a.x, a.z, .6, 1);
      } else if (a.kind === 'vehicle') {
        const axle = (a as ActorSample & { axle: number[] }).axle;
        for (let k = 0; k < 2 && n < MAX_DISTURBERS; k++) push[n++].set(axle[k * 2], axle[k * 2 + 1], a.radius, 1);
      }
    }
    for (let k = n; k < MAX_DISTURBERS; k++) push[k].set(0, 0, 0, 0);
    grassDebug.disturbers = n;

    // Trample memory advances on the shared wind clock (stops when paused / in QA shots).
    const t = windUniforms.uWindTime.value, dt = s.lastTime < 0 ? 0 : Math.max(0, Math.min(.1, t - s.lastTime));
    s.lastTime = t;
    if (dt > 0) {
      for (let k = 0; k < n; k++) stamp(push[k].x, push[k].y, push[k].z * .9, .95);
      let max = 0; const dirty = trample.active.size > 0;
      for (const idx of trample.active) {
        const v = trample.amount[idx] - TRAMPLE_DECAY * dt;
        if (v <= 0) { trample.amount[idx] = 0; trample.data[idx * 4] = 0; trample.active.delete(idx); continue; }
        trample.amount[idx] = v; max = Math.max(max, v);
        // Ease-out recovery: stays down, then rises.
        trample.data[idx * 4] = Math.round(Math.min(1, v * 1.25) ** .7 * 255);
      }
      grassDebug.trampleActive = trample.active.size; grassDebug.maxTrample = +max.toFixed(3);
      // Upload only while something is bent or recovering (256 KB RGBA8).
      if (dirty) trample.texture.needsUpdate = true;
    }
  });

  return <instancedMesh ref={ref} name="ground-grass-blades" args={[geometry, material, GRASS_PROFILE.high.cap]} receiveShadow frustumCulled={false} />;
}

