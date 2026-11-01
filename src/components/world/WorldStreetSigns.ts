/**
 * Street props: the runtime sign atlas (street session). One 2048^2 canvas, bilingual, no logos.
 * Facts: place names come from world-i18n (zone labels); nothing here is a portfolio fact.
 * Cells (pixel rects, top-left origin) are fixed so geometry uv never depends on paint order.
 */
import { worldText } from './world-i18n';
import { FONT, paintAtlas, cellOf, type AtlasPainter } from './WorldStreetMaterial';

type Rect = [number, number, number, number];
const zh = worldText.zh, en = worldText.en;

export const CELLS = {
  stop: [0, 0, 256, 256] as Rect,
  chevron: [256, 0, 464, 256] as Rect,
  /** direction-0..5 (two rows of three). */
  direction: Array.from({ length: 6 }, (_, i) => [(i % 3) * 680, 288 + Math.floor(i / 3) * 300, 660, 290] as Rect),
};

/** Direction boards per approach road (arrow relative to the approaching driver). */
export const DIRECTION_TEXT: Record<string, [string, string, string][]> = {
  'camp-road': [['←', zh.town, en.town], ['→', '南滩', 'South beach']],
  'ring-south': [['↑', zh.town, en.town], ['←', zh.camp, en.camp]],
  'west-road': [['→', zh.ridge, en.ridge], ['←', '西岸', 'West shore']],
  'back-street': [['←', zh.ridge, en.ridge], ['→', zh.park, en.park]],
  'year-street': [['←', zh.park, en.park], ['→', zh.camp, en.camp]],
  'ring-west': [['→', zh.town, en.town], ['↑', zh.ridge, en.ridge]],
};

const border = (g: CanvasRenderingContext2D, w: number, h: number, col: string, lw: number, inset: number, r = 18) => {
  g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.roundRect(inset, inset, w - 2 * inset, h - 2 * inset, r); g.stroke();
};
const stopPaint: AtlasPainter = (g, w, h) => {
  g.fillStyle = '#E8803A'; g.fillRect(0, 0, w, h);
  // Octagon border follows the plate outline (regular octagon, flat top).
  g.save(); g.translate(w / 2, h / 2); g.strokeStyle = '#EFE6D6'; g.lineWidth = 10; g.beginPath();
  for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4, r = w * .44; g[i ? 'lineTo' : 'moveTo'](r * Math.cos(a), r * Math.sin(a)); }
  g.closePath(); g.stroke(); g.restore();
  g.fillStyle = '#EFE6D6'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 92px ${FONT}`; g.fillText('停', w / 2, h * .42);
  g.font = `700 46px ${FONT}`; g.fillText('STOP', w / 2, h * .7);
};
const chevronPaint: AtlasPainter = (g, w, h) => {
  g.fillStyle = '#E8803A'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#EFE6D6';
  for (let i = 0; i < 3; i++) {
    const x = w * (.2 + i * .25);
    g.beginPath(); g.moveTo(x, h * .14); g.lineTo(x + w * .14, h * .5); g.lineTo(x, h * .86); g.lineTo(x + w * .07, h * .86); g.lineTo(x + w * .21, h * .5); g.lineTo(x + w * .07, h * .14); g.closePath(); g.fill();
  }
};
const directionPaint = (rows: [string, string, string][]): AtlasPainter => (g, w, h) => {
  g.fillStyle = '#4E647D'; g.fillRect(0, 0, w, h);
  border(g, w, h, '#E6DCCB', 8, 14);
  rows.forEach(([arrow, z, e], i) => {
    const y = h * (.3 + i * .42);
    g.fillStyle = '#E6DCCB'; g.textBaseline = 'middle';
    g.textAlign = 'center'; g.font = `700 92px ${FONT}`; g.fillText(arrow, w * .13, y);
    g.textAlign = 'left'; g.font = `600 64px ${FONT}`; g.fillText(z, w * .25, y - 22);
    g.font = `500 38px ${FONT}`; g.globalAlpha = .9; g.fillText(e, w * .25, y + 34); g.globalAlpha = 1;
    if (i === 0) { g.fillRect(w * .07, h * .52, w * .86, 3); }
  });
};

/** Extra painters registered by later groups (F04 boards, shelter poster). */
const extra: { rect: Rect; paint: AtlasPainter }[] = [];
export const registerSignCell = (rect: Rect, paint: AtlasPainter) => { extra.push({ rect, paint }); };

export function directionCellFor(index: number) { return cellOf(CELLS.direction[index % 6]); }
export const stopCell = () => cellOf(CELLS.stop);
export const chevronCell = () => cellOf(CELLS.chevron);

let atlas: ReturnType<typeof paintAtlas> | undefined;
/** Built once in the browser, after every group registered its painters (call from the first render). */
export function streetAtlas(directionRoads: string[]) {
  if (atlas !== undefined) return atlas;
  atlas = paintAtlas([
    { rect: CELLS.stop, paint: stopPaint }, { rect: CELLS.chevron, paint: chevronPaint },
    ...directionRoads.map((road, i) => ({ rect: CELLS.direction[i % 6], paint: directionPaint(DIRECTION_TEXT[road] ?? [['↑', zh.shore, en.shore]]) })),
    ...extra,
  ]);
  return atlas;
}
