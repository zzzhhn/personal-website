import { useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { RigidBody, TrimeshCollider, useAfterPhysicsStep, useBeforePhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier';
import { BufferAttribute, BufferGeometry, CanvasTexture, Group, Matrix4, Mesh, MeshStandardMaterial, Object3D, Quaternion, SRGBColorSpace, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PartBatch, gltfTrimesh, meshPiece, meshesUnder, mergeBatch, parkMaterial, parkUrl, withDraco, hash, topName, type GLTF } from './WorldParkKit';
import { EXHIBITS, EXHIBIT_ANCHOR, HUTS, exhibitMatrix, type HutPlacement } from './WorldParkLayout';
import { Knockables } from './WorldParkWalk';
import { useInteractable } from './WorldInteract';
import { useWorldStore } from './store';
import { isWorldRunning } from './WorldWind';
import { trackPortfolioEvent } from '../../lib/analytics';
import { parkAudio } from './WorldParkAudio';
import { CLUB } from './djc-club-layout';
import { ParkLOD } from './WorldParkLOD';
import { boardFlipAngle, exhibitBoardRotation, exhibitBoardSweepClear, exhibitPartContact, exhibitPartShape, exhibitRecordPose, exhibitSweepClear,
  exhibitSurfaceId, type ExhibitPartShape, type ExhibitSourceRange } from './park-exhibit-collision';
import type { KnockableContact } from './park-knockable-contact';
import type { Vec3, WorldProject, Lang } from './types';

/**
 * P13-P18: five playable exhibits. One E press = one action with one visible
 * result in 3D, <= 10 s, no submenu; E during a running action is ignored. Demo content is generated
 * locally and labelled DEMO / 演示: it never claims to be real service output or real statistics.
 * Static exhibit bodies join the park batch (returned to WorldPark); moving nodes are small meshes.
 */
const ids = ['P13', 'P14', 'P15', 'P16', 'P17', 'P18'];
export function useExhibitGltfs() {
  const list = useLoader(GLTFLoader, ids.map(parkUrl), withDraco) as GLTF[];
  return useMemo(() => Object.fromEntries(ids.map((id, i) => [id, list[i]])) as Record<string, GLTF>, [list]);
}

type Movers = Record<string, Object3D>;
type Placed = { body: BufferGeometry; hut: HutPlacement; id: string; matrix: Matrix4; root: Object3D; movers: Movers;
  fixed: ReturnType<typeof gltfTrimesh>; contact: Record<string, ExhibitPartShape>;
  dynamic: { name: string; geometry: BufferGeometry; position: Vec3; yaw: number; contact: KnockableContact }[] };
const DYNAMIC = new Set(['stool', 'crate']);

/** Static batch pieces + per-exhibit moving node clones + colliders. */
export function placeExhibits(gltfs: Record<string, GLTF>) {
  const placed: Placed[] = [];
  for (const hut of HUTS) for (const ex of EXHIBITS[hut.id] ?? []) {
    const src = gltfs[ex.id].scene.getObjectByName(ex.id)!;
    const root = src.clone(true);
    const matrix = exhibitMatrix(hut, ex.at, ex.yaw);
    root.updateMatrixWorld(true);
    const movers: Movers = {}, contact: Placed['contact'] = {};
    const fixed = new Set<string>();
    for (const child of root.children) {
      const policy = exhibitPartContact(ex.id, child.name);
      if (policy.collision === 'solid' && policy.group === 'body') fixed.add(child.name);
      if (child.name === 'body' || policy.collision === 'pushable') continue;
      movers[child.name] = child;
      if (policy.collision === 'solid' && policy.group !== 'body') contact[child.name] = exhibitPartShape(child, matrix);
    }
    const body = root.getObjectByName('body')!;
    const bodyGeometry = mergeBatch(meshesUnder(body, new Set()).map(m => meshPiece(m, new Matrix4().multiplyMatrices(matrix, m.matrixWorld))));
    const fixedMesh = gltfTrimesh(root, matrix, n => fixed.has(n));
    const dynamic: Placed['dynamic'] = [];
    for (const name of DYNAMIC) {
      const node = root.getObjectByName(name);
      if (!node) continue;
      // Dynamic prop geometry in its own node frame (origin = floor contact centre).
      const inv = node.matrixWorld.clone().invert();
      const geometry = mergeBatch(meshesUnder(node, new Set()).map(m => meshPiece(m, inv.clone().multiply(m.matrixWorld))));
      const wp = new Vector3().setFromMatrixPosition(new Matrix4().multiplyMatrices(matrix, node.matrixWorld));
      const positions = geometry.getAttribute('position');
      dynamic.push({ name, geometry, position: [wp.x, wp.y, wp.z], yaw: hut.yaw + ex.yaw,
        contact: { near: [{ id: name, firstVertex: 0, vertexCount: positions.count, collision: 'pushable' }],
          hulls: [{ id: name, points: new Float32Array(positions.array) }] } });
    }
    placed.push({ body: bodyGeometry, hut, id: ex.id, matrix, root, movers, dynamic, fixed: fixedMesh, contact });
  }
  return placed;
}

const partId = (p: Placed, group: string) => exhibitSurfaceId(p.hut.id, p.id, group);
const partAsset = (p: Placed, group: string) => group === 'body' ? p.id : `${p.id}-${group}`;

function ExhibitMovingContact({ body, p, part }: { body: Ref<RapierRigidBody>; p: Placed; part: string }) {
  const shape = p.contact[part];
  return <RigidBody ref={body} type="kinematicPosition" colliders={false} position={shape.position} quaternion={shape.rotation}
    userData={{ solid: true, assetId: partAsset(p, part) }}>
    <TrimeshCollider name={partId(p, part)} args={[shape.vertices, shape.indices]} friction={.6} />
  </RigidBody>;
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
  const available = () => state.current.t < 0;
  const start = () => { if (!available()) return false; state.current.t = 0; state.current.n++; return true; };
  const advance = (dt: number) => { if (state.current.t < 0) return -1; state.current.t += dt; if (state.current.t > dur) { state.current.t = -1; return -1; } return state.current.t; };
  return { state, available, start, advance };
}

function useExhibitE(p: Placed, kind: 'exhibit' | 'seat', label: { en: string; zh: string }, onPress: () => void,
  { radius = 1.6, enabled }: { radius?: number; enabled?: () => boolean } = {}) {
  const a = EXHIBIT_ANCHOR[p.hut.id];
  const position = useMemo(() => p.hut.local(a[0], 0.9, a[1]), [p.hut, a]);
  useInteractable({ id: `park-${p.id}-${p.hut.id}`, position, radius, label, kind, enabled, onInteract: () => {
    if (enabled?.() === false) return;
    if (!new URLSearchParams(location.search).has('qa')) trackPortfolioEvent('world_booth_open', p.hut.slug);
    onPress();
  } });
}

/* ------------------------------------------------------------------ P13 review booth */
function ReviewBooth({ p }: { p: Placed }) {
  const lang = useLang();
  const L = useDisplay(p.movers.display_clip0, 0.54, 0.38, 192), R = useDisplay(p.movers.display_clip1, 0.54, 0.38, 192);
  const shot = useOneShot(4.2);
  const buttonBody = useRef<RapierRigidBody>(null);
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
  }, { enabled: shot.available });
  const sel = p.movers.selector, btn = p.movers.button;
  const buttonHome = useRef(btn.position.y), buttonY = useRef(buttonHome.current);
  useBeforePhysicsStep(world => {
    if (!isWorldRunning() || !buttonBody.current) return;
    const t = shot.advance(world.timestep);
    const target = buttonHome.current - (0 <= t && t < .25 ? .02 : 0);
    const shift = target - buttonY.current;
    if (!shift) return;
    buttonY.current += Math.abs(shift) < .0001 ? shift : shift * Math.min(1, world.timestep * 20);
    const [x,y,z] = p.contact.button.position;
    buttonBody.current.setNextKinematicTranslation({ x, y: y + buttonY.current - buttonHome.current, z });
  });
  useAfterPhysicsStep(() => { btn.position.y = buttonY.current; });
  useFrame((_, dt) => {
    if (!isWorldRunning()) return;
    const t = shot.state.current.t;
    if (t >= 0) {
      clip(L, 0, t, t > 3 && side.current === 0); clip(R, 1, t, t > 3 && side.current === 1);
      if (t > 3 && voted.current !== shot.state.current.n) { votes.current[side.current]++; voted.current = shot.state.current.n; }
    }
    if (sel) sel.rotation.y += ((side.current ? -1 : 1) * Math.PI / 2 - sel.rotation.y) * Math.min(1, dt * 10);
    for (const i of [0, 1]) {
      shown.current[i] += (votes.current[i] - shown.current[i]) * Math.min(1, dt * 3);
      const bar = p.movers[`bar_${i}`];
      if (bar) bar.scale.y = Math.min(1, 0.06 + shown.current[i] / 40);
    }
  });
  return <ExhibitMovingContact body={buttonBody} p={p} part="button" />;
}

/* ------------------------------------------------------------------ P14 DJ table */
function DjTable({ p }: { p: Placed }) {
  useExhibitE(p, 'exhibit', { en: 'Find the beach club', zh: '前往海边 Club' }, () => useWorldStore.setState({
    waypoint:[CLUB.entrance[0],CLUB.entrance[2]],toast:{zh:'DJC 搬到海边了，沿地图标记前往 Club。',en:'DJC is at the beach. Follow the map marker to the club.',at:performance.now()}
  }));
  useExhibitProbe(p.id, () => ({ destination: 'djc-beach-club' }));
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
const recordAxis = new Vector3(0, 0, 1);
function RecordWall({ p }: { p: Placed }) {
  const { rapier } = useRapier();
  const order = useRef([0, 1, 2, 3, 4, 5, 6, 7, 8]);          // slot -> record
  const records = useMemo(() => Array.from({ length: 9 }, (_, i) => {
    const part = `record_${i}`, node = p.movers[part];
    return { part, node, home: node.position.clone(), shape: p.contact[part] };
  }), [p]);
  const bodies = useRef<(RapierRigidBody | null)[]>([]);
  const shot = useOneShot(2.6), move = useRef({ a: -1, b: -1 });
  const blocked = useRef(false);
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
  }, { enabled: shot.available });
  useBeforePhysicsStep(world => {
    if (!isWorldRunning() || shot.available()) return;
    const t = shot.state.current.t, { a, b } = move.current;
    if (t < .9) {
      const steps = [[b, a], [a, b]].map(([from, to]) => {
        const index = order.current[to], { shape } = records[index];
        const before = exhibitRecordPose(records[from].home, records[to].home, p.matrix, t, from === b);
        const after = exhibitRecordPose(records[from].home, records[to].home, p.matrix, t + world.timestep, from === b);
        const rotationAt = (angle: number) => shape.rotation.clone().multiply(new Quaternion().setFromAxisAngle(recordAxis, angle));
        const rotation = rotationAt(after.angle);
        const clear = exhibitSweepClear(world, rapier, shape, before.position, after.position,
          rotationAt((before.angle + after.angle) / 2), Math.abs(after.angle - before.angle), Math.hypot(shape.edge.x, shape.edge.y));
        return { index, after, rotation, clear };
      });
      if (steps.some(step => !step.clear)) {
        if (!blocked.current) useWorldStore.setState({ toast: { zh: '请让开唱片墙前方。', en: 'Step back to let the records finish moving.', at: performance.now() } });
        blocked.current = true;
        return;
      }
      blocked.current = false;
      for (const step of steps) {
        bodies.current[step.index]?.setNextKinematicTranslation(step.after.position);
        bodies.current[step.index]?.setNextKinematicRotation(step.rotation);
        records[step.index].node.position.copy(step.after.local);
        records[step.index].node.rotation.z = step.after.angle;
      }
    }
    shot.advance(world.timestep);
  });
  useFrame((_, dt) => {
    if (!isWorldRunning()) return;
    const t = shot.state.current.t;
    // Cords re-thicken after the swap lands.
    if (t < 0 || t > 0.9) width.current = width.current.map((w, i) => w + (goal.current[i] - w) * Math.min(1, dt * 4));
    CORD_NODES.forEach((name, i) => { const c = p.movers[name]; if (c) { c.scale.x = c.scale.z = width.current[i]; } });
  });
  useEffect(() => { width.current = goal.current.slice(); }, []);
  return <>{records.map(({ part }, i) => <ExhibitMovingContact key={part} p={p} part={part} body={body => { bodies.current[i] = body; }} />)}</>;
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
  }, { radius: 1.8 });
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
  const { rapier } = useRapier(), body = useRef<RapierRigidBody>(null);
  const front = useDisplay(p.movers.display_front ?? p.root.getObjectByName('display_front'), 2.0, 1.1, 384);
  const back = useDisplay(p.movers.display_back ?? p.root.getObjectByName('display_back'), 2.0, 1.1, 384);
  const courses = project?.courses?.[lang] ?? [];
  const page = useRef(0), shot = useOneShot(3.2);
  const base = useRef(0), angle = useRef(0), blocked = useRef(false);
  useExhibitProbe(p.id, () => ({ runs: shot.state.current.n, page: page.current % Math.max(1, courses.length), courses: courses.map(c => c.code), angle: p.movers.board?.rotation.x, blocked: blocked.current }));
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
  const shape = p.contact.board;
  useExhibitE(p, 'exhibit', { en: 'Flip to the next course', zh: '翻到下一门课' }, () => {
    if (!courses.length || !body.current || !shot.start()) return;
    base.current = angle.current;
    const next = page.current + 1;
    // whichever face turns toward the room shows the next page
    const showing = Math.round((board?.rotation.x ?? 0) / Math.PI) % 2 === 0 ? back : front;
    draw(showing, next, 0, showing === back);
    page.current = next;
  }, { enabled: () => courses.length > 0 && body.current !== null && shot.available() });
  useBeforePhysicsStep(world => {
    if (!isWorldRunning() || !body.current || !shape || shot.available()) return;
    const next = boardFlipAngle(base.current, shot.state.current.t + world.timestep);
    if (next !== angle.current && !exhibitBoardSweepClear(world, rapier, shape, angle.current, next)) {
      if (!blocked.current) useWorldStore.setState({ toast: { zh: '请让开黑板的翻转范围。', en: 'Step clear of the blackboard to let it turn.', at: performance.now() } });
      blocked.current = true;
      return;
    }
    blocked.current = false;
    shot.advance(world.timestep);
    if (next !== angle.current) body.current.setNextKinematicRotation(exhibitBoardRotation(shape, next));
    angle.current = next;
  });
  useAfterPhysicsStep(() => { if (board) board.rotation.x = angle.current; });
  useFrame(() => {
    const t = shot.state.current.t;
    if (isWorldRunning() && t >= .8) {
      const facing = Math.round(angle.current / Math.PI) % 2 === 0 ? front : back;
      draw(facing, page.current, Math.min(1, (t - .8) / 2), facing === back);
    }
  });
  return <ExhibitMovingContact body={body} p={p} part="board" />;
}

/* ------------------------------------------------------------------ assembly */
function ExhibitSet({ placed, projects }: { placed: Placed[]; projects: WorldProject[] }) {
  const project = (slug: string) => projects.find(x => x.slug === slug);
  const { parts, sources } = useMemo(() => {
    const batch = new PartBatch(), I = new Matrix4(), sources: ExhibitSourceRange[] = [];
    let firstVertex = 0;
    for (const p of placed) {
      moversOnly(p);
      for (const mesh of meshesUnder(p.root, new Set())) {
        const policy = exhibitPartContact(p.id, topName(mesh, p.root));
        const surfaceId = policy.group ? partId(p, policy.group) : undefined;
        const reason = 'reason' in policy ? policy.reason : undefined;
        Object.assign(mesh.userData, { worldCollision: policy.collision, surfaceId, worldCollisionSharedSurface: !!surfaceId,
          worldCollisionReason: reason, ...(policy.collision === 'solid' ? { solid: true, assetId: partAsset(p, policy.group) } : {}) });
        if (mesh.name.startsWith('display') || mesh.parent?.name.startsWith('display') || mesh.name === 'screen' || mesh.parent?.name === 'screen') continue;
        batch.add(mesh, [{ mesh, local: I }]);
        const vertexCount = mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count;
        sources.push({ id: `${partId(p, topName(mesh, p.root))}-${sources.length}`, firstVertex, vertexCount,
          collision: policy.collision, surfaceId, reason });
        firstVertex += vertexCount;
        mesh.visible = false;
        mesh.castShadow = false;
      }
    }
    return { parts: batch.build(), sources };
  }, [placed]);
  useEffect(() => { exhibitParts.add(parts); return () => { exhibitParts.delete(parts); parts.geometry?.dispose(); parts.material?.dispose(); parts.texture?.dispose(); }; }, [parts]);
  useEffect(() => () => placed.forEach(p => p.body.dispose()), [placed]);
  const holder = useRef<Group>(null);
  useFrame(() => { holder.current?.updateMatrixWorld(true); parts.sync(); });
  const lampFor = (hut: string) => placed.find(x => x.hut.id === hut && x.id === 'P17');
  const dynamic = useMemo(() => placed.flatMap(p => p.dynamic.map(d => ({ ...d, key: `${p.id}-${d.name}`,
    items: [{ id: `${p.hut.id}-${d.name}`, position: d.position, yaw: d.yaw }] }))), [placed]);
  return <group name={`park-exhibit-set-${placed[0]?.hut.id}`}>
    {placed.map(p => <group key={`body-${p.id}`}>
      <mesh name={`park-exhibit-body-${p.id}`} geometry={p.body} material={parkMaterial()} castShadow receiveShadow
        userData={{ solid: true, occluder: true, assetId: p.id, worldCollision: 'solid', surfaceId: partId(p, 'body'), worldCollisionSharedSurface: true }} />
      <RigidBody type="fixed" colliders={false} userData={{ solid: true, assetId: p.id }}>
        <TrimeshCollider name={partId(p, 'body')} args={[p.fixed.vertices, p.fixed.indices]} friction={.6} restitution={.05} />
      </RigidBody>
    </group>)}
    <group ref={holder} name="park-exhibit-nodes">
      {placed.map(p => <group key={`${p.hut.id}-${p.id}`} name={`park-exhibit-${p.id}`} matrixAutoUpdate={false} matrix={p.matrix}>
        <primitive object={p.root} />
      </group>)}
    </group>
    <mesh name="park-exhibit-parts" geometry={parts.geometry!} material={parts.material!} frustumCulled={false} receiveShadow userData={{ noOcclusionFade: true, worldCollisionSources: sources }} />
    {placed.map(p => {
      const key = `${p.hut.id}-${p.id}`;
      switch (p.id) {
        case 'P13': return <ReviewBooth key={key} p={p} />;
        case 'P14': return <DjTable key={key} p={p} />;
        case 'P15': return <RecordWall key={key} p={p} />;
        case 'P16': return <CampChairs key={key} p={p} lamp={lampFor(p.hut.id)} />;
        case 'P18': return <Blackboard key={key} p={p} project={project(p.hut.slug)} />;
        default: return null;
      }
    })}
    {dynamic.map(d => <Knockables key={d.key} name={`exhibit-${d.key}`} items={d.items} source={d.geometry} contact={d.contact}
      spec={{ mass: d.name === 'crate' ? 9 : 4 }} />)}
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
