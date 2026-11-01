import { EXCHANGE_INITIAL_POINTS, EXCHANGE_LOT, EXCHANGE_POSITION_LIMIT, type ExchangeDay } from './alpha-exchange-data.ts';

export type ExchangeRoundMessage = 'ticket-ready' | 'select-target' | 'invalid-target' | 'sealed' | 'insufficient' | 'segment-complete' | 'collect-receipt' | 'complete';
export interface ExchangeEquityPoint {
  day: number; date: string; value: number; cash: number; units: number; equity: number;
}
export interface ExchangeRoundChoice {
  checkpoint: number; day: number; date: string; value: number;
  fromUnits: number; units: number; deltaUnits: number; cashBefore: number; cashAfter: number;
  equityBefore: number; throughDay: number; throughDate: string; equityAfter: number;
}
export interface ExchangeRoundReceipt {
  startDate: string; endDate: string; startPoints: number; finalEquity: number; pnl: number; returnPct: number;
  benchmark: 'SPY'; historical: true; caveat: string;
  choices: ExchangeRoundChoice[]; equityTrace: ExchangeEquityPoint[];
}
export interface ExchangeRound {
  phase: 'ticket' | 'selecting' | 'sealed' | 'clearing' | 'complete';
  history: ExchangeDay[]; day: number; cash: number; units: number; targetUnits: number; checkpoint: number;
  choices: ExchangeRoundChoice[]; equityTrace: ExchangeEquityPoint[];
  receipt: ExchangeRoundReceipt | null; previousRun: ExchangeRoundReceipt | null; message: ExchangeRoundMessage;
}
export type ExchangeRoundAction = { type: 'insert' } | { type: 'target'; units: number } | { type: 'seal' }
  | { type: 'ring' } | { type: 'collect' } | { type: 'replay' };

const CAVEAT = 'Historical SPY normalized NAV replay using virtual points; no trading fees or slippage are included.';

function validatedHistory(history: ExchangeDay[]): ExchangeDay[] {
  if (!Array.isArray(history) || history.length < 1 || history.length > 10_000)
    throw new Error('A finite historical SPY replay requires 1 to 10000 validated days.');
  let previous = '';
  const copy = history.map(row => {
    if (!row || typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || row.date <= previous
      || !Number.isFinite(Date.parse(`${row.date}T00:00:00Z`)) || new Date(`${row.date}T00:00:00Z`).toISOString().slice(0, 10) !== row.date
      || typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value <= 0 || row.value > 1e8)
      throw new Error('Invalid historical SPY benchmark calendar or normalized NAV.');
    previous = row.date;
    return { date: row.date, value: row.value };
  });
  if (Math.abs(copy[0].value - 100) > 1e-6) throw new Error('SPY benchmark must begin at NAV 100.');
  return copy;
}

/** Three intervals of the loaded history, shortened only when there are fewer available days. */
function checkpointDays(length: number): number[] {
  const last = length - 1;
  if (!last) return [0];
  return [...new Set([Math.round(last / 3), Math.round(last * 2 / 3), last])].filter(day => day > 0);
}

function copyReceipt(receipt: ExchangeRoundReceipt): ExchangeRoundReceipt {
  return {
    startDate: receipt.startDate, endDate: receipt.endDate, startPoints: receipt.startPoints,
    finalEquity: receipt.finalEquity, pnl: receipt.pnl, returnPct: receipt.returnPct,
    benchmark: receipt.benchmark, historical: receipt.historical, caveat: receipt.caveat,
    choices: receipt.choices.map(choice => ({ ...choice })), equityTrace: receipt.equityTrace.map(point => ({ ...point })),
  };
}

export function createExchangeRound(history: ExchangeDay[], previousRun: ExchangeRoundReceipt | null = null): ExchangeRound {
  const days = validatedHistory(history);
  return {
    phase: 'ticket', history: days, day: 0, cash: EXCHANGE_INITIAL_POINTS, units: 0, targetUnits: 0, checkpoint: 0,
    choices: [], equityTrace: [{ day: 0, ...days[0], cash: EXCHANGE_INITIAL_POINTS, units: 0, equity: EXCHANGE_INITIAL_POINTS }],
    receipt: null, previousRun: previousRun ? copyReceipt(previousRun) : null, message: 'ticket-ready',
  };
}

export const roundEquity = (round: ExchangeRound): number => round.cash + round.units * round.history[round.day].value;

/** Pure phase transitions. The controller separately validates physical contacts and action tokens. */
export function reduceExchangeRound(round: ExchangeRound, action: ExchangeRoundAction): ExchangeRound {
  switch (action.type) {
    case 'insert':
      return round.phase === 'ticket' ? { ...round, phase: 'selecting', message: 'select-target' } : round;
    case 'target':
      if (round.phase !== 'selecting') return round;
      if (!Number.isInteger(action.units) || action.units < 0 || action.units > EXCHANGE_POSITION_LIMIT || action.units % EXCHANGE_LOT !== 0)
        return round.message === 'invalid-target' ? round : { ...round, message: 'invalid-target' };
      return round.targetUnits === action.units && round.message === 'select-target' ? round
        : { ...round, targetUnits: action.units, message: 'select-target' };
    case 'seal':
      return round.phase === 'selecting' ? { ...round, phase: 'sealed', message: 'sealed' } : round;
    case 'ring': {
      if (round.phase !== 'sealed') return round;
      const current = round.history[round.day], deltaUnits = round.targetUnits - round.units;
      const remainingCash = round.cash - deltaUnits * current.value;
      // Reject the complete rebalance; no partial lots or future NAV are used to make it affordable.
      if (remainingCash < -1e-8) return { ...round, phase: 'selecting', message: 'insufficient' };
      const cash = Math.max(0, remainingCash), units = round.targetUnits;
      const destinations = checkpointDays(round.history.length), throughDay = destinations[round.checkpoint];
      const points: ExchangeEquityPoint[] = [];
      for (let day = round.day; day <= throughDay; day++) {
        const row = round.history[day];
        points.push({ day, ...row, cash, units, equity: cash + units * row.value });
      }
      const checkpoint = round.checkpoint + 1, equityAfter = cash + units * round.history[throughDay].value;
      const choice: ExchangeRoundChoice = {
        checkpoint, day: round.day, date: current.date, value: current.value, fromUnits: round.units, units, deltaUnits,
        cashBefore: round.cash, cashAfter: cash, equityBefore: roundEquity(round),
        throughDay, throughDate: round.history[throughDay].date, equityAfter,
      };
      const finished = checkpoint === destinations.length;
      return {
        ...round, phase: finished ? 'clearing' : 'selecting', day: throughDay, cash, units, checkpoint,
        choices: [...round.choices, choice],
        // Replace only the current day's exposure; keep one mark for every historical date visited.
        equityTrace: [...round.equityTrace.slice(0, -1), ...points],
        message: finished ? 'collect-receipt' : 'segment-complete',
      };
    }
    case 'collect': {
      if (round.phase !== 'clearing') return round;
      const finalEquity = roundEquity(round), pnl = finalEquity - EXCHANGE_INITIAL_POINTS;
      const receipt: ExchangeRoundReceipt = {
        startDate: round.history[0].date, endDate: round.history[round.day].date, startPoints: EXCHANGE_INITIAL_POINTS,
        finalEquity, pnl, returnPct: pnl / EXCHANGE_INITIAL_POINTS * 100, benchmark: 'SPY', historical: true, caveat: CAVEAT,
        choices: round.choices.map(choice => ({ ...choice })), equityTrace: round.equityTrace.map(point => ({ ...point })),
      };
      return { ...round, phase: 'complete', receipt, message: 'complete' };
    }
    case 'replay':
      return round.phase === 'complete' && round.receipt ? createExchangeRound(round.history, round.receipt) : round;
    default:
      return round;
  }
}
