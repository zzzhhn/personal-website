/**
 * Street props: static groups (street session). One BatchedMesh visual per group plus one fixed RigidBody
 * whose colliders are the convex hulls of the same generated parts under the same placement matrices
 * (collision and visual from one source). Used by street-fixed (benches, bollards, shelter), rails and
 * foundations. A group claims its greybox key(s) only once its visual and colliders are mounted.
 */
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { ConvexHullCollider, RigidBody, TrimeshCollider } from '@react-three/rapier';
import { Matrix4, Vector3 } from 'three';
import { useWorldStore } from './store';
import { useInteractable } from './WorldInteract';
import { useGreyboxClaim, type GreyboxKey } from './WorldVisualClaims';
import type { Builder, V3 } from './WorldStreetGeometry';
import { StreetBatch, type BatchKind } from './WorldStreetBatch';
import { createStreetMaterial } from './WorldStreetMaterial';
import type { CanvasTexture } from 'three';
import type { Vec3 } from './types';

export interface StaticKind { id: string; L0: Builder; L1: Builder; lodNear: number; far: number; collide?: 'hull' | 'trimesh' | 'none' }
export interface StaticPlacement { kind: string; matrix: Matrix4; surface?: boolean }
export interface Seat { id: string; position: Vec3; yaw: number; anchor: Vec3; label: { en: string; zh: string } }

const v = new Vector3();
function transform(points: Float32Array, m: Matrix4) {
  const out = new Float32Array(points.length);
  for (let i = 0; i < points.length; i += 3) { v.set(points[i], points[i + 1], points[i + 2]).applyMatrix4(m); out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z; }
  return out;
}

function SeatPoint({ seat }: { seat: Seat }) {
  useInteractable({
    id: seat.id, position: seat.anchor, radius: 1.8, kind: 'seat', label: seat.label,
    onInteract: () => useWorldStore.setState({ seat: { id: seat.id, position: seat.position, yaw: seat.yaw } }),
  });
  return null;
}

export default function StreetStatic({ name, claims, kinds, placements, atlas, seats = [], shadow = true, occluder = false, assetId }: {
  name: string; claims: GreyboxKey[]; kinds: StaticKind[]; placements: StaticPlacement[]; atlas?: CanvasTexture | null; seats?: Seat[];
  shadow?: boolean; occluder?: boolean; assetId: string;
}) {
  const built = useMemo(() => {
    const index = new Map(kinds.map((k, i) => [k.id, i]));
    const counts = kinds.map(k => placements.filter(p => p.kind === k.id).length);
    const material = createStreetMaterial(atlas ?? null, `street-static-${atlas ? 'atlas' : 'plain'}-v1`);
    const bk: BatchKind[] = kinds.map(k => ({ id: k.id, L0: k.L0.build(), L1: k.L1.build(), lodNear: k.lodNear, far: k.far }));
    const batch = new StreetBatch(name, bk, counts, material);
    const hulls: { key: string; points: Float32Array }[] = [], tris: { key: string; pos: Float32Array; idx: Uint32Array; surface: boolean }[] = [];
    const local = kinds.map(k => ({ hulls: k.collide === 'none' ? [] : k.L0.hulls(), geo: bk[index.get(k.id)!].L0 }));
    placements.forEach((p, n) => {
      const i = index.get(p.kind)!; batch.add(i, p.matrix);
      const mode = kinds[i].collide ?? 'hull';
      if (mode === 'hull') local[i].hulls.forEach((h, j) => hulls.push({ key: `${n}-${j}`, points: transform(h, p.matrix) }));
      else if (mode === 'trimesh') {
        const g = local[i].geo;
        tris.push({ key: `${n}`, pos: transform(g.getAttribute('position').array as Float32Array, p.matrix), idx: new Uint32Array(g.index!.array), surface: !!p.surface });
      }
    });
    batch.finish(1);
    batch.mesh.castShadow = shadow; batch.mesh.receiveShadow = true;
    if (occluder) batch.mesh.userData.occluder = true; else batch.mesh.userData.noOcclusionFade = true;
    batch.mesh.userData.assetId = assetId;
    batch.mesh.userData.streetKinds = kinds.map(k => k.id);
    const last = { l0: 0, l1: 0 };
    batch.mesh.userData.streetStats = () => ({ tris: last.l0 + last.l1, ...last, instances: batch.count, colliders: hulls.length + tris.length });
    return { batch, material, hulls, tris, last };
  }, [name, kinds, placements, atlas, shadow, occluder, assetId]);
  useEffect(() => () => { built.batch.dispose(); built.material.dispose(); }, [built]);
  useFrame(({ camera }) => { Object.assign(built.last, built.batch.update(camera)); });
  const ud = useMemo(() => ({ solid: true, assetId }), [assetId]);
  return <group name={`${name}-group`}>
    <primitive object={built.batch.mesh} />
    {built.hulls.length > 0 && <RigidBody type="fixed" colliders={false} userData={ud} name={`${name}-body`}>
      {built.hulls.map(h => <ConvexHullCollider key={h.key} args={[h.points]} friction={.65} restitution={.1} />)}
    </RigidBody>}
    {built.tris.filter(t => !t.surface).length > 0 && <RigidBody type="fixed" colliders={false} userData={ud} name={`${name}-solid`}>
      {built.tris.filter(t => !t.surface).map(t => <TrimeshCollider key={t.key} args={[t.pos, t.idx]} friction={.65} restitution={.05} />)}
    </RigidBody>}
    {seats.map(s => <SeatPoint key={s.id} seat={s} />)}
    {claims.length > 0 && <StreetClaim keys={claims} />}
  </group>;
}

/** Local point -> world under a placement matrix. */
export const at = (m: Matrix4, p: V3): Vec3 => { v.set(p[0], p[1], p[2]).applyMatrix4(m); return [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]; };

/** Claims greybox keys; render it LAST inside a group so its layout effect runs after the group's
 * visual and colliders mounted (sibling effects run in order). */
export function StreetClaim({ keys }: { keys: GreyboxKey[] }) { useGreyboxClaim(...keys); return null; }
