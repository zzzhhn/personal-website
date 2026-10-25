import type { AlphaFactorId, AlphaReplayFactor } from './alpha-mine-data';

/** Ore pigments remain muted; emitted plot light needs contrast on dark water. */
export const POOL_INK: Record<AlphaFactorId, string> = {
  REVERSAL_5: '#ffd493', ROC20_RANK: '#86e7d5', LOW_STD_20: '#c6d7ff',
};
export type PoolSample = AlphaReplayFactor['curve'][number];
export const poolPercent = (value: number) => `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
export function poolDomain(curves: PoolSample[][]): [number, number] {
  let lo = 1, hi = 1;
  for (const curve of curves) for (const p of curve) {
    lo = Math.min(lo, p.nav, p.benchmark); hi = Math.max(hi, p.nav, p.benchmark);
  }
  const padding = Math.max(.025, (hi - lo) * .09);
  return [lo - padding, hi + padding];
}
export function poolPoint(curve: PoolSample[], index: number, key: 'nav' | 'benchmark', domain: [number, number]) {
  const i = Math.max(0, Math.min(curve.length - 1, Math.round(index)));
  return { x: curve.length < 2 ? 0 : i / (curve.length - 1), y: (curve[i][key] - domain[0]) / (domain[1] - domain[0]) };
}
/** Select a real observation by date. Never fabricate an interpolated daily return. */
export function poolDateIndex(curve: PoolSample[], date: string) {
  let lo = 0, hi = curve.length - 1;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (curve[mid].date <= date) lo = mid; else hi = mid - 1; }
  return lo;
}
