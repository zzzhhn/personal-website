/** The exchange trades virtual index units from the existing Alpha API's historical SPY benchmark.
 * These values are normalized NAV, never a stock quote or a brokerage balance. */
export interface ExchangeDay { date: string; value: number }
export const EXCHANGE_DATA_SEED = 'REVERSAL_5' as const;
export const EXCHANGE_INITIAL_POINTS = 10_000;
export const EXCHANGE_LOT = 10;
export const EXCHANGE_POSITION_LIMIT = 50;
export function exchangeBenchmarkHistory(result: unknown): ExchangeDay[] {
  const r = result as { factor?: { curve?: Array<{date:unknown;benchmark:unknown}> }; metadata?: { acknowledgedParameters?: {benchmark?:unknown} } } | null;
  if (r?.metadata?.acknowledgedParameters?.benchmark !== 'SPY' || !Array.isArray(r?.factor?.curve)
    || r.factor.curve.length < 10 || r.factor.curve.length > 10_000) throw new Error('A validated SPY historical benchmark is required.');
  let previous = '';
  const history = r.factor.curve.map(row => {
    if (typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || row.date <= previous
      || !Number.isFinite(Date.parse(`${row.date}T00:00:00Z`)) || new Date(`${row.date}T00:00:00Z`).toISOString().slice(0,10) !== row.date
      || typeof row.benchmark !== 'number' || !Number.isFinite(row.benchmark) || row.benchmark <= 0 || row.benchmark > 1e6)
      throw new Error('Invalid historical SPY benchmark calendar or NAV.');
    previous = row.date;
    return { date: row.date, value: row.benchmark * 100 };
  });
  if (Math.abs(history[0].value - 100) > 1e-6) throw new Error('SPY benchmark must begin at NAV 100.');
  return history;
}
