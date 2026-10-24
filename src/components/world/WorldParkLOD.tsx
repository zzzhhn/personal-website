import { useEffect, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Vector3 } from 'three';
import { ParkGeo } from './WorldParkKit';
import { DECK_Y, HUT_BACK_Z, HUT_FRONT_Z, type HutPlacement } from './WorldParkLayout';
import type { Vec3 } from './types';

export const PARK_LOD_DISTANCE = 60;
const evidence = new Map<string, () => unknown>();
/** Visual-only distance switches. Original fixed/dynamic colliders live outside these groups. */
export function ParkLOD({ id, center, near, far = null, nearTriangles = 0, farTriangles = 0 }: {
  id: string; center: Vec3; near: ReactNode; far?: ReactNode; nearTriangles?: number; farTriangles?: number;
}) {
  const hi = useRef<Group>(null), lo = useRef<Group>(null), last = useRef({ distance: 0, level: 0 });
  const p = useRef(new Vector3(...center));
  useFrame(({ camera }) => {
    const distance = camera.position.distanceTo(p.current), level = distance >= PARK_LOD_DISTANCE ? 1 : 0;
    last.current = { distance, level };
    if (hi.current) hi.current.visible = level === 0;
    if (lo.current) lo.current.visible = level === 1;
  });
  useEffect(() => {
    if (new URLSearchParams(location.search).get('qa') !== '1') return;
    evidence.set(id, () => ({ id, center, ...last.current, nearTriangles, farTriangles, ratio: nearTriangles ? farTriangles / nearTriangles : 0,
      nearVisible: hi.current?.visible, farVisible: lo.current?.visible }));
    Object.assign(window, { __parkLOD: () => [...evidence.values()].map(read => read()) });
    return () => { evidence.delete(id); };
  }, [id, center, nearTriangles, farTriangles]);
  return <group name={`park-lod-${id}`}><group ref={hi} name={`park-lod-${id}-0`}>{near}</group><group ref={lo} name={`park-lod-${id}-1`} visible={false}>{far}</group></group>;
}

/** Far silhouette generated from the same hut dimensions / placement; near GLB is untouched. */
export function hutLOD(h: HutPlacement) {
  const solid = new ParkGeo(), deck = new ParkGeo(), d = HUT_FRONT_Z - HUT_BACK_Z, mid = (HUT_FRONT_Z + HUT_BACK_Z) / 2;
  const b = (c: Vec3, s: Vec3, color: string, o: { pitch?: number; emit?: [number, number, number?] } = {}) => solid.box(c, s, color, { frame: h.matrix, ...o });
  b([0, 1.4, HUT_BACK_Z], [h.width, 2.8, .14], '#4E647D');
  for (const side of [-1, 1]) {
    b([side * h.width / 2, 1.4, mid], [.14, 2.8, d], '#4E647D');
    b([side * (h.width / 2 + .075), 1.5, -1.35], [.02, .8, 1.1], '#D9D2C2', { emit: [0, .85, 1] });
    for (const yy of [1.05, 1.95]) b([side * (h.width / 2 + .09), yy, -1.35], [.04, .07, 1.22], '#B99469');
    for (const zz of [-1.94, -.76]) b([side * (h.width / 2 + .09), 1.5, zz], [.04, .9, .07], '#B99469');
    for (const zz of [HUT_FRONT_Z, HUT_BACK_Z]) b([side * (h.width / 2 - .04), 1.5, zz], [.14, 3, .14], '#B99469');
    for (const zz of [HUT_FRONT_Z - .2, HUT_BACK_Z + .2]) {
      const p = h.local(side * (h.width / 2 - .16), 0, zz);
      solid.cyl([p[0], -1.9, p[2]], [p[0], DECK_Y - .05, p[2]], .13, .13, 6, '#8E6E55');
    }
  }
  b([0, 3.04, -1.225], [h.width + .58, .105, 4.55], '#3A4A5C', { pitch: -Math.atan(.35 / d) });
  b([0, 3.06, HUT_FRONT_Z], [h.width, .18, .14], '#B99469');
  b([0, 2.96, HUT_FRONT_Z + .08], [h.width - .2, .03, .02], '#4FD1C5', { emit: [.18, 1.5] });
  deck.box([0, -.03, mid], [h.width, .06, d], '#9C7A58', { frame: h.matrix });
  if (h.spur) {
    const a = h.spur.from, z = h.spur.to, L = Math.hypot(a[0] - z[0], a[2] - z[2]);
    deck.box([(a[0] + z[0]) / 2, DECK_Y - .03, (a[2] + z[2]) / 2], [h.spur.width, .06, L], '#9C7A58', { yaw: h.yaw });
  }
  return { solid: solid.build(), deck: deck.build(), triangles: solid.triangles + deck.triangles };
}
