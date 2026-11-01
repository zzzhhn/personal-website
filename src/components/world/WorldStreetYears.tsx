/** G11 facts flow from server-mapped experiences through WorldRuntime; no duplicate i18n import. */
import { useEffect, useMemo } from 'react';
import { BUILDINGS_V4, ROAD_Y } from './layout-v4';
import StreetKnockables, { type Item } from './WorldStreetKnock';
import { FONT, paintAtlas, cellOf } from './WorldStreetMaterial';
import type { WorldContent } from './types';
const SIZE = 2048;
export default function StreetYears({ experiences }: { experiences: WorldContent['experiences'] }) {
  const built = useMemo(() => {
    const facts = BUILDINGS_V4.map((b, slot) => {
      const en = experiences.en[slot], zh = experiences.zh[slot];
      if (!en || !zh || en.startDate !== zh.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(en.startDate)) throw new Error('G11 missing / mismatched startDate at ' + b.id);
      return { buildingId: b.id, slot, startDate: en.startDate, year: en.startDate.slice(0, 4), month: en.startDate.slice(5, 7) };
    });
    const rects = facts.map((_, i) => [(i % 4) * 512, Math.floor(i / 4) * 1024, 512, 1024] as [number, number, number, number]);
    const atlas = paintAtlas(facts.map((f, i) => ({ rect: rects[i], paint: (g, w, h) => {
      g.fillStyle = '#4E647D'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#E6DCCB'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `650 172px ${FONT}`; g.fillText(f.year, w / 2, h * .32);
      g.font = `650 248px ${FONT}`; g.fillText(f.month, w / 2, h * .65);
      g.font = `500 44px ${FONT}`; g.fillText('月 / MONTH', w / 2, h * .86);
      g.fillStyle = '#4FD1C5'; g.fillRect(w * .2, h * .48, w * .6, 6);
    } })), SIZE);
    const items: Item[] = BUILDINGS_V4.map((b, i) => ({ id: 'year-' + b.id, kind: 'year', position: [b.position[0] + b.size[0] / 2 + 5, ROAD_Y + .01, b.position[2]], yaw: Math.PI / 2, road: 'avenue', cell: cellOf(rects[i], SIZE), sourceId: b.id, sourceDate: facts[i].startDate, label: facts[i].year + '.' + facts[i].month }));
    return { items, atlas, facts };
  }, [experiences]);
  useEffect(() => {
    const qa = new URLSearchParams(window.location.search).get('qa') === '1';
    if (qa) Object.assign(window, { __worldStreetYears: (atlas = false) => ({ facts: built.facts, items: built.items, atlas: atlas ? (built.atlas?.image as HTMLCanvasElement).toDataURL('image/png') : null }) });
    return () => { built.atlas?.dispose(); if (qa) delete (window as unknown as Record<string, unknown>).__worldStreetYears; };
  }, [built]);
  return <StreetKnockables set="year" customItems={built.items} customAtlas={built.atlas} />;
}
