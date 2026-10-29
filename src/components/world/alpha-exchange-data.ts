/** The exchange trades virtual index units from the existing Alpha API's historical SPY benchmark.
 * These values are normalized NAV, never a stock quote or a brokerage balance. */
export interface ExchangeDay { date: string; value: number }
export interface ExchangeArchiveTicket { id: string; label: string; history: ExchangeDay[]; identity: string }
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

/** A bounded menu from accepted history. Dates describe coverage, never future returns. */
export function exchangeArchiveCatalog(history: ExchangeDay[]): ExchangeArchiveTicket[] {
  if (!Array.isArray(history) || history.length < 10 || history.length > 10_000)
    throw new Error('A validated SPY archive requires 10 to 10000 historical days.');
  let previous = '';
  const years = new Map<string, ExchangeDay[]>(), days: ExchangeDay[] = [];
  for (const row of history) {
    if (!row || typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || row.date <= previous
      || !Number.isFinite(Date.parse(`${row.date}T00:00:00Z`)) || new Date(`${row.date}T00:00:00Z`).toISOString().slice(0, 10) !== row.date
      || typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value <= 0 || row.value > 1e8)
      throw new Error('Invalid historical SPY archive calendar or NAV.');
    previous = row.date;
    const day = { date: row.date, value: row.value }, year = row.date.slice(0, 4);
    days.push(day);
    if (!years.has(year)) years.set(year, []);
    years.get(year)!.push(day);
  }
  if (Math.abs(days[0].value - 100) > 1e-6) throw new Error('SPY benchmark must begin at NAV 100.');
  const ticket = (id: string, label: string, source: ExchangeDay[]): ExchangeArchiveTicket => {
    const start = source[0].value;
    const normalized = source.map(row => ({ date: row.date, value: start === 100 ? row.value : row.value / start * 100 }));
    if (normalized.some(row => !Number.isFinite(row.value) || row.value <= 0 || row.value > 1e8))
      throw new Error('Historical SPY archive cannot be normalized to a finite supported NAV.');
    // Preserve source values in the identity: proportional series must not share a receipt.
    return { id, label, history: normalized, identity: JSON.stringify(source) };
  };
  // Keep the four most recent sufficiently covered years, in chronological order.
  const annual = [...years].filter(([, rows]) => rows.length >= 20).slice(-4);
  return [ticket('full', 'SPY', days), ...annual.map(([year, rows]) => ticket(`year-${year}`, year, rows))];
}
