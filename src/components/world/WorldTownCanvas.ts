import { CanvasTexture, SRGBColorSpace } from 'three';
import { experienceMonth } from './world-i18n';
import type { WorldExperience } from './types';

/** Runtime canvases for the town (facts only from `experiences`, no logos: each building gets an
 * abstract geometric mark). Atlases are stacked rows; `rows[i]` gives the v range of slot i. */
export interface Atlas { texture: CanvasTexture; rows: { v0: number; v1: number }[] }

const FONT = 'system-ui, -apple-system, "PingFang SC", "Noto Sans CJK SC", sans-serif';

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = 600) {
  let s = size;
  do { ctx.font = `${weight} ${s}px ${FONT}`; s -= 2; } while (ctx.measureText(text).width > maxW && s > 10);
}

/** Abstract marks by building id (no organisation logos). */
function mark(ctx: CanvasRenderingContext2D, id: string, cx: number, cy: number, r: number, color: string) {
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(2, r * .16);
  switch (id) {
    case 'sdic': ctx.strokeRect(cx - r, cy - r, 2 * r, 2 * r); ctx.fillRect(cx - r * .45, cy - r * .45, r * .9, r * .9); break;
    case 'worldquant': for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { ctx.beginPath(); ctx.arc(cx + i * r * .7, cy + j * r * .7, r * .2, 0, Math.PI * 2); ctx.fill(); } break;
    case 'moe': ctx.beginPath(); ctx.arc(cx, cy + r * .4, r * .8, Math.PI, 0); ctx.fill(); ctx.fillRect(cx - r, cy + r * .55, 2 * r, r * .18); break;
    case 'aime': for (let i = 0; i < 4; i++) ctx.fillRect(cx - r + i * r * .52, cy + r - (i + 1) * r * .48, r * .36, (i + 1) * r * .48); break;
    case 'video-rebirth': ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx - r * .35, cy - r * .5); ctx.lineTo(cx + r * .55, cy); ctx.lineTo(cx - r * .35, cy + r * .5); ctx.closePath(); ctx.fill(); break;
    default: for (const k of [1, .62, .26]) { ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, Math.PI * 2); ctx.stroke(); }
  }
  ctx.restore();
}

function atlas(width: number, heights: number[], draw: (ctx: CanvasRenderingContext2D, i: number, y: number, h: number) => void): Atlas {
  const total = heights.reduce((a, b) => a + b, 0);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = total;
  const ctx = canvas.getContext('2d');
  const rows: Atlas['rows'] = [];
  let y = 0;
  heights.forEach((h, i) => {
    if (ctx) { ctx.save(); ctx.beginPath(); ctx.rect(0, y, width, h); ctx.clip(); draw(ctx, i, y, h); ctx.restore(); }
    // canvas y grows down; texture v grows up (flipY = true)
    rows.push({ v0: 1 - (y + h) / total, v1: 1 - y / total });
    y += h;
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return { texture, rows };
}

/** Roof / fascia signs: mark + organisation name; light text on the dark sign field. */
export function signAtlas(ids: string[], aspect: number[], en: WorldExperience[], zh: WorldExperience[]) {
  const W = 1024;
  const heights = aspect.map(a => Math.max(64, Math.round(W / a)));
  return atlas(W, heights, (ctx, i, y, h) => {
    ctx.fillStyle = '#1F2730'; ctx.fillRect(0, y, W, h);
    ctx.strokeStyle = 'rgba(230,220,203,.35)'; ctx.lineWidth = 3; ctx.strokeRect(4, y + 4, W - 8, h - 8);
    const r = Math.min(h * .3, 60), cx = 26 + r, cy = y + h / 2;
    mark(ctx, ids[i], cx, cy, r, '#F3E7CF');
    const x0 = cx + r + 24, maxW = W - x0 - 24;
    ctx.fillStyle = '#F3E7CF'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    if (h > 220) {
      fitText(ctx, en[i]?.organization ?? '', maxW, Math.round(h * .26));
      ctx.fillText(en[i]?.organization ?? '', x0, y + h * .36);
      fitText(ctx, zh[i]?.organization ?? '', maxW, Math.round(h * .2), 500);
      ctx.fillStyle = 'rgba(243,231,207,.8)'; ctx.fillText(zh[i]?.organization ?? '', x0, y + h * .7);
    } else {
      fitText(ctx, en[i]?.organization ?? '', maxW, Math.round(h * .62));
      ctx.fillText(en[i]?.organization ?? '', x0, y + h * .54);
    }
  });
}

/** Year plates on the pillars: YYYY.MM. */
export function yearAtlas(en: WorldExperience[]) {
  const W = 256, H = 156;
  return atlas(W, en.map(() => H), (ctx, i, y, h) => {
    ctx.fillStyle = '#1D2A33'; ctx.fillRect(0, y, W, h);
    ctx.fillStyle = '#E6F7F4'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    fitText(ctx, experienceMonth(en[i].startDate), W - 24, 70, 650);
    ctx.fillText(experienceMonth(en[i].startDate), W / 2, y + h * .54);
  });
}

/** Exhibit boards: date, role and organisation in both languages, plus a press-E hint mark. */
export function boardAtlas(ids: string[], en: WorldExperience[], zh: WorldExperience[]) {
  const W = 512, H = 358;
  return atlas(W, en.map(() => H), (ctx, i, y, h) => {
    ctx.fillStyle = '#F1EBDF'; ctx.fillRect(0, y, W, h);
    ctx.fillStyle = '#4E647D'; ctx.fillRect(0, y, W, 58);
    mark(ctx, ids[i], 36, y + 29, 17, '#F1EBDF');
    ctx.fillStyle = '#F1EBDF'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.font = `650 34px ${FONT}`; ctx.fillText(experienceMonth(en[i].startDate), 70, y + 31);
    ctx.fillStyle = '#263B48';
    const lines: [string, number, number, string][] = [
      [zh[i]?.organization ?? '', 30, 650, '#263B48'], [zh[i]?.role ?? '', 25, 500, '#41535F'],
      [en[i]?.organization ?? '', 26, 650, '#263B48'], [en[i]?.role ?? '', 22, 500, '#41535F'],
    ];
    let ly = y + 98;
    lines.forEach(([t, s, w, c], k) => {
      ctx.fillStyle = c; fitText(ctx, t, W - 52, s, w); ctx.fillText(t, 26, ly);
      ly += k === 1 ? 70 : 52;
    });
    ctx.fillStyle = 'rgba(78,100,125,.75)'; ctx.font = `600 18px ${FONT}`; ctx.textAlign = 'right';
    ctx.fillText('E · 查看 / View', W - 22, y + h - 22);
  });
}
