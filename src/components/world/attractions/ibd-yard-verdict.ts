import { IBD_ALL_CLEAR } from './ibd-cases.ts';
import { yardCase, yardItemId, type IbdVerdict, type IbdYardGame } from './ibd-yard-game.ts';
import type { IbdSlot } from './ibd-yard-layout.ts';
import type { Bi } from '../types';

const bi = (zh: string, en: string): Bi => ({ zh, en });
export const IBD_VERDICT_LABEL: Record<IbdVerdict, Bi> = {
  matches: bi('与货单一致', 'Matches manifest'), short: bi('少件', 'Short count'), 'wrong-spec': bi('规格不符', 'Wrong specification'),
  sound: bi('两面完好', 'Both faces sound'), 'rear-damage': bi('背面损伤', 'Rear damage'),
};
/** The same unselected choices are offered for every batch and replacement. */
export function ibdVerdictOptions(slot: IbdSlot): readonly IbdVerdict[] {
  return slot.startsWith('coil') ? ['sound', 'rear-damage'] : ['matches', 'short', 'wrong-spec'];
}
/** Only proof-backed measurements are displayed, without choosing a conclusion for the player. */
export function ibdVerdictEvidence(game: IbdYardGame, slot: IbdSlot): Bi[] {
  const item = yardCase(game).items.find(i => i.id === yardItemId(game, slot))!;
  const expected = IBD_ALL_CLEAR.items.find(i => i.id === slot)!, proof = game.core.proofs[item.id] ?? [];
  const unit = item.kind === 'coil' ? bi('卷', 'coil') : bi('件', 'pieces');
  const rows = [bi(`货单：${expected.quantity} ${unit.zh}，${expected.specId}`, `Manifest: ${expected.quantity} ${unit.en}, ${expected.specId}`)];
  if (proof.includes('quantity')) rows.push(bi(`实点：${item.quantity} ${unit.zh}`, `Counted: ${item.quantity} ${unit.en}`));
  if (proof.includes('specification')) rows.push(bi(`卡规：${item.specId}`, `Gauge: ${item.specId}`));
  if (item.kind === 'coil') for (const [aspect, label] of [['quality-front', bi('正面', 'Front')], ['quality-rear', bi('背面', 'Rear')]] as const) {
    if (proof.includes(aspect)) rows.push(bi(`${label.zh}照检：${item.defects[aspect] ? '可见凹痕' : '未见损伤'}`,
      `${label.en}: ${item.defects[aspect] ? 'visible dent' : 'no damage seen'}`));
  }
  return rows;
}
