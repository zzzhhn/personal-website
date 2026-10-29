/** G15: three independent shallow light-wood billboards, outside road/sidewalk envelopes. */
import { useEffect, useMemo } from 'react';
import { ROADS_V4, pointAt, polylineLength, paveHalf, onPavement, solidsV4, solidDistance, knockablesV4, FOUNDATIONS_V4 } from './layout-v4';
import { meshHeight, terrainHeight } from './WorldLandform';
import StreetKnockables, { type Item } from './WorldStreetKnock';
import { FONT, paintAtlas, cellOf } from './WorldStreetMaterial';
const COPY = [
  { road: 'camp-road', fraction: .65, side: -1, zh: '慢一点，看见更多', en: 'TAKE THE SCENIC ROUTE' },
  { road: 'ring-north', fraction: .55, side: 1, zh: '向海而行', en: 'MEET THE COAST' },
  { road: 'ring-west', fraction: .45, side: 1, zh: '让想法生长', en: 'GIVE IDEAS ROOM' },
];
export default function StreetBillboards() {
  const built = useMemo(() => {
    const rects = COPY.map((_, i) => [0, i * 640, 1280, 640] as [number, number, number, number]);
    const atlas = paintAtlas(COPY.map((c, i) => ({ rect: rects[i], paint: (g, w, h) => {
      g.fillStyle = '#E6DCCB'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#D2B98A'; g.fillRect(0, h * .62, w, h * .38);
      g.fillStyle = '#6F8A3A'; g.beginPath(); g.moveTo(w * .66, h * .62); g.quadraticCurveTo(w * .84, h * .1, w, h * .5); g.lineTo(w, h); g.lineTo(w * .6, h); g.fill();
      g.fillStyle = '#4E647D'; g.beginPath(); g.arc(w * .8, h * .25, 56, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3B332B'; g.textAlign = 'left'; g.font = `650 76px ${FONT}`; g.fillText(c.zh, 68, h * .38, w * .63);
      g.font = `600 37px ${FONT}`; g.fillText(c.en, 68, h * .56, w * .63);
      g.font = `500 24px ${FONT}`; g.fillText('BOBBY’S ISLAND', 68, h * .82);
    } })));
    const items: Item[] = COPY.map((c, i) => {
      const road = ROADS_V4.find(r => r.id === c.road)!;
      const off = (paveHalf(road.cls) + 2) * c.side;
      const clear = (x: number, z: number, dx: number, dz: number) => {
        // Check the full board/feet envelope against ALL paved polygons, not just its chosen road.
        for (const u of [-1.55, 0, 1.55]) for (const v of [-.65, 0, .65]) if (onPavement([x + dx * u + dz * v, z + dz * u - dx * v])) return false;
        if (solidsV4().some(s => solidDistance([x, z], s) < 1.8)) return false;
        if (FOUNDATIONS_V4.some(f => solidDistance([x, z], { ...f, yaw: 0 }) < 1.8)) return false;
        return !knockablesV4().some(k => Math.hypot(k.position[0] - x, k.position[2] - z) < 2.2);
      };
      let chosen: { x: number; z: number; nx: number; nz: number } | null = null;
      for (const fraction of [c.fraction, .45, .35, .25, .15, .75]) {
        const q = pointAt(road.pts, polylineLength(road.pts) * fraction);
        const x = q.p[0] + q.dir[1] * off, z = q.p[1] - q.dir[0] * off;
        if (clear(x, z, q.dir[0], q.dir[1])) { chosen = { x, z, nx: q.p[0] - x, nz: q.p[1] - z }; break; }
      }
      if (!chosen) throw new Error('No clear G15 road shoulder at ' + road.id);
      const { x, z, nx, nz } = chosen;
      return { id: 'billboard-' + i, kind: 'billboard', position: [x, meshHeight(x, z) ?? terrainHeight(x, z), z], yaw: Math.atan2(nx, nz), road: road.id, cell: cellOf(rects[i]), label: c.zh + ' / ' + c.en };
    });
    return { items, atlas };
  }, []);
  useEffect(() => () => built.atlas?.dispose(), [built]);
  return <StreetKnockables set="billboard" customItems={built.items} customAtlas={built.atlas} />;
}
