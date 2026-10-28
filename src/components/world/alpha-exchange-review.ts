import type { ExchangeEquityPoint, ExchangeRound } from './alpha-exchange-round.ts';

/** Compare only visited marks from exactly the same dated price series. Never use the prior terminal value. */
export function exchangePreviousMarks(round: ExchangeRound, marks: ExchangeEquityPoint[]) {
  if (!round.previousRun || !marks.length) return null;
  const previous = new Map(round.previousRun.equityTrace.map(mark => [mark.date, mark]));
  const matched: ExchangeEquityPoint[] = [];
  for (const mark of marks) {
    if (mark.day > round.day) return null;
    const old = previous.get(mark.date);
    if (!old || old.value !== mark.value) return null;
    matched.push({ ...old });
  }
  return matched;
}

export function exchangeReview(round: ExchangeRound | null, index: number | null) {
  if (!round || index === null || !Number.isInteger(index) || index < 0) return null;
  const choice = round.choices[index];
  if (!choice || choice.throughDay > round.day) return null;
  const marks = round.equityTrace.filter(mark => mark.day >= choice.day && mark.day <= choice.throughDay).map(mark => ({ ...mark }));
  if (!marks.length) return null;
  const previous = exchangePreviousMarks(round, marks);
  const pnl = choice.equityAfter - choice.equityBefore;
  const previousPnl = previous ? previous.at(-1)!.equity - previous[0].equity : null;
  return { index, from: choice.date, through: choice.throughDate, fromUnits: choice.fromUnits, units: choice.units,
    pnl, returnPct: pnl / choice.equityBefore * 100, equity: choice.equityAfter, marks, previous, previousPnl,
    difference: previousPnl === null ? null : pnl - previousPnl };
}
