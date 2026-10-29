// Explicit fixture answers for simulated players. Production guidance never selects these.
import { yardCase } from './ibd-yard-game.ts';
export function playerVerdict(game, action) {
  if (action.kind !== 'judge') return action;
  const item=yardCase(game).items.find(i=>i.id===action.itemId);
  const verdict = item.kind==='coil' ? item.defects['quality-rear']?'rear-damage':'sound'
    :item.specId!=='M8'?'wrong-spec':item.quantity<4?'short':'matches';
  return { ...action, verdict };
}
