import { IBD_ALL_CLEAR } from './ibd-cases.ts';
import type { IbdItem } from './ibd-model.ts';
import type { IbdStockKey } from './ibd-yard-layout.ts';

export interface IbdStockState {
  /** Original B carton remains in quarantine after this first transfer. */
  originalReturned:boolean;
  requested:boolean;
  assigned:IbdStockKey|null;
}
export const createIbdStock=():IbdStockState=>({originalReturned:false,requested:false,assigned:null});
/** Fictional goods have stable identities for a visit. Labels alone never disclose the mismatch. */
export function ibdStockItem(round:number,caseIndex:number,key:IbdStockKey):IbdItem {
  const base=IBD_ALL_CLEAR.items.find(i=>i.id==='parts-b')!;
  const correctLeft=(round+caseIndex)%2===0;
  const specId=(key==='stock-a')===correctLeft?'M8':'M6';
  return {...base,id:`reserve:${round}:${key}`,specId,
    package:{...base.package!,outerId:`reserve-carton:${round}:${key}`}};
}
