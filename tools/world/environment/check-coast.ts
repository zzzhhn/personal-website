/** Coast shape on the actual noisy shoreline (spec §3 / §12.1 A7): bay / cape spacing along the real
 * waterline, longest near-circular arc, and the topPush window. */
import { islandShoreline, OUTLINE_PERIMETER, topPush, coastFrame } from '../../../src/components/world/WorldLandform';
const shore = islandShoreline();
// Signed offset of the waterline from the control outline, resampled every 1 m of waterline arclength.
const pts: { s: number; off: number; x: number; z: number }[] = [];
let run = 0;
for (let i = 0; i < shore.length; i++) {
  const [x, z] = shore[i], [px, pz] = shore[(i - 1 + shore.length) % shore.length];
  if (i) run += Math.hypot(x - px, z - pz);
  pts.push({ s: run, off: coastFrame(x, z).d, x, z });
}
const total = run + Math.hypot(shore[0][0] - shore.at(-1)![0], shore[0][1] - shore.at(-1)![1]);
// Smooth 6 m, find extrema with >= 0.8 m prominence against the neighbouring opposite extremum.
const sm = pts.map((p, i) => { let a = 0, n = 0; for (const q of pts) { let d = Math.abs(q.s - p.s); d = Math.min(d, total - d); if (d <= 3) { a += q.off; n++; } } return a / n; });
const ext: { s: number; kind: 'cape' | 'bay'; off: number; x: number; z: number }[] = [];
for (let i = 0; i < sm.length; i++) {
  const a = sm[(i - 3 + sm.length) % sm.length], b = sm[(i + 3) % sm.length];
  if (sm[i] > a && sm[i] >= b) ext.push({ s: pts[i].s, kind: 'cape', off: sm[i], x: pts[i].x, z: pts[i].z });
  if (sm[i] < a && sm[i] <= b) ext.push({ s: pts[i].s, kind: 'bay', off: sm[i], x: pts[i].x, z: pts[i].z });
}
// Merge alternating, drop weak pairs.
const merged: typeof ext = [];
for (const e of ext) { const l = merged.at(-1); if (l && l.kind === e.kind) { if ((e.kind === 'cape') === (e.off > l.off)) merged[merged.length - 1] = e; } else merged.push(e); }
const strong = merged.filter((e, i) => { const p = merged[(i - 1 + merged.length) % merged.length], n = merged[(i + 1) % merged.length]; return Math.max(Math.abs(e.off - p.off), Math.abs(e.off - n.off)) >= .8; });
const gaps = strong.map((e, i) => { const n = strong[(i + 1) % strong.length]; return +(((n.s - e.s) + total) % total).toFixed(1); });
console.log(JSON.stringify({ outlinePerimeter: +OUTLINE_PERIMETER.toFixed(1), waterline: +total.toFixed(1), features: strong.length, maxGap: Math.max(...gaps), minGap: Math.min(...gaps), gaps,
  over50: strong.flatMap((e, i) => gaps[i] > 50 ? [[e.kind, +e.x.toFixed(0), +e.z.toFixed(0), +coastFrame(e.x, e.z).s.toFixed(1), strong[(i + 1) % strong.length].kind, +strong[(i + 1) % strong.length].x.toFixed(0), +strong[(i + 1) % strong.length].z.toFixed(0), +coastFrame(strong[(i + 1) % strong.length].x, strong[(i + 1) % strong.length].z).s.toFixed(1)]] : []), topPushWindow: [200, 206, 215, 224, 230].map(s => +topPush(s).toFixed(2)) }));
