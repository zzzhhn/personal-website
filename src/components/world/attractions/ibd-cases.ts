import type { IbdCase, IbdItem } from './ibd-model.ts';

// Fictional teaching fixtures, not records of a real client or an actual audit finding.
const coil = (id: string, blockedBy: readonly string[] = []): IbdItem => ({
  id, lotId: 'steel-lot', kind: 'coil', specId: 'steel-A', quantity: 1, unit: 'coil', grossKg: 1200,
  blockedBy, qualityChecks: ['quality-front', 'quality-rear'], defects: {},
});
const pack = (id: string, outerId: string, quantity = 4): IbdItem => ({
  id, lotId: 'parts-lot', kind: 'hardware-pack', specId: 'M8', quantity, unit: 'piece',
  grossKg: 1 + quantity * 0.25, blockedBy: [],
  package: { outerId, declaredUnits: 4, declaredSpecId: 'M8' },
  qualityChecks: ['quality-contents'], defects: {},
});
export const IBD_ALL_CLEAR: IbdCase = {
  id: 'all-clear-v1',
  items: [coil('coil-front'), coil('coil-rear', ['coil-front']), pack('parts-a', 'carton-a'), pack('parts-b', 'carton-b')],
  inventory: [
    { lotId: 'steel-lot', specId: 'steel-A', quantity: 2, unit: 'coil' },
    { lotId: 'parts-lot', specId: 'M8', quantity: 8, unit: 'piece' },
  ],
  waybill: [{ lotId: 'parts-lot', specId: 'M8', quantity: 8, unit: 'piece' }],
};
export const IBD_SHORT_PACK: IbdCase = {
  ...IBD_ALL_CLEAR, id: 'short-pack-v1',
  items: IBD_ALL_CLEAR.items.map(item => item.id === 'parts-b' ? pack('parts-b', 'carton-b', 3) : item),
};
export const IBD_REAR_DAMAGE: IbdCase = {
  ...IBD_ALL_CLEAR, id: 'rear-damage-v1',
  items: IBD_ALL_CLEAR.items.map(item => item.id === 'coil-rear' ?
    { ...item, defects: { 'quality-rear': 'Fictional visible dent / 游戏可见凹痕' } } : item),
};
export const IBD_WRONG_SPEC: IbdCase = {
  ...IBD_ALL_CLEAR, id: 'wrong-spec-v1',
  items: IBD_ALL_CLEAR.items.map(item => item.id === 'parts-b' ? { ...item, specId: 'M6' } : item),
};
export const IBD_CASES: readonly IbdCase[] = [IBD_ALL_CLEAR, IBD_SHORT_PACK, IBD_REAR_DAMAGE, IBD_WRONG_SPEC];
