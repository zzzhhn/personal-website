import { useEffect, useMemo, useRef } from 'react';
import { AnyCollider, ConvexHullCollider, CuboidCollider, RigidBody, useBeforePhysicsStep, useRapier, type RapierCollider } from '@react-three/rapier';
import { Box3, Matrix4, Mesh, Vector3, type Object3D } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Vec3 } from './types';
import { PUSH_MAX, pushUniforms } from './WorldNatureMotion';

/** Collision for the camp slice, derived from the same GLB geometry and the same placement
 * matrices that drive rendering, so an updated model or placement can never drift from its
 * collider. Every shape is authored in GLB-local space and transformed by the instance matrix. */

type LocalShape =
  | { kind: 'hull'; part: string; points: Float32Array; sensor?: boolean }
  | { kind: 'trimesh'; part: string; vertices: Float32Array; indices: Uint32Array };
export interface CampColliderRecord { id: string; key: string; instance?: number; label?: string; part: string; kind: LocalShape['kind']; sensor?: boolean; aabb: { min: Vec3; max: Vec3 } }

const registry = new Map<string, CampColliderRecord>();
/** QA-only listing (exposed by WorldRuntime behind ?qa=1). */
export const campColliderRecords = () => [...registry.values()];

const ancestors = (object: Object3D, root: Object3D) => {
  const names: string[] = [];
  for (let node: Object3D | null = object; node && node !== root; node = node.parent) if (node.name) names.push(node.name);
  return names;
};

/** Exact static mesh for rigid authored parts. A whole-object convex hull would bridge
 * the empty space below benches, between fire-ring stones and inside shelves. */
function staticMesh(gltf: GLTF, part: string, match: (names: string[], mesh: Mesh) => boolean): LocalShape[] | null {
  const vertices: number[] = [], indices: number[] = [], p = new Vector3();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || !match(ancestors(mesh, gltf.scene), mesh)) return;
    const pos = mesh.geometry.getAttribute('position'), index = mesh.geometry.index, offset = vertices.length / 3;
    for (let i = 0; i < pos.count; i++) { p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); vertices.push(p.x, p.y, p.z); }
    for (let i = 0; i < (index?.count ?? pos.count); i++) indices.push(offset + (index ? index.getX(i) : i));
  });
  return indices.length ? [{ kind: 'trimesh', part, vertices: new Float32Array(vertices), indices: new Uint32Array(indices) }] : null;
}

/** nature-v4 soft bush volume: the convex hull of every crown vertex (cores and leaves) in
 * GLB-local space. Placed with the same instance matrix as the visual, so the sensor is the
 * visual's own extent rather than a separately authored proxy. */
function crownHull(gltf: GLTF) {
  const out: number[] = [], p = new Vector3();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || !mesh.geometry.getAttribute('_wind')) return;
    const pos = mesh.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) { p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); out.push(p.x, p.y, p.z); }
  });
  return new Float32Array(out);
}

const all = () => true;

/** Soft bush drag (quality-v3 spec 11.3). Sensor hulls never touch the solver, so bodies pass
 * through; each physics step every dynamic body overlapping a bush loses part of its HORIZONTAL
 * velocity only: dv = -v_h * (1 - exp(-k * dt)), dt = the actual world timestep. Overlapping bushes
 * merge by max(k), never sum, so stacking cannot pin a body. No vertical impulse, no gravity or
 * suspension change; leaving every sensor ends the drag on the same step. Ground probes and
 * vehicle suspension rays in WorldActors already filter !c.isSensor(), so bushes never support. */
export const SOFT_BUSH_DRAG = { person: 5.6, vehicle: 0.8 } as const;
const softZones = new Set<number>();
type PushRecord = { x: number; y: number; z: number; r: number; inside: boolean; exitAt: number };
const pushers = new Map<number, PushRecord>();
/** QA-only A/B switch (?qa=1): same sensors and visuals, drag impulse off. Default on. */
let softDragEnabled = true;
const softStats = { steps: 0, lastInside: [] as { handle: number; kind: string; k: number; vh: number }[], horizontalImpulseTotal: 0, verticalImpulseTotal: 0 };

export function SoftBushDrag() {
  const { world } = useRapier();
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('qa') !== '1') return;
    Object.assign(window, { __worldSoftBush: { zones: () => softZones.size, drag: SOFT_BUSH_DRAG, state: () => JSON.parse(JSON.stringify(softStats)),
      setDrag: (on: boolean) => { softDragEnabled = on; return softDragEnabled; } } });
    return () => { softDragEnabled = true; delete (window as unknown as Record<string, unknown>).__worldSoftBush; };
  }, []);
  useEffect(() => () => { pushers.clear(); pushUniforms.uPushCount.value = 0; }, []);
  useBeforePhysicsStep(() => {
    const dt = world.timestep || 1 / 60;
    softStats.steps++;
    const inside = new Map<number, number>();
    for (const handle of softZones) {
      const zone = world.getCollider(handle);
      if (!zone) { softZones.delete(handle); continue; }
      world.intersectionPairsWith(zone, other => {
        const body = other.parent();
        if (!body || !body.isDynamic()) return;
        const data = body.userData as { vehicle?: string } | undefined;
        const k = data?.vehicle ? SOFT_BUSH_DRAG.vehicle : SOFT_BUSH_DRAG.person;
        inside.set(body.handle, Math.max(inside.get(body.handle) ?? 0, k));
      });
    }
    const now = softStats.steps * dt;
    softStats.lastInside = [];
    for (const [handle, k] of inside) {
      const body = world.getRigidBody(handle);
      if (!body) continue;
      const v = body.linvel(), m = body.mass(), f = 1 - Math.exp(-k * dt);
      if (softDragEnabled) {
        body.applyImpulse({ x: -v.x * f * m, y: 0, z: -v.z * f * m }, true);
        softStats.horizontalImpulseTotal += Math.hypot(v.x, v.z) * f * m;
      }
      const p = body.translation(), vehicle = !!(body.userData as { vehicle?: string } | undefined)?.vehicle;
      pushers.set(handle, { x: p.x, y: p.y, z: p.z, r: vehicle ? 1.1 : .45, inside: true, exitAt: 0 });
      softStats.lastInside.push({ handle, kind: vehicle ? 'vehicle' : 'person', k, vh: Math.hypot(v.x, v.z) });
    }
    // Visual part-and-recover: bodies that left keep a damped wobble at their exit point for 1.6 s.
    for (const [handle, rec] of pushers) {
      if (inside.has(handle)) continue;
      if (rec.inside) { rec.inside = false; rec.exitAt = now; }
      if (now - rec.exitAt > 1.6) pushers.delete(handle);
    }
    const list = [...pushers.values()].sort((a, b) => Number(b.inside) - Number(a.inside) || b.exitAt - a.exitAt).slice(0, PUSH_MAX);
    list.forEach((rec, i) => {
      const t = rec.inside ? 0 : now - rec.exitAt;
      pushUniforms.uPushers.value[i].set(rec.x, rec.y, rec.z, rec.r);
      pushUniforms.uPushAmp.value[i] = rec.inside ? 1 : Math.exp(-t * 3.2) * Math.cos(t * 9.5);
    });
    pushUniforms.uPushCount.value = list.length;
  });
  return null;
}

/** Per-asset recipe. Returns null when the GLB lacks the structure a recipe needs, so the caller
 * keeps the conservative greybox collider and logs instead of silently passing. */
export function campShapes(id: string, gltf: GLTF): LocalShape[] | null {
  switch (id) {
    case 'C03': case 'C04': {
      // camp-tent-shell-v2: exact closed canvas shell (walls, roof, gathered curtains) with a
      // real door opening, authored by the shelters generator in the same local frame.
      const root = gltf.scene.getObjectByName(id);
      const data = root?.userData as { collisionSchema?: string; collisionVertices?: number[]; collisionIndices?: number[] } | undefined;
      if (data?.collisionSchema !== 'camp-tent-shell-v2' || !data.collisionVertices?.length || !data.collisionIndices?.length) return null;
      return [{ kind: 'trimesh', part: 'shell', vertices: new Float32Array(data.collisionVertices), indices: new Uint32Array(data.collisionIndices) }];
    }
    case 'C07': return staticMesh(gltf, 'desk-and-stool', all);
    case 'C10': return staticMesh(gltf, 'pole-and-base', n => n.includes('C10_pole'));
    case 'G16': case 'G17': case 'G18':
      return staticMesh(gltf, 'trunk', n => n.includes('trunk'));
    case 'G19': case 'G20': {
      // Spec 11.3: pass-through drag volume, no rigid core left behind.
      const points = crownHull(gltf);
      return points.length >= 12 ? [{ kind: 'hull', part: 'soft-crown', points, sensor: true }] : null;
    }
    case 'C05': case 'C06': case 'C08': case 'C09': case 'G21': case 'G22': case 'G23':
      return staticMesh(gltf, 'body', all);
    default:
      return null;
  }
}

const transformPoints = (points: Float32Array, matrix: Matrix4) => {
  const out = new Float32Array(points.length), v = new Vector3();
  for (let i = 0; i < points.length; i += 3) { v.set(points[i], points[i + 1], points[i + 2]).applyMatrix4(matrix); out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z; }
  return out;
};
const boundsOf = (points: Float32Array) => {
  const box = new Box3();
  for (let i = 0; i < points.length; i += 3) box.expandByPoint(new Vector3(points[i], points[i + 1], points[i + 2]));
  return { min: box.min.toArray() as Vec3, max: box.max.toArray() as Vec3 };
};

/** Fixed body per asset group; collider vertices are pre-transformed to world space by the
 * exact render matrices. userData carries solid + assetId for vehicle impacts and QA contacts. */
export function CampColliders({ id, label, shapes, matrices }: { id: string; label: string; shapes: LocalShape[]; matrices: Matrix4[] }) {
  const { rapier } = useRapier();
  const built = useMemo(() => matrices.flatMap((matrix, instance) => shapes.map((shape, n) => {
    const key = `camp-collider-${id}-${label}-${instance}-${shape.part}-${n}`;
    return shape.kind === 'hull'
      ? { key, instance, part: shape.part, kind: shape.kind, sensor: !!shape.sensor, points: transformPoints(shape.points, matrix) }
      : { key, instance, part: shape.part, kind: shape.kind, points: transformPoints(shape.vertices, matrix), indices: shape.indices };
  })), [id, label, shapes, matrices]);
  useEffect(() => {
    built.forEach(b => registry.set(b.key, { id, key: b.key, instance: b.instance, label, part: b.part, kind: b.kind, sensor: 'sensor' in b && b.sensor, aabb: boundsOf(b.kind === 'trimesh' && b.indices ? new Float32Array(Array.from(b.indices).flatMap(i => Array.from(b.points.slice(i * 3, i * 3 + 3)))) : b.points) }));
    return () => built.forEach(b => registry.delete(b.key));
  }, [built, id, label]);
  const soft = shapes.every(s => s.kind === 'hull' && s.sensor);
  // Soft bushes are not solid: vehicle impact shake and QA contact classifiers ignore them.
  const userData = useMemo(() => (soft ? { softBush: true, assetId: id } : { solid: true, assetId: id }), [id, soft]);
  // Each instance registers only its own sensor handles and removes only those.
  const own = useRef(new Set<number>());
  const zoneRef = (c: RapierCollider | null) => { if (c) { softZones.add(c.handle); own.current.add(c.handle); } };
  useEffect(() => { const mine = own.current; return () => { mine.forEach(h => softZones.delete(h)); mine.clear(); }; }, [built]);
  return <RigidBody type="fixed" colliders={false} name={`camp-body-${id}-${label}`} userData={userData}>
    {built.map(b => b.kind === 'hull'
      ? ('sensor' in b && b.sensor
        ? <ConvexHullCollider key={b.key} name={b.key} args={[b.points]} sensor ref={zoneRef} />
        : <ConvexHullCollider key={b.key} name={b.key} args={[b.points]} friction={0.65} restitution={0.1} />)
      // Static trimesh keeps the door opening (a hull would fill it); internal-edge fixing avoids
      // snagging on the shell's interior triangle seams.
      : <AnyCollider key={b.key} name={b.key} shape="trimesh" friction={0.6} restitution={0.05}
        args={[b.points, b.indices, rapier.TriMeshFlags.FIX_INTERNAL_EDGES] as unknown as [Float32Array, Uint32Array]} />)}
  </RigidBody>;
}

/** Greybox box colliders: used while a GLB loads, when it fails, or when a recipe is missing.
 * Named camp-greybox-collider-* so QA never mistakes them for fitted shapes. */
export function BlockColliders({ id, blocks }: { id: string; blocks: { position: Vec3; size: Vec3; rotation?: Vec3 }[] }) {
  const userData = useMemo(() => ({ solid: true, assetId: id }), [id]);
  useEffect(() => {
    const keys = blocks.map((b, i) => {
      const key = `camp-greybox-collider-${id}-${i}`;
      const h = b.size.map(v => v / 2);
      registry.set(key, { id, key, part: 'greybox', kind: 'hull', aabb: { min: [b.position[0] - h[0], b.position[1] - h[1], b.position[2] - h[2]], max: [b.position[0] + h[0], b.position[1] + h[1], b.position[2] + h[2]] } });
      return key;
    });
    return () => keys.forEach(k => registry.delete(k));
  }, [blocks, id]);
  return <RigidBody type="fixed" colliders={false} name={`camp-greybox-body-${id}`} userData={userData}>
    {blocks.map((b, i) => <CuboidCollider key={i} name={`camp-greybox-collider-${id}-${i}`} position={b.position} rotation={b.rotation}
      args={[b.size[0] / 2, b.size[1] / 2, b.size[2] / 2]} friction={0.65} restitution={0.15} />)}
  </RigidBody>;
}
