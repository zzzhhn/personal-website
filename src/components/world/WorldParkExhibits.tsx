import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { BufferAttribute, BufferGeometry, CanvasTexture, Group, Matrix4, Mesh, MeshStandardMaterial, Object3D, SRGBColorSpace, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PartBatch, gltfTrimesh, meshPiece, meshesUnder, mergeBatch, parkMaterial, parkUrl, withDraco, hash, type GLTF } from './WorldParkKit';
import { EXHIBITS, EXHIBIT_ANCHOR, HUTS, exhibitMatrix, type HutPlacement } from './WorldParkLayout';
import { Knockables } from './WorldParkWalk';
import { useInteractable } from './WorldInteract';
import { useWorldStore } from './store';
import { isWorldRunning } from './WorldWind';
import { trackPortfolioEvent } from '../../lib/analytics';
import { parkAudio } from './WorldParkAudio';
import { ParkLOD } from './WorldParkLOD';
import type { Vec3, WorldProject, Lang } from './types';

/**
 * P12-P18: six playable exhibits (PRD 3.3, spec 15.3). One E press = one action with one visible
 * result in 3D, <= 10 s, no submenu; E during a running action is ignored. Demo content is generated
 * locally and labelled DEMO / 演示: it never claims to be real service output or real statistics.
 * Static exhibit bodies join the park batch (returned to WorldPark); moving nodes are small meshes.
 */
const ids = ['P12', 'P13', 'P14', 'P15', 'P16', 'P17', 'P18'];
export function useExhibitGltfs() {
  const list = useLoader(GLTFLoader, ids.map(parkUrl), withDraco) as GLTF[];
  return Object.fromEntries(ids.map((id, i) => [id, list[i]])) as Record<string, GLTF>;
}

type Movers = Record<string, Object3D>;
type Placed = { body: BufferGeometry; hut: HutPlacement; id: string; matrix: Matrix4; root: Object3D; movers: Movers; dynamic: { name: string; geometry: BufferGeometry; position: Vec3; yaw: number; hull: Float32Array }[] };
const DYNAMIC = new Set(['stool', 'crate']);

/** Static batch pieces + per-exhibit moving node clones + colliders. */
export function placeExhibits(gltfs: Record<string, GLTF>) {
  const placed: Placed[] = [], fixed: { vertices: Float32Array; indices: Uint32Array }[] = [];
  for (const hut of HUTS) for (const ex of EXHIBITS[hut.id] ?? []) {
    const src = gltfs[ex.id].scene.getObjectByName(ex.id)!;
    const root = src.clone(true);
    const matrix = exhibitMatrix(hut, ex.at, ex.yaw);
    root.updateMatrixWorld(true);
    const movers: Movers = {}, stop = new Set<Object3D>();
    for (const c of root.children) if (c.name !== 'body') { stop.add(c); if (!DYNAMIC.has(c.name)) movers[c.name] = c; }
    const body = root.getObjectByName('body')!;
    const bodyGeometry = mergeBatch(meshesUnder(body, new Set()).map(m => meshPiece(m, new Matrix4().multiplyMatrices(matrix, m.matrixWorld))));
    fixed.push(gltfTrimesh(root, matrix, n => n === 'body'));
    const dynamic: Placed['dynamic'] = [];
    for (const name of DYNAMIC) {
      const node = root.getObjectByName(name);
      if (!node) continue;
      // Dynamic prop geometry in its own node frame (origin = floor contact centre).
      const inv = new Matrix4().copy(node.matrixWorld).invert(), parts: BufferGeometry[] = [], pts: number[] = [], v = new Vector3();
      for (const m of meshesUnder(node, new Set())) {
        const local = new Matrix4().multiplyMatrices(inv, m.matrixWorld);
        parts.push(meshPiece(m, local));
        const p = m.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(local); pts.push(v.x, v.y, v.z); }
      }
      const wp = new Vector3().setFromMatrixPosition(new Matrix4().multiplyMatrices(matrix, node.matrixWorld));
      dynamic.push({ name, geometry: mergeBatch(parts), position: [wp.x, wp.y, wp.z], yaw: hut.yaw + ex.yaw, hull: new Float32Array(pts) });
    }
    placed.push({ body: bodyGeometry, hut, id: ex.id, matrix, root, movers, dynamic });
  }
  return { placed, fixed };
}

/** Read-only QA evidence. The bot still triggers every action through real E key events. */
const probes = new Map<string, () => unknown>();
function useExhibitProbe(id: string, get: () => unknown) {
  const latest = useRef(get); latest.current = get;
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('qa') !== '1') return;
    const probe = () => latest.current(); probes.set(id, probe);
    Object.assign(window, { __parkExhibits: () => Object.fromEntries([...probes].map(([key, read]) => [key, read()])) });
    return () => { if (probes.get(id) === probe) probes.delete(id); };
  }, [id]);
}

/* ------------------------------------------------------------------ canvas displays */

/** A canvas-textured face replacing a GLB screen slab (UVs from its local box extents). */
function useDisplay(node: Object3D | undefined, w: number, h: number, px = 256) {
  return useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(px * Math.max(1, w / h)); canvas.height = Math.round(px * Math.max(1, h / w));
    const tex = new CanvasTexture(canvas); tex.colorSpace = SRGBColorSpace; tex.anisotropy = 4;
    const mat = new MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.7, roughness: 0.6 });
    const mesh = node && (node as Mesh).isMesh ? node as Mesh : node?.children.find(c => (c as Mesh).isMesh) as Mesh | undefined;
    if (mesh) {
      const g = mesh.geometry.clone(); g.computeBoundingBox();
      const bb = g.boundingBox!, p = g.getAttribute('position'), uv = new Float32Array(p.count * 2);
      // Screen faces lie in the local XY plane (glTF): u along x, v along y; the back face mirrors.
      for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x); uv[i * 2 + 1] = (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y); }
      g.setAttribute('uv', new BufferAttribute(uv, 2));
      mesh.geometry = g; mesh.material = mat;
    }
    return { canvas, ctx: canvas.getContext('2d')!, tex, mat };
  }, [node, w, h, px]);
}
const INK = '#E6DCCB', CHALK = '#F2EEE4', PAPER = '#1C2A33';
function demoTag(ctx: CanvasRenderingContext2D, lang: Lang, x: number, y: number, size = 13) {
  ctx.font = `600 ${size}px Geist, sans-serif`; ctx.fillStyle = '#8E9BA6';
  ctx.fillText(lang === 'zh' ? 'DEMO · 演示数据' : 'DEMO · illustrative', x, y);
}
const useLang = () => useWorldStore(s => s.lang);

/** Common one-shot runner: E starts `run(t)` for `dur` seconds; presses during a run are ignored. */
function useOneShot(dur: number) {
  const state = useRef({ t: -1, n: 0 });
  const start = () => { if (state.current.t >= 0) return false; state.current.t = 0; state.current.n++; return true; };
  const advance = (dt: number) => { if (state.current.t < 0) return -1; state.current.t += dt; if (state.current.t > dur) { state.current.t = -1; return -1; } return state.current.t; };
  return { state, start, advance };
}

function useExhibitE(p: Placed, kind: 'exhibit' | 'seat', label: { en: string; zh: string }, onPress: () => void, radius = 1.6) {
  const a = EXHIBIT_ANCHOR[p.hut.id];
  const position = useMemo(() => p.hut.local(a[0], 0.9, a[1]), [p.hut, a]);
  useInteractable({ id: `park-${p.id}-${p.hut.id}`, position, radius, label, kind, onInteract: () => { if (!new URLSearchParams(location.search).has('qa')) trackPortfolioEvent('world_booth_open', p.hut.slug); onPress(); } });
}

/* ------------------------------------------------------------------ P12 research desk */
function ResearchDesk({ p }: { p: Placed }) {
  const lang = useLang();
  const disp = useDisplay(p.movers.screen, 0.6, 1.0, 320);
  const shot = useOneShot(7.5);
  const levers = useRef([1, 1, 1, 1, 1]);   // detent 0..2 (centre = 1)
  const anim = useRef({ lever: 0, from: 1, curve: [] as number[], pass: true, seed: 0 });
  useExhibitProbe(p.id, () => ({ runs: shot.state.current.n, time: shot.state.current.t, levers: levers.current.slice(), curvePoints: anim.current.curve.length, pass: anim.current.pass }));
  const draw = (t: number) => {
    const { ctx, canvas, tex } = disp, W = canvas.width, H = canvas.height, a = anim.current;
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = INK; ctx.font = `600 ${W * 0.075}px Geist, sans-serif`;
    ctx.fillText(lang === 'zh' ? '假设 → 回测' : 'Hypothesis → backtest', W * 0.07, H * 0.08);
    demoTag(ctx, lang, W * 0.07, H * 0.12, W * 0.045);
    // lever state strip
    levers.current.forEach((l, i) => { ctx.fillStyle = ['#E8803A', '#4E647D', '#8AA24A', '#B8975A', '#E8803A'][i]; ctx.fillRect(W * (0.08 + i * 0.17), H * 0.16 + (2 - l) * H * 0.012, W * 0.13, H * 0.012); });
    // axes
    const x0 = W * 0.1, x1 = W * 0.92, y0 = H * 0.78, y1 = H * 0.24;
    ctx.strokeStyle = '#4A5C6A'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x0, y0); ctx.lineTo(x1, y0); ctx.stroke();
    ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(x0, (y0 + y1) / 2); ctx.lineTo(x1, (y0 + y1) / 2); ctx.stroke(); ctx.setLineDash([]);
    if (t >= 0 && a.curve.length) {
      const k = Math.min(1, Math.max(0, (t - 0.6) / 3.2)), n = Math.max(2, Math.floor(a.curve.length * k));
      ctx.strokeStyle = a.pass ? '#8AA24A' : '#E8803A'; ctx.lineWidth = W * 0.012; ctx.lineJoin = 'round'; ctx.beginPath();
      for (let i = 0; i < n; i++) { const x = x0 + (x1 - x0) * i / (a.curve.length - 1), y = (y0 + y1) / 2 - a.curve[i] * (y0 - y1) * 0.45; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
      if (t > 4.0) {
        const s = Math.min(1, (t - 4.0) / 0.25), sc = 1.6 - 0.6 * s;
        ctx.save(); ctx.translate(W * 0.5, H * 0.88); ctx.rotate(-0.12); ctx.scale(sc, sc); ctx.globalAlpha = s;
        ctx.strokeStyle = ctx.fillStyle = a.pass ? '#8AA24A' : '#E8803A'; ctx.lineWidth = W * 0.012;
        ctx.strokeRect(-W * 0.3, -H * 0.045, W * 0.6, H * 0.09);
        ctx.font = `700 ${W * 0.085}px Geist, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(a.pass ? (lang === 'zh' ? '通过' : 'PASS') : (lang === 'zh' ? '拒绝' : 'REJECT'), 0, 2);
        ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
    } else {
      ctx.fillStyle = '#8E9BA6'; ctx.font = `${W * 0.055}px Geist, sans-serif`;
      ctx.fillText(lang === 'zh' ? '按 E 拨一根拨杆' : 'Press E to flip a lever', W * 0.1, H * 0.9);
    }
    tex.needsUpdate = true;
  };
  useEffect(() => draw(shot.state.current.n ? 7.4 : -1), [lang]); // eslint-disable-line react-hooks/exhaustive-deps
  useExhibitE(p, 'exhibit', { en: 'Flip a hypothesis lever', zh: '拨一根假设拨杆' }, () => {
    if (!shot.start()) return;
    const a = anim.current, i = Math.floor(Math.random() * 5), l = levers.current[i];
    a.lever = i; a.from = l;
    levers.current[i] = l === 1 ? (Math.random() < 0.5 ? 0 : 2) : 1;
    a.seed = levers.current.reduce((s, v, k) => s + v * 3 ** k, 0) + shot.state.current.n * 0.37;
    // Deterministic toy backtest from the lever combination: drift + noise; pass when final > 0 and drawdown small.
    const drift = (levers.current[0] - 1) * 0.012 + (levers.current[2] - 1) * 0.008 - (levers.current[4] - 1) * 0.006 + 0.002;
    let v = 0, peak = 0, dd = 0; a.curve = [];
    for (let k = 0; k < 60; k++) { v += drift + (hash(a.seed * 31 + k) - 0.5) * 0.09; peak = Math.max(peak, v); dd = Math.max(dd, peak - v); a.curve.push(Math.max(-1, Math.min(1, v))); }
    a.pass = v > 0.05 && dd < 0.35;
  });
  const stamp = p.movers.stamp, base = useMemo(() => stamp?.position.y ?? 0, [stamp]);
  useFrame((_, dt) => {
    if (!isWorldRunning()) return;
    const t = shot.advance(dt), a = anim.current;
    p.movers[`lever_${a.lever}`] && levers.current.forEach((l, i) => {
      const node = p.movers[`lever_${i}`]; if (!node) return;
      const target = (l - 1) * 0.45, cur = node.rotation.x;
      node.rotation.x = cur + (target - cur) * Math.min(1, dt * 14);
    });
    if (stamp) stamp.position.y = base + (t > 4.0 && t < 4.6 ? -Math.sin((t - 4.0) / 0.6 * Math.PI) * 0.035 : 0);
    if (t >= 0) draw(t); else if (shot.state.current.n && shot.state.current.t === -1 && a.curve.length) { /* keep last frame */ }
  });
  return null;
}

/* ------------------------------------------------------------------ P13 review booth */
function ReviewBooth({ p }: { p: Placed }) {
  const lang = useLang();
  const L = useDisplay(p.movers.display_clip0, 0.54, 0.38, 192), R = useDisplay(p.movers.display_clip1, 0.54, 0.38, 192);
  const shot = useOneShot(4.2);
  const voted = useRef(0);
  const votes = useRef<[number, number]>([3, 3]), side = useRef(0), shown = useRef<[number, number]>([3, 3]);
  useExhibitProbe(p.id, () => ({ runs: shot.state.current.n, time: shot.state.current.t, votes: votes.current.slice(), side: side.current }));
  const clip = (d: ReturnType<typeof useDisplay>, which: number, t: number, chosen: boolean) => {
    const { ctx, canvas: c, tex } = d, W = c.width, H = c.height;
    ctx.fillStyle = which ? '#1E2A36' : '#2A2421'; ctx.fillRect(0, 0, W, H);
    // Abstract generated-video stand-in: drifting shapes (clip A circles, clip B bands), 3 s loop.
    const k = Math.max(0, t) % 3;
    if (which === 0) for (let i = 0; i < 5; i++) { ctx.fillStyle = ['#E8803A', '#B8975A', '#E6DCCB', '#8E6E55', '#E8803A'][i]; ctx.beginPath(); ctx.arc(W * (0.15 + 0.18 * i + 0.05 * Math.sin(k * 2 + i)), H * (0.5 + 0.25 * Math.sin(k * 2.1 + i * 1.3)), H * (0.08 + 0.03 * i), 0, 7); ctx.fill(); }
    else for (let i = 0; i < 6; i++) { ctx.fillStyle = ['#4E647D', '#8AA24A', '#E6DCCB', '#4FD1C5', '#7E8C3E', '#4E647D'][i]; ctx.fillRect(((k * 0.33 + i / 6) % 1) * W - W * 0.1, H * 0.12 + i * H * 0.13, W * 0.32, H * 0.08); }
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, H - H * 0.08, W, H * 0.08);
    ctx.fillStyle = INK; ctx.fillRect(0, H - H * 0.08, W * (t >= 0 ? Math.min(1, t / 3) : 0), H * 0.03);
    ctx.font = `600 ${H * 0.1}px Geist, sans-serif`; ctx.fillText(which ? 'B' : 'A', W * 0.04, H * 0.14);
    ctx.font = `500 ${H * 0.075}px Geist, sans-serif`; ctx.fillText(`${lang === 'zh' ? '本地票数' : 'Local votes'}: ${votes.current[which]}`, W * .04, H * .91);
    if (chosen) { ctx.strokeStyle = '#E6DCCB'; ctx.lineWidth = H * 0.04; ctx.strokeRect(H * 0.02, H * 0.02, W - H * 0.04, H - H * 0.04); }
    demoTag(ctx, lang, W * 0.55, H * 0.14, H * 0.07);
    tex.needsUpdate = true;
  };
  useEffect(() => { clip(L, 0, -1, side.current === 0); clip(R, 1, -1, side.current === 1); }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps
  useExhibitE(p, 'exhibit', { en: 'Watch both clips and vote', zh: '看两段短片并投票' }, () => {
    if (!shot.start()) return;
    side.current = 1 - side.current;
  });
  const sel = p.movers.selector, btn = p.movers.button;
  useFrame((_, dt) => {
    if (!isWorldRunning()) return;
    const t = shot.advance(dt);
    if (t >= 0) {
      clip(L, 0, t, t > 3 && side.current === 0); clip(R, 1, t, t > 3 && side.current === 1);
      if (t > 3 && voted.current !== shot.state.current.n) { votes.current[side.current]++; voted.current = shot.state.current.n; }
    }
    if (btn) btn.position.y += ((t >= 0 && t < 0.25 ? -0.02 : 0) + (btn.userData.y0 ??= btn.position.y) - btn.position.y) * Math.min(1, dt * 20);
    if (sel) sel.rotation.y += ((side.current ? -1 : 1) * Math.PI / 2 - sel.rotation.y) * Math.min(1, dt * 10);
    for (const i of [0, 1]) {
      shown.current[i] += (votes.current[i] - shown.current[i]) * Math.min(1, dt * 3);
      const bar = p.movers[`bar_${i}`];
      if (bar) bar.scale.y = Math.min(1, 0.06 + shown.current[i] / 40);
    }
  });
  return null;
}

/* ------------------------------------------------------------------ P14 DJ table */
const NOTCHES = [-0.1, -0.05, 0, 0.05, 0.1];
function DjTable({ p }: { p: Placed }) {
  const pos = useRef(0), dir = useRef(1), shot = useOneShot(1.2);
  useExhibitE(p, 'exhibit', { en: 'Slide the crossfader', zh: '推一格横推子' }, () => {
    if (!shot.start()) return;
    parkAudio.start();
    if (pos.current + dir.current > 4 || pos.current + dir.current < 0) dir.current = -dir.current;
    pos.current += dir.current;
    parkAudio.setCrossfade(pos.current / 4);
  });
  useExhibitProbe(p.id, () => ({ runs: shot.state.current.n, notch: pos.current, crossfade: parkAudio.crossfade, audioState: parkAudio.ctx?.state }));
  const fader = p.movers.crossfader, x0 = useMemo(() => fader?.position.x ?? 0, [fader]);
  useFrame((_, dt) => {
    if (!isWorldRunning()) return;
    shot.advance(dt);
    if (fader) fader.position.x += (x0 + NOTCHES[pos.current] - fader.position.x) * Math.min(1, dt * 12);
    const [a, b] = parkAudio.started ? parkAudio.gains() : [0, 0];
    // 33 1/3 rpm scaled by each deck's gain; idle decks stand still.
    if (p.movers.platter_0) p.movers.platter_0.rotation.y -= dt * 3.49 * a;
    if (p.movers.platter_1) p.movers.platter_1.rotation.y -= dt * 3.49 * b;
  });
  return null;
}

/* ------------------------------------------------------------------ P15 record wall */
/** Local demo features per record: tempo (bpm), key (Camelot number), energy 0..1. Illustrative only. */
const FEATURES = Array.from({ length: 9 }, (_, i) => ({ bpm: 96 + Math.round(hash(i * 3.1) * 34), key: 1 + Math.floor(hash(i * 7.7) * 12), energy: hash(i * 5.3) }));
const continuity = (a: typeof FEATURES[number], b: typeof FEATURES[number]) => {
  const tempo = Math.max(0, 1 - Math.abs(a.bpm - b.bpm) / 18), dk = Math.min(Math.abs(a.key - b.key), 12 - Math.abs(a.key - b.key));
  const key = dk === 0 ? 1 : dk === 1 ? 0.8 : dk === 2 ? 0.35 : 0.1, energy = 1 - Math.abs(a.energy - b.energy);
  return 0.4 * tempo + 0.4 * key + 0.2 * energy;
};
const SLOT_LINKS: [number, number][] = [[0, 1], [1, 2], [3, 4], [4, 5], [6, 7], [7, 8], [0, 3], [3, 6], [1, 4], [4, 7], [2, 5], [5, 8]];
const CORD_NODES = ['cord_h00', 'cord_h01', 'cord_h10', 'cord_h11', 'cord_h20', 'cord_h21', 'cord_v00', 'cord_v01', 'cord_v10', 'cord_v11', 'cord_v20', 'cord_v21'];
function RecordWall({ p }: { p: Placed }) {
  const order = useRef([0, 1, 2, 3, 4, 5, 6, 7, 8]);          // slot -> record
  const homes = useMemo(() => Array.from({ length: 9 }, (_, i) => p.movers[`record_${i}`]?.position.clone() ?? new Vector3()), [p]);
  const shot = useOneShot(2.6), move = useRef({ a: -1, b: -1 });
  const width = useRef(SLOT_LINKS.map(() => 1));
  const target = () => SLOT_LINKS.map(([s, t]) => 0.35 + 2.3 * continuity(FEATURES[order.current[s]], FEATURES[order.current[t]]) ** 2);
  const goal = useRef(target());
  useExhibitProbe(p.id, () => ({ runs: shot.state.current.n, order: order.current.slice(), cordWidths: width.current.slice() }));
  useExhibitE(p, 'exhibit', { en: 'Reshuffle one record', zh: '换一张唱片的位置' }, () => {
    if (!shot.start()) return;
    const a = Math.floor(Math.random() * 9); let b = Math.floor(Math.random() * 8); if (b >= a) b++;
    move.current = { a, b };
    const o = order.current; [o[a], o[b]] = [o[b], o[a]];
    goal.current = target();
  });
  useFrame((_, dt) => {
    if (!isWorldRunning()) return;
    const t = shot.advance(dt), { a, b } = move.current;
    for (let slot = 0; slot < 9; slot++) {
      const rec = order.current[slot], node = p.movers[`record_${rec}`]; if (!node) continue;
      const home = homes[slot];
      if (t >= 0 && t < 0.9 && (slot === a || slot === b)) {
        const from = homes[slot === a ? b : a], k = t / 0.9, e = k * k * (3 - 2 * k);
        node.position.lerpVectors(from, home, e); node.position.z += Math.sin(k * Math.PI) * 0.35 * (slot === a ? 1 : 0.6);
        node.rotation.z = Math.sin(k * Math.PI) * 0.25 * (slot === a ? 1 : -1);
      } else { node.position.lerp(home, Math.min(1, dt * 10)); node.rotation.z *= 0.8; }
    }
    // Cords re-thicken after the swap lands.
    if (t < 0 || t > 0.9) width.current = width.current.map((w, i) => w + (goal.current[i] - w) * Math.min(1, dt * 4));
    CORD_NODES.forEach((name, i) => { const c = p.movers[name]; if (c) { c.scale.x = c.scale.z = width.current[i]; } });
  });
  useEffect(() => { width.current = goal.current.slice(); }, []);
  return null;
}

/* ------------------------------------------------------------------ P16 + P17 camp chairs and lantern */
const LINES: Record<Lang, string[]> = {
  en: ['What did you work on this week?', 'Which part felt like real progress?', 'Want me to keep that as evidence?'],
  zh: ['这周做了什么？', '哪一部分让你觉得真的在进步？', '要不要把它记下来作为证据？'],
};
function CampChairs({ p, lamp }: { p: Placed; lamp?: Placed }) {
  const lang = useLang();
  const seatId = `park-seat-${p.hut.id}`;
  const seated = useWorldStore(s => s.seat?.id === seatId);
  const level = useRef(0);
  // Chair A is near the opening; both chairs share the hut axis so the empty chair stays in view.
  const seatPoint = useMemo(() => new Vector3(0, 0.43, 0.75).applyMatrix4(p.matrix), [p.matrix]);
  const empty = useMemo(() => new Vector3(0, 0.43, -0.75).applyMatrix4(p.matrix), [p.matrix]);
  const seatYaw = useMemo(() => { const f = new Vector3(0, 0, -1).transformDirection(p.matrix); return Math.atan2(-f.z, f.x); }, [p.matrix]);
  useExhibitE(p, 'seat', { en: 'Sit down and talk', zh: '坐下来聊聊' }, () => {
    useWorldStore.setState({ seat: { id: seatId, position: [seatPoint.x, seatPoint.y, seatPoint.z], yaw: seatYaw } });
  }, 1.8);
  const [shown, setShown] = useState(0);
  const since = useRef(0);
  useExhibitProbe(p.id, () => ({ seated: useWorldStore.getState().seat?.id === seatId, bubbles: shown, lantern: level.current, seat: [seatPoint.x, seatPoint.y, seatPoint.z], yaw: seatYaw }));
  useEffect(() => { if (seated) { since.current = 0; setShown(0); } }, [seated]);
  useFrame((_, dt) => {
    if (!isWorldRunning()) return;
    if (seated) { since.current += dt; const n = Math.min(3, Math.floor((since.current - 0.6) / 1.6) + 1); if (n !== shown && n >= 0) setShown(Math.max(0, n)); }
    level.current += ((seated ? 1 : 0) - level.current) * Math.min(1, dt * 3);
    const flick = 1 + 0.07 * Math.sin(performance.now() * 0.013) * level.current;
    setPartEmit(lamp?.movers.lamp_flame, (0.4 + level.current * 1.8) * flick);
    setPartEmit(lamp?.movers.lamp_glass, level.current * 0.55 * flick);
  });
  return <Bubbles active={seated} lines={LINES[lang].slice(0, shown)} at={[empty.x, empty.y + 0.65, empty.z]} />;
}
/** Screen-sized text anchored above the empty chair; close orbit must not magnify it over the player. */
function Bubbles({ lines, at, active }: { lines: string[]; at: Vec3; active: boolean }) {
  const alpha = useRef(0);
  const body = useRef<HTMLDivElement>(null);
  const projected = useMemo(() => new Vector3(), []);
  useFrame((_, dt) => {
    if (!isWorldRunning()) return;
    alpha.current += ((active ? 1 : 0) - alpha.current) * Math.min(1, dt * 5);
    if (body.current) body.current.style.opacity = String(alpha.current);
  });
  return <Html position={at} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }} calculatePosition={(object, camera, size) => {
    projected.setFromMatrixPosition(object.matrixWorld).project(camera);
    const margin = Math.min(288, size.width - 48) / 2 + 16;
    return [Math.max(margin, Math.min(size.width - margin, (projected.x + 1) * size.width / 2)),
      Math.max(Math.min(220, size.height / 2), Math.min(size.height - 130, (1 - projected.y) * size.height / 2))];
  }}>
    <div ref={body} className="world-park-bubbles" style={{ opacity: 0 }}>
      {lines.map((text, i) => <p key={i}>{text}</p>)}
    </div>
  </Html>;
}

/* ------------------------------------------------------------------ P18 blackboard */
function Blackboard({ p, project }: { p: Placed; project?: WorldProject }) {
  const lang = useLang();
  const front = useDisplay(p.movers.display_front ?? p.root.getObjectByName('display_front'), 2.0, 1.1, 384);
  const back = useDisplay(p.movers.display_back ?? p.root.getObjectByName('display_back'), 2.0, 1.1, 384);
  const courses = project?.courses?.[lang] ?? [];
  const page = useRef(0), shot = useOneShot(3.2);
  useExhibitProbe(p.id, () => ({ runs: shot.state.current.n, page: page.current % Math.max(1, courses.length), courses: courses.map(c => c.code), angle: p.movers.board?.rotation.x }));
  const draw = (d: ReturnType<typeof useDisplay>, idx: number, k: number, mirror: boolean) => {
    const { ctx, canvas: c, tex } = d, W = c.width, H = c.height;
    ctx.setTransform(1, 0, 0, mirror ? -1 : 1, 0, mirror ? H : 0);
    ctx.fillStyle = '#2F3D38'; ctx.fillRect(0, 0, W, H);
    // faint erased-chalk smudges
    for (let i = 0; i < 6; i++) { ctx.fillStyle = 'rgba(230,235,225,0.05)'; ctx.beginPath(); ctx.ellipse(W * hash(i * 3.3 + idx), H * hash(i * 1.7 + idx), W * 0.12, H * 0.06, 0.3, 0, 7); ctx.fill(); }
    const course = courses.length ? courses[idx % courses.length] : null;
    ctx.strokeStyle = ctx.fillStyle = CHALK; ctx.lineCap = 'round';
    if (!course) { ctx.font = `500 ${H * 0.08}px Geist, sans-serif`; ctx.fillText('—', W * 0.1, H * 0.2); tex.needsUpdate = true; return; }
    // stroke-reveal: k 0..1 over the title, name, sketch, underline
    const reveal = (from: number, to: number) => Math.max(0, Math.min(1, (k - from) / (to - from)));
    const r1 = reveal(0, 0.3), r2 = reveal(0.2, 0.5), r3 = reveal(0.45, 0.9), r4 = reveal(0.85, 1);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W * (0.08 + 0.6 * r1), H * 0.32); ctx.clip();
    ctx.font = `700 ${H * 0.2}px Geist, sans-serif`; ctx.fillText(course.code, W * 0.08, H * 0.27); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(0, H * 0.32, W * (0.08 + 0.9 * r2), H * 0.14); ctx.clip();
    ctx.font = `500 ${H * 0.085}px Geist, "PingFang SC", sans-serif`; ctx.fillText(course.name, W * 0.08, H * 0.42); ctx.restore();
    ctx.lineWidth = H * 0.012; ctx.beginPath(); ctx.moveTo(W * 0.08, H * 0.31); ctx.lineTo(W * (0.08 + 0.5 * r4), H * 0.31 + H * 0.006 * Math.sin(r4 * 9)); ctx.stroke();
    // course sketch, chosen from the course's own product description keywords (no hard-coded codes)
    const kind = /ODE|slope|方向场|phase/i.test(course.response) ? 'ode' : /DDM|CAPM|portfolio|valuation|估值|组合/i.test(course.response + course.problem) ? 'frontier'
      : /formula|公式|capital|资本/i.test(course.response + course.problem) ? 'npv' : 'framework';
    const ox = W * 0.08, oy = H * 0.5, sw = W * 0.84, sh = H * 0.42;
    ctx.lineWidth = H * 0.008; ctx.save(); ctx.beginPath(); ctx.rect(ox - 4, oy - 4, (sw + 8) * r3, sh + 8); ctx.clip();
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + sh); ctx.lineTo(ox + sw, oy + sh); ctx.stroke();
    if (kind === 'ode') {
      for (let i = 1; i < 12; i++) for (let j = 1; j < 5; j++) { const x = ox + sw * i / 12, y = oy + sh * j / 5, s = Math.sin(i * 0.6 - j * 0.9); ctx.beginPath(); ctx.moveTo(x - 12, y - 12 * s); ctx.lineTo(x + 12, y + 12 * s); ctx.stroke(); }
    } else if (kind === 'frontier') {
      ctx.beginPath(); for (let i = 0; i <= 30; i++) { const t = i / 30, x = ox + sw * (0.12 + 0.75 * t ** 2), y = oy + sh * (0.92 - 0.8 * Math.sqrt(t)); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, oy + sh * 0.75); ctx.lineTo(ox + sw * 0.9, oy + sh * 0.05); ctx.stroke();
    } else if (kind === 'npv') {
      for (let i = 0; i < 6; i++) { const x = ox + sw * (0.1 + i * 0.15), h = sh * (i ? 0.25 + 0.08 * i : 0.6); ctx.strokeRect(x, i ? oy + sh - h : oy + sh, sw * 0.08, i ? h : -h * 0); if (!i) { ctx.beginPath(); ctx.moveTo(x + sw * 0.04, oy + sh); ctx.lineTo(x + sw * 0.04, oy + sh * 0.3); ctx.lineTo(x, oy + sh * 0.42); ctx.moveTo(x + sw * 0.04, oy + sh * 0.3); ctx.lineTo(x + sw * 0.08, oy + sh * 0.42); ctx.stroke(); } }
    } else {
      const nodes = [[0.2, 0.3], [0.5, 0.15], [0.8, 0.3], [0.35, 0.75], [0.65, 0.75]];
      nodes.forEach(([a, b], i) => { ctx.beginPath(); ctx.arc(ox + sw * a, oy + sh * b, H * 0.04, 0, 7); ctx.stroke(); nodes.slice(i + 1).forEach(([c2, d2]) => { if ((i + 1) % 2) { ctx.beginPath(); ctx.moveTo(ox + sw * a, oy + sh * b); ctx.lineTo(ox + sw * c2, oy + sh * d2); ctx.stroke(); } }); });
    }
    ctx.restore();
    ctx.font = `500 ${H * 0.045}px Geist, sans-serif`; ctx.fillStyle = 'rgba(242,238,228,0.7)';
    ctx.fillText(`${(idx % courses.length) + 1} / ${courses.length}`, W * 0.86, H * 0.12);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    tex.needsUpdate = true;
  };
  useEffect(() => { draw(front, page.current, 1, false); draw(back, page.current + 1, 0, true); }, [lang, courses.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const board = p.movers.board;
  useExhibitE(p, 'exhibit', { en: 'Flip to the next course', zh: '翻到下一门课' }, () => {
    if (!courses.length || !shot.start()) return;
    const next = page.current + 1;
    // whichever face turns toward the room shows the next page
    const showing = Math.round((board?.rotation.x ?? 0) / Math.PI) % 2 === 0 ? back : front;
    draw(showing, next, 0, showing === back);
    page.current = next;
  });
  const base = useRef(0);
  useFrame((_, dt) => {
    if (!isWorldRunning()) return;
    const t = shot.advance(dt);
    if (!board) return;
    if (t >= 0 && t < 0.8) { const k = t / 0.8; board.rotation.x = base.current + Math.PI * k * k * (3 - 2 * k); }
    else if (t >= 0.8) { board.rotation.x = base.current + Math.PI; const facing = (Math.round(board.rotation.x / Math.PI) % 2 === 0) ? front : back; draw(facing, page.current, Math.min(1, (t - 0.8) / 2), facing === back); }
    else if (shot.state.current.n && Math.abs(board.rotation.x - base.current) > 1) base.current = board.rotation.x;
  });
  return null;
}

/* ------------------------------------------------------------------ assembly */
function ExhibitSet({ placed, projects }: { placed: Placed[]; projects: WorldProject[] }) {
  const project = (slug: string) => projects.find(x => x.slug === slug);
  const parts = useMemo(() => {
    const batch = new PartBatch(), I = new Matrix4();
    for (const p of placed) {
      moversOnly(p);
      p.root.traverse(o => { const m = o as Mesh; if (m.isMesh && !m.name.startsWith('display') && !m.parent?.name.startsWith('display') && m.name !== 'screen' && m.parent?.name !== 'screen') { batch.add(m, [{ mesh: m, local: I }]); m.visible = false; m.castShadow = false; } });
    }
    return batch.build();
  }, [placed]);
  useEffect(() => { exhibitParts.add(parts); return () => { exhibitParts.delete(parts); parts.geometry?.dispose(); parts.material?.dispose(); parts.texture?.dispose(); }; }, [parts]);
  useEffect(() => () => placed.forEach(p => p.body.dispose()), [placed]);
  const holder = useRef<Group>(null);
  useFrame(() => { holder.current?.updateMatrixWorld(true); parts.sync(); });
  const lampFor = (hut: string) => placed.find(x => x.hut.id === hut && x.id === 'P17');
  const dynamic = useMemo(() => {
    const by = new Map<string, { geometry: BufferGeometry; hull: Float32Array; items: { id: string; position: Vec3; yaw: number }[] }>();
    for (const p of placed) for (const d of p.dynamic) {
      const key = `${p.id}-${d.name}`;
      by.set(key, { geometry: d.geometry, hull: d.hull, items: [{ id: `${p.hut.id}-${d.name}`, position: d.position, yaw: d.yaw }] });
    }
    return [...by.entries()];
  }, [placed]);
  return <group name={`park-exhibit-set-${placed[0]?.hut.id}`}>
    {placed.map(p => <mesh key={`body-${p.id}`} name={`park-exhibit-body-${p.id}`} geometry={p.body} material={parkMaterial()} castShadow receiveShadow userData={{ solid: true, occluder: true, assetId: p.id }} />)}
    <group ref={holder} name="park-exhibit-nodes">
      {placed.map(p => <group key={`${p.hut.id}-${p.id}`} name={`park-exhibit-${p.id}`} matrixAutoUpdate={false} matrix={p.matrix}>
        <primitive object={p.root} />
      </group>)}
    </group>
    <mesh name="park-exhibit-parts" geometry={parts.geometry!} material={parts.material!} frustumCulled={false} receiveShadow userData={{ noOcclusionFade: true }} />
    {placed.map(p => {
      const key = `${p.hut.id}-${p.id}`;
      switch (p.id) {
        case 'P12': return <ResearchDesk key={key} p={p} />;
        case 'P13': return <ReviewBooth key={key} p={p} />;
        case 'P14': return <DjTable key={key} p={p} />;
        case 'P15': return <RecordWall key={key} p={p} />;
        case 'P16': return <CampChairs key={key} p={p} lamp={lampFor(p.hut.id)} />;
        case 'P18': return <Blackboard key={key} p={p} project={project(p.hut.slug)} />;
        default: return null;
      }
    })}
    {dynamic.map(([key, d]) => <Knockables key={key} name={`exhibit-${key}`} items={d.items} source={d.geometry} hull={d.hull}
      spec={{ half: [0.2, 0.3, 0.2], offset: [0, 0.3, 0], mass: key.endsWith('crate') ? 9 : 4 }} />)}
  </group>;
}
/** Root clone keeping only moving nodes (body is in the static batch, dynamic props are rigid bodies). */
function moversOnly(p: Placed) {
  for (const c of [...p.root.children]) if (c.name === 'body' || DYNAMIC.has(c.name)) p.root.remove(c);
  p.root.position.set(0, 0, 0); p.root.rotation.set(0, 0, 0); p.root.updateMatrix();
  p.root.traverse(o => { const m = o as Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = true; } });
  return p.root;
}
/** One independent moving-part batch per hut; lantern lookup keeps the matching batch. */
const exhibitParts = new Set<PartBatch>();
const setPartEmit = (node: Object3D | undefined, v: number) => {
  if (!node) return;
  for (const b of exhibitParts) node.traverse(o => { const i = b.nodes.indexOf(o); if (i >= 0) b.emit[i] = v; });
};

export function ParkExhibits({ placed, projects }: { placed: Placed[]; projects: WorldProject[] }) {
  const groups = useMemo(() => HUTS.map(hut => {
    const list = placed.filter(p => p.hut.id === hut.id); let triangles = 0;
    list.forEach(p => {
      triangles += p.body.getAttribute('position').count / 3;
      p.root.traverse(o => { const m = o as Mesh; if (!m.isMesh) return;
        let top = o; while (top.parent && top.parent !== p.root) top = top.parent;
        if (top.name === 'body' || DYNAMIC.has(top.name)) return;
        triangles += (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3;
      });
    });
    return { hut, list, triangles };
  }), [placed]);
  return <group name="park-exhibits">{groups.map(g => <ParkLOD key={g.hut.id} id={`exhibits-${g.hut.id}`} center={g.hut.local(0, 1, -1.5)} nearTriangles={g.triangles}
    near={<ExhibitSet placed={g.list} projects={projects} />} />)}</group>;
}
