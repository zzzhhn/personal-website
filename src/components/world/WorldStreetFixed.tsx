/**
 * Street props: street-fixed group (street session, claim 'street-fixed'): benches G14 (13, sit/stand via
 * store.seat), forecourt bollards (12), the bus shelter near J2 with an island-map poster. All solid.
 * Positions, yaws and sizes come from layout-v4 solidsV4() (kinds bench / bollard / shelter).
 */
import { useMemo } from 'react';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { BUILDINGS_V4, LANDMARKS_V4, ROADS_V4, solidsV4, type SolidBox } from './layout-v4';
import { islandShoreline } from './WorldLandform';
import { worldText } from './world-i18n';
import * as A from './WorldStreetAssets';
import { cellOf, FONT, paintAtlas } from './WorldStreetMaterial';
import StreetStatic, { at, type Seat, type StaticKind, type StaticPlacement } from './WorldStreetStatic';

const POSTER: [number, number, number, number] = [0, 0, 720, 1008];
const ATLAS = 1024;

/** Island map poster: real waterline, road network, district labels, landmarks and a you-are-here pin. */
function paintPoster(g: CanvasRenderingContext2D, w: number, h: number, here: [number, number]) {
  const sea = g.createLinearGradient(0, 0, 0, h); sea.addColorStop(0, '#2F7377'); sea.addColorStop(1, '#1E5A5E');
  g.fillStyle = '#E6DCCB'; g.fillRect(0, 0, w, h);
  const pad = 40, top = 150, bottom = 150;
  g.fillStyle = sea; g.fillRect(pad, top, w - 2 * pad, h - top - bottom);
  const shore = islandShoreline();
  const xs = shore.map(p => p[0]), zs = shore.map(p => p[1]);
  const x0 = Math.min(...xs, 54) - 6, x1 = Math.max(...xs, 54) + 6, z0 = Math.min(...zs) - 6, z1 = Math.max(...zs) + 6;
  const s = Math.min((w - 2 * pad) / (x1 - x0), (h - top - bottom) / (z1 - z0));
  const ox = pad + ((w - 2 * pad) - (x1 - x0) * s) / 2, oz = top + ((h - top - bottom) - (z1 - z0) * s) / 2;
  const P = (x: number, z: number): [number, number] => [ox + (x - x0) * s, oz + (z - z0) * s];
  g.beginPath(); shore.forEach((p, i) => { const q = P(p[0], p[1]); g[i ? 'lineTo' : 'moveTo'](q[0], q[1]); }); g.closePath();
  g.fillStyle = '#E3D3B4'; g.fill(); g.lineWidth = 9; g.strokeStyle = '#E3D3B4'; g.stroke();
  g.fillStyle = '#7E8C3E'; g.beginPath(); shore.forEach((p, i) => { const q = P(p[0] + (-30 - p[0]) * .04, p[1] + (-10 - p[1]) * .04); g[i ? 'lineTo' : 'moveTo'](q[0], q[1]); }); g.closePath(); g.fill();
  // Park plaza and boardwalk (east, beyond the bridge).
  g.fillStyle = '#B99469'; const pp = P(36, -54), pq = P(54, -36); g.fillRect(pp[0], pp[1], pq[0] - pp[0], pq[1] - pp[1]);
  for (const r of ROADS_V4) {
    g.beginPath(); r.pts.forEach((p, i) => { const q = P(p[0], p[2]); g[i ? 'lineTo' : 'moveTo'](q[0], q[1]); });
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = r.cls === 'dirt' ? '#B08A5E' : r.cls === 'foot' ? '#B99469' : '#F3EBDD';
    g.lineWidth = r.cls === 'avenue' ? 11 : r.cls === 'coastal' ? 9 : r.cls === 'dirt' || r.cls === 'foot' ? 5 : 7;
    g.stroke();
  }
  g.fillStyle = '#4E647D';
  for (const b of BUILDINGS_V4) { const q = P(b.position[0] - b.size[0] / 2, b.position[2] - b.size[2] / 2); g.fillRect(q[0], q[1], b.size[0] * s, b.size[2] * s); }
  const zh = worldText.zh, en = worldText.en;
  const label = (x: number, z: number, a: string, b: string) => {
    const q = P(x, z); g.textAlign = 'center'; g.fillStyle = '#26282A';
    g.font = `600 30px ${FONT}`; g.fillText(a, q[0], q[1]); g.font = `500 20px ${FONT}`; g.fillText(b, q[0], q[1] + 24);
  };
  const L = Object.fromEntries(LANDMARKS_V4.map(l => [l.label, l.p]));
  label(L.campfire[0], L.campfire[1], zh.camp, en.camp);
  label(L.windmill[0], L.windmill[1] + 4, zh.ridge, en.ridge);
  label(4, -14, zh.town, en.town);
  label(46, -60, zh.park, en.park);
  label(-30, 82, '南滩', 'South beach');
  // You are here.
  const q = P(here[0], here[1]);
  g.fillStyle = '#E8803A'; g.beginPath(); g.arc(q[0], q[1], 15, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#EFE6D6'; g.lineWidth = 5; g.stroke();
  g.textAlign = 'left'; g.fillStyle = '#E8803A'; g.font = `700 24px ${FONT}`; g.fillText('你在这里  You are here', Math.min(q[0] + 22, w - 300), q[1] + 8);
  // Header / footer.
  g.fillStyle = '#4E647D'; g.fillRect(0, 0, w, 120);
  g.fillStyle = '#E6DCCB'; g.textAlign = 'left'; g.font = `700 52px ${FONT}`; g.fillText(zh.map, pad, 70); g.font = `500 28px ${FONT}`; g.fillText(en.map, pad, 104);
  g.fillStyle = '#4FD1C5'; g.fillRect(0, 118, w, 4);
  g.fillStyle = '#26282A'; g.font = `500 24px ${FONT}`;
  g.fillText('大道南往营地 · 北过桥到园区', pad, h - 96); g.fillText('Avenue: camp south · park over the bridge', pad, h - 62);
}

const rot = (yaw: number) => new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
/** Ground-contact matrix of a greybox solid (its position is the box centre). */
const ground = (s: SolidBox, extraYaw = 0) => new Matrix4().compose(new Vector3(s.position[0], s.position[1] - s.size[1] / 2, s.position[2]), rot(s.yaw + extraYaw), new Vector3(1, 1, 1));

export default function StreetFixed() {
  const { kinds, placements, seats, atlas } = useMemo(() => {
    const solids = solidsV4();
    const shelter = solids.find(s => s.kind === 'shelter')!;
    const atlas = paintAtlas([{ rect: POSTER, paint: (g, w, h) => paintPoster(g, w, h, [shelter.position[0], shelter.position[2]]) }], ATLAS);
    const kinds: StaticKind[] = [
      { id: 'bench', ...A.bench(), lodNear: 24, far: 110 },
      { id: 'bollard', ...A.bollard(), lodNear: 20, far: 90 },
      { id: 'shelter', L0: A.shelterGeometry(0, cellOf(POSTER, ATLAS)), L1: A.shelterGeometry(1, cellOf(POSTER, ATLAS)), lodNear: 40, far: 160 },
    ];
    const placements: StaticPlacement[] = [], seats: Seat[] = [];
    const zh = '坐下', en = 'Sit';
    solids.forEach((s, i) => {
      if (s.kind === 'bench') {
        // Bench model is long along local X with its back toward +Z. A greybox 0.6 x 1.8 bench is long in z:
        // rotate so the seat front faces the walkway (forecourt / promenade benches face the avenue).
        const longZ = s.size[2] > s.size[0];
        const faceYaw = longZ ? (s.position[0] < 21 ? -Math.PI / 2 : Math.PI / 2) : (s.position[2] < -42 ? Math.PI : 0);
        const m = ground(s, faceYaw);
        placements.push({ kind: 'bench', matrix: m });
        // Seat yaw: guide faces local -Z of the bench (its front) -> heading of (-Z) in world.
        const f = new Vector3(0, 0, -1).applyQuaternion(rot(s.yaw + faceYaw));
        seats.push({ id: `street-bench-${i}`, position: at(m, A.BENCH_SEAT_LOCAL), yaw: Math.atan2(-f.z, f.x), anchor: at(m, [0, .47, -.45]), label: { en, zh } });
      } else if (s.kind === 'bollard') placements.push({ kind: 'bollard', matrix: ground(s) });
      else if (s.kind === 'shelter') {
        // Open side toward the road (west, -X): model's open side is already local -X.
        const m = ground(s);
        placements.push({ kind: 'shelter', matrix: m });
        const f = new Vector3(-1, 0, 0).applyQuaternion(rot(s.yaw));
        seats.push({ id: 'street-shelter-seat', position: at(m, [.4, .5, -.4]), yaw: Math.atan2(-f.z, f.x), anchor: at(m, [-.1, .5, -.4]), label: { en, zh } });
      }
    });
    return { kinds, placements, seats, atlas };
  }, []);
  return <StreetStatic name="street-fixed" claims={['street-fixed']} kinds={kinds} placements={placements} atlas={atlas} seats={seats} assetId="street-fixed" />;
}
