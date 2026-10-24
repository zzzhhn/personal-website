import { Component, memo, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AnyCollider, ConvexHullCollider, RigidBody, useBeforePhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier';
import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide, Group, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, SRGBColorSpace, Vector3, type Material, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { UI } from '../../lib/i18n';
import { useWorldStore } from './store';
import { night } from './WorldNight';
import { useInteractable } from './WorldInteract';
import { useGreyboxClaim } from './WorldVisualClaims';
import { campColliderRecords } from './WorldCampPhysics';
import { CAMP_CENTER } from './layout';
import type { Vec3 } from './types';
import { bake, drawLabels, glowMaterial, localPoints, localTrimesh, nodeParts, placementMatrix, poolTexture, useContentGltfs, vertexColourMaterial, type NodePart } from './WorldCampContentAssets';
import { CAMP_TOP, CONTENT_PAD, EXIT_POSTS, PAD, PAD_TOP, benches, bookStack, onPad, padCentre, padOffset, towardFire, yawFacing, yawToFire, type Place } from './WorldCampContentLayout';

/**
 * Camp content (owner: camp session): C11 tool wall, C12 guitar, C13 dumbbells, C14 wok + stove, C15
 * suitcase on the ring pads, C16 lantern on the C07 desk, the two exit lamp posts (L01), the About
 * interactables (E -> store.card about/<id>) with a <= 2 s feedback, and eight bench seats.
 *
 * Main-pass draws: static merge 1, tool-wall tools 1, wok 1, guitar 2 (body, strings), dumbbells 2,
 * suitcase 1, glow 1, label plates 1, light pools 1 = 11 (+1 page-flip quad only during its 1.8 s).
 * Pushables are plain Meshes (never InstancedMesh), so WorldShadows re-renders their shadows where
 * they are instead of baking them into its static chunks. No light source is added; claiming
 * 'camp-lamps' also removes the greybox lamp-pool point light (one point light fewer than before).
 *
 * Collision classes (from the same GLB geometry and placement matrices): hard fixed trimesh for C11,
 * C14 and both L01; pushable sleeping dynamic convex hulls for C12 (4 kg), C13 (10 kg each) and C15
 * (12 kg) that fade out and return home 30 s after being displaced; C16 none (on the desk, inside the
 * C07 collider footprint).
 *
 * Greybox hand-over (spec 15.2): the claim runs in the component that renders after every GLB
 * resolved; while loading or on failure nothing is claimed and the greybox keeps visual + collider.
 */

type ExhibitId = 'identity' | 'education' | 'awards' | 'languages' | 'skills' | 'interests';
type FeedbackKey = 'tent' | 'books' | 'trophy' | 'flags' | 'tools' | 'guitar' | 'dumbbell' | 'wok' | 'suitcase';
const FEEDBACK_SECONDS = 1.8;
/** Start (performance.now ms) of each object's feedback; frame loops read it. */
const feedback = new Map<FeedbackKey, number>();
const fbT = (k: FeedbackKey) => { const t0 = feedback.get(k); if (t0 === undefined) return -1; const t = (performance.now() - t0) / 1000; if (t > FEEDBACK_SECONDS) { feedback.delete(k); return -1; } return t; };
const decay = (t: number) => t < 0 ? 0 : Math.max(0, 1 - t / FEEDBACK_SECONDS);

const vc = vertexColourMaterial('camp-content-vc');
const RESET_SECONDS = 30;

class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error('[world-camp-content] assets failed; camp greybox stays.', error); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default memo(function WorldCampContent() {
  return <Guard><CampContent /></Guard>;
});

/** Glow parts: lantern globe vertex alpha 1 (warm channel), lamp lens alpha 0 (cyan channel). */
function glowBake(part: NodePart, frame: Matrix4, warm: boolean) {
  const g = bake(part, frame), c = g.getAttribute('color');
  if (c && c.itemSize === 4) for (let i = 0; i < c.count; i++) c.setW(i, warm ? 1 : 0);
  return g;
}
/** C07 GLB-local desk-top spot for the lantern: the end away from the C08 books. */
const DESK_LOCAL = new Vector3(-0.4, 0.85, -0.62);
/** Toy-scale lift (Art Lock 'objects you could cup in your hands', camp refs): the real-size dumbbell
 * (0.34 m) and stove (0.85 m) vanished on 3.1 m pads next to the 2 m desk and 1.8 m shelf. Uniform scale
 * of render, collider and hull alike; mass follows the larger dumbbell. */
const SCALE = { C13: 1.7, C14: 1.3 } as const;

function CampContent() {
  const g = useContentGltfs();
  const lang = useWorldStore(s => s.lang);
  const data = useMemo(() => {
    const parts = Object.fromEntries(Object.entries(g).map(([id, gltf]) => [id, nodeParts(gltf)])) as Record<keyof typeof g, NodePart[]>;
    const byName = (id: keyof typeof g, name: string) => parts[id].filter(p => p.name === name);
    const place = { C11: onPad(CONTENT_PAD.C11), C14: onPad(CONTENT_PAD.C14), C12: onPad(CONTENT_PAD.C12), C15: onPad(CONTENT_PAD.C15) };
    const desk = onPad(PAD.desk), deskM = placementMatrix(desk.position, desk.yaw);
    const lanternPos = DESK_LOCAL.clone().applyMatrix4(deskM);
    const lanternM = placementMatrix([lanternPos.x, lanternPos.y, lanternPos.z], desk.yaw + 0.5);
    const postM = EXIT_POSTS.map(p => placementMatrix(p, 0));
    const m11 = placementMatrix(place.C11.position, place.C11.yaw), m14 = placementMatrix(place.C14.position, place.C14.yaw, SCALE.C14);
    // Static merge: everything that never moves (tool-wall body, stove, lantern frame, both posts).
    const staticGeometry = mergeGeometries([
      ...byName('C11', 'C11_body').map(p => bake(p, m11)), ...byName('C14', 'C14_stove').map(p => bake(p, m14)),
      ...byName('C16', 'C16_frame').map(p => bake(p, lanternM)), ...postM.flatMap(m => byName('L01', 'L01_post').map(p => bake(p, m))),
    ])!;
    const glowGeometry = mergeGeometries([...byName('C16', 'C16_glass').map(p => glowBake(p, lanternM, true)), ...postM.flatMap(m => byName('L01', 'L01_lens').map(p => glowBake(p, m, false)))])!;
    const hard = [
      { id: 'C11', mesh: localTrimesh(parts.C11), matrix: m11 }, { id: 'C14', mesh: localTrimesh(parts.C14), matrix: m14 },
      ...postM.map((m, i) => ({ id: `L01-${i}`, mesh: localTrimesh(byName('L01', 'L01_post')), matrix: m })),
    ].map(h => ({ id: h.id, indices: h.mesh.indices, vertices: transform(h.mesh.vertices, h.matrix) }));
    // Animated sub-parts: geometry in node-local frame, placed by asset matrix x node matrix.
    const sub = (id: keyof typeof g, name: string, assetM: Matrix4) => { const p = byName(id, name)[0]; return { geometry: bake({ ...p, matrix: new Matrix4() }, new Matrix4()), frame: new Matrix4().multiplyMatrices(assetM, p.matrix) }; };
    const dumbbells: Place[] = [padOffset(CONTENT_PAD.C13, -0.05, 0.95), padOffset(CONTENT_PAD.C13, -0.62, 0.9)].map((p, i) => ({ position: p, yaw: yawToFire(CONTENT_PAD.C13) + (i ? 0.12 : -0.05) }));
    const local = (list: NodePart[]) => mergeGeometries(list.map(p => bake(p, new Matrix4())))!;
    return {
      place, lanternPos, staticGeometry, glowGeometry, hard, dumbbells, benchTop: seatTop(parts.C06),
      tools: sub('C11', 'C11_tools', m11), wok: sub('C14', 'C14_wok', m14),
      guitar: { body: local([...byName('C12', 'C12_guitar'), ...byName('C12', 'C12_stand')]), strings: local(byName('C12', 'C12_strings')), hull: localPoints(parts.C12) },
      dumbbell: { geometry: mergeGeometries(parts.C13.map(p => bake(p, new Matrix4().makeScale(SCALE.C13, SCALE.C13, SCALE.C13))))!, hull: localPoints(parts.C13, SCALE.C13) },
      suitcase: { geometry: local(parts.C15), hull: localPoints(byName('C15', 'C15_case')) },
      plates: JSON.parse(String(g.C11.scene.getObjectByName('C11')?.userData.labelPlatesGLB ?? '[]')) as { centre: Vec3; w: number; h: number }[], m11,
    };
  }, [g]);
  useEffect(() => () => { for (const geo of [data.staticGeometry, data.glowGeometry, data.tools.geometry, data.wok.geometry, data.guitar.body, data.guitar.strings, data.dumbbell.geometry, data.suitcase.geometry]) geo.dispose(); }, [data]);

  // Formal replacements for the five pad stand-ins and both exit lamps are mounted (visual + collider).
  useGreyboxClaim('camp-placeholder', 'camp-lamps');
  const glow = useMemo(glowMaterial, []);
  useEffect(() => () => glow.material.dispose(), [glow]);
  useFrame(() => {
    const n = night.value;
    glow.uWarm.value = 0.12 + n * 2.1;
    glow.uCyan.value = 0.18 + n * 1.25; // Art Lock: cyan only micro-bright at dusk; a lit line at night
  });
  useQa(data);

  return <group name="world-camp-content">
    <mesh name="camp-content-static" geometry={data.staticGeometry} material={vc} castShadow receiveShadow userData={{ assetId: 'camp-content', solid: true }} />
    <mesh name="camp-content-glow" geometry={data.glowGeometry} material={glow.material} userData={{ noOcclusionFade: true }} />
    <HardColliders hard={data.hard} />
    <Animated name="camp-content-C11-tools" geometry={data.tools.geometry} frame={data.tools.frame} kind="tools" />
    <Animated name="camp-content-C14-wok" geometry={data.wok.geometry} frame={data.wok.frame} kind="wok" />
    <LabelPlates plates={data.plates} frame={data.m11} lang={lang} />
    <Pushable id="C12" home={data.place.C12} hull={data.guitar.hull} mass={4} feedbackKey="guitar">
      <mesh geometry={data.guitar.body} material={vc} castShadow receiveShadow />
      <mesh name="camp-content-C12-strings" geometry={data.guitar.strings} material={vc} />
    </Pushable>
    {data.dumbbells.map((home, i) => <Pushable key={i} id={`C13-${i}`} home={home} hull={data.dumbbell.hull} mass={16} feedbackKey="dumbbell">
      <mesh geometry={data.dumbbell.geometry} material={vc} castShadow receiveShadow />
    </Pushable>)}
    <Pushable id="C15" home={data.place.C15} hull={data.suitcase.hull} mass={12} feedbackKey="suitcase">
      <mesh geometry={data.suitcase.geometry} material={vc} castShadow receiveShadow />
    </Pushable>
    <LightPools lantern={data.lanternPos} />
    <SceneFeedback />
    {EXHIBITS.map(e => <Exhibit key={e.key} e={e} />)}
    <Seats top={data.benchTop} />
  </group>;
}

function transform(points: Float32Array, m: Matrix4) {
  const out = new Float32Array(points.length), v = new Vector3();
  for (let i = 0; i < points.length; i += 3) { v.set(points[i], points[i + 1], points[i + 2]).applyMatrix4(m); out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z; }
  return out;
}

/** C06 seat surface in GLB-local space: highest point of the log, and the mean X of its top band. */
function seatTop(parts: NodePart[]) {
  const p = localPoints(parts); let maxY = -Infinity;
  for (let i = 1; i < p.length; i += 3) maxY = Math.max(maxY, p[i]);
  let sx = 0, n = 0;
  for (let i = 0; i < p.length; i += 3) if (p[i + 1] > maxY - 0.03 && Math.abs(p[i + 2]) < 0.6) { sx += p[i]; n++; }
  return { y: maxY, x: n ? sx / n : 0 };
}

const hardRecords: { id: string; aabb: { min: Vec3; max: Vec3 } }[] = [];
function HardColliders({ hard }: { hard: { id: string; vertices: Float32Array; indices: Uint32Array }[] }) {
  const { rapier } = useRapier();
  useEffect(() => {
    hardRecords.length = 0;
    for (const h of hard) {
      const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < h.vertices.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], h.vertices[i + k]); max[k] = Math.max(max[k], h.vertices[i + k]); }
      hardRecords.push({ id: h.id, aabb: { min, max } });
    }
  }, [hard]);
  return <>{hard.map(h => <RigidBody key={h.id} type="fixed" colliders={false} name={`camp-content-body-${h.id}`} userData={{ solid: true, assetId: h.id.slice(0, 3) }}>
    <AnyCollider name={`camp-content-collider-${h.id}`} shape="trimesh" friction={0.6} restitution={0.05}
      args={[h.vertices, h.indices, rapier.TriMeshFlags.FIX_INTERNAL_EDGES] as unknown as [Float32Array, Uint32Array]} />
  </RigidBody>)}</>;
}

/** A sub-part that only moves during its feedback (tool swing, wok toss); pivot = its GLB node origin. */
function Animated({ name, geometry, frame, kind }: { name: string; geometry: BufferGeometry; frame: Matrix4; kind: 'tools' | 'wok' }) {
  const ref = useRef<Group>(null), inner = useRef<Mesh>(null);
  useLayoutEffect(() => { const o = ref.current; if (o) frame.decompose(o.position, o.quaternion, o.scale); }, [frame]);
  useFrame(() => {
    const m = inner.current; if (!m) return;
    const t = fbT(kind);
    if (kind === 'tools') m.rotation.z = t < 0 ? 0 : 0.2 * Math.abs(Math.sin(t * 6.5)) * decay(t);
    else { m.position.y = t < 0 || t > 0.6 ? 0 : 0.09 * Math.sin(Math.PI * t / 0.6); m.rotation.z = t < 0 ? 0 : 0.12 * Math.sin(t * 9) * decay(t); }
  });
  return <group ref={ref} name={name}><mesh ref={inner} geometry={geometry} material={vc} castShadow receiveShadow userData={{ assetId: name, solid: true }} /></group>;
}

/** Five bilingual category labels on the tool wall from UI.about.techCategories (same order as the
 * five icon panels: Programming, Office, AI & Agent, Data & ML, Finance). */
function LabelPlates({ plates, frame, lang }: { plates: { centre: Vec3; w: number; h: number }[]; frame: Matrix4; lang: 'en' | 'zh' }) {
  const { geometry, material, canvas } = useMemo(() => {
    const n = plates.length, pos: number[] = [], uv: number[] = [], nor: number[] = [], idx: number[] = [], v = new Vector3();
    plates.forEach((p, i) => {
      const [x, y, z] = p.centre, hw = p.w / 2, hh = p.h / 2, v0 = 1 - (i + 1) / n, v1 = 1 - i / n;
      // facing GLB +X: the viewer's right is -Z, so u runs along -Z
      for (const [dz, dy, u, vv] of [[hw, -hh, 0, v0], [-hw, -hh, 1, v0], [-hw, hh, 1, v1], [hw, hh, 0, v1]]) {
        v.set(x + 0.0015, y + dy, z + dz).applyMatrix4(frame); pos.push(v.x, v.y, v.z); uv.push(u, vv);
      }
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    const normal = new Vector3(1, 0, 0).transformDirection(frame);
    for (let i = 0; i < n * 4; i++) nor.push(normal.x, normal.y, normal.z);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    geometry.setIndex(idx);
    const canvas = document.createElement('canvas');
    const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace; map.anisotropy = 8;
    const material = new MeshStandardMaterial({ map, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 });
    return { geometry, material, canvas };
  }, [plates, frame]);
  useEffect(() => {
    drawLabels(canvas, UI.about.techCategories[lang].map(c => c.label));
    (material.map as CanvasTexture).needsUpdate = true;
  }, [lang, canvas, material]);
  useEffect(() => () => { geometry.dispose(); material.map?.dispose(); material.dispose(); }, [geometry, material]);
  return <mesh name="camp-content-C11-labels" geometry={geometry} material={material} receiveShadow userData={{ noOcclusionFade: true }} />;
}

const pushables = new Map<string, { body: RefObject<RapierRigidBody | null>; home: Vec3; state: { displacedAt: number; clock: number } }>();
/** Pushable prop: sleeping dynamic convex hull; 30 s after it leaves home it fades and returns. */
function Pushable({ id, home, hull, mass, feedbackKey, children }: { id: string; home: Place; hull: Float32Array; mass: number; feedbackKey: FeedbackKey; children: ReactNode }) {
  const body = useRef<RapierRigidBody>(null), visual = useRef<Group>(null);
  const state = useRef({ displacedAt: -1, clock: 0 });
  // Own material copy so the 30 s fade touches only this prop.
  const material = useMemo(() => vertexColourMaterial(`camp-content-${id}`), [id]);
  useEffect(() => () => material.dispose(), [material]);
  useLayoutEffect(() => { visual.current?.traverse(o => { if ((o as Mesh).isMesh) (o as Mesh).material = material; }); }, [material]);
  const start = useMemo(() => [home.position[0], home.position[1] + 0.004, home.position[2]] as Vec3, [home]);
  useEffect(() => { pushables.set(id, { body, home: start, state: state.current }); body.current?.sleep(); return () => { pushables.delete(id); }; }, [id, start]);
  useBeforePhysicsStep(world => {
    const b = body.current; if (!b) return;
    const s = state.current; s.clock += world.timestep || 1 / 60;
    const p = b.translation(), q = b.rotation();
    const moved = Math.hypot(p.x - start[0], p.z - start[2]) > 0.25 || Math.abs(q.x) + Math.abs(q.z) > 0.15 || p.y < start[1] - 1;
    if (s.displacedAt < 0 && moved) s.displacedAt = s.clock;
    const t = s.displacedAt < 0 ? -1 : s.clock - s.displacedAt;
    const fade = t > RESET_SECONDS - 0.6 ? Math.max(0, (RESET_SECONDS - t) / 0.6) : 1;
    if ((fade < 1) !== material.transparent) { material.transparent = fade < 1; material.depthWrite = fade >= 1; material.needsUpdate = true; }
    material.opacity = fade;
    if (t >= RESET_SECONDS) {
      const half = home.yaw / 2;
      b.setTranslation({ x: start[0], y: start[1], z: start[2] }, false);
      b.setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }, false);
      b.setLinvel({ x: 0, y: 0, z: 0 }, false); b.setAngvel({ x: 0, y: 0, z: 0 }, false); b.sleep();
      s.displacedAt = -1; material.opacity = 1;
    }
  });
  // <= 2 s visual-only feedback on the child group; the body and its collider never move for it.
  useFrame(() => {
    const v = visual.current; if (!v) return;
    const t = fbT(feedbackKey), k = decay(t);
    v.position.set(0, 0, 0); v.rotation.set(0, 0, 0);
    const strings = feedbackKey === 'guitar' ? v.getObjectByName('camp-content-C12-strings') : undefined;
    if (strings) strings.position.x = t < 0 ? 0 : 0.003 * Math.sin(t * 140) * k;
    if (t < 0) return;
    if (feedbackKey === 'guitar') v.rotation.x = 0.02 * Math.sin(t * 22) * k;
    if (feedbackKey === 'dumbbell') v.rotation.x = 0.16 * Math.sin(t * 8) * k;
    if (feedbackKey === 'suitcase') v.position.y = 0.05 * Math.abs(Math.sin(Math.PI * Math.min(t, 0.9) / 0.45));
  });
  return <RigidBody ref={body} name={`camp-content-push-${id}`} position={start} rotation={[0, home.yaw, 0]} colliders={false} canSleep ccd
    linearDamping={0.35} angularDamping={0.8} userData={{ obstacle: true, assetId: id.slice(0, 3), interactable: id }}>
    <ConvexHullCollider args={[hull]} mass={mass} friction={0.7} restitution={0.12} />
    <group ref={visual} name={`camp-content-${id}`} userData={{ assetId: id.slice(0, 3) }}>{children}</group>
  </RigidBody>;
}

/** Additive ground pools in one draw: lantern (desk top + pad), cyan under each exit lamp, and a warm
 * tent-door pulse that is only the identity feedback. Night-driven levels; no light sources. */
function LightPools({ lantern }: { lantern: Vector3 }) {
  const quads = useMemo(() => [
    { c: [lantern.x, PAD_TOP + 0.012, lantern.z] as Vec3, r: 2.1, color: [1, 0.79, 0.47] },
    { c: [lantern.x, lantern.y + 0.004, lantern.z] as Vec3, r: 0.55, color: [1, 0.79, 0.47] },
    ...EXIT_POSTS.map(p => ({ c: [p[0] - 0.4, CAMP_TOP + 0.03, p[2]] as Vec3, r: 1.6, color: [0.31, 0.82, 0.77] })),
    { c: [-42.2, PAD_TOP + 0.014, 14.9] as Vec3, r: 2.2, color: [1, 0.6, 0.29] },
  ], [lantern]);
  const { geometry, material } = useMemo(() => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    quads.forEach(({ c, r }, i) => {
      for (const [dx, dz, u, v] of [[-r, -r, 0, 0], [r, -r, 1, 0], [r, r, 1, 1], [-r, r, 0, 1]]) { pos.push(c[0] + dx, c[1], c[2] + dz); uv.push(u, v); }
      idx.push(i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2);
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(quads.length * 12), 3));
    geometry.setIndex(idx);
    const material = new MeshBasicMaterial({ map: poolTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 });
    return { geometry, material };
  }, [quads]);
  useEffect(() => () => { geometry.dispose(); material.map?.dispose(); material.dispose(); }, [geometry, material]);
  useFrame(() => {
    const n = night.value, col = geometry.getAttribute('color') as BufferAttribute, tt = fbT('tent');
    const tent = tt < 0 ? 0 : Math.sin(Math.PI * tt / FEEDBACK_SECONDS);
    const levels = [0.03 + n * 0.5, 0.05 + n * 0.55, 0.02 + n * 0.32, 0.02 + n * 0.32, tent * 0.55];
    quads.forEach((q, i) => { for (let k = 0; k < 4; k++) col.setXYZ(i * 4 + k, q.color[0] * levels[i], q.color[1] * levels[i], q.color[2] * levels[i]); });
    col.needsUpdate = true;
  });
  return <mesh name="camp-content-light-pools" geometry={geometry} material={material} renderOrder={1} frustumCulled={false} userData={{ noOcclusionFade: true }} />;
}

/** Feedback on objects owned by WorldCamp, applied at runtime without editing that file: C09 brass glows,
 * C10 flags lift about their hoist, and a page flips over the C08 book stack (own transient quad). */
function SceneFeedback() {
  const scene = useThree(s => s.scene);
  const cache = useRef<{ brass: MeshStandardMaterial[]; flags: Object3D[]; frame: number }>({ brass: [], flags: [], frame: -1e9 });
  const pivot = useRef<Group>(null), frameNo = useRef(0);
  const book = useMemo(bookStack, []);
  useFrame(() => {
    const c = cache.current; frameNo.current++;
    if ((!c.flags.length || !c.brass.length) && frameNo.current - c.frame > 60) {
      c.frame = frameNo.current;
      const brass = new Set<MeshStandardMaterial>(), flags: Object3D[] = [];
      scene.traverse(o => {
        const m = o as Mesh;
        if (m.isMesh && /^camp-mesh-C09-/.test(m.name)) for (const mt of (Array.isArray(m.material) ? m.material : [m.material]) as Material[]) if (mt.name === 'props_brass_matte') brass.add(mt as MeshStandardMaterial);
        if (/^flag_0[1-4]$/.test(o.name)) for (let p: Object3D | null = o; p; p = p.parent) if (/^camp-asset-C10-/.test(p.name)) { flags.push(o); break; }
      });
      c.brass = [...brass]; c.flags = flags;
    }
    const tr = fbT('trophy'), glow = tr < 0 ? 0 : Math.sin(Math.PI * tr / FEEDBACK_SECONDS) * 0.7;
    for (const m of c.brass) { m.emissive.setRGB(1, 0.79, 0.47); m.emissiveIntensity = glow; }
    const tf = fbT('flags'), lift = tf < 0 ? 0 : 0.42 * Math.sin(Math.PI * tf / FEEDBACK_SECONDS) * (1 + 0.15 * Math.sin(tf * 11));
    c.flags.forEach((f, i) => { f.rotation.x = lift * (1 - i * 0.08); });
    const tb = fbT('books'), pv = pivot.current;
    if (pv) { pv.visible = tb >= 0; pv.rotation.z = tb < 0 ? 0 : Math.PI * Math.min(1, (tb % 0.9) / 0.75); }
  });
  return <group position={[book.position[0], book.position[1] + 0.335, book.position[2]]} rotation={[0, book.yaw, 0]}>
    <group ref={pivot} visible={false}>
      <mesh name="camp-content-page-flip" position={[0.12, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.24, 0.17]} />
        <meshStandardMaterial color="#E6DCCB" roughness={0.9} side={DoubleSide} />
      </mesh>
    </group>
  </group>;
}

/**
 * About exhibits (kind 'exhibit'): E sets store.card = { kind: 'about', id, page? } and starts the
 * object's feedback. Anchors sit just outside each object's collider on the fire side (the actor's
 * line-of-sight ray would otherwise hit the object). The tent-door and dumbbell anchors are 2.2 m
 * apart with radii 1.8 / 1.5, so standing at one never prompts the other. Pushable anchors follow
 * their prop (the array is mutated in place; useInteractable reads it live).
 */
type ExhibitDef = { key: string; id: ExhibitId; page?: number; position: Vec3; radius: number; fb: FeedbackKey; follow?: string; label: { en: string; zh: string } };
const EXHIBITS: ExhibitDef[] = [
  { key: 'tent', id: 'identity', position: [-42.4, 5.6, 14.75], radius: 1.8, fb: 'tent', label: { en: 'About Bobby', zh: '关于 Bobby' } },
  { key: 'desk', id: 'education', position: towardFire(PAD.desk, 1.05, 5.6), radius: 2.0, fb: 'books', label: { en: 'Education', zh: '教育背景' } },
  { key: 'trophy', id: 'awards', position: towardFire(PAD.trophy, 0.75, 5.6), radius: 2.0, fb: 'trophy', label: { en: 'Awards', zh: '奖项与证书' } },
  { key: 'flags', id: 'languages', position: towardFire(PAD.flags, 0.95, 5.6), radius: 2.0, fb: 'flags', label: { en: 'Languages', zh: '语言' } },
  { key: 'tools', id: 'skills', position: towardFire(CONTENT_PAD.C11, 0.95, 5.7), radius: 2.0, fb: 'tools', label: { en: 'Skills', zh: '技能' } },
  { key: 'guitar', id: 'interests', page: 0, position: towardFire(CONTENT_PAD.C12, 0.9, 5.4), radius: 1.8, fb: 'guitar', follow: 'C12', label: { en: 'Singing', zh: '唱歌' } },
  { key: 'dumbbell', id: 'interests', page: 1, position: padOffset(CONTENT_PAD.C13, -1.55, 0.95, 5.3), radius: 1.5, fb: 'dumbbell', follow: 'C13-0', label: { en: 'Gym', zh: '健身' } },
  { key: 'wok', id: 'interests', page: 2, position: towardFire(CONTENT_PAD.C14, 0.9, 5.4), radius: 1.8, fb: 'wok', label: { en: 'Cooking', zh: '烹饪' } },
  { key: 'suitcase', id: 'interests', page: 3, position: towardFire(CONTENT_PAD.C15, 0.85, 5.3), radius: 1.8, fb: 'suitcase', follow: 'C15', label: { en: 'Travel', zh: '旅行' } },
];
function Exhibit({ e }: { e: ExhibitDef }) {
  const base = useMemo(() => [...e.position] as Vec3, [e]);
  useFrame(() => {
    if (!e.follow) return;
    const p = pushables.get(e.follow), b = p?.body.current; if (!p || !b) return;
    const t = b.translation();
    e.position[0] = base[0] + t.x - p.home[0]; e.position[2] = base[2] + t.z - p.home[2];
  });
  useInteractable({
    id: `camp-about-${e.key}`, position: e.position, radius: e.radius, kind: 'exhibit', label: e.label,
    onInteract: () => {
      feedback.set(e.fb, performance.now());
      useWorldStore.setState({ card: e.page === undefined ? { kind: 'about', id: e.id } : { kind: 'about', id: e.id, page: e.page } });
    },
  });
  return null;
}

/** Bench seats: two per C06 log at +-1.0 m along it; hip point on the seat top, facing the fire. The
 * prompt anchor sits 0.55 m on the fire side of the log (clear of its collider for the sight test). */
function seatList(top: { x: number; y: number }) {
  return benches().flatMap((b, i) => [-1, 1].map(s => {
    const ox = Math.cos(b.yaw) * top.x, oz = -Math.sin(b.yaw) * top.x;
    const position: Vec3 = [b.centre[0] + ox + b.tangent[0] * s, CAMP_TOP + top.y, b.centre[2] + oz + b.tangent[1] * s];
    const d = Math.hypot(CAMP_CENTER[0] - position[0], CAMP_CENTER[2] - position[2]);
    const anchor: Vec3 = [position[0] + (CAMP_CENTER[0] - position[0]) / d * 0.55, position[1] + 0.25, position[2] + (CAMP_CENTER[2] - position[2]) / d * 0.55];
    return { id: `camp-bench-${i}-${s < 0 ? 'a' : 'b'}`, position, yaw: yawFacing(position, CAMP_CENTER), anchor };
  }));
}
type SeatDef = ReturnType<typeof seatList>[number];
const seatsQa: SeatDef[] = [];
function Seat({ s }: { s: SeatDef }) {
  useInteractable({ id: s.id, position: s.anchor, radius: 1.2, kind: 'seat', label: { en: 'Sit', zh: '坐下' },
    onInteract: () => useWorldStore.setState({ seat: { id: s.id, position: s.position, yaw: s.yaw } }) });
  return null;
}
function Seats({ top }: { top: { x: number; y: number } }) {
  const list = useMemo(() => seatList(top), [top]);
  useEffect(() => { seatsQa.splice(0, seatsQa.length, ...list); }, [list]);
  return <>{list.map(s => <Seat key={s.id} s={s} />)}</>;
}

/** QA (?qa=1): placements, collider bounds, pushable state, anchors, seats, and a layout drift check
 * against the live WorldCamp collider records (C06 / C07 / C09 / C10 must sit where this file assumes). */
function useQa(data: { place: Record<string, Place>; dumbbells: Place[]; lanternPos: Vector3; benchTop: { x: number; y: number } }) {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('qa') !== '1') return;
    const api = {
      placements: () => ({ ...data.place, C13: data.dumbbells, C16: data.lanternPos.toArray(), L01: EXIT_POSTS, benchTop: data.benchTop }),
      hard: () => hardRecords,
      pushables: () => [...pushables].map(([id, p]) => { const b = p.body.current, t = b?.translation(); return { id, home: p.home, position: t ? [t.x, t.y, t.z] : null, sleeping: b?.isSleeping() ?? null, displacedFor: p.state.displacedAt < 0 ? null : +(p.state.clock - p.state.displacedAt).toFixed(2) }; }),
      exhibits: () => EXHIBITS.map(e => ({ key: e.key, id: e.id, page: e.page ?? null, position: [...e.position], radius: e.radius })),
      seats: () => seatsQa,
      feedback: () => [...feedback.keys()],
      check: () => {
        const recs = campColliderRecords(), centres = (id: string) => recs.filter(x => x.id === id).map(x => [(x.aabb.min[0] + x.aabb.max[0]) / 2, (x.aabb.min[2] + x.aabb.max[2]) / 2]);
        const near = (a: number[][], p: Vec3, tol: number) => a.some(c => Math.hypot(c[0] - p[0], c[1] - p[2]) < tol);
        return { deskOnPad3: near(centres('C07'), padCentre(PAD.desk), 0.8), trophyOnPad5: near(centres('C09'), padCentre(PAD.trophy), 0.8),
          flagsOnPad4: near(centres('C10'), padCentre(PAD.flags), 0.8), benches: benches().map(b => near(centres('C06'), b.centre, 0.5)) };
      },
    };
    Object.assign(window, { __worldCampContent: api });
    return () => { delete (window as unknown as Record<string, unknown>).__worldCampContent; };
  }, [data]);
}
