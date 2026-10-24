import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { ConvexHullCollider, CuboidCollider, InstancedRigidBodies, type RapierRigidBody, type InstancedRigidBodyProps } from '@react-three/rapier';
import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial } from 'three';
import { BOARDWALK_POINTS, BOARDWALK_WIDTH } from './layout';
import { ParkGeo, clipHalf, hash, parkMaterial, parkNight, plankPoly, slab, type P2 } from './WorldParkKit';
import { DECK_Y, HUTS, HUT_FRONT_Z } from './WorldParkLayout';
import { isWorldRunning } from './WorldWind';
import { PARK_LAMP } from './WorldParkLamp';
import type { Vec3 } from './types';

/**
 * P01 plaza, P02 boardwalk deck + piles, P03 low rails, P04 warm lamp posts: runtime-procedural from
 * layout.ts (BOARDWALK_POINTS / BOARDWALK_WIDTH) and the hut spurs. Coordinates are unchanged from the
 * greybox: plaza 17 x 17 m top at x 36.5-53.5, z -53.5..-36.5 (+ its 18 m revetment block), boardwalk
 * centreline and width as authored.
 */
export const PLAZA = { x0: 36.5, x1: 53.5, z0: -53.5, z1: -36.5, top: 1.15 };
/** The bridge / park-spur road reaches x 50.7 at z -40.9..-51.1: the plaza paving leaves that strip to
 * the road owner (paved key) and starts east of the bridge head. */
const BRIDGE_X = 43.6;
const W2 = BOARDWALK_WIDTH / 2;
const P = BOARDWALK_POINTS.map(p => [p[0], p[2]] as P2);
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const unit = (a: P2): P2 => { const l = Math.hypot(a[0], a[1]); return [a[0] / l, a[1] / l]; };
const perp = (a: P2): P2 => [-a[1], a[0]];
const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const add = (a: P2, b: P2, k = 1): P2 => [a[0] + b[0] * k, a[1] + b[1] * k];

/** Boardwalk segments as convex quads with mitred joins; the first segment starts at the plaza edge. */
function segments() {
  const out: { quad: P2[]; dir: P2; a: P2; b: P2; L: number }[] = [];
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], d = unit(sub(b, a)), n = perp(d);
    let quad: P2[] = [add(a, n, -W2), add(b, n, -W2), add(b, n, W2), add(a, n, W2)];
    quad = [add(quad[0], d, -6), add(quad[1], d, 6), add(quad[2], d, 6), add(quad[3], d, -6)];
    // Mitre planes at interior joints: bisector of the two directions.
    if (i > 0) { const dp = unit(sub(a, P[i - 1])), m = unit(add(dp, d)); quad = clipHalf(quad, m, dot(m, a)); }
    // Visual planks meet the existing flagstone edge (x1-.35); the original support boxes below
    // remain unchanged. The old x1-.02 cut left a 33 cm exposed bedding / coping sawtooth.
    else quad = clipHalf(quad, [1, 0], PLAZA.x1 - 0.35);
    if (i < P.length - 2) { const dn = unit(sub(P[i + 2], b)), m = unit(add(d, dn)); quad = clipHalf(quad, [-m[0], -m[1]], -dot(m, b)); }
    else quad = clipHalf(quad, [-d[0], -d[1]], -dot(d, b));
    out.push({ quad, dir: d, a, b, L: Math.hypot(b[0] - a[0], b[1] - a[1]) });
  }
  return out;
}

/** Hut spur openings on each boardwalk side (arc-length intervals per segment) so rails leave a gap. */
function openings() {
  const list: { seg: number; side: number; s0: number; s1: number }[] = [];
  for (const h of HUTS) {
    if (!h.spur) continue;
    const to: P2 = [h.spur.to[0], h.spur.to[2]];
    let best = { seg: 0, s: 0, side: 1, d: Infinity };
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], d = unit(sub(P[i + 1], a)), L = Math.hypot(P[i + 1][0] - a[0], P[i + 1][1] - a[1]);
      const s = Math.max(0, Math.min(L, dot(sub(to, a), d))), q = add(a, d, s), dist = Math.hypot(to[0] - q[0], to[1] - q[1]);
      if (dist < best.d) best = { seg: i, s, side: Math.sign(dot(sub(to, a), perp(d))) || 1, d: dist };
    }
    const half = h.spur.width / 2 + 0.25;
    list.push({ seg: best.seg, side: best.side, s0: best.s - half, s1: best.s + half });
  }
  return list;
}

export interface RailSection { id: string; position: Vec3; yaw: number; length: number }
export interface LampPost { id: string; position: Vec3; yaw: number }

export function buildWalk(low = false) {
  const deck = new ParkGeo(), solid = new ParkGeo();
  const segs = segments(), opens = openings();
  const groups: { id: string; center: Vec3; deck: BufferGeometry; solid: BufferGeometry; triangles: number; deckTris: number; solidTris: number }[] = [];
  const surfaces: { position: Vec3; size: Vec3; rotation: Vec3 }[] = [];
  // ---------------- P02 boardwalk deck: planks across the walk, stringers, pile bents every ~2.6 m
  segs.forEach((s, i) => {
    const deck = new ParkGeo(), solid = new ParkGeo();
    if (low) slab(deck, s.quad, DECK_Y, DECK_Y - .06, '#9C7A58');
    else plankPoly(deck, s.quad, perp(s.dir), DECK_Y, 11 + i);
    const n = perp(s.dir), start = i === 0 ? dot(sub([PLAZA.x1, s.a[1]], s.a), s.dir) + 0.4 : 0.6;
    for (const off of [-W2 + 0.18, 0, W2 - 0.18]) {
      const a = add(add(s.a, s.dir, i === 0 ? start - 0.4 : -0.3), n, off), b = add(add(s.b, s.dir, i === P.length - 2 ? -0.1 : 0.3), n, off);
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      solid.box([(a[0] + b[0]) / 2, DECK_Y - 0.17, (a[1] + b[1]) / 2], [0.14, 0.22, L], off ? '#6E563F' : '#5A4634', { yaw: Math.atan2(s.dir[0], s.dir[1]) });
    }
    // fascia boards on both outer edges
    for (const side of [-1, 1]) {
      const a = add(add(s.a, n, side * (W2 + 0.02)), s.dir, i === 0 ? start - 0.4 : 0), b = add(add(s.b, n, side * (W2 + 0.02)), s.dir, 0);
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      solid.box([(a[0] + b[0]) / 2, DECK_Y - 0.13, (a[1] + b[1]) / 2], [0.05, 0.2, L], '#7A5F45', { yaw: Math.atan2(s.dir[0], s.dir[1]), jitter: 0.04, seed: i * 2 + side });
    }
    for (let t = start, k = 0; t < s.L - 0.3; t += 2.6, k++) {
      const c = add(s.a, s.dir, t);
      const ends = [add(c, n, -W2 + 0.2), add(c, n, W2 - 0.2)];
      for (const [e, p] of ends.entries()) solid.cyl([p[0], -2.6, p[1]], [p[0], DECK_Y - 0.28, p[1]], 0.15, 0.13, low ? 4 : 8, '#8E6E55', { jitter: 0.06, seed: i * 50 + k * 2 + e, smooth: true });
      solid.box([c[0], DECK_Y - 0.36, c[1]], [BOARDWALK_WIDTH + 0.1, 0.16, 0.16], '#5A4634', { yaw: Math.atan2(s.dir[0], s.dir[1]) + Math.PI / 2 });
      if (k % 2 === 0) { // diagonal brace under every second bent
        const A = ends[0], B = ends[1];
        solid.cyl([A[0], -1.2, A[1]], [B[0], DECK_Y - 0.48, B[1]], 0.045, 0.045, 6, '#5A4634');
      }
    }
    // collider: one support slab per segment (mitred quads are approximated by the unclipped rectangle
    // trimmed to the joints; overlaps at the mitre are coplanar supports).
    const len = s.L + (i === 0 ? 0 : 0.3) + (i === P.length - 2 ? 0 : 0.3) - (i === 0 ? start - 0.4 : 0);
    const mid = add(s.a, s.dir, (i === 0 ? start - 0.4 : -0.3) + len / 2);
    surfaces.push({ position: [mid[0], DECK_Y - 0.15, mid[1]], size: [BOARDWALK_WIDTH, 0.3, len], rotation: [0, Math.atan2(s.dir[0], s.dir[1]), 0] });
    groups.push({ id: `walk-${i}`, center: [(s.a[0] + s.b[0]) / 2, DECK_Y, (s.a[1] + s.b[1]) / 2], deck: deck.build(), solid: solid.build(), triangles: deck.triangles + solid.triangles, deckTris: deck.triangles, solidTris: solid.triangles });
  });
  // ---------------- P01 plaza: 0.9 m stone flags with chamfers (two greys), stone revetment, coping
  const flags = 0.9;
  if (!low) for (let x = BRIDGE_X; x < PLAZA.x1 - 0.35; x += flags) for (let z = PLAZA.z0 + 0.35; z < PLAZA.z1 - 0.35; z += flags) {
    const x1 = Math.min(x + flags, PLAZA.x1 - 0.35), z1 = Math.min(z + flags, PLAZA.z1 - 0.35);
    const r = hash(x * 13.1 + z * 7.7);
    slab(deck, [[x + 0.01, z + 0.01], [x1 - 0.01, z + 0.01], [x1 - 0.01, z1 - 0.01], [x + 0.01, z1 - 0.01]], PLAZA.top + r * 0.006, PLAZA.top - 0.1, r < 0.5 ? '#8A8580' : r < 0.85 ? '#958F87' : '#7F7A74', { inset: 0.012, jitter: 0.04, seed: x * 3 + z });
  }
  if (low) slab(deck, [[BRIDGE_X, PLAZA.z0 + .35], [PLAZA.x1 - .35, PLAZA.z0 + .35], [PLAZA.x1 - .35, PLAZA.z1 - .35], [BRIDGE_X, PLAZA.z1 - .35]], PLAZA.top, PLAZA.top - .1, '#8A8580');
  // bedding under the flags (gap colour) and coping stones around the north / east / south edges
  slab(deck, [[BRIDGE_X, PLAZA.z0 + 0.35], [PLAZA.x1 - 0.35, PLAZA.z0 + 0.35], [PLAZA.x1 - 0.35, PLAZA.z1 - 0.35], [BRIDGE_X, PLAZA.z1 - 0.35]], PLAZA.top - 0.012, PLAZA.top - 0.2, '#6E6A64');
  const coping = (a: P2, b: P2, seed: number) => {
    const d = unit(sub(b, a)), L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = perp(d);
    if (low) { slab(deck, [add(a, n, -.36), add(b, n, -.36), add(b, n, .02), add(a, n, .02)], PLAZA.top + .02, PLAZA.top - .25, '#B4A896'); return; }
    for (let t = 0, k = 0; t < L - 0.05; t += 1.2, k++) {
      const t1 = Math.min(L, t + 1.2), p0 = add(a, d, t + 0.01), p1 = add(a, d, t1 - 0.01);
      slab(deck, [add(p0, n, -0.36), add(p1, n, -0.36), add(p1, n, 0.02), add(p0, n, 0.02)], PLAZA.top + 0.02, PLAZA.top - 0.25, k % 3 ? '#B4A896' : '#A89C8A', { inset: 0.02, jitter: 0.04, seed: seed + k });
    }
  };
  coping([BRIDGE_X - 0.36, PLAZA.z1], [PLAZA.x1, PLAZA.z1], 900);           // north (z1)
  coping([PLAZA.x1, PLAZA.z1], [PLAZA.x1, -40.9], 920);                      // east, north of the boardwalk joint
  coping([PLAZA.x1, -47.5], [PLAZA.x1, PLAZA.z0], 930);                      // east, south of it
  coping([PLAZA.x1, PLAZA.z0], [BRIDGE_X - 0.36, PLAZA.z0], 940);           // south
  // revetment: courses of offset stone blocks on the three water faces, down to the sea bed
  const revet = (a: P2, b: P2, seed: number) => {
    const d = unit(sub(b, a)), L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = perp(d);
    if (low) { slab(solid, [add(a, n, -.5), add(b, n, -.5), add(b, n, .05), add(a, n, .05)], PLAZA.top - .25, -1.3, '#8C8276'); return; }
    let row = 0;
    for (let y = PLAZA.top - 0.25; y > -1.3; y -= 0.48, row++) {
      for (let t = row % 2 ? -0.55 : 0, k = 0; t < L; k++) {
        const w = 1.0 + hash(seed + row * 31 + k) * 0.8, t0 = Math.max(0, t), t1 = Math.min(L, t + w);
        const out = 0.02 + hash(seed * 3 + row * 17 + k) * 0.05;
        const p0 = add(a, d, t0 + 0.012), p1 = add(a, d, t1 - 0.012);
        const r = hash(seed * 7 + row * 5 + k);
        if (t1 - t0 > 0.1) slab(solid, [add(p0, n, -0.5), add(p1, n, -0.5), add(p1, n, out), add(p0, n, out)], y - 0.012, y - 0.46, r < 0.45 ? '#8C8276' : r < 0.8 ? '#9A8F80' : '#B4A896', { inset: 0.025, jitter: 0.05, seed: seed + row * 100 + k });
        t += w;
      }
    }
  };
  slab(solid, [[PLAZA.x0, PLAZA.z0 - 0.45], [PLAZA.x1 + 0.45, PLAZA.z0 - 0.45], [PLAZA.x1 + 0.45, PLAZA.z1 + 0.45], [PLAZA.x0, PLAZA.z1 + 0.45]], -1.25, -4, '#7A7268');
  revet([PLAZA.x0 + 0.0, PLAZA.z1 + 0.5], [PLAZA.x1 + 0.5, PLAZA.z1 + 0.5], 1);
  revet([PLAZA.x1 + 0.5, PLAZA.z1 + 0.5], [PLAZA.x1 + 0.5, PLAZA.z0 - 0.5], 2);
  revet([PLAZA.x1 + 0.5, PLAZA.z0 - 0.5], [PLAZA.x0 + 0.0, PLAZA.z0 - 0.5], 3);
  // plaza collision: the greybox block (18 x 2.2 x 18, top 1.0) is replaced by top 1.15 paving +
  // revetment sides; the bridge strip stays with the road owner (paved, its own collider).
  surfaces.push({ position: [(BRIDGE_X + PLAZA.x1 + 0.5) / 2, PLAZA.top - 1.65, (PLAZA.z0 + PLAZA.z1) / 2], size: [PLAZA.x1 + 0.5 - BRIDGE_X, 3.3, PLAZA.z1 - PLAZA.z0 + 1.0], rotation: [0, 0, 0] });
  surfaces.push({ position: [(PLAZA.x0 - 0.5 + BRIDGE_X) / 2, PLAZA.top - 1.65 - 0.01, (PLAZA.z0 + PLAZA.z1) / 2], size: [BRIDGE_X - PLAZA.x0 + 0.5, 3.3, PLAZA.z1 - PLAZA.z0 + 1.0], rotation: [0, 0, 0] });
  // paving west of the bridge head (between the shore and the road strip): flags in the same grid
  if (!low) for (const [z0, z1] of [[PLAZA.z0 + 0.35, -49.6]] as P2[]) for (let x = PLAZA.x0 + 0.3; x < BRIDGE_X; x += flags) for (let z = z0; z < z1 - 0.05; z += flags) {
    const x1 = Math.min(x + flags, BRIDGE_X), zz1 = Math.min(z + flags, z1); const r = hash(x * 5.1 + z * 3.3);
    slab(deck, [[x + 0.01, z + 0.01], [x1 - 0.01, z + 0.01], [x1 - 0.01, zz1 - 0.01], [x + 0.01, zz1 - 0.01]], PLAZA.top + r * 0.006, PLAZA.top - 0.1, r < 0.5 ? '#8A8580' : '#958F87', { inset: 0.012, seed: x + z * 9 });
  }
  if (low) slab(deck, [[PLAZA.x0 + .3, PLAZA.z0 + .35], [BRIDGE_X, PLAZA.z0 + .35], [BRIDGE_X, -49.6], [PLAZA.x0 + .3, -49.6]], PLAZA.top, PLAZA.top - .1, '#8A8580');
  // ---------------- P03 rails (2 m knockable sections) and P04 lamp posts along both outer edges
  const rails: RailSection[] = [], lamps: LampPost[] = [];
  segs.forEach((s, i) => {
    const n = perp(s.dir), yaw = Math.atan2(s.dir[0], s.dir[1]);
    const t0 = i === 0 ? dot(sub([PLAZA.x1 + 0.4, s.a[1]], s.a), s.dir) + 0.3 : 0.9;
    const t1 = s.L - (i === P.length - 2 ? 0.4 : 0.9);
    for (const side of [-1, 1]) {
      const gaps = opens.filter(o => o.seg === i && o.side === side);
      // free runs between openings, each filled with whole 2.0 m sections centred in the run
      const cuts = [t0, ...gaps.flatMap(g => [g.s0, g.s1]).sort((x, y) => x - y), t1];
      let k = 0;
      for (let r = 0; r + 1 < cuts.length; r += 2) {
        const a0 = Math.max(t0, cuts[r]), a1 = Math.min(t1, cuts[r + 1]), count = Math.floor((a1 - a0 + 0.01) / 2.02);
        const pad = (a1 - a0 - count * 2.02) / 2;
        for (let q = 0; q < count; q++, k++) {
          const c = add(add(s.a, s.dir, a0 + pad + q * 2.02 + 1.01), n, side * (W2 - 0.12));
          rails.push({ id: `rail-${i}-${side > 0 ? 'r' : 'l'}-${k}`, position: [c[0], DECK_Y, c[1]], yaw, length: 2.0 });
        }
      }
      // lamps: every ~7 m on alternating sides, skipping openings
      for (let lt = t0 + (side > 0 ? 1.5 : 5), m = 0; lt < t1 - 0.5; lt += 8, m++) {
        if (gaps.some(g => lt > g.s0 - 0.6 && lt < g.s1 + 0.6)) continue;
        const c = add(add(s.a, s.dir, lt), n, side * (W2 - 0.42));
        lamps.push({ id: `lamp-${i}-${side > 0 ? 'r' : 'l'}-${m}`, position: [c[0], DECK_Y, c[1]], yaw: Math.atan2(-n[0] * side, -n[1] * side) });
      }
    }
  });
  // spur side rails (short fixed-length sections on long spurs)
  for (const h of HUTS) if (h.spur) {
    const L = Math.hypot(h.spur.to[0] - h.spur.from[0], h.spur.to[2] - h.spur.from[2]);
    if (L < 2.4) continue;
    const count = Math.floor((L - 0.5) / 2.02), pad = (L - count * 2.02) / 2;
    for (const side of [-1, 1]) for (let k = 0; k < count; k++) {
      const p = h.local(side * (h.spur.width / 2 - 0.12), 0, HUT_FRONT_Z + pad + k * 2.02 + 1.01);
      rails.push({ id: `rail-${h.id}-${side > 0 ? 'r' : 'l'}-${k}`, position: [p[0], DECK_Y, p[2]], yaw: h.yaw, length: 2.0 });
    }
  }
  return { deck: deck.build(), deckTris: deck.triangles + groups.reduce((n, g) => n + g.deckTris, 0), solid: solid.build(), solidTris: solid.triangles + groups.reduce((n, g) => n + g.solidTris, 0), plazaTris: deck.triangles + solid.triangles, groups, surfaces, rails, lamps };
}

/* ------------------------------------------------------------------ P03 / P04 knockables */

const KNOCK_RESET_S = 30, FADE_S = 1.2;
type KnockSpec = { half?: Vec3; offset?: Vec3; mass: number };
function railGeometry() {
  // 2.0 m section (scaled along z per instance): two posts, top handrail, mid rail, post caps.
  const g = new ParkGeo(), L = 2.0;
  for (const z of [-L / 2 + 0.06, L / 2 - 0.06]) {
    g.box([0, 0.47, z], [0.09, 0.94, 0.09], '#8E6E55', { inset: 0.012 });
    g.box([0, 0.955, z], [0.12, 0.03, 0.12], '#7A5F45', { inset: 0.02 });
  }
  g.box([0, 0.9, 0], [0.1, 0.06, L], '#B99469', { inset: 0.015 });
  g.box([0, 0.5, 0], [0.04, 0.07, L - 0.1], '#9C7A58');
  g.box([0, 0.2, 0], [0.04, 0.05, L - 0.1], '#9C7A58');
  return { geometry: g.build(), triangles: g.triangles };
}
type KState = { pos: Vec3; yaw: number; knocked: number | null; fade: number; reset: boolean };
/** QA listing of every park knockable (?qa=1 exposes it as window.__parkKnock()). */
const knockQa = new Map<string, () => { id: string; home: Vec3; position: Vec3 | null; knocked: boolean; fade: number; sleeping: boolean | null }[]>();
export const parkKnockables = () => [...knockQa.values()].flatMap(f => f());
const lodInstanceQa = new Map<string, () => unknown>();
/** Sleeping dynamic props (spec 15 / PRD 4.3): woken only by contact; 30 s after being knocked they
 * dither out, reset to their home pose asleep, and dither back in. One instanced draw per kind. */
export function Knockables({ name, items, source, farSource, spec, hull, hulls, userData }: { name: string; items: { id: string; position: Vec3; yaw: number }[]; source: BufferGeometry; farSource?: BufferGeometry; spec: KnockSpec; hull?: Float32Array; hulls?: Float32Array[]; userData?: Record<string, unknown> }) {
  const bodies = useRef<(RapierRigidBody | null)[]>(null);
  const mesh = useRef<InstancedMesh>(null), nearMesh = useRef<InstancedMesh>(null), farMesh = useRef<InstancedMesh>(null);
  const states = useRef<KState[]>([]);
  const slept = useRef(false);
  const geometry = useMemo(() => {
    const g = source.clone();
    g.setAttribute('aInstFade', new InstancedBufferAttribute(new Float32Array(items.length).fill(1), 1));
    return g;
  }, [source, items]);
  const farGeometry = useMemo(() => { if (!farSource) return null; const g = farSource.clone(); g.setAttribute('aInstFade', new InstancedBufferAttribute(new Float32Array(items.length).fill(1), 1)); return g; }, [farSource, items]);
  const material = useMemo(() => {
    const base = parkMaterial().clone(), prev = base.onBeforeCompile;
    base.onBeforeCompile = (shader, r) => {
      prev.call(base, shader, r);
      shader.vertexShader = 'attribute float aInstFade;\nvarying float vFade;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFade = aInstFade;');
      // Screen-door fade (no transparency sorting): 4x4 ordered-dither discard.
      shader.fragmentShader = 'varying float vFade;\n' + shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (vFade < 0.999) { ivec2 q = ivec2(gl_FragCoord.xy) % 4; int i = q.x * 4 + q.y;
          float b = float((i * 11 + 3) % 16) / 16.0; if (vFade <= b) discard; }`);
    };
    base.customProgramCacheKey = () => 'park-knock-fade-v1';
    return base;
  }, []);
  useEffect(() => () => { material.dispose(); geometry.dispose(); farGeometry?.dispose(); }, [material, geometry, farGeometry]);
  const instances = useMemo<InstancedRigidBodyProps[]>(() => items.map(it => ({
    key: it.id, position: it.position, rotation: [0, it.yaw, 0], userData: { obstacle: true, knockable: it.id, assetId: name, ...userData },
  })), [items, name, userData]);
  useEffect(() => { states.current = items.map(it => ({ pos: it.position, yaw: it.yaw, knocked: null, fade: 1, reset: false })); }, [items]);
  useEffect(() => {
    knockQa.set(name, () => items.map((it, i) => { const b = bodies.current?.[i], p = b?.translation(), s = states.current[i];
      return { id: it.id, home: it.position, position: p ? [p.x, p.y, p.z] as Vec3 : null, knocked: s?.knocked !== null, fade: s?.fade ?? 1, sleeping: b?.isSleeping() ?? null, mass: b?.mass() ?? null, knockedElapsed: s?.knocked ?? null, resetPhaseDone: s?.reset ?? false }; }));
    return () => { knockQa.delete(name); };
  }, [items, name]);
  useEffect(() => {
    if (new URLSearchParams(location.search).get('qa') !== '1') return;
    lodInstanceQa.set(name, () => ({ id: name, nearCount: nearMesh.current?.count ?? 0, farCount: farMesh.current?.count ?? 0,
      nearTrianglesEach: (source.index?.count ?? source.getAttribute('position').count) / 3,
      farTrianglesEach: farSource ? (farSource.index?.count ?? farSource.getAttribute('position').count) / 3 : 0 }));
    Object.assign(window, { __parkLodInstances: () => [...lodInstanceQa.values()].map(read => read()) });
    return () => { lodInstanceQa.delete(name); };
  }, [name, source, farSource]);
  const tick = useRef(0), matrix = useMemo(() => new Matrix4(), []);
  const syncVisuals = (camera: { position: { x: number; y: number; z: number } }) => {
    const hi = nearMesh.current, lo = farMesh.current, proxy = mesh.current;
    if (!hi || !proxy) return;
    let hn = 0, ln = 0;
    const hf = geometry.getAttribute('aInstFade') as InstancedBufferAttribute, lf = farGeometry?.getAttribute('aInstFade') as InstancedBufferAttribute | undefined;
    items.forEach((_, i) => {
      proxy.getMatrixAt(i, matrix); const e = matrix.elements;
      const near = Math.hypot(camera.position.x - e[12], camera.position.y - e[13], camera.position.z - e[14]) < 60;
      if (near) { hi.setMatrixAt(hn, matrix); hf.setX(hn++, states.current[i]?.fade ?? 1); }
      else if (lo) { lo.setMatrixAt(ln, matrix); lf?.setX(ln++, states.current[i]?.fade ?? 1); }
    });
    hi.count = hn; hi.instanceMatrix.needsUpdate = true; hf.needsUpdate = true;
    if (lo) { lo.count = ln; lo.instanceMatrix.needsUpdate = true; if (lf) lf.needsUpdate = true; }
  };
  useFrame(({ camera }, delta) => {
    if (!slept.current && bodies.current?.length && bodies.current.every(Boolean)) { bodies.current.forEach(b => b?.sleep()); slept.current = true; }
    if (!isWorldRunning()) { syncVisuals(camera); return; }
    tick.current += delta;
    const check = tick.current >= 0.25;
    if (check) tick.current = 0;
    states.current.forEach((s, i) => {
      const b = bodies.current?.[i];
      if (!b) return;
      if (s.knocked === null) {
        if (!check || b.isSleeping()) return;
        const p = b.translation(), q = b.rotation(), tilt = 1 - 2 * (q.x * q.x + q.z * q.z);
        if (Math.hypot(p.x - s.pos[0], p.z - s.pos[2]) > 0.3 || tilt < 0.94 || p.y < s.pos[1] - 0.4) s.knocked = 0;
        return;
      }
      const T = (s.knocked += delta);
      if (T >= KNOCK_RESET_S && !s.reset) {
        const h = s.yaw / 2;
        b.setTranslation({ x: s.pos[0], y: s.pos[1], z: s.pos[2] }, false);
        b.setRotation({ x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) }, false);
        b.setLinvel({ x: 0, y: 0, z: 0 }, false); b.setAngvel({ x: 0, y: 0, z: 0 }, false); b.sleep(); s.reset = true;
      }
      s.fade = T < KNOCK_RESET_S - FADE_S ? 1 : T < KNOCK_RESET_S ? Math.max(0, (KNOCK_RESET_S - T) / FADE_S) : Math.min(1, (T - KNOCK_RESET_S) / FADE_S);
      if (T >= KNOCK_RESET_S + FADE_S) { s.knocked = null; s.fade = 1; s.reset = false; }
    });
    syncVisuals(camera);
  });
  return <group name={`park-${name}-lod-instances`}><InstancedRigidBodies ref={bodies} instances={instances} colliders={false} canSleep linearDamping={0.08} angularDamping={0.25}
    colliderNodes={hulls?.length ? hulls.map((points, i) => <ConvexHullCollider key={`h-${i}`} args={[points]} mass={spec.mass / hulls.length} friction={0.8} restitution={0.08} />)
      : [hull ? <ConvexHullCollider key="h" args={[hull]} mass={spec.mass} friction={0.8} restitution={0.08} /> : <CuboidCollider key="c" args={spec.half!} position={spec.offset} mass={spec.mass} friction={0.8} restitution={0.08} />]}>
    <instancedMesh ref={mesh} name={`park-${name}-physics-proxy`} args={[geometry, material, items.length]} visible={false} frustumCulled={false}
      userData={{ noOcclusionFade: true, assetId: name }} />
  </InstancedRigidBodies>
    <instancedMesh ref={nearMesh} name={`park-${name}`} args={[geometry, material, items.length]} castShadow receiveShadow frustumCulled={false} userData={{ noOcclusionFade: true, assetId: name }} />
    {farGeometry && <instancedMesh ref={farMesh} name={`park-${name}-far`} args={[farGeometry, material, items.length]} castShadow receiveShadow frustumCulled={false} userData={{ noOcclusionFade: true, assetId: name }} />}
  </group>;
}

export const RAIL = { ...railGeometryCached(), far: farRail(), spec: { half: [0.06, 0.48, 1.0] as Vec3, offset: [0, 0.48, 0] as Vec3, mass: 40 } };
export const LAMP = PARK_LAMP;
function farRail() {
  const g = new ParkGeo();
  const member = (center: Vec3, size: Vec3, axis: number, color: string) => {
    const piece = new ParkGeo(); piece.box(center, size, color); const full = piece.build(), p = full.getAttribute('position'), pos: number[] = [];
    for (let t = 0; t < p.count; t += 3) {
      const values = [p.getComponent(t, axis), p.getComponent(t + 1, axis), p.getComponent(t + 2, axis)];
      if (Math.max(...values) - Math.min(...values) < 1e-6) continue; // omit subpixel end caps only in the far proxy
      for (let k = 0; k < 3; k++) pos.push(p.getX(t + k), p.getY(t + k), p.getZ(t + k));
    }
    full.dispose(); g.raw(pos, color);
  };
  for (const z of [-.94, .94]) member([0, .48, z], [.1, .96, .1], 1, '#8E6E55');
  member([0, .95, 0], [.12, .1, 2], 2, '#B99469');
  return g.build();
}
function railGeometryCached() { return railGeometry(); }

/** Warm ground pools under every lamp: one additive draw of flat quads, intensity follows night. */
export function LampPools({ lamps, extra = [] }: { lamps: LampPost[]; extra?: { position: Vec3; radius: number }[] }) {
  const { geometry, material } = useMemo(() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d')!, gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,208,138,1)'); gr.addColorStop(0.45, 'rgba(255,190,110,0.45)'); gr.addColorStop(1, 'rgba(255,180,100,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const tex = new CanvasTexture(c);
    const pos: number[] = [], uv: number[] = [], R = 1.7;
    for (const l of lamps) {
      const cx = l.position[0], cz = l.position[2], y = DECK_Y + 0.012;
      const q = [[cx - R, cz - R, 0, 0], [cx + R, cz - R, 1, 0], [cx + R, cz + R, 1, 1], [cx - R, cz + R, 0, 1]];
      for (const k of [0, 2, 1, 0, 3, 2]) { pos.push(q[k][0], y, q[k][1]); uv.push(q[k][2], q[k][3]); }
    }
    for (const e of extra) {
      const [cx, y, cz] = e.position, r = e.radius;
      const q = [[cx - r, cz - r, 0, 0], [cx + r, cz - r, 1, 0], [cx + r, cz + r, 1, 1], [cx - r, cz + r, 0, 1]];
      for (const k of [0, 2, 1, 0, 3, 2]) { pos.push(q[k][0], y + 0.012, q[k][1]); uv.push(q[k][2], q[k][3]); }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3)); g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    g.computeBoundingSphere();
    const m = new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: AdditiveBlending, color: new Color(0, 0, 0), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
    return { geometry: g, material: m };
  }, [lamps, extra]);
  useEffect(() => () => { geometry.dispose(); material.map?.dispose(); material.dispose(); }, [geometry, material]);
  useFrame(() => { const k = parkNight.value * 0.4; material.color.setRGB(k, k, k); });
  return <mesh name="park-lamp-pools" geometry={geometry} material={material} renderOrder={2} userData={{ noOcclusionFade: true }} />;
}

