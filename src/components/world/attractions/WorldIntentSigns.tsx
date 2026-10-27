import { useEffect, useMemo } from 'react';
import { CanvasTexture, Matrix4, PlaneGeometry, SRGBColorSpace } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useWorldStore } from '../store';
import { useIntentStore } from './intent-state';
import { coasterWorld, COASTER_DURATION, COASTER_GATE_Z } from './coaster-track';
import type { Vec3 } from '../types';

/** Gate, chest and station share one small atlas. Workshop signs own their request state. */
export default function WorldIntentSigns() {
  const lang = useWorldStore(s => s.lang), passed = useIntentStore(s => s.progress.passed.length);
  const atlas = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 384;
    const ctx = canvas.getContext('2d')!, zh = lang === 'zh', t = (a: string, b: string) => zh ? a : b;
    const entries = [
      [t('骤变回路', 'SUDDEN SHIFT'), t('意图过山车', 'INTENT COASTER')],
      [t(`六道锁 · 已打开 ${Math.min(6, passed)}`, `${Math.min(6, passed)} OF SIX LOCKS OPEN`), t('处理请求 → 开箱 → 钥匙 → 大门', 'REQUESTS → CHEST → KEY → GATE')],
      [t('回路车站', 'SHIFT STATION'), t(`${COASTER_DURATION} 秒 · 沿左侧踏步登车`, `${COASTER_DURATION} SECONDS · BOARD VIA THE LEFT STEPS`)],
    ];
    entries.forEach(([a,b], i) => {
      const y = i * 128; ctx.fillStyle = '#1e303b'; ctx.fillRect(0, y, 1024, 128);
      ctx.fillStyle = '#edf0e6'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `600 48px ${zh ? '"Songti SC", serif' : 'sans-serif'}`; ctx.fillText(a, 512, y + 46, 960);
      ctx.fillStyle = '#8dd7ce'; ctx.font = '22px sans-serif'; ctx.fillText(b, 512, y + 96, 960);
    });
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; return texture;
  }, [lang, passed]);
  const geometry = useMemo(() => {
    const panels: { at: Vec3; size: [number, number] }[] = [
      { at: [0, 6.4, COASTER_GATE_Z + 1.03], size: [10, .95] },
      { at: [-8, 2.6, 60.2], size: [6, .95] }, { at: [-2, 5.6, 53.1], size: [8.5, .95] },
    ];
    const parts = panels.map((panel, tile) => {
      const g = new PlaneGeometry(...panel.size), uv = g.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) + 2 - tile) / 3);
      g.applyMatrix4(new Matrix4().makeTranslation(...coasterWorld(panel.at))); return g;
    });
    const merged = mergeGeometries(parts, false)!; parts.forEach(p => p.dispose()); return merged;
  }, []);
  useEffect(() => () => atlas.dispose(), [atlas]); useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry}><meshBasicMaterial map={atlas} toneMapped={false} /></mesh>;
}
