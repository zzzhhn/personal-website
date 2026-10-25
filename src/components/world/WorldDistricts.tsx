/**
 * Layout v4 step 1 greybox (spec §12): road network, junctions, district massing, street furniture and the
 * north ridge, all derived from layout-v4.ts. Mounted only under `?layout=v4` (WorldRuntime).
 *
 * Budget rules (§12.4): paved prisms are split into four spatial chunks (one draw call and one surface +
 * one solid trimesh per chunk, frustum-culled); every repeated block is one instanced draw; furniture is
 * one instanced draw per kind. Knockable furniture (§12.5) uses sleeping dynamic bodies with one simple
 * box collider each, put to sleep at mount and woken only by contact; 30 s after being knocked they reset.
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CuboidCollider, InstancedRigidBodies, RigidBody, TrimeshCollider, useRapier, type RapierRigidBody } from '@react-three/rapier';
import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, Group, InstancedMesh, MeshStandardMaterial, Object3D, Sphere, Vector3 } from 'three';
import {
  decorV4, knockablesV4, LANDFORM_HAS_RIDGE, layoutQaV4, nearestRoadPointV4, pavedV4, ridgeHeightV4, RIDGE_V4, solidsV4,
  type DecorBox, type Knockable, type KnockKind, type PavedPoly, type SolidBox,
} from './layout-v4';
import { nearestDryPoint } from './WorldLandform';
import WorldTerrainRoads from './WorldTerrainRoads';
import { WATER_Y } from './layout';
import { useWorldStore } from './store';
import { windUniforms } from './WorldWind';
import { useClaimStore, useIsClaimed, type GreyboxKey } from './WorldVisualClaims';
import type { Vec3 } from './types';

/** Until WorldLandform evaluates ridgeHeightV4 itself (docs/world/quality-v3/map-v4/integration/), the
 * ridge is a local terrain patch with the same surface / solid collider split. */
const RIDGE_PATCH = !LANDFORM_HAS_RIDGE;

type Arrays = { pos: number[]; nrm: number[]; col: number[]; glow?: number[] };
/** Four spatial chunks (west/east of x = -30, north/south of z = -20) so every district draw is
 * frustum-culled by the view and by each shadow pass instead of spanning the whole island. */
const chunkKey = (x: number, z: number) => (x < -30 ? 0 : 1) + (z < -20 ? 0 : 2);
const color = new Color();

/* ------------------------------------------------------------------ paved prisms */

function prism(poly: PavedPoly, vis: Arrays, top: { pos: number[]; idx: number[] }, side: { pos: number[]; idx: number[] }) {
  const n = poly.pts.length, c = color.set(poly.color);
  let area = 0;
  for (let i = 0; i < n; i++) { const a = poly.pts[i], b = poly.pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  // Normalise to a positive x/z shoelace; the fan (0, i+1, i) then faces +y and walls face outward.
  const order = area < 0 ? [...poly.pts.keys()].reverse() : [...poly.pts.keys()];
  const P = order.map(i => poly.pts[i]), Yt = order.map(i => poly.ys[i]), Yb = Yt.map(y => y - poly.thickness);
  const tri = (a: Vec3, b: Vec3, d: Vec3, out: { pos: number[]; idx: number[] }) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const p of [a, b, d]) { vis.pos.push(...p); vis.nrm.push(nx, ny, nz); vis.col.push(c.r, c.g, c.b); }
    const base = out.pos.length / 3;
    out.pos.push(...a, ...b, ...d); out.idx.push(base, base + 1, base + 2);
  };
  const T = (i: number): Vec3 => [P[i][0], Yt[i], P[i][1]], B = (i: number): Vec3 => [P[i][0], Yb[i], P[i][1]];
  for (let i = 1; i < n - 1; i++) tri(T(0), T(i + 1), T(i), top);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (poly.openEdges?.some(e => (order[i] === e && order[j] === (e + 1) % n) || (order[j] === e && order[i] === (e + 1) % n))) continue;
    // Outward walls.
    tri(T(i), T(j), B(j), side); tri(T(i), B(j), B(i), side);
  }
}

function pavedChunks() {
  const chunks = new Map<number, { vis: Arrays; top: { pos: number[]; idx: number[] }; side: { pos: number[]; idx: number[] } }>();
  for (const poly of pavedV4()) {
    const cx = poly.pts.reduce((s, p) => s + p[0], 0) / poly.pts.length, cz = poly.pts.reduce((s, p) => s + p[1], 0) / poly.pts.length;
    const key = chunkKey(cx, cz);
    if (!chunks.has(key)) chunks.set(key, { vis: { pos: [], nrm: [], col: [] }, top: { pos: [], idx: [] }, side: { pos: [], idx: [] } });
    const k = chunks.get(key)!;
    prism(poly, k.vis, k.top, k.side);
  }
  return [...chunks.entries()].map(([key, k]) => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(k.vis.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(k.vis.nrm, 3));
    g.setAttribute('color', new Float32BufferAttribute(k.vis.col, 3));
    g.computeBoundingSphere();
    return { key, geometry: g, top: { pos: new Float32Array(k.top.pos), idx: new Uint32Array(k.top.idx) }, side: { pos: new Float32Array(k.side.pos), idx: new Uint32Array(k.side.idx) } };
  });
}

function Paved() {
  const chunks = useMemo(pavedChunks, []);
  const material = useMemo(() => new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }), []);
  useEffect(() => () => { chunks.forEach(c => c.geometry.dispose()); material.dispose(); }, [chunks, material]);
  return <group name="v4-paved">
    {chunks.map(c => <group key={c.key}>
      <RigidBody name={`v4-paved-${c.key}-support`} type="fixed" colliders={false} userData={{ surface: true }}>
        <TrimeshCollider name={`v4-paved-${c.key}-top`} args={[c.top.pos, c.top.idx]} friction={.95} restitution={0} />
      </RigidBody>
      <RigidBody name={`v4-paved-${c.key}-sides`} type="fixed" colliders={false} userData={{ solid: true }}>
        <TrimeshCollider name={`v4-paved-${c.key}-walls`} args={[c.side.pos, c.side.idx]} friction={.65} restitution={0} />
      </RigidBody>
      <mesh name={`v4-paved-${c.key}`} geometry={c.geometry} material={material} receiveShadow userData={{ surface: true }} />
    </group>)}
  </group>;
}

/* ------------------------------------------------------------------ instanced boxes */

function Boxes({ items, name, shadow, solid }: { items: (SolidBox | DecorBox)[]; name: string; shadow: boolean; solid?: boolean }) {
  const chunks = useMemo(() => {
    const by = new Map<number, (SolidBox | DecorBox)[]>();
    for (const it of items) { const k = chunkKey(it.position[0], it.position[2]); by.set(k, [...(by.get(k) ?? []), it]); }
    return [...by.entries()];
  }, [items]);
  return <>{chunks.map(([k, list]) => <BoxChunk key={k} name={`${name}-${k}`} items={list} shadow={shadow} solid={solid} />)}</>;
}
function BoxChunk({ items, name, shadow, solid }: { items: (SolidBox | DecorBox)[]; name: string; shadow: boolean; solid?: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const material = useMemo(() => new MeshStandardMaterial({ roughness: 1 }), []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useLayoutEffect(() => {
    const mesh = ref.current; if (!mesh) return;
    const d = new Object3D();
    items.forEach((it, i) => {
      d.position.set(...it.position); d.rotation.set(0, it.yaw, 0); d.scale.set(...it.size); d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix); mesh.setColorAt(i, color.set(it.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} name={name} args={[geometry, material, items.length]} castShadow={shadow} receiveShadow userData={{ solid: !!solid }} />;
}

/** Greybox claim key per v4 solid kind (formal district modules take over visual + collider). */
const SOLID_CLAIM: Record<SolidBox['kind'], GreyboxKey> = {
  massing: 'massing', kiosk: 'massing', tower: 'massing', windmill: 'windmill', rail: 'rail', post: 'rail', wall: 'rail',
  bollard: 'street-fixed', bench: 'street-fixed', shelter: 'street-fixed', trunk: 'tree',
};
function Solids() {
  const claims = useClaimStore(s => s.claims);
  const items = useMemo(() => solidsV4().filter(s => !claims[SOLID_CLAIM[s.kind]]), [claims]);
  if (!items.length) return null;
  return <>
    <RigidBody name="v4-solids" type="fixed" colliders={false} userData={{ solid: true }}>
      {items.map((s, i) => <CuboidCollider key={`${s.kind}|${s.position}|${s.size}|${s.yaw}`} name={`v4-${s.kind}-${i}`} position={s.position} rotation={[0, s.yaw, 0]}
        args={[s.size[0] / 2, s.size[1] / 2, s.size[2] / 2]} friction={.65} restitution={.15} />)}
    </RigidBody>
    <Boxes name="v4-solid-visuals" items={items} shadow solid />
  </>;
}

function Decor() {
  const paved = useIsClaimed('paved'), tree = useIsClaimed('tree');
  const { flat, raised } = useMemo(() => {
    const all = decorV4();
    // Flat decor = road markings (owned with the paving); raised = beach-walk stilts (paving) and the
    // pocket-park canopy (tree).
    const raisedAll = all.filter(d => d.size[1] >= .05);
    return { flat: paved ? [] : all.filter(d => d.size[1] < .05),
      raised: raisedAll.filter(d => d.color === '#8AA24A' ? !tree : !paved) };
  }, [paved, tree]);
  return <>
    <Boxes name="v4-markings" items={flat} shadow={false} />
    <Boxes name="v4-decor" items={raised} shadow />
  </>;
}

/** G29 greybox: nacelle plus one merged three-blade rotor turning with the shared (pausable) wind clock. */
function Windmill() {
  const rotor = useRef<Group>(null);
  const [cx, cz] = RIDGE_V4.center, hub = RIDGE_V4.topY + 12 - .6;
  const blades = useMemo(() => {
    // One blade along +Y from the hub, copied at 0 / 120 / 240 deg about the rotor axis (+X).
    const one = kindGeometry([{ c: [0, 2.3, 0], s: [.12, 4.6, .55], color: '#D9D2C2' }]), g = new BufferGeometry();
    const src = one.getAttribute('position'), nrm = one.getAttribute('normal'), col = one.getAttribute('color');
    const pos: number[] = [], nn: number[] = [], cc: number[] = [];
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI * 2 / 3, c = Math.cos(a), sn = Math.sin(a);
      for (let i = 0; i < src.count; i++) {
        pos.push(src.getX(i), src.getY(i) * c - src.getZ(i) * sn, src.getY(i) * sn + src.getZ(i) * c);
        nn.push(nrm.getX(i), nrm.getY(i) * c - nrm.getZ(i) * sn, nrm.getY(i) * sn + nrm.getZ(i) * c);
        cc.push(col.getX(i), col.getY(i), col.getZ(i));
      }
    }
    one.dispose();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new Float32BufferAttribute(nn, 3)); g.setAttribute('color', new Float32BufferAttribute(cc, 3));
    g.computeBoundingSphere();
    return g;
  }, []);
  const material = useMemo(() => new MeshStandardMaterial({ vertexColors: true, roughness: 1 }), []);
  useEffect(() => () => { blades.dispose(); material.dispose(); }, [blades, material]);
  useFrame(() => { if (rotor.current) rotor.current.rotation.x = windUniforms.uWindTime.value * .9; });
  return <group name="v4-windmill-G29" position={[cx, hub, cz]}>
    <mesh castShadow position={[-.4, 0, 0]}><boxGeometry args={[2.2, 1.1, 1.2]} /><meshStandardMaterial color="#E6DCCB" roughness={1} /></mesh>
    <group ref={rotor} position={[-1.65, 0, 0]}><mesh castShadow geometry={blades} material={material} /></group>
  </group>;
}

/* ------------------------------------------------------------------ ridge patch (temporary) */

function ridgePatch() {
  const [cx, cz] = RIDGE_V4.center, R = RIDGE_V4.footR + .6, step = .5, n = Math.ceil(2 * R / step);
  const x0 = cx - n * step / 2, z0 = cz - n * step / 2, H: number[] = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) H.push(ridgeHeightV4(x0 + i * step, z0 + j * step) ?? .985);
  const vis: Arrays = { pos: [], nrm: [], col: [] }, surf: number[] = [], solid: number[] = [], pos: number[] = [];
  const grass = new Color('#7E8C3E'), earth = new Color('#A7835A'), c = new Color(), cos25 = Math.cos(25 * Math.PI / 180);
  const v = (i: number, j: number): Vec3 => [x0 + i * step, H[j * (n + 1) + i], z0 + j * step];
  const tri = (a: Vec3, b: Vec3, d: Vec3) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = d[0] - a[0], wy = d[1] - a[1], wz = d[2] - a[2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; [b, d] = [d, b]; }
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    c.copy(grass).lerp(earth, Math.min(1, Math.max(0, (cos25 + .05 - ny) * 6)));
    const base = pos.length / 3;
    for (const p of [a, b, d]) { vis.pos.push(...p); vis.nrm.push(nx, ny, nz); vis.col.push(c.r, c.g, c.b); pos.push(...p); }
    (ny >= cos25 ? surf : solid).push(base, base + 1, base + 2);
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const mx = x0 + (i + .5) * step - cx, mz = z0 + (j + .5) * step - cz;
    if (Math.hypot(mx, mz) > R) continue;
    tri(v(i, j), v(i, j + 1), v(i + 1, j)); tri(v(i + 1, j), v(i, j + 1), v(i + 1, j + 1));
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(vis.pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(vis.nrm, 3));
  g.setAttribute('color', new Float32BufferAttribute(vis.col, 3));
  g.computeBoundingSphere();
  const P = new Float32Array(pos);
  return { geometry: g, positions: P, surface: new Uint32Array(surf), solid: new Uint32Array(solid) };
}

function RidgePatch() {
  const patch = useMemo(ridgePatch, []);
  const material = useMemo(() => new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }), []);
  useEffect(() => () => { patch.geometry.dispose(); material.dispose(); }, [patch, material]);
  return <group name="v4-ridge-patch">
    <RigidBody name="v4-ridge-surface" type="fixed" colliders={false} userData={{ surface: true }}>
      <TrimeshCollider name="v4-ridge-surface-top" args={[patch.positions, patch.surface]} friction={.95} restitution={0} />
    </RigidBody>
    {patch.solid.length > 0 && <RigidBody name="v4-ridge-solid" type="fixed" colliders={false} userData={{ solid: true }}>
      <TrimeshCollider name="v4-ridge-solid-faces" args={[patch.positions, patch.solid]} friction={.65} restitution={.05} />
    </RigidBody>}
    <mesh name="v4-ridge-patch-mesh" geometry={patch.geometry} material={material} receiveShadow userData={{ surface: true }} />
  </group>;
}

/* ------------------------------------------------------------------ knockable furniture */

type Part = { c: Vec3; s: Vec3; color: string; glow?: number };
/** Body origin = base point on the ground; collider = one box (half extents), raised by its half height. */
const KINDS: Record<KnockKind, { half: Vec3; mass: number; parts: Part[] }> = {
  // Arms reach toward local -Z (layout-v4 sets yaw so -Z points over the carriageway).
  lamp: { half: [.09, 2.1, .09], mass: 45, parts: [
    { c: [0, 2.1, 0], s: [.18, 4.2, .18], color: '#4E647D' }, { c: [0, 4.1, -.7], s: [.12, .12, 1.4], color: '#4E647D' },
    { c: [0, 3.97, -1.35], s: [.5, .18, .32], color: '#FFE2B0', glow: 1 }] },
  signal: { half: [.1, 1.75, .1], mass: 55, parts: [
    { c: [0, 1.75, 0], s: [.2, 3.5, .2], color: '#4E647D' }, { c: [0, 3.35, -1.6], s: [.14, .14, 3.2], color: '#4E647D' },
    { c: [0, 2.85, -3], s: [.3, .95, .32], color: '#263B48' },
    { c: [-.16, 3.13, -3], s: [.04, .2, .2], color: '#D9534F', glow: .7 }, { c: [-.16, 2.85, -3], s: [.04, .2, .2], color: '#F0AD4E', glow: .5 },
    { c: [-.16, 2.57, -3], s: [.04, .2, .2], color: '#5CB85C', glow: .7 }] },
  stop: { half: [.05, 1.1, .05], mass: 12, parts: [
    { c: [0, 1.1, 0], s: [.1, 2.2, .1], color: '#9A8F82' }, { c: [-.06, 2.05, 0], s: [.05, .66, .66], color: '#B5473A' },
    { c: [-.09, 2.05, 0], s: [.02, .12, .44], color: '#E6DCCB' }] },
  direction: { half: [.06, 1.2, .06], mass: 16, parts: [
    { c: [0, 1.2, 0], s: [.12, 2.4, .12], color: '#9A8F82' }, { c: [-.07, 2.15, 0], s: [.06, .62, 1.5], color: '#4E647D' },
    { c: [-.11, 2.15, .1], s: [.02, .14, .9], color: '#E6DCCB' }] },
  delineator: { half: [.06, .5, .06], mass: 4, parts: [
    { c: [0, .5, 0], s: [.12, 1, .12], color: '#E6DCCB' }, { c: [0, .86, 0], s: [.13, .12, .13], color: '#E8803A', glow: .35 }] },
  chevron: { half: [.05, .7, .05], mass: 8, parts: [
    { c: [0, .7, 0], s: [.1, 1.4, .1], color: '#9A8F82' }, { c: [-.05, 1.2, 0], s: [.05, .5, .9], color: '#E8803A' }] },
  bin: { half: [.25, .43, .25], mass: 14, parts: [
    { c: [0, .42, 0], s: [.5, .84, .5], color: '#4E647D' }, { c: [0, .87, 0], s: [.56, .06, .56], color: '#263B48' }] },
};

function kindGeometry(parts: Part[]) {
  const pos: number[] = [], nrm: number[] = [], col: number[] = [], glow: number[] = [];
  const unit = new BoxGeometry(1, 1, 1).toNonIndexed(), up = unit.getAttribute('position'), un = unit.getAttribute('normal');
  for (const p of parts) {
    color.set(p.color);
    for (let i = 0; i < up.count; i++) {
      pos.push(up.getX(i) * p.s[0] + p.c[0], up.getY(i) * p.s[1] + p.c[1], up.getZ(i) * p.s[2] + p.c[2]);
      nrm.push(un.getX(i), un.getY(i), un.getZ(i)); col.push(color.r, color.g, color.b); glow.push(p.glow ?? 0);
    }
  }
  unit.dispose();
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setAttribute('glow', new Float32BufferAttribute(glow, 1));
  g.computeBoundingSphere();
  return g;
}

/** Night glow for lamp heads / signal lenses (eases like the scene's warm emissives). */
const glowUniform = { value: .05 };
function furnitureMaterial() {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  m.onBeforeCompile = shader => {
    shader.uniforms.uGlow = glowUniform;
    shader.vertexShader = 'attribute float glow;\nvarying float vGlow;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGlow = glow;');
    shader.fragmentShader = 'uniform float uGlow;\nvarying float vGlow;\n' + shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * vGlow * uGlow;');
  };
  m.customProgramCacheKey = () => 'v4-furniture-glow';
  return m;
}

const KNOCK_RESET_S = 30;
type KnockState = { item: Knockable; body: () => RapierRigidBody | null; knockedAt: number | null };
const knockRegistry: KnockState[] = [];

function KnockGroup({ kind, items, material }: { kind: KnockKind; items: Knockable[]; material: MeshStandardMaterial }) {
  const spec = KINDS[kind];
  const geometry = useMemo(() => kindGeometry(spec.parts), [spec]);
  const bodies = useRef<(RapierRigidBody | null)[]>(null);
  const mesh = useRef<InstancedMesh>(null);
  const slept = useRef(false);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => {
    const states = items.map((item, i) => ({ item, body: () => bodies.current?.[i] ?? null, knockedAt: null }));
    knockRegistry.push(...states);
    return () => { for (const s of states) knockRegistry.splice(knockRegistry.indexOf(s), 1); };
  }, [items]);
  useFrame(() => {
    // Put every body to sleep once, right after creation: no settling, no idle solver cost.
    if (slept.current || !bodies.current?.length || bodies.current.some(b => !b)) return;
    bodies.current.forEach(b => b?.sleep()); slept.current = true;
    // Culling sphere from the home positions (+3 m for knocked props), fixed for the session.
    if (mesh.current) {
      let cx = 0, cz = 0;
      for (const it of items) { cx += it.position[0]; cz += it.position[2]; }
      cx /= items.length; cz /= items.length;
      const r = Math.max(...items.map(it => Math.hypot(it.position[0] - cx, it.position[2] - cz))) + 3 + spec.half[1] * 2;
      mesh.current.boundingSphere = new Sphere(new Vector3(cx, items[0].position[1] + spec.half[1], cz), r);
      mesh.current.frustumCulled = true;
    }
  });
  const instances = useMemo(() => items.map(it => ({ key: it.id, position: it.position, rotation: [0, it.yaw, 0] as Vec3, userData: { obstacle: true, knockable: it.id } })), [items]);
  return <InstancedRigidBodies ref={bodies} instances={instances} colliders={false} canSleep linearDamping={.05} angularDamping={.2}
    colliderNodes={[<CuboidCollider key="c" args={spec.half} position={[0, spec.half[1], 0]} mass={spec.mass} friction={.8} restitution={.1} />]}>
    <instancedMesh ref={mesh} name={`v4-knock-${kind}`} args={[geometry, material, items.length]} castShadow={kind === 'lamp' || kind === 'signal'} receiveShadow frustumCulled={false} />
  </InstancedRigidBodies>;
}

function Knockables() {
  const groups = useMemo(() => {
    const by = new Map<KnockKind, Knockable[]>();
    for (const k of knockablesV4()) by.set(k.kind, [...(by.get(k.kind) ?? []), k]);
    return [...by.entries()];
  }, []);
  const material = useMemo(furnitureMaterial, []);
  useEffect(() => () => material.dispose(), [material]);
  const tick = useRef(0), light = useRef(0);
  useFrame((_, delta) => {
    const s = useWorldStore.getState();
    light.current += ((s.light === 'night' ? 1 : 0) - light.current) * Math.min(1, delta * 2.5);
    glowUniform.value = .05 + light.current * 1.5;
    if (s.paused || s.shot) return;
    tick.current += delta;
    if (tick.current < .25) return;
    const dt = tick.current; tick.current = 0;
    for (const k of knockRegistry) {
      const b = k.body(); if (!b) continue;
      if (k.knockedAt === null) {
        if (b.isSleeping()) continue;
        const p = b.translation(), q = b.rotation(), home = k.item.position;
        const tilt = 1 - 2 * (q.x * q.x + q.z * q.z); // cos of the angle between local +Y and world +Y
        if (Math.hypot(p.x - home[0], p.z - home[2]) > .35 || tilt < .94 || p.y < home[1] - .5) k.knockedAt = 0;
      } else if ((k.knockedAt += dt) >= KNOCK_RESET_S) {
        const home = k.item.position, h = k.item.yaw / 2;
        b.setTranslation({ x: home[0], y: home[1], z: home[2] }, false);
        b.setRotation({ x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) }, false);
        b.setLinvel({ x: 0, y: 0, z: 0 }, false); b.setAngvel({ x: 0, y: 0, z: 0 }, false);
        b.sleep(); k.knockedAt = null;
      }
    }
  });
  return <group name="v4-knockables">{groups.map(([kind, items]) => <KnockGroup key={kind} kind={kind} items={items} material={material} />)}</group>;
}

/* ------------------------------------------------------------------ QA queries (?qa=1) */

function DistrictsDebug() {
  const { world, rapier } = useRapier();
  const { scene } = useThree();
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('qa') !== '1') return;
    const w = window as unknown as { __worldDistricts?: unknown };
    w.__worldDistricts = {
      layout: layoutQaV4,
      knockables: () => knockRegistry.map(k => {
        const b = k.body(), p = b?.translation(), home = k.item.position;
        return { id: k.item.id, kind: k.item.kind, road: k.item.road, home, position: p ? [p.x, p.y, p.z] : null,
          sleeping: b?.isSleeping() ?? null, knocked: k.knockedAt !== null, displacement: p ? Math.hypot(p.x - home[0], p.z - home[2]) : null };
      }),
      /** A/B cost probe only: hide / show the whole v4 district group (render cost, not physics). */
      setVisible: (on: boolean) => { const g = scene.getObjectByName('world-districts-v4'); if (g) g.visible = on; return !!g; },
      awakeKnockables: () => knockRegistry.filter(k => k.body() && !k.body()!.isSleeping()).length,
      /** Water recovery inputs for a splash point: the dry-land search and the road fallback, separately. */
      recoveryProbe: (x: number, z: number) => ({ dry: nearestDryPoint(x, z), road: nearestRoadPointV4([x, 0, z]) }),
      /** First non-vehicle, non-player collider straight below (x, fromY, z): real support check. */
      supportAt: (x: number, z: number, fromY = 40) => {
        const hit = world.castRay(new rapier.Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 }), fromY + 30, true, undefined, undefined, undefined, undefined,
          c => { const u = c.parent()?.userData as Record<string, unknown> | undefined; return !c.isSensor() && !u?.vehicle && !u?.vehicleId && !u?.obstacle && c.parent()?.isDynamic() !== true; });
        if (!hit) return null;
        const c = hit.collider, u = (c.parent()?.userData ?? {}) as Record<string, unknown>;
        return { y: fromY - hit.timeOfImpact, kind: u.surface ? 'surface' : u.solid ? 'solid' : 'unknown', overWater: fromY - hit.timeOfImpact < WATER_Y + .3 };
      },
    };
    return () => { delete w.__worldDistricts; };
  }, [world, rapier, scene]);
  return null;
}

export default memo(function WorldDistricts() {
  const paved = useIsClaimed('paved'), windmill = useIsClaimed('windmill'), knockable = useIsClaimed('knockable');
  return <group name="world-districts-v4">
    {!paved && <Paved />}
    <WorldTerrainRoads />
    <Solids />
    <Decor />
    {!windmill && <Windmill />}
    {RIDGE_PATCH && <RidgePatch />}
    {!knockable && <Knockables />}
    <DistrictsDebug />
  </group>;
});
