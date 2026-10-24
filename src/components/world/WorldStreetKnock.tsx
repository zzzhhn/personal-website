/**
 * Street props: sleeping-dynamic knockable furniture (street session, claim 'knockable').
 * Data: layout-v4 knockablesV4() (lamps G10, signals, stop / direction signs, delineators, chevron, bins G13).
 *
 * Physics (spec 12.5): one dynamic RigidBody per prop, asleep from the first frame, convex hull colliders
 * from the same generated parts and placement as the visual. Mass sits in the base collider with a low
 * centre of mass (cast footing), so a woken prop falls like a real post instead of tipping by itself.
 * Heavy kinds (lamp, signal, sign posts) are locked while only a person is near: a walking body is stopped
 * like by a real anchored post (Bobby: "heavy things block"). The lock is released BEFORE any vehicle can
 * touch them (proximity test each step), so a car never meets a static response first (spec 12.5).
 * Bins and delineators stay free for people too. Knocked = displaced > .35 m, tilted > 20 deg or dropped
 * .5 m; 30 s later a .6 s dither fade-out, reset home (waits while home is occupied), sleep, .6 s fade-in.
 * Render: every kind in ONE BatchedMesh (L0/L1 per instance, far dither). Night: lamp lens glow plus ONE
 * instanced additive light-pool draw; no lights are added.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { ConvexHullCollider, RigidBody, useBeforePhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier';
import {
  AdditiveBlending, CanvasTexture, CircleGeometry, Color, InstancedMesh, Matrix4, MeshBasicMaterial, Object3D, Quaternion, Vector3,
} from 'three';
import { knockablesV4, OBSTACLES_V4, type Knockable, type KnockKind as LayoutKind } from './layout-v4';
import type { GreyboxKey } from './WorldVisualClaims';
import { useWorldStore } from './store';
import { night } from './WorldNight';
import { useGreyboxClaim } from './WorldVisualClaims';
import * as A from './WorldStreetAssets';
import { StreetBatch, type BatchKind } from './WorldStreetBatch';
import { createStreetDepthMaterial, createStreetMaterial, streetUniforms } from './WorldStreetMaterial';
import { chevronCell, directionCellFor, stopCell, streetAtlas } from './WorldStreetSigns';
import type { Builder } from './WorldStreetGeometry';
import type { Vec3 } from './types';

type KnockKind = LayoutKind | 'roadblock';
type Item = Omit<Knockable, 'kind'> & { kind: KnockKind };
const KNOCK_RESET_S = 30, FADE_S = .6;
/** Mass (kg), centre of mass height (m), locked against people, visual far distance (m). */
const SPEC: Record<KnockKind, { mass: number; com: number; h: number; heavy: boolean; far: number; lod: number }> = {
  lamp: { h: 4.8, mass: 140, com: .55, heavy: true, far: 150, lod: 30 },
  signal: { h: 3.6, mass: 160, com: .6, heavy: true, far: 150, lod: 32 },
  stop: { h: 2.4, mass: 22, com: .45, heavy: true, far: 95, lod: 22 },
  direction: { h: 2.6, mass: 28, com: .5, heavy: true, far: 110, lod: 26 },
  chevron: { h: 1.5, mass: 18, com: .4, heavy: true, far: 95, lod: 22 },
  delineator: { h: 1, mass: 4, com: .15, heavy: false, far: 70, lod: 18 },
  bin: { h: 1, mass: 16, com: .3, heavy: false, far: 80, lod: 20 },
  // G12: same mass as the greybox roadblock it replaces (28 kg), free for people and cars.
  roadblock: { h: 1, mass: 28, com: .35, heavy: false, far: 100, lod: 22 },
};

type Phase = 'home' | 'knocked' | 'fadeOut' | 'fadeIn';
interface KState { item: Item; batchId: number; body: RapierRigidBody | null; phase: Phase; t: number; locked: boolean; heavy: boolean }
export const streetKnockRegistry: KState[] = [];

function buildersFor(kind: KnockKind, directionIndex: number): { L0: Builder; L1: Builder } {
  switch (kind) {
    case 'lamp': return A.lamp();
    case 'signal': return A.signal();
    case 'bin': return A.bin();
    case 'roadblock': return A.roadblock();
    case 'delineator': return A.delineator();
    case 'stop': return { L0: A.stopGeometry(0, stopCell()), L1: A.stopGeometry(1, stopCell()) };
    case 'chevron': return { L0: A.chevronGeometry(0, chevronCell()), L1: A.chevronGeometry(1, chevronCell()) };
    case 'direction': return { L0: A.directionGeometry(0, directionCellFor(directionIndex)), L1: A.directionGeometry(1, directionCellFor(directionIndex)) };
  }
}
const homeMatrix = (it: Item) => new Matrix4().compose(new Vector3(...it.position), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), it.yaw), new Vector3(1, 1, 1));

/** Base hull with vertical walls (same footprint radius, same height): a flared footing hull is a cone,
 * and a walking capsule pushed into a cone rides up it. 16-gon at the widest radius of the base part. */
function verticalPrism(h: Float32Array) {
  let r = 0, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < h.length; i += 3) { r = Math.max(r, Math.hypot(h[i], h[i + 2])); y0 = Math.min(y0, h[i + 1]); y1 = Math.max(y1, h[i + 1]); }
  const out: number[] = [];
  for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; for (const y of [y0, y1]) out.push(Math.cos(a) * r, y, Math.sin(a) * r); }
  return new Float32Array(out);
}

/** Hull colliders of one kind: the base hull carries the whole mass with a low centre of mass. */
function KnockBody({ state, hulls, kind }: { state: KState; hulls: Float32Array[]; kind: KnockKind }) {
  const s = SPEC[kind], ref = useRef<RapierRigidBody>(null);
  useEffect(() => { state.body = ref.current; return () => { state.body = null; }; }, [state]);
  const ud = useMemo(() => ({ obstacle: true, knockable: state.item.id, assetId: `street-${kind}` }), [state, kind]);
  // Rod-like inertia about the centre of mass (thin pole of height h).
  const I = s.mass * s.h * s.h / 10;
  return <RigidBody ref={ref} type="dynamic" colliders={false} canSleep ccd position={state.item.position} rotation={[0, state.item.yaw, 0]}
    linearDamping={.05} angularDamping={.35} userData={ud} name={`street-knock-${state.item.id}`}>
    {hulls.map((p, i) => <ConvexHullCollider key={i} args={[p]} friction={.8} restitution={.08}
      {...(i === 0
        ? { massProperties: { mass: s.mass, centerOfMass: { x: 0, y: s.com, z: 0 }, principalAngularInertia: { x: I, y: s.mass * .03, z: I }, angularInertiaLocalFrame: { x: 0, y: 0, z: 0, w: 1 } } }
        : { density: 0 })} />)}
  </RigidBody>;
}

/** Radial warm pool texture (soft centre, no hard rim). */
function poolTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!, grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(.45, 'rgba(255,255,255,.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

/** Roadblocks G12 from OBSTACLES_V4 (greybox centre y -> ground contact y). */
const roadblockItems = (): Item[] => OBSTACLES_V4.map((p, i) => ({ id: `roadblock-${i}`, kind: 'roadblock', position: [p[0], +(p[1] - .5).toFixed(3), p[2]] as Vec3, yaw: 0, road: 'roadblock' }));

export default function StreetKnockables({ set }: { set: 'knock' | 'roadblock' }) {
  const items = useMemo((): Item[] => (set === 'knock' ? knockablesV4() : roadblockItems()), [set]);
  const claim: GreyboxKey = set === 'knock' ? 'knockable' : 'roadblock';
  const lastTris = useMemo(() => ({ l0: 0, l1: 0 }), []);
  const { world } = useRapier();
  const built = useMemo(() => {
    const dirRoads = items.filter(i => i.kind === 'direction').map(i => i.road);
    const atlas = streetAtlas(dirRoads);
    const material = createStreetMaterial(atlas, 'street-knock-v1'), depth = createStreetDepthMaterial();
    // One batch kind per kind, except direction boards (one per instance: each has its own atlas cell).
    const kinds: BatchKind[] = [], kindOf = new Map<string, number>(), hulls = new Map<string, Float32Array[]>(), counts: number[] = [];
    let dirIndex = 0;
    const states: KState[] = [];
    const keyFor = (it: Item) => (it.kind === 'direction' ? `direction-${dirIndex++}` : it.kind);
    const keys = items.map(keyFor);
    dirIndex = 0;
    items.forEach((it, n) => {
      const key = keys[n];
      if (!kindOf.has(key)) {
        const b = buildersFor(it.kind, it.kind === 'direction' ? dirIndex++ : 0);
        kindOf.set(key, kinds.length); counts.push(0);
        kinds.push({ id: key, L0: b.L0.build(), L1: b.L1.build(), lodNear: SPEC[it.kind].lod, far: SPEC[it.kind].far });
        hulls.set(key, b.L0.hulls().map((h, i) => (i === 0 ? verticalPrism(h) : h)));
      }
      counts[kindOf.get(key)!]++;
    });
    const batch = new StreetBatch(`street-${set}`, kinds, counts, material);
    items.forEach((it, n) => {
      const id = batch.add(kindOf.get(keys[n])!, homeMatrix(it));
      states.push({ item: it, batchId: id, body: null, phase: 'home', t: 0, locked: SPEC[it.kind].heavy, heavy: SPEC[it.kind].heavy });
    });
    batch.finish(5);
    batch.mesh.castShadow = true; batch.mesh.receiveShadow = true;
    batch.mesh.customDepthMaterial = depth;
    // Thin poles never hide the player; the corridor fade would turn the whole batch transparent.
    batch.mesh.userData.noOcclusionFade = true;
    batch.mesh.userData.streetKinds = kinds.map(k => k.id);
    batch.mesh.userData.streetStats = () => ({ tris: lastTris.l0 + lastTris.l1, ...lastTris, instances: batch.count });
    return { batch, states, hulls: keys.map(k => hulls.get(k)!), material, depth };
  }, [items, set, lastTris]);
  useEffect(() => {
    streetKnockRegistry.push(...built.states);
    return () => { for (const s of built.states) streetKnockRegistry.splice(streetKnockRegistry.indexOf(s), 1); built.batch.dispose(); built.material.dispose(); built.depth.dispose(); };
  }, [built]);

  // Night light pools: one instanced additive disc per lamp, on the ground under the lens.
  const lamps = useMemo(() => built.states.filter(s => s.item.kind === 'lamp'), [built]);
  const pools = useRef<InstancedMesh>(null);
  const poolMat = useMemo(() => new MeshBasicMaterial({ color: new Color('#FFD08A'), map: poolTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false }), []);
  const poolGeo = useMemo(() => new CircleGeometry(3.4, 28).rotateX(-Math.PI / 2), []);
  useEffect(() => () => { poolMat.map?.dispose(); poolMat.dispose(); poolGeo.dispose(); }, [poolMat, poolGeo]);
  const head = useMemo(() => new Vector3(...A.LAMP_HEAD_LOCAL), []);
  const placePools = () => {
    const m = pools.current; if (!m) return;
    const o = new Object3D(), p = new Vector3();
    lamps.forEach((s, i) => {
      p.copy(head).applyMatrix4(homeMatrix(s.item));
      o.position.set(p.x, s.item.position[1] + .035, p.z);
      o.scale.setScalar(s.phase === 'home' ? 1 : 0); o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
  };
  useLayoutEffect(placePools, [lamps]);

  useGreyboxClaim(claim);

  // Vehicle bodies (for the heavy-prop unlock); collected lazily.
  const vehicles = useRef<RapierRigidBody[]>([]);
  const tmpM = useMemo(() => new Matrix4(), []), tq = useMemo(() => new Quaternion(), []), tv = useMemo(() => new Vector3(), []), one = useMemo(() => new Vector3(1, 1, 1), []);
  const slept = useRef(false);
  useBeforePhysicsStep(() => {
    if (!vehicles.current.length) world.forEachRigidBody(b => { if ((b.userData as { vehicle?: string } | undefined)?.vehicle) vehicles.current.push(b); });
    if (!slept.current && built.states.every(s => s.body)) {
      for (const s of built.states) { s.body!.lockTranslations(s.locked, false); s.body!.lockRotations(s.locked, false); s.body!.sleep(); }
      slept.current = true;
    }
    if (!slept.current) return;
    const vp = vehicles.current.map(b => b.translation());
    for (const s of built.states) {
      if (!s.heavy || !s.body || s.phase !== 'home') continue;
      const [x, y, z] = s.item.position;
      // Car half-length 2.3 m + speed lead: unlock 5 m ahead of any vehicle body.
      const near = vp.some(p => Math.abs(p.y - y) < 4 && Math.hypot(p.x - x, p.z - z) < 6.5);
      if (near === s.locked) {
        s.locked = !near;
        s.body.lockTranslations(s.locked, false); s.body.lockRotations(s.locked, false);
        if (s.locked) { s.body.setLinvel({ x: 0, y: 0, z: 0 }, false); s.body.setAngvel({ x: 0, y: 0, z: 0 }, false); s.body.sleep(); }
      }
    }
  });

  useFrame(({ camera }, delta) => {
    streetUniforms.uNight.value = night.value;
    const st = useWorldStore.getState(), running = !st.paused && !st.shot, dt = Math.min(delta, .1);
    const b = built.batch;
    let poolsDirty = false;
    for (const s of built.states) {
      const body = s.body; if (!body) continue;
      // Visual follows the body whenever it is awake or away from home.
      if (!body.isSleeping() || s.phase !== 'home') {
        const p = body.translation(), q = body.rotation();
        b.setMatrix(s.batchId, tmpM.compose(tv.set(p.x, p.y, p.z), tq.set(q.x, q.y, q.z, q.w), one));
      }
      if (!running) continue;
      if (s.phase === 'home') {
        if (body.isSleeping()) continue;
        const p = body.translation(), q = body.rotation(), home = s.item.position;
        const tilt = 1 - 2 * (q.x * q.x + q.z * q.z);
        if (Math.hypot(p.x - home[0], p.z - home[2]) > .35 || tilt < .94 || p.y < home[1] - .5) { s.phase = 'knocked'; s.t = 0; poolsDirty = true; }
      } else if (s.phase === 'knocked') {
        if ((s.t += dt) >= KNOCK_RESET_S) { s.phase = 'fadeOut'; s.t = 0; }
      } else if (s.phase === 'fadeOut') {
        s.t += dt; b.setFade(s.batchId, Math.max(0, 1 - s.t / FADE_S));
        if (s.t >= FADE_S) {
          const [x, y, z] = s.item.position;
          let occupied = false;
          world.forEachRigidBody(o => { if (o !== body && o.isDynamic() && !(o.userData as { obstacle?: boolean })?.obstacle) { const t = o.translation(); if (Math.hypot(t.x - x, t.z - z) < 1.6 && Math.abs(t.y - y - 1) < 2) occupied = true; } });
          if (!occupied) {
            const h = s.item.yaw / 2;
            body.setTranslation({ x, y, z }, false); body.setRotation({ x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) }, false);
            body.setLinvel({ x: 0, y: 0, z: 0 }, false); body.setAngvel({ x: 0, y: 0, z: 0 }, false);
            s.locked = s.heavy; body.lockTranslations(s.locked, false); body.lockRotations(s.locked, false); body.sleep();
            b.setMatrix(s.batchId, homeMatrix(s.item));
            s.phase = 'fadeIn'; s.t = 0;
          }
        }
      } else if (s.phase === 'fadeIn') {
        s.t += dt; b.setFade(s.batchId, Math.min(1, s.t / FADE_S));
        if (s.t >= FADE_S) { s.phase = 'home'; poolsDirty = true; }
      }
    }
    if (poolsDirty) placePools();
    if (pools.current) { pools.current.visible = night.value > .01; poolMat.opacity = .5 * night.value; }
    Object.assign(lastTris, b.update(camera));
  });

  return <group name={`street-${set}-group`}>
    <primitive object={built.batch.mesh} />
    {built.states.map((s, i) => <KnockBody key={s.item.id} state={s} hulls={built.hulls[i]} kind={s.item.kind} />)}
    {lamps.length > 0 && <instancedMesh ref={pools} name="street-lamp-pools" args={[poolGeo, poolMat, lamps.length]} frustumCulled renderOrder={2} userData={{ noOcclusionFade: true, surface: true }} />}
  </group>;
}

export const knockQa = () => streetKnockRegistry.map(k => {
  const b = k.body, p = b?.translation(), home = k.item.position as Vec3;
  return { id: k.item.id, kind: k.item.kind, road: k.item.road, home, position: p ? [p.x, p.y, p.z] : null, sleeping: b?.isSleeping() ?? null,
    knocked: k.phase !== 'home', phase: k.phase, lockedForPeople: k.locked, displacement: p ? Math.hypot(p.x - home[0], p.z - home[2]) : null };
});
export const awakeKnockQa = () => streetKnockRegistry.filter(k => k.body && !k.body.isSleeping()).length;
