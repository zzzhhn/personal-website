import type { Bi } from '../types';
import type { IbdActionKind, IbdYardGame } from './ibd-yard-game.ts';
const bi = (zh: string, en: string): Bi => ({ zh, en });
export const IBD_MOTION_WAIT_LABEL = {
  'path-occupied': bi('运输通道有人，请退到操作台外侧；清空后自动继续。', 'Transport lane occupied. Step to the outer side of the controls; movement resumes when clear.'),
  'player-unavailable': bi('等待人物碰撞体就绪，货物已停稳。', 'Waiting for the player collider. Cargo is held in place.'),
};
export const IBD_ACTION_LABEL: Record<IbdActionKind, Bi> = {
  brief: bi('接收本批货单', 'Receive this batch'), kit: bi('拿取检验工具', 'Take the inspection kit'),
  crane: bi('吊开前卷，露出后排', 'Lift the front coil aside'), scan: bi('读标识、量规格、照前面', 'Read, measure and inspect the front'),
  rear: bi('照检转出的背面', 'Inspect the exposed rear face'), survey: bi('使用高廊观测仪', 'Survey with the gallery scope'),
  turn: bi('转动钢卷承托台', 'Rotate the coil cradle'), weigh: bi('称重，读取线索', 'Weigh for a clue'),
  open: bi('拆开外箱、展开内托', 'Open the carton and tray'), contents: bi('核件数、卡规格、照内件', 'Count, gauge and inspect contents'),
  judge: bi('对照证据，选择现场结论', 'Compare evidence and choose a verdict'),
  load: bi('推托盘进入车厢', 'Send this pallet into the truck'), unload: bi('卸回原检验位', 'Return the pallet to inspection'),
  replace: bi('退回差异货物，换一件新货', 'Quarantine and exchange this cargo'), verify: bi('按实际装载核对运单', 'Reconcile the actual truck load'),
  'select-stock':bi('选这箱，送回 B 台','Choose this carton for bench B'),
  'return-stock':bi('退回后库，重新选箱','Return to reserve and choose again'),
  release: bi('升起月台闸，放行发货', 'Raise the shutter and release'), reset: bi('重做本批', 'Restart this batch'), next: bi('接下一批模拟货', 'Receive the next fictional batch'),
};
const messages: Record<string, Bi> = {
  welcome: bi('入口接货台领取货单。所有货物与差异均为模拟资料。', 'Receive a manifest at the entrance. All cargo and discrepancies are fictional.'),
  manifest: bi('库存目标：钢卷 2 卷、M8 五金 8 件。发货单：只发 M8 五金 8 件。左侧取工具。', 'Stock: 2 steel coils and 8 M8 pieces. Ship only the 8 M8 pieces. Collect the kit on your left.'),
  equipped: bi('手电、标识读头、卡规已备好。钢卷可以吊开查，也可以走西侧缓坡上高廊。', 'Torch, reader and gauge ready. Use the crane or walk up the west ramp to survey the coils.'),
  'inspection-stand-clear': bi('先在卷前地面站稳，并放回手上的零件，再照检钢卷。', 'Stand on the ground in front of the coil and return any held sample before inspecting.'),
  crane: bi('前卷已落在侧方检查位。后排现在露出来了。', 'The front coil is on the side inspection pad. The rear row is now exposed.'),
  scan: bi('身份、数量、规格及前面已记录。背面还需转台或高廊观测。', 'Identity, quantity, specification and front recorded. Check the rear with the turntable or gallery scope.'),
  rear: bi('背面检查已记录。', 'Rear condition recorded.'), survey: bi('高廊观测完成，卷号、数量、规格与两面外观均已记录。', 'Gallery survey complete: identity, count, specification and both faces recorded.'),
  turn: bi('承托台已转向，回到卷前用手电照检背面。', 'Cradle rotated. Return to the coil and inspect the rear with the torch.'),
  weigh: bi('称重只是线索。包装未打开，不能证明件数或质量。', 'Weight is only a clue. It cannot establish the count or condition of sealed contents.'),
  open: bi('外箱已打开。看槽位，再用卡规核规格；标签不替代内件。', 'Carton opened. Inspect the slots and gauge the parts; the printed label is not proof.'),
  contents: bi('内件数量、规格与外观已记录。', 'Contents counted, gauged and inspected.'),
  load: bi('这托货已实际装入车厢。货位上的备货不会自动算装车。', 'This pallet is now in the truck. Staged cargo never counts as loaded.'),
  unload: bi('货已卸回原位，先前发货确认已失效。可以纠正后重新装车。', 'Cargo returned; prior dispatch confirmation is invalid. Correct it and load again.'),
  'evidence-ready': bi('证据齐了。对照货单与实测记录，亲自选择结论。', 'Evidence complete. Compare the manifest and readings, then choose your verdict.'),
  'judgement-needed': bi('请在货单上选择结论；E 不会替你判断。', 'Choose a verdict on the field manifest. E does not select an answer.'),
  'judgement-missing': bi('还缺现场判断。回到未签认的货物旁，对照证据选择结论。', 'Inspection verdicts are missing. Return to the unsigned cargo and choose from its evidence.'),
  'judgement-evidence-missing': bi('先完成这件货的所有检查，再签认结论。', 'Finish every inspection for this item before choosing a verdict.'),
  'judgement-retry-matches': bi('再逐项比较实点件数和卡规读数。证据保留，可以立即重选。', 'Compare the count and gauge with both manifest entries. Evidence retained; choose again.'),
  'judgement-retry-short': bi('再数一遍槽位，将实点件数与货单件数比较。可以立即重选。', 'Recount the occupied slots and compare with the manifest quantity. Choose again.'),
  'judgement-retry-wrong-spec': bi('重点看卡规读数，再与货单规格比较。可以立即重选。', 'Look at the gauge reading and compare it with the manifest specification. Choose again.'),
  'judgement-retry-sound': bi('再看正面和背面的照检记录，是否看到损伤？可以立即重选。', 'Review both face observations for damage. Choose again.'),
  'judgement-retry-rear-damage': bi('再看背面照检记录，留意可见凹痕。可以立即重选。', 'Review the rear-face observation and its visible dent. Choose again.'),
  'judgement-clear': bi('判断已确认，这件货验收完成。', 'Verdict confirmed. This item is accepted.'),
  'judgement-different': bi('判断已确认，退换装置已解锁。', 'Verdict confirmed. The exchange controls are unlocked.'),
  replaced: bi('原货及证据已留在隔离记录。新货有新编号，尚未核验。', 'Original cargo and evidence retained in quarantine. The replacement has a new ID and needs inspection.'),
  'check-clear': bi('库存与车内实货都核对一致。现在可以升闸放行。', 'Stock and actual truck load both match. Raise the shutter to dispatch.'),
  'check-insufficient': bi('还缺检查证据。完成钢卷两面、开箱核件，再回此处核对。', 'Evidence is missing. Check both coil faces and open/count the packs, then return.'),
  'check-different': bi('核对有差异。检查货单明细；少装就补装，有异常就卸回退换。', 'Reconciliation differs. Review the manifest: load missing cargo, or unload and exchange a faulty item.'),
  released: bi('发货完成。原始异常记录仍保留。可在此接下一批，或从南侧出口回岛。', 'Shipment released. Original findings remain recorded. Receive another batch here or leave via the south entrance.'),
  occluded: bi('前卷仍挡住后排。先吊开前卷，或从西侧缓坡登上高廊。', 'The front coil still blocks the rear. Move it with the crane, or use the west ramp and gallery.'),
  'turn-or-change-view': bi('这个位置看不到背面。使用转台，或上高廊换角度。', 'The rear face is hidden here. Rotate the cradle or change viewpoint on the gallery.'),
  'front-first': bi('先在钢卷前检验朝外的一面，再转台翻看背面。', 'Inspect the outward face at the coil first, then rotate it to reveal the rear.'),
  'clear-exchange-lane': bi('已证实后卷差异。先用吊架移开前卷，腾出退换通道。', 'Rear-coil discrepancy confirmed. Move the front coil with the crane to clear the exchange lane.'),
  'package-sealed': bi('先打开外箱。', 'Open the carton first.'), 'unload-first': bi('先到车厢侧面卸回此托。', 'Unload this pallet from the truck first.'),
  'out-of-reach': bi('走到装置旁再操作。', 'Walk up to the device.'), busy: bi('装置正在动作，请等它停稳。', 'The mechanism is moving. Wait until it settles.'),
  'walked-away': bi('检查中走远了，尚未记录证据。回到装置旁再试。', 'You moved away before inspection finished. Return and try again.'),
  interrupted: bi('动作已中断，未记为完成。靠近装置即可重试。', 'Action interrupted; no completion recorded. Return to the device to retry.'),
  'action-unavailable': bi('此步骤尚不可用。先接货单、取工具，或查看当前动作。', 'This step is unavailable. Receive the manifest, collect tools, or use the current action.'),
  'not-cleared': bi('库存和实际发货尚未全部核对一致。', 'Stock and actual shipment have not both cleared.'),
  'no-proven-difference': bi('没有已证实的差异，不需要换货。', 'No discrepancy has been established; no exchange is needed.'),
};
export function ibdNotice(game: IbdYardGame): Bi {
  if (game.notice.startsWith('doing-')) return IBD_ACTION_LABEL[game.notice.slice(6) as IbdActionKind] ?? messages.busy;
  const message = messages[game.notice] ?? bi('请按当前装置提示继续核验。', 'Follow the current device prompt to continue.');
  return game.notice === 'weigh' && game.reading !== undefined
    ? bi(`${game.reading.toFixed(2)} kg。${message.zh}`, `${game.reading.toFixed(2)} kg. ${message.en}`) : message;
}
