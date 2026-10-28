import { IBD_SLOTS, ibdStation, type IbdStationId, type IbdSlot } from './ibd-yard-layout.ts';
import { yardActions, yardCase, yardItemComplete, yardItemDifferent, yardItemId, type IbdAction, type IbdActionKind, type IbdYardGame } from './ibd-yard-game.ts';
import { IBD_ALL_CLEAR } from './ibd-cases.ts';
import type { Bi, Vec3 } from '../types';

const bi = (zh: string, en: string): Bi => ({ zh, en });
export const IBD_GUIDE_PHASES = [bi('接货', 'Receive'), bi('工具', 'Tools'), bi('钢卷', 'Coils'), bi('拆箱', 'Packs'), bi('装车', 'Load'), bi('放行', 'Dispatch')];
const copy: Partial<Record<IbdActionKind, [Bi, Bi]>> = {
  brief: [bi('拿起货单', 'Pick up the manifest'), bi('走到入口左侧的白色货单旁。', 'Walk to the white manifest left of the entrance.')],
  kit: [bi('拿走检验工具', 'Collect the tools'), bi('拿走桌上的手电和卡规。', 'Take the torch and gauge from the table.')],
  scan: [bi('检查钢卷正面', 'Inspect the coil front'), bi('朝向卷号牌，读标识、量规格。', 'Face the coil tag to read and measure it.')],
  turn: [bi('转动手轮，翻看背面', 'Turn the handwheel'), bi('退到操作台外侧翻卷，等钢卷停稳。', 'Stand on the outer side of the controls to turn the coil. Wait until it stops.')],
  rear: [bi('照检刚转出的背面', 'Inspect the exposed rear'), bi('背面检查完成，这卷才算验完。', 'Check this face to finish inspecting the coil.')],
  crane: [bi('吊开前卷，露出后卷', 'Lift the front coil aside'), bi('拉吊架杆，看前卷移到左侧。', 'Use the crane lever; watch the front coil move left.')],
  weigh: [bi('按台秤，看重量', 'Read the scale'), bi('重量是线索，下一步仍要拆箱。', 'Weight is a clue. Open the carton next.')],
  open: [bi('打开箱盖', 'Open the carton'), bi('看箱盖翻开，露出四个槽位。', 'Watch the lid open and reveal four slots.')],
  contents: [bi('核对槽位里的零件', 'Check the parts in the slots'), bi('数实物，再用卡规核 M8 规格。', 'Count the parts and gauge the M8 specification.')],
  replace: [bi('换掉已确认的异常货', 'Exchange the faulty cargo'), bi('看原货退到隔离位，再检查新货。', 'Watch the original move to quarantine. Inspect its replacement.')],
  unload: [bi('先把这托卸回来', 'Unload this pallet first'), bi('看货物回到检验台，再补检查。', 'Watch it return to the bench, then finish inspection.')],
  load: [bi('拉杆，把这一托送上车', 'Load this pallet'), bi('看托盘进入车厢；空货位不算丢货。', 'Watch the pallet enter the truck, leaving its bench empty.')],
  verify: [bi('核对车内两托实货', 'Check both pallets in the truck'), bi('库存验完、两托装齐后，在闸旁核对。', 'At the gate, reconcile the checked stock and loaded pallets.')],
  release: [bi('升闸，完成这单', 'Raise the shutter to finish'), bi('看月台闸升起，本批才算发出。', 'The batch is dispatched when the shutter rises.')],
  next: [bi('这单已完成', 'Batch complete'), bi('可接下一批，也可以直接离开园区。', 'Receive another batch or leave the yard.')],
};
export interface IbdGuideStep { action: IbdAction; phase: number; title: Bi; hint: Bi }
function guideCopy(action: IbdAction): [Bi, Bi] {
  const text: [Bi, Bi] = copy[action.kind] ?? [bi('观察装置动作', 'Watch the mechanism'), bi('等动作停稳。', 'Wait until it settles.')];
  if (action.slot !== 'coil-rear') return text;
  if (action.kind === 'scan' || action.kind === 'rear') return [text[0],
    bi('沿东侧退到南端开口，再绕入后卷黄圈。', 'Follow the east aisle back to the south opening, then enter the rear-coil ring.')];
  if (action.kind === 'turn') return [text[0],
    bi('从南端开口绕出，退到操作台外侧翻卷。', 'Exit through the south opening, then turn the coil from the outer side of the controls.')];
  return text;
}
export function ibdGuidePhaseDone(game: IbdYardGame): boolean[] {
  const checked = (prefix: string) => IBD_SLOTS.filter(s => s.startsWith(prefix)).every(s => yardItemComplete(game, s) && !yardItemDifferent(game, s));
  return [game.started, game.equipped, checked('coil'), checked('parts'),
    checked('parts') && ['parts-a', 'parts-b'].every(s => game.core.loaded.includes(yardItemId(game, s as IbdSlot))), game.released];
}

/** A recommendation over real evidence, never a second tutorial state machine or an auto-completion. */
export function ibdGuideStep(game: IbdYardGame): IbdGuideStep {
  const step = (station: IbdStationId, kind: IbdActionKind, phase: number): IbdGuideStep => {
    const action = yardActions(game, station).find(a => a.kind === kind);
    if (!action) throw new Error(`IBD guide requested unavailable action ${station}/${kind}`);
    const [title, hint] = guideCopy(action);
    return { action, phase, title, hint };
  };
  if (game.released) return step('dispatch', 'next', 5);
  if (game.pending) {
    const { action } = game.pending;
    // Keep the target attached to the moving operation until it actually commits.
    const c = guideCopy(action);
    const phase = action.kind === 'brief' ? 0 : action.kind === 'kit' ? 1 : action.station.includes('dispatch') ? 5
      : ['load', 'unload'].includes(action.kind) ? 4 : action.slot?.startsWith('parts') ? 3 : 2;
    return { action, phase, title: c[0], hint: c[1] };
  }
  if (!game.started) return step('manifest', 'brief', 0);
  if (!game.equipped) return step('kit', 'kit', 1);
  for (const slot of IBD_SLOTS) {
    const id = yardItemId(game, slot), coil = slot.startsWith('coil'), phase = coil ? 2 : 3;
    const complete = yardItemComplete(game, slot), different = yardItemDifferent(game, slot);
    if (complete && !different) continue;
    if (game.core.loaded.includes(id)) return step(slot === 'parts-a' ? 'truck-a' : 'truck-b', 'unload', 4);
    if (slot === 'coil-rear' && !game.core.moved.includes(yardItemId(game, 'coil-front')))
      return step('crane', 'crane', 2);
    if (different) return step(slot, 'replace', phase);
    if (coil) {
      if (!(game.core.proofs[id] ?? []).includes('quality-front')) return step(slot, 'scan', phase);
      if (!game.core.turned.includes(id)) return step(slot === 'coil-front' ? 'turn-front' : 'turn-rear', 'turn', phase);
      return step(slot, 'rear', phase);
    }
    // A player who already opened a carton is never sent backwards to an optional weighing step.
    if (!game.core.opened.includes(id)) {
      if (!game.core.weighed.includes(id)) return step(slot === 'parts-a' ? 'scale-a' : 'scale-b', 'weigh', phase);
      return step(slot, 'open', phase);
    }
    return step(slot, 'contents', phase);
  }
  for (const slot of ['parts-a', 'parts-b'] as IbdSlot[]) if (!game.core.loaded.includes(yardItemId(game, slot)))
    return step(slot === 'parts-a' ? 'load-a' : 'load-b', 'load', 4);
  return step('dispatch', game.core.shipmentConfirmed ? 'release' : 'verify', 5);
}

/** Ground-level breadcrumb branches follow the open central aisle, never cut through a bench or coil. */
export function ibdGuideRoute(game: IbdYardGame, step = ibdGuideStep(game)): Vec3[] {
  const s = ibdStation(step.action.station, game.core.moved), [x, , z] = s.at;
  const at = (xx: number, zz: number): Vec3 => [xx, .13, zz];
  if (s.id === 'manifest') return [at(0, 31), at(0, 27), at(x, z)];
  if (s.id === 'kit') return [at(0, 27), at(0, 20), at(x, z)];
  if (s.id === 'dispatch' || s.id.startsWith('truck')) return [at(0, 23), at(0, z), at(x, z)];
  if (s.id.startsWith('turn')) return [at(0, 20), at(0, 3), at(-7, 3), at(-7, z), at(x, z)];
  if (x < 0) return [at(0, 20), at(0, 3), at(x, 1), at(x, z)];
  const aisle = s.id === 'scale-a' || s.id === 'load-a' ? 6 : s.id === 'scale-b' || s.id === 'load-b' ? 23 : 14;
  return [at(0, 20), at(0, 2), at(aisle, 2), at(aisle, z), at(x, z)];
}

/** Join the main trail at the open south end instead of directing a lateral crossing of the guard. */
export function ibdGuideReturnRoute(game: IbdYardGame, step = ibdGuideStep(game)): Vec3[] {
  if (step.action.slot !== 'coil-rear') return [];
  const at = (x: number, z: number): Vec3 => [x, .13, z];
  if (step.action.kind === 'scan' || step.action.kind === 'rear') return [at(-8, -8), at(-7, -8), at(-7, 1), at(-12, 1)];
  if (step.action.kind === 'turn') return [at(-12, -6.7), at(-12, 1), at(-7, 1)];
  return [];
}

export function ibdGuideResult(game: IbdYardGame): Bi {
  if (game.pending) return bi('', '');
  const slot = game.completedAction?.slot;
  if (game.notice === 'turn' && slot === 'coil-rear')
    return bi('钢卷已翻转，从南端开口绕回黄圈。', 'Coil turned. Return to the ring through the south opening.');
  if (slot && ['contents', 'difference-observed'].includes(game.notice)) {
    const id = yardItemId(game, slot), item = yardCase(game).items.find(i => i.id === id)!;
    const expected = IBD_ALL_CLEAR.items.find(i => i.id === slot)!, proof = game.core.proofs[id] ?? [];
    const label = ({ 'coil-front': bi('前卷', 'Front coil'), 'coil-rear': bi('后卷', 'Rear coil'),
      'parts-a': bi('A 箱', 'Pack A'), 'parts-b': bi('B 箱', 'Pack B') })[slot];
    if (proof.includes('quantity') && item.quantity !== expected.quantity)
      return bi(`${label.zh}实点 ${item.quantity} 件，应有 ${expected.quantity} 件。退换后再检。`, `${label.en}: ${item.quantity} pieces counted; ${expected.quantity} required. Exchange and inspect again.`);
    if (proof.includes('specification') && item.specId !== expected.specId)
      return bi(`${label.zh}实测 ${item.specId}，应为 ${expected.specId}。退换后再检。`, `${label.en}: measured ${item.specId}; ${expected.specId} required. Exchange and inspect again.`);
    if (proof.includes('quality-rear') && item.defects['quality-rear'])
      return bi(`${label.zh}背面已照见凹痕。退换后再检。`, `${label.en}: a rear dent was observed. Exchange and inspect again.`);
    if (game.notice === 'contents' && proof.includes('quantity') && proof.includes('specification'))
      return bi(`${label.zh}：${item.quantity} 件 ${item.specId}，核对一致。`, `${label.en}: ${item.quantity} ${item.specId} pieces, matching the manifest.`);
  }
  const results: Record<string, Bi> = {
    manifest: bi('本批验 2 卷钢卷、8 件 M8，只发五金。', 'This batch: inspect 2 coils and 8 M8 pieces. Ship only the parts.'), equipped: bi('工具已拿到。', 'Tools collected.'),
    scan: bi('正面已记录，背面还没看。', 'Front recorded. The rear is still unchecked.'), turn: bi('背面已转出，回到卷前照检。', 'Rear exposed. Return to the coil to inspect it.'),
    rear: bi('这一卷的两面都已记录。', 'Both coil faces recorded.'), survey: bi('高廊检查完成，两面均已记录。', 'Gallery check complete. Both faces recorded.'),
    crane: bi('前卷已移开，从南端开口绕入后卷。', 'Front coil moved. Reach the rear coil through the south opening.'), open: bi('箱盖打开了，现在核对内件。', 'Lid open. Check the contents now.'),
    contents: bi('内件数量、规格已记录。', 'Contents counted and gauged.'), load: bi('一托已进车厢。', 'One pallet is in the truck.'),
    unload: bi('货物已回检验台。', 'Cargo returned to the bench.'), replaced: bi('新货到了，需重新检查。', 'Replacement arrived. Inspect it again.'),
    'difference-observed': bi('发现实物差异，先退换。', 'Discrepancy found. Exchange this cargo.'),
    'check-clear': bi('核对一致，可以升闸。', 'Everything matches. Raise the shutter.'), released: bi('闸已升起，这单完成。', 'Shutter raised. Batch dispatched.'),
  };
  if (game.notice === 'weigh' && game.reading !== undefined) return bi(`秤上 ${game.reading.toFixed(2)} kg，接着拆箱。`, `${game.reading.toFixed(2)} kg. Open the carton next.`);
  return results[game.notice] ?? bi('', '');
}
