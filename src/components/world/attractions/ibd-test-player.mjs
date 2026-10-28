// Explicit fixture answers for simulated players. Production guidance never selects these.
export function playerVerdict(game, action) {
  if (action.kind !== 'judge') return action;
  const fresh = action.itemId.includes(':replacement');
  const verdict = action.slot.startsWith('coil')
    ? !fresh && game.caseIndex === 2 && action.slot === 'coil-rear' ? 'rear-damage' : 'sound'
    : !fresh && action.slot === 'parts-b' && game.caseIndex === 1 ? 'short'
      : !fresh && action.slot === 'parts-b' && game.caseIndex === 3 ? 'wrong-spec' : 'matches';
  return { ...action, verdict };
}
