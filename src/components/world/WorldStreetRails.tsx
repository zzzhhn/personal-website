/**
 * Street props: rails group (street session, claims 'rail' + 'roadside'). Derived from layout-v4 solidsV4()
 * rail / post records (same runs, same heights as the greybox):
 *   - seawall (cream, x = 31): fixed bays (post + three rails + balusters), 2 m spacing, end posts;
 *   - ring corner guardrails (cream greybox -> galvanised W-beam): fixed posts every ~4.7 m, knockable
 *     panels between them (sleeping dynamic, unlocked only for vehicles);
 *   - hill timber rails (brown): fixed log posts, knockable resting logs;
 *   - bridge parapets (cream, 1.25 m): fixed masonry walls with end piers (structural, not knockable).
 * 'roadside' is the v3 key: no v4 greybox exists under it, so claiming it is a documented no-op.
 */
import { useMemo } from 'react';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { solidsV4, TRAIL_V4, type SolidBox } from './layout-v4';
import * as A from './WorldStreetAssets';
import StreetKnockables, { type Item } from './WorldStreetKnock';
import StreetStatic, { StreetClaim, type StaticKind, type StaticPlacement } from './WorldStreetStatic';

const yawQ = (yaw: number) => new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
const M = (x: number, y: number, z: number, yaw: number, pitch = 0) => {
  const q = yawQ(yaw).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), pitch));
  return new Matrix4().compose(new Vector3(x, y, z), q, new Vector3(1, 1, 1));
};
/** Rail run endpoints from a greybox rail box (local X along the run, three.js yaw convention). */
const ends = (r: SolidBox) => {
  const c = Math.cos(r.yaw), s = Math.sin(r.yaw), h = r.size[0] / 2;
  return { a: [r.position[0] - c * h, r.position[2] + s * h] as [number, number], b: [r.position[0] + c * h, r.position[2] - s * h] as [number, number] };
};

export function railLayout() {
  const solids = solidsV4();
  const placements: StaticPlacement[] = [], beams: Item[] = [];
  const rails = solids.filter(s => s.kind === 'rail');
  rails.forEach((r, ri) => {
    const { a, b } = ends(r), L = r.size[0];
    if (r.color === '#8E6E55') {
      // Hill timber: post bases follow the hill road height at each post (nearest trail point), sunk .45 m
      // by the post model itself; the log rests on the two domes (top .57) with a .2 m gap over each post.
      const trailY = (p: [number, number]) => { let best = Infinity, y = 0; for (const t of TRAIL_V4) { const d = Math.hypot(t[0] - p[0], t[2] - p[1]); if (d < best) { best = d; y = t[1]; } } return y; };
      const ya = trailY(a), yb = trailY(b);
      placements.push({ kind: 'timberPost', matrix: M(a[0], ya, a[1], r.yaw) });
      const last = rails[ri + 1]?.color !== '#8E6E55' || Math.hypot(ends(rails[ri + 1]).a[0] - b[0], ends(rails[ri + 1]).a[1] - b[1]) > .05;
      if (last) placements.push({ kind: 'timberPost', matrix: M(b[0], yb, b[1], r.yaw) });
      const ta = ya + .57, tb = yb + .57, len = Math.hypot(L, tb - ta) - .2, pitch = Math.atan2(tb - ta, L);
      beams.push({ id: `rail-beam-${ri}`, kind: 'beam', position: [(a[0] + b[0]) / 2, (ta + tb) / 2, (a[1] + b[1]) / 2], yaw: r.yaw, pitch, len: +len.toFixed(2), road: 'hill-road' });
      return;
    }
    if (r.size[1] > 1) {
      // Bridge parapet: greybox wall centred at deck + .68 with height 1.25 -> base at deck level - .0.
      // Sunk 6 cm into the deck so no light line shows under the wall.
      const base = r.position[1] - r.size[1] / 2 - .06;
      placements.push({ kind: `parapet-${ri}`, matrix: M(a[0], base, a[1], r.yaw) });
      for (const p of [a, b]) placements.push({ kind: 'pier', matrix: M(p[0], base - 1.5, p[1], r.yaw) });
      return;
    }
    const base = r.position[1] + .14 - .9;
    if (Math.abs(r.position[0] - 31) < .01) {
      // Seawall: bays of ~2 m.
      const n = Math.max(1, Math.round(L / 2)), step = L / n;
      for (let i = 0; i < n; i++) placements.push({ kind: 'seawallBay', matrix: M(a[0] + (b[0] - a[0]) * i / n, base, a[1] + (b[1] - a[1]) * i / n, r.yaw) });
      placements.push({ kind: 'seawallEnd', matrix: M(b[0], base, b[1], r.yaw) });
      if (Math.abs(step - 2) > .2) console.warn('[world-street] seawall bay step', step);
      return;
    }
    // Ring guardrail: three panels of L / 3 (~4.67 m) between four fixed posts. The beam faces the road:
    // the greybox run is offset outward, so the road side is toward the island centre.
    const n = 3, seg = L / n, cx = -30, cz = -10;
    const toCentre = [cx - r.position[0], cz - r.position[2]];
    const localZ = [Math.sin(r.yaw), Math.cos(r.yaw)]; // local +Z in world (three.js yaw)
    const flip = toCentre[0] * localZ[0] + toCentre[1] * localZ[1] > 0 ? Math.PI : 0; // beam sits on local -Z
    for (let i = 0; i <= n; i++) placements.push({ kind: 'guardPost', matrix: M(a[0] + (b[0] - a[0]) * i / n, base, a[1] + (b[1] - a[1]) * i / n, r.yaw + flip) });
    for (let i = 0; i < n; i++) {
      const t = (i + .5) / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      beams.push({ id: `rail-guard-${ri}-${i}`, kind: 'guard', position: [x, base + .02, z], yaw: r.yaw + flip, len: +(seg - .12).toFixed(2), road: 'ring' });
    }
  });
  return { placements, beams, parapets: rails.filter(r => r.size[1] > 1).map(r => ({ id: rails.indexOf(r), len: r.size[0] })) };
}

export default function StreetRails() {
  const { kinds, placements, beams } = useMemo(() => {
    const { placements, beams, parapets } = railLayout();
    const kinds: StaticKind[] = [
      { id: 'seawallBay', L0: A.seawallBay(0, 2), L1: A.seawallBay(1, 2), lodNear: 24, far: 120 },
      { id: 'seawallEnd', L0: A.railEndPost(0, 'seawall'), L1: A.railEndPost(1, 'seawall'), lodNear: 24, far: 120 },
      { id: 'guardPost', L0: A.guardPost(0), L1: A.guardPost(1), lodNear: 24, far: 120 },
      { id: 'timberPost', L0: A.timberPost(0), L1: A.timberPost(1), lodNear: 24, far: 120 },
      { id: 'pier', L0: A.bridgePier(0, 2.95), L1: A.bridgePier(1, 2.95), lodNear: 40, far: 180 },
      ...parapets.map(p => ({ id: `parapet-${p.id}`, L0: A.parapet(0, p.len), L1: A.parapet(1, p.len), lodNear: 45, far: 200 })),
    ];
    return { kinds, placements, beams };
  }, []);
  return <group name="street-rails-group">
    <StreetStatic name="street-rails" claims={[]} kinds={kinds} placements={placements} assetId="street-rail" />
    <StreetKnockables set="rail" beams={beams} />
    <StreetClaim keys={['rail', 'roadside']} />
  </group>;
}
