import { create } from 'zustand';
import { requestMineBacktest, useMineOnline } from './alpha-mine-online.ts';
import { EXCHANGE_DATA_SEED, EXCHANGE_INITIAL_POINTS, EXCHANGE_LOT, EXCHANGE_POSITION_LIMIT, exchangeBenchmarkHistory, type ExchangeDay } from './alpha-exchange-data.ts';

export type ExchangeAction = 'buy' | 'sell' | 'next' | 'reset';
export type ExchangeMessage = 'ring-first' | 'loading' | 'opened' | 'bought' | 'sold' | 'next-day' | 'insufficient' | 'position-limit' | 'no-shares' | 'last-day' | 'reset' | 'error';
export interface ExchangeLedgerEntry { kind: ExchangeAction; date: string; units: number; value: number; cash: number }
export interface AlphaExchangeState {
  phase: 'closed' | 'loading' | 'open' | 'error'; history: ExchangeDay[]; day: number;
  cash: number; units: number; cost: number; realized: number; ledger: ExchangeLedgerEntry[];
  message: ExchangeMessage; rings: number; error: string | null;
}
const initial = (): AlphaExchangeState => ({ phase:'closed',history:[],day:0,cash:EXCHANGE_INITIAL_POINTS,units:0,cost:0,
  realized:0,ledger:[],message:'ring-first',rings:0,error:null });
export const exchangeEquity = (s: AlphaExchangeState) => s.cash + s.units * (s.history[s.day]?.value ?? 0);

/** One E press, one historical fill at the currently displayed NAV. No shorts, leverage or future fills. */
export function reduceExchange(s: AlphaExchangeState, action: ExchangeAction): AlphaExchangeState {
  if (s.phase !== 'open' || !s.history[s.day]) return { ...s,message:s.phase==='loading'?'loading':'ring-first' };
  if (action === 'reset') return { ...s,day:0,cash:EXCHANGE_INITIAL_POINTS,units:0,cost:0,realized:0,ledger:[],message:'reset' };
  if (action === 'next') return s.day >= s.history.length-1 ? { ...s,message:'last-day' } : { ...s,day:s.day+1,message:'next-day' };
  if (action !== 'buy' && action !== 'sell') return s;
  const row=s.history[s.day], amount=row.value*EXCHANGE_LOT;
  if (action==='buy' && s.units+EXCHANGE_LOT>EXCHANGE_POSITION_LIMIT) return { ...s,message:'position-limit' };
  if (action==='buy' && s.cash+1e-8<amount) return { ...s,message:'insufficient' };
  if (action==='sell' && s.units<EXCHANGE_LOT) return { ...s,message:'no-shares' };
  const buying=action==='buy',cash=s.cash+(buying?-amount:amount),units=s.units+(buying?EXCHANGE_LOT:-EXCHANGE_LOT);
  const cost=buying?s.cost+amount:s.cost*(units/s.units);
  const realized=s.realized+(buying?0:amount-s.cost/s.units*EXCHANGE_LOT);
  const entry={kind:action,date:row.date,units:EXCHANGE_LOT,value:row.value,cash};
  return { ...s,cash:Math.max(0,cash),units,cost:units?cost:0,realized,ledger:[...s.ledger,entry].slice(-6),message:buying?'bought':'sold' };
}

/** Injectable request keeps the finite-state test independent of transport. Mounting never requests. */
export function createExchangeController(readBenchmark: () => Promise<unknown>) {
  const store=create<AlphaExchangeState>(initial); let generation=0, pending:Promise<void>|null=null;
  function ring() {
    const s=store.getState();
    if(s.phase==='loading' && pending)return pending;
    if(s.phase==='open'){store.setState({rings:s.rings+1,message:'opened'});return Promise.resolve();}
    const request=++generation;store.setState({phase:'loading',message:'loading',error:null,rings:s.rings+1});
    const work=(async()=>{
      try{const history=exchangeBenchmarkHistory(await readBenchmark());if(request!==generation)return;
        store.setState({...initial(),phase:'open',history,message:'opened',rings:store.getState().rings});
      }catch(error){if(request===generation)store.setState({phase:'error',message:'error',error:error instanceof Error?error.message:'History unavailable.'});}
      finally{if(request===generation)pending=null;}
    })();pending=work;return work;
  }
  function release(){generation++;pending=null;if(store.getState().phase==='loading')store.setState({phase:'closed',message:'ring-first'});}
  return {store,ring,act:(action:ExchangeAction)=>store.setState(s=>reduceExchange(s,action)),release};
}
const exchange=createExchangeController(async()=>{
  const existing=useMineOnline.getState().factors[EXCHANGE_DATA_SEED];
  await requestMineBacktest(EXCHANGE_DATA_SEED,existing.status==='error');
  const entry=useMineOnline.getState().factors[EXCHANGE_DATA_SEED];
  if(entry.status!=='ready'||!entry.result)throw new Error(entry.error??'Historical SPY benchmark unavailable. Ring the bell to retry.');
  return entry.result;
});
export const useAlphaExchange=exchange.store;
export const ringExchange=exchange.ring;
export const actExchange=exchange.act;
/** Invalidates this scene's response listener without cancelling the quarry's shared request/cache. */
export const releaseExchange=exchange.release;
