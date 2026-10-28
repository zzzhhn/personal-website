import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { useWorldStore } from '../store';
import { useIntentStore } from './intent-state';
import { COASTER_DURATION } from './coaster-track';
import { createIntentSignGeometry } from './intent-sign-layout';

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
  const geometry = useMemo(createIntentSignGeometry, []);
  useEffect(() => () => atlas.dispose(), [atlas]); useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry}><meshBasicMaterial map={atlas} toneMapped={false} /></mesh>;
}
