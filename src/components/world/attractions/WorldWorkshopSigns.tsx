import { useEffect, useMemo } from 'react';
import { CanvasTexture, Matrix4, PlaneGeometry, SRGBColorSpace } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useWorldStore } from '../store';
import { useIntentStore } from './intent-state';
import { findIntentTask } from './intent-tasks';
import { useWorkshopStore } from './intent-workshop-runtime';
import { WORKSHOP_TOOLS } from './intent-workshop-layout';
import { coasterWorld } from './coaster-track';

export default function WorldWorkshopSigns() {
  const lang = useWorldStore(s => s.lang), s = useWorkshopStore(), progress = useIntentStore(s => s.progress);
  const notice = useIntentStore(s => s.notice);
  const atlas = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 1024;
    const c = canvas.getContext('2d')!, zh = lang === 'zh', t = (a: string, b: string) => zh ? a : b;
    const task = findIntentTask(s.taskId ?? '');
    const request = task?.clarification && progress.clarified.includes(task.id) ? task.clarification.reply[lang] : task?.request[lang];
    const rows = [
      [s.phase === 'idle' ? t('先拉接件杆，接收一件请求', 'PULL THE INTAKE LEVER. RECEIVE A REQUEST.') : request ?? t('请求已完成', 'REQUESTS COMPLETE'),
        s.phase === 'processing' ? t('看它被送到机器里……', 'WATCH THE CARRIER REACH THE MACHINE…')
          : s.phase === 'result' ? notice?.[lang] ?? '' : t('读目标 → 走到机器旁 → 拉杆送件', 'READ THE GOAL → WALK TO A MACHINE → PULL ITS LEVER')],
      ...WORKSHOP_TOOLS.map(tool => [tool.label[lang], s.outputs[tool.id] ? t(
        { lookup: '20:00 · 仍有 3 席 · 未预订', plan: '灯塔 → 列车 → 门口', debug: '循环已断开 · 小车前进', rewrite: '请勿攀爬，谢谢配合。', extract: '10/27 · 20:00 · 2 人', act: '20:00 · 已预订 1 席' }[tool.id],
        { lookup: '20:00 · 3 FREE · NOT BOOKED', plan: 'LIGHTHOUSE → TRAIN → GATE', debug: 'LOOP BROKEN · CART FORWARD', rewrite: 'Please do not climb. Thank you.', extract: '10/27 · 20:00 · PARTY 2', act: '20:00 · ONE SEAT BOOKED' }[tool.id]) : t(
        { lookup: '只查看，不占座', plan: '按顺序连接目的地', debug: '修复错误循环', rewrite: '换说法，不换意思', extract: '拆出原有字段', act: '改变模拟席位状态' }[tool.id],
        { lookup: 'VIEW. DO NOT RESERVE.', plan: 'ORDER THE DESTINATIONS.', debug: 'REPAIR THE FAULTY LOOP.', rewrite: 'NEW WORDS. SAME MEANING.', extract: 'SEPARATE EXISTING FIELDS.', act: 'CHANGE A SIMULATED SEAT.' }[tool.id])]),
      [t(`六道锁 · 已打开 ${Math.min(6, progress.passed.length)}`, `${Math.min(6, progress.passed.length)} OF SIX LOCKS OPEN`),
        t('摇铃问清含糊请求 · 选错会退回原件', 'RING TO CLARIFY · WRONG ROUTES RETURN THE ORIGINAL')],
    ];
    rows.forEach(([a, b], i) => {
      const y = i * 128; c.fillStyle = '#21333b'; c.fillRect(0, y, 1024, 128);
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff1d9';
      c.font = `600 ${i === 0 ? 36 : 45}px ${zh ? '"Songti SC", serif' : 'sans-serif'}`; c.fillText(a, 512, y + 41, 985);
      c.fillStyle = '#a8e6df'; c.font = '25px sans-serif'; c.fillText(b, 512, y + 94, 985);
    });
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; return texture;
  }, [lang, s.phase, s.taskId, s.outputs, progress, notice]);
  const geometry = useMemo(() => {
    const panels = [{ at: [-16, 2.7, 72.05], size: [5.3, .85], row: 0 },
      ...WORKSHOP_TOOLS.map((tool, i) => ({ at: [tool.at[0], 2.55, tool.at[2] - .81], size: [2.65, .6], row: i + 1 })),
      { at: [-16, 3.6, 72.05], size: [5.3, .7], row: 7 }];
    const parts = panels.map(({ at, size, row }) => {
      const g = new PlaneGeometry(size[0], size[1]), uv = g.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) + 7 - row) / 8);
      g.applyMatrix4(new Matrix4().makeTranslation(...coasterWorld(at as [number, number, number]))); return g;
    });
    const g = mergeGeometries(parts, false)!; parts.forEach(p => p.dispose()); return g;
  }, []);
  useEffect(() => () => atlas.dispose(), [atlas]); useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry}><meshBasicMaterial map={atlas} toneMapped={false} /></mesh>;
}
