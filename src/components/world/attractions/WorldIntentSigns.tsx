import { useEffect, useMemo } from 'react';
import { CanvasTexture, Matrix4, PlaneGeometry, SRGBColorSpace } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useWorldStore } from '../store';
import { useIntentStore } from './intent-state';
import { coasterWorld } from './coaster-track';
import { INTENT_STATIONS } from './intent-stations';
import type { Vec3 } from '../types';

/** One local canvas atlas and one draw call; no remote font, textures or DOM inside the scene. */
export default function WorldIntentSigns() {
  const lang = useWorldStore(s => s.lang), progress = useIntentStore(s => s.progress), tasks = useIntentStore(s => s.tasks);
  const atlas = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 640;
    const ctx = canvas.getContext('2d')!;
    const zh = lang === 'zh', t = (cn: string, en: string) => zh ? cn : en;
    const routeTask = INTENT_STATIONS[0].tasks[tasks.route];
    const routeText = routeTask === 'T2' ? t('灯塔 → 列车 → 门口 · 22:00 前', 'LIGHTHOUSE → RIDE → GATE · BEFORE 22:00')
      : routeTask === 'T5' ? progress.passed.includes('T5') ? t('循环已修复 · 小车前进', 'LOOP FIXED · CART MOVING') : t('出发 → 回站 → 出发 → 回站', 'START → RETURN → START → RETURN')
      : progress.passed.includes('T6') && routeTask === 'T6' ? t('20:00 · 模拟预订 1 席', '20:00 · ONE SIMULATED BOOKING') : progress.passed.includes('T6') ? t('20:00 · 还有 2 个空位', '20:00 · TWO SEATS AVAILABLE') : t('20:00 · 还有 3 个空位', '20:00 · THREE SEATS AVAILABLE');
    const pressText = tasks.press === 1 ? progress.passed.includes('T4') ? t('日期 10/27 · 场次 20:00 · 人数 2', 'DATE 10/27 · SESSION 20:00 · PARTY 2') : t('入园券 · 等待提取原有字段', 'ADMISSION TICKET · FIELDS WAITING')
      : progress.passed.includes('T3') ? t('请勿攀爬，谢谢配合。', 'Please do not climb. Thank you.') : t('禁止攀爬', 'DO NOT CLIMB');
    const entries = [
      [t('骤变回路', 'SUDDEN SHIFT'), t('意图过山车', 'INTENT COASTER')],
      [t('路线与席位', 'ROUTES & SEATS'), t('拨轨 · 排序 · 排错 · 预订', 'SWITCH · ARRANGE · DEBUG · BOOK')],
      [t('文字加工台', 'THE WORD WORKSHOP'), t('原件进去，目的决定输出', 'ONE ORIGINAL. TWO DIFFERENT OUTCOMES.')],
      [t('先听清，再动手', 'ASK BEFORE YOU ACT'), t('铃在右边', 'THE BELL IS ON YOUR RIGHT')],
      [t(`已理解 ${progress.passed.length}/7`, `${progress.passed.length}/7 UNDERSTOOD`), t('六个不同任务 → 开箱 → 钥匙 → 大门', 'SIX TASKS → CHEST → KEY → GATE')],
      [t('回路车站', 'SHIFT STATION'), t('94 秒 · 随时可回站', '94 SECONDS · RETURN AT ANY TIME')],
      [routeText, t('园内原创模拟', 'A FICTIONAL PARK MODEL')],
      [pressText, t('只改变请求中需要改变的部分', 'CHANGE ONLY WHAT WAS REQUESTED')],
      [progress.passed.includes('T7') ? t('请勿攀爬，谢谢配合。', 'Please do not climb. Thank you.') : progress.clarified.includes('T7') ? t('只改礼貌，别发送。', 'MAKE IT POLITE. DO NOT SEND.') : t('帮我弄一下这个。', 'CAN YOU SORT THIS OUT?'), t('摇铃听目标', 'RING TO CLARIFY')],
    ];
    for (let i = 0; i < entries.length; i++) {
      const x = i % 2 * 1024, y = Math.floor(i / 2) * 128;
      ctx.fillStyle = '#1e303b'; ctx.fillRect(x, y, 1024, 128);
      ctx.fillStyle = '#edf0e6'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `600 ${i >= 6 ? 32 : 48}px ${zh ? '"Songti SC", serif' : 'sans-serif'}`;
      ctx.fillText(entries[i][0], x + 512, y + 46, 960);
      ctx.fillStyle = '#8dd7ce'; ctx.font = '22px sans-serif';
      ctx.fillText(entries[i][1], x + 512, y + 96, 960);
    }
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
    return texture;
  }, [lang, progress, tasks]);
  const geometry = useMemo(() => {
    const panels: { at: Vec3; size: [number, number]; tile: number }[] = [
      { at: [0, 6.4, 32.53], size: [10, .95], tile: 0 },
      ...INTENT_STATIONS.map((s, i) => ({ at: [s.origin[0], 3, s.origin[2] - 1.31] as Vec3, size: [7, .85] as [number, number], tile: i + 1 })),
      { at: [-7, 2.6, 35], size: [6, .95], tile: 4 },
      { at: [-2.6, 4.7, 30.54], size: [8.5, .95], tile: 5 },
      ...INTENT_STATIONS.map((s, i) => ({ at: [s.origin[0], 1.9, s.origin[2] + 1.76] as Vec3, size: [6.4, .65] as [number, number], tile: i + 6 })),
    ];
    const parts = panels.map(panel => {
      const g = new PlaneGeometry(...panel.size), uv = g.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + panel.tile % 2) / 2, (uv.getY(i) + 4 - Math.floor(panel.tile / 2)) / 5);
      g.applyMatrix4(new Matrix4().makeTranslation(...coasterWorld(panel.at))); return g;
    });
    const merged = mergeGeometries(parts, false)!; parts.forEach(p => p.dispose()); return merged;
  }, []);
  useEffect(() => () => atlas.dispose(), [atlas]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry}><meshBasicMaterial map={atlas} toneMapped={false} /></mesh>;
}
