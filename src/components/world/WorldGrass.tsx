import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import {
  BufferGeometry, Color, DataTexture, DoubleSide, Float32BufferAttribute, Frustum, InstancedBufferAttribute, InstancedMesh, LinearFilter, Matrix4, MeshStandardMaterial, Object3D, Sphere,
  ClampToEdgeWrapping, Quaternion, RGBAFormat, UnsignedByteType, Vector3, Vector4,
} from 'three';
import { VEHICLES } from './layout';
import { useWorldStore } from './store';
import { windUniforms } from './WorldWind';
import { GRID } from './WorldLandform';
import type { VehicleId } from './types';
import { quarryFloraBanks, quarryFloraStyle } from './alpha-mine-flora';
import { createTrampleUploads } from './grass-trample-uploads.ts';

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

/** Bounded world map, 0.5 m per texel over the entire terrain grid. A footprint must never wrap to
 * another meadow 64 m away when the focus moves across the larger v4 island.
 * R = bend amount, G/B = bend direction (x, z) encoded 0..1. Decays ~4.7 s from full; the
 * eased mapping keeps blades mostly down for ~1.5 s, then they rise. */
const TRAMPLE_CELL = .5, TRAMPLE_DECAY = .2;
const TRAMPLE_NX = GRID.nx + 1, TRAMPLE_NZ = GRID.nz + 1;
const MAX_DISTURBERS = 8;
function createTrample() {
  const data = new Uint8Array(TRAMPLE_NX * TRAMPLE_NZ * 4);
  for (let i = 0; i < data.length; i += 4) { data[i + 1] = 128; data[i + 2] = 128; }
  const texture = new DataTexture(data, TRAMPLE_NX, TRAMPLE_NZ, RGBAFormat, UnsignedByteType);
  texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
  texture.magFilter = texture.minFilter = LinearFilter;
  const uploads = createTrampleUploads(texture, data, TRAMPLE_NX, TRAMPLE_NZ);
  return { data, texture, uploads, amount: new Float32Array(TRAMPLE_NX * TRAMPLE_NZ), active: new Set<number>() };
}

/* ------------------------------------------------------------------ geometry + material */

const BLADE_H = .42;
/** Five blades, each a two-segment taper (quad + tip = 3 triangles): 15 triangles per tuft.
 * aBlade.x = packed quarry detail, aBlade.y = island blade phase, aBlade.z = island cross-width.
 * Bend weight is derived from the selected geometry's height, not the original grass bank. */
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
    tris.forEach((v, i) => {
      pos.push(...v);
      const f = v[1] / h;
      blade.push(v[1] / BLADE_H, k / 5, [0, 1, 1, 0, 1, 0, 0, 1, .5][i]);
      col.push(.62 + .5 * f, .66 + .48 * f, .58 + .42 * f);
    });
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setAttribute('aBlade', new Float32BufferAttribute(blade, 3));
  const flora=quarryFloraBanks();
  // Spare .w lanes carry quarry tuft XYZ; aBlade.x no longer needs to store height,
  // which the shader derives from the selected position. Keep the original attribute slots.
  const packed=(bank:number[],axis:number)=>bank.flatMap((_,i)=>i%3===0
    ?[bank[i],bank[i+1],bank[i+2],flora.tuft[i+axis]]:[]);
  g.setAttribute('aLeafPosition',new Float32BufferAttribute(packed(flora.leaf,0),4));
  g.setAttribute('aBloomPosition',new Float32BufferAttribute(packed(flora.bloom,1),4));
  g.setAttribute('aBloomColor',new Float32BufferAttribute(packed(flora.colour,2),4));
  for(let i=0;i<45;i++)g.getAttribute('aBlade').setX(i,flora.detail[i]);
  g.setAttribute('aFloraKind',new InstancedBufferAttribute(new Float32Array(2450),1));
  // Up-facing normals: blades light like the ground they grow from (no dark back faces).
  g.setAttribute('normal', new Float32BufferAttribute(Array.from({ length: pos.length / 3 }, () => [0, 1, 0]).flat(), 3));
  g.computeBoundingSphere();
  return g;
}
export const GRASS_TUFT_TRIANGLES = 15;

export function grassMaterial(uniforms: Record<string, { value: unknown }>) {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: .95, side: DoubleSide });
  m.name = 'ground-grass-blades';
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `attribute vec3 aBlade;
attribute vec4 aLeafPosition; attribute vec4 aBloomPosition; attribute vec4 aBloomColor; attribute float aFloraKind;
uniform float uWindTime; uniform float uWindStrength;
uniform vec4 uPush[${MAX_DISTURBERS}];
uniform float uPushHeight[${MAX_DISTURBERS}];
uniform sampler2D uTrample; uniform vec3 uFocus; uniform vec2 uFade;
varying float vBend;
varying vec2 vBladeDetail;
` + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        if(aFloraKind>2.5)transformed=vec3(aLeafPosition.w,aBloomPosition.w,aBloomColor.w);
        else if(aFloraKind>1.5)transformed=aBloomPosition.xyz;
        else if(aFloraKind>.5)transformed=aLeafPosition.xyz;
        vec3 base = instanceMatrix[3].xyz;
        float s2 = dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz);
        float f = transformed.y / ${BLADE_H.toFixed(2)};
        float crossWidth = aFloraKind>2.5 ? mod(floor(aBlade.x/16.0),4.0)*0.5 : aFloraKind>1.5 ? mod(floor(aBlade.x/4.0),4.0)*0.5 : aFloraKind>.5 ? mod(aBlade.x,4.0)*0.5 : aBlade.z;
        vBladeDetail = vec2(crossWidth, f);
        // Distance fade: blades shrink into the ground before they are culled (no popping).
        float fade = 1.0 - smoothstep(uFade.x, uFade.y, distance(base.xz, uFocus.xz));
        // Live disturbers: push away from each centre, strongest inside the radius.
        vec2 dir = vec2(0.0); float bend = 0.0;
        for (int i = 0; i < ${MAX_DISTURBERS}; i++) {
          vec4 d = uPush[i];
          if (d.w <= 0.0 || abs(base.y - uPushHeight[i]) > 0.55) continue;
          vec2 o = base.xz - d.xy; float l = length(o);
          float k = d.w * (1.0 - smoothstep(d.z * 0.55, d.z, l));
          if (k > bend) { bend = k; dir = l > 1e-3 ? o / l : vec2(1.0, 0.0); }
        }
        // Trample memory (decays on the CPU) keeps grass down after the body leaves.
        vec2 trUv = (base.xz - vec2(${GRID.minX.toFixed(1)}, ${GRID.minZ.toFixed(1)}) + vec2(0.25)) / vec2(${(TRAMPLE_NX * TRAMPLE_CELL).toFixed(1)}, ${(TRAMPLE_NZ * TRAMPLE_CELL).toFixed(1)});
        vec4 tr = texture2D(uTrample, trUv);
        float near = 1.0 - smoothstep(26.0, 30.0, distance(base.xz, uFocus.xz));
        float tb = tr.r * near * (1.0 - step(0.65, abs(base.y - (tr.a * 32.0 - 8.0))));
        if (tb > bend) { bend = tb; dir = normalize(tr.gb * 2.0 - 1.0 + vec2(1e-4)); }
        bend = clamp(bend, 0.0, 1.0);
        vBend = bend;
        // Wind sway, reduced while flattened.
        // Connected stems/petals share a phase, so their junctions do not separate in wind.
        float bladePhase = aFloraKind>2.5 ? floor(aBlade.x/64.0)/8.0 : aFloraKind>.5 ? 0.0 : aBlade.y;
        float ph = dot(base.xz, vec2(0.37, 0.21)) + bladePhase * 6.2831;
        vec2 wind = vec2(0.8, 0.6) * (sin(uWindTime * 1.9 + ph) * 0.06 + sin(uWindTime * 3.3 + ph * 1.7) * 0.025) * uWindStrength * (1.0 - bend * 0.85);
        // World-space bend: tip leans along dir and drops (blade length roughly kept).
        float h = transformed.y;
        vec2 lean = dir * bend * h * 1.15 + wind * h / ${BLADE_H.toFixed(2)};
        vec3 disp = vec3(lean.x, -h * bend * 0.72, lean.y);
        // To instance-local space (instance = translate * yaw * uniform scale).
        transformed += vec3(dot(instanceMatrix[0].xyz, disp), 0.0, dot(instanceMatrix[2].xyz, disp)) / s2 + vec3(0.0, disp.y / sqrt(s2), 0.0);
        transformed *= vec3(1.0, fade, 1.0);
        transformed.y = max(transformed.y, 0.012 * f);
      }`).replace('#include <color_vertex>',`#include <color_vertex>
        if(aFloraKind>1.5 && aFloraKind<2.5)vColor.rgb=aBloomColor.rgb;
      `);
    // Both faces use the ground-up normal (DoubleSide would flip back faces dark), and pressed
    // blades read a touch lighter/drier, so a trodden trail shows from the follow camera.
    shader.fragmentShader = 'varying float vBend;\nvarying vec2 vBladeDetail;\n' + shader.fragmentShader
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
      nonPerturbedNormal = normal;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      // A subdued midrib and dark margins give each blade a readable face at close range.
      float rib = 1.0 - smoothstep(0.025, 0.12, abs(vBladeDetail.x - 0.5));
      float margin = smoothstep(0.3, 0.5, abs(vBladeDetail.x - 0.5));
      diffuseColor.rgb *= 1.0 + 0.08 * rib - 0.10 * margin;
      diffuseColor.rgb *= mix(vec3(1.0), vec3(1.16, 1.12, 1.0), vBend);`);
  };
  m.customProgramCacheKey = () => 'ground-grass-blades-v7-quarry-crowns-rgb';
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
export const grassDebug = { candidates: 0, culled: 0, uploads: 0, setCullingForQA: (_enabled: boolean) => {}, instances: 0, triangles: 0, disturbers: 0, trampleActive: 0, maxTrample: 0, profile: 'high' as keyof typeof GRASS_PROFILE,
  trampleBytes: TRAMPLE_NX * TRAMPLE_NZ * 4,
  /** Trample amount 0..1 at a world point (max over a 0.5 m neighbourhood). */
  trampleAt: (x: number, z: number) => { void x; void z; return 0; } };

/** data stride 6: x, y, z, yaw, size 0..1, keep (lower = kept first). */
export default function WorldGrass({ data }: { data: Float32Array }) {
  const ref = useRef<InstancedMesh>(null);
  const { scene, gl } = useThree();
  const cull = useMemo(() => ({
    matrices: new Float32Array(GRASS_PROFILE.high.cap * 16), colors: new Float32Array(GRASS_PROFILE.high.cap * 3), kinds:new Float32Array(GRASS_PROFILE.high.cap),
    count: 0, revision: 0, uploadedRevision: -1, enabled: true, uploadedEnabled: true,
    frustum: new Frustum(), viewProjection: new Matrix4(), previousView: new Matrix4(), previousWorld: new Matrix4(), sphere: new Sphere(),
  }), []);
  useEffect(() => {
    const mesh = ref.current; if (!mesh) return;
    mesh.instanceColor ??= new InstancedBufferAttribute(new Float32Array(GRASS_PROFILE.high.cap * 3), 3);
    const previous = scene.onBeforeRender;
    let active = true;
    const before: typeof previous = function (this: Object3D, renderer, renderScene, camera, geometry, material, group) {
      previous.call(this, renderer, renderScene, camera, geometry, material, group);
      if (!active) return;
      // Renderer has updated the actual camera/world matrices; projectObject (and instance upload)
      // follows this scene hook. A mesh hook would run after the upload, one frame too late.
      cull.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      if (cull.uploadedRevision === cull.revision && cull.uploadedEnabled === cull.enabled
        && cull.previousView.equals(cull.viewProjection) && cull.previousWorld.equals(mesh.matrixWorld)) return;
      cull.frustum.setFromProjectionMatrix(cull.viewProjection, camera.coordinateSystem);
      cull.sphere.radius = mesh.matrixWorld.getMaxScaleOnAxis(); // conservative 1 m, including wind / pressed tips
      const dst = mesh.instanceMatrix.array, colors = mesh.instanceColor!.array;
      const kinds=mesh.geometry.getAttribute('aFloraKind') as InstancedBufferAttribute;
      let visible = 0;
      for (let i = 0; i < cull.count; i++) {
        const m = i * 16;
        cull.sphere.center.set(cull.matrices[m + 12], cull.matrices[m + 13], cull.matrices[m + 14]).applyMatrix4(mesh.matrixWorld);
        if (cull.enabled && !cull.frustum.intersectsSphere(cull.sphere)) continue;
        for (let k = 0; k < 16; k++) dst[visible * 16 + k] = cull.matrices[m + k];
        for (let k = 0; k < 3; k++) colors[visible * 3 + k] = cull.colors[i * 3 + k];
        kinds.array[visible]=cull.kinds[i];
        visible++;
      }
      mesh.count = visible;
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor!.needsUpdate = true;kinds.needsUpdate=true;
      cull.previousView.copy(cull.viewProjection); cull.previousWorld.copy(mesh.matrixWorld);
      cull.uploadedRevision = cull.revision; cull.uploadedEnabled = cull.enabled;
      grassDebug.candidates = cull.count; grassDebug.culled = cull.count - visible;
      grassDebug.instances = visible; grassDebug.triangles = visible * GRASS_TUFT_TRIANGLES; grassDebug.uploads++;
    };
    scene.onBeforeRender = before;
    const qa = new URLSearchParams(window.location.search).get('qa') === '1';
    const setCullingForQA = (enabled: boolean) => { if (qa) cull.enabled = enabled; };
    grassDebug.setCullingForQA = setCullingForQA;
    return () => {
      // A later hook (e.g. shadows) may wrap ours: leave that chain intact, with ours inert.
      active = false;
      if (scene.onBeforeRender === before) scene.onBeforeRender = previous;
      if (grassDebug.setCullingForQA === setCullingForQA) grassDebug.setCullingForQA = () => {};
    };
  }, [scene, cull]);
  const count = data.length / 6;
  const geometry = useMemo(grassTuftGeometry, []);
  const trample = useMemo(createTrample, []);
  const uniforms = useMemo(() => ({
    uWindTime: windUniforms.uWindTime, uWindStrength: windUniforms.uWindStrength,
    uPush: { value: Array.from({ length: MAX_DISTURBERS }, () => new Vector4()) },
    uPushHeight: { value: new Float32Array(MAX_DISTURBERS) },
    uTrample: { value: trample.texture }, uFocus: { value: new Vector3() }, uFade: { value: [30, 36] },
  }), [trample]);
  const material = useMemo(() => grassMaterial(uniforms), [uniforms]);
  useEffect(() => {
    trample.uploads.connect(); // Effect cleanup/setup may reuse memoized resources in React StrictMode.
    return () => { geometry.dispose(); material.dispose(); trample.uploads.dispose(); trample.texture.dispose(); };
  }, [geometry, material, trample]);
  useEffect(() => {
    const restore = () => trample.uploads.reset();
    gl.domElement.addEventListener('webglcontextrestored', restore);
    return () => gl.domElement.removeEventListener('webglcontextrestored', restore);
  }, [gl, trample]);
  const state = useRef({ fx: 1e9, fz: 1e9, quality: '', lastTime: -1 });
  // Candidates arrive asynchronously (built over idle frames): force a refill when they do.
  useEffect(() => { state.current.fx = 1e9; }, [data]);
  const tint = useMemo(() => ({ a: new Color('#697B36'), b: new Color('#939F4D'), c: new Color() }), []);
  useEffect(() => {
    grassDebug.trampleAt = (x, z) => {
      let m = 0; const cx = Math.round((x - GRID.minX) / TRAMPLE_CELL), cz = Math.round((z - GRID.minZ) / TRAMPLE_CELL);
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const ti = cz + j, tj = cx + i;
        if (ti < 0 || ti >= TRAMPLE_NZ || tj < 0 || tj >= TRAMPLE_NX) continue;
        m = Math.max(m, trample.amount[ti * TRAMPLE_NX + tj]);
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
      dummy.position.set(data[i * 6], data[i * 6 + 1] - .02, data[i * 6 + 2]); dummy.rotation.set(0, data[i * 6 + 3], 0); dummy.scale.setScalar(s * (.82 + .3 * Math.abs(Math.sin(data[i * 6] * 5.7 + data[i * 6 + 2] * 3.9)))); dummy.updateMatrix();
      dummy.matrix.toArray(cull.matrices, n * 16);
      tint.c.copy(tint.a).lerp(tint.b, data[i * 6 + 4]).toArray(cull.colors, n * 3);
      cull.kinds[n]=quarryFloraStyle(data[i*6],data[i*6+2]);
    });
    cull.count = pick.length; cull.revision++;
    uniforms.uFade.value = [p.far - 6, p.far];
    grassDebug.profile = q;
  };

  const stamp = (x: number, z: number, radius: number, strength: number, height: number) => {
    const r = Math.ceil(radius / TRAMPLE_CELL), cx = Math.round((x - GRID.minX) / TRAMPLE_CELL), cz = Math.round((z - GRID.minZ) / TRAMPLE_CELL);
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const wx = GRID.minX + (cx + i) * TRAMPLE_CELL - x, wz = GRID.minZ + (cz + j) * TRAMPLE_CELL - z, l = Math.hypot(wx, wz);
      if (l > radius) continue;
      const k = strength * Math.min(1, 1.6 * (1 - l / radius));
      const ti = cz + j, tj = cx + i;
      if (ti < 0 || ti >= TRAMPLE_NZ || tj < 0 || tj >= TRAMPLE_NX) continue;
      const idx = ti * TRAMPLE_NX + tj;
      if (k <= trample.amount[idx]) continue;
      trample.amount[idx] = k;
      const o = idx * 4;
      trample.uploads.write(o + 1, Math.round((wx / Math.max(l, 1e-3) * .5 + .5) * 255));
      trample.uploads.write(o + 2, Math.round((wz / Math.max(l, 1e-3) * .5 + .5) * 255));
      trample.uploads.write(o + 3, Math.round(Math.max(0,Math.min(1,(height+8)/32))*255));
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
      // Only bodies touching this ground bend its grass (no imprint below a bridge or a jump).
      const size = a.kind === 'vehicle' ? VEHICLE_SIZE.get(a.id as VehicleId) : null;
      const foot = size ? a.y - (size[1] * .28 + .42 + Math.min(.5, Math.max(.34, size[1] * .28))) : a.bottom;
      if (a.kind === 'player' && n < MAX_DISTURBERS) {
        uniforms.uPushHeight.value[n] = foot;
        push[n++].set(a.x, a.z, .6, 1);
      } else if (a.kind === 'vehicle') {
        const axle = (a as ActorSample & { axle: number[] }).axle;
        for (let k = 0; k < 2 && n < MAX_DISTURBERS; k++) { uniforms.uPushHeight.value[n] = foot; push[n++].set(axle[k * 2], axle[k * 2 + 1], a.radius, 1); }
      }
    }
    for (let k = n; k < MAX_DISTURBERS; k++) push[k].set(0, 0, 0, 0);
    grassDebug.disturbers = n;

    // Trample memory advances on the shared wind clock (stops when paused / in QA shots).
    const t = windUniforms.uWindTime.value, dt = s.lastTime < 0 ? 0 : Math.max(0, Math.min(.1, t - s.lastTime));
    s.lastTime = t;
    if (dt > 0) {
      for (let k = 0; k < n; k++) stamp(push[k].x, push[k].y, push[k].z * .9, .95,uniforms.uPushHeight.value[k]);
      let max = 0;
      for (const idx of trample.active) {
        const v = trample.amount[idx] - TRAMPLE_DECAY * dt;
        if (v <= 0) { trample.amount[idx] = 0; trample.uploads.write(idx * 4, 0); trample.active.delete(idx); continue; }
        trample.amount[idx] = v; max = Math.max(max, v);
        // Ease-out recovery: stays down, then rises.
        trample.uploads.write(idx * 4, Math.round(Math.min(1, v * 1.25) ** .7 * 255));
      }
      grassDebug.trampleActive = trample.active.size; grassDebug.maxTrample = +max.toFixed(3);
      // Quantized RGBA changes upload only their rows, retaining unconsumed offscreen edits.
      trample.uploads.flush();
    }
  });

  return <instancedMesh ref={ref} name="ground-grass-blades" args={[geometry, material, GRASS_PROFILE.high.cap]} receiveShadow frustumCulled={false} />;
}

