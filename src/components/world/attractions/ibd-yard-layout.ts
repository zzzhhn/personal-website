import { IBD_YARD } from './attraction-layout.ts';
import type { Vec3, Bi } from '../types';

export type IbdSlot = 'coil-front' | 'coil-rear' | 'parts-a' | 'parts-b';
export const IBD_SLOTS: readonly IbdSlot[] = ['coil-front', 'coil-rear', 'parts-a', 'parts-b'];
export type IbdStationId = 'manifest' | 'kit' | 'crane' | 'coil-front' | 'coil-rear' | 'turn-front' | 'turn-rear'
  | 'gallery-front' | 'gallery-rear' | 'parts-a' | 'parts-b' | 'scale-a' | 'scale-b'
  | 'load-a' | 'load-b' | 'truck-a' | 'truck-b' | 'dispatch';
export interface IbdStation { id: IbdStationId; at: Vec3; title: Bi; slot?: IbdSlot; radius: number }
const station = (id: IbdStationId, at: Vec3, zh: string, en: string, slot?: IbdSlot): IbdStation =>
  ({ id, at, title: { zh, en }, slot, radius: id.startsWith('gallery') ? 1.8 : 2.1 });
/** Local coordinates, relative to IBD_YARD.center. Interaction anchors sit on the walking side. */
export const IBD_STATIONS: readonly IbdStation[] = [
  station('manifest', [0, 1.1, 21], '接货台', 'Receiving desk'),
  station('kit', [-5, 1.1, 15], '检验工具', 'Inspection kit'),
  station('crane', [-6, 1.1, 1], '桥式吊架', 'Gantry crane'),
  station('coil-front', [-12, 1.2, -1.7], '前卷检验位', 'Front coil', 'coil-front'),
  station('coil-rear', [-12, 1.2, -6.7], '后卷检验位', 'Rear coil', 'coil-rear'),
  station('turn-front', [-8, 1.1, -3], '前卷转台', 'Front turntable', 'coil-front'),
  station('turn-rear', [-8, 1.1, -8], '后卷转台', 'Rear turntable', 'coil-rear'),
  station('gallery-front', [-6, 4.8, -3.5], '高廊前卷观测仪', 'Front survey scope', 'coil-front'),
  station('gallery-rear', [-10, 4.8, -13.5], '高廊后卷观测仪', 'Rear survey scope', 'coil-rear'),
  station('parts-a', [10, 1.1, -9.5], 'A 箱拆检台', 'Pack A inspection', 'parts-a'),
  station('parts-b', [18, 1.1, -9.5], 'B 箱拆检台', 'Pack B inspection', 'parts-b'),
  station('scale-a', [7.2, 1.1, -10.8], 'A 台秤', 'Scale A', 'parts-a'),
  station('scale-b', [21, 1.1, -10.8], 'B 台秤', 'Scale B', 'parts-b'),
  station('load-a', [7.8, 1.1, -5.8], 'A 托装车杆', 'Load pallet A', 'parts-a'),
  station('load-b', [20.2, 1.1, -5.8], 'B 托装车杆', 'Load pallet B', 'parts-b'),
  station('truck-a', [8, 1.1, 8.5], 'A 托卸货杆', 'Unload pallet A', 'parts-a'),
  station('truck-b', [8, 1.1, 16.5], 'B 托卸货杆', 'Unload pallet B', 'parts-b'),
  station('dispatch', [7, 1.1, 16.8], '发货核对闸', 'Dispatch control'),
];
export const ibdWorld = (p: readonly number[]): Vec3 =>
  [p[0] + IBD_YARD.center[0], p[1] + IBD_YARD.center[1], p[2] + IBD_YARD.center[2]];
export const ibdLocal = (p: readonly number[]): Vec3 =>
  [p[0] - IBD_YARD.center[0], p[1] - IBD_YARD.center[1], p[2] - IBD_YARD.center[2]];
export function ibdStation(id: IbdStationId, moved: readonly string[] = []): IbdStation {
  const found = IBD_STATIONS.find(s => s.id === id)!;
  return id === 'coil-front' && moved.some(s => s.startsWith('coil-front')) ? { ...found, at: [-20, 1.2, -1.7] } : found;
}
export function ibdReach(p: readonly number[], station: IbdStation): boolean {
  return Math.abs(p[1] - station.at[1]) <= 1.8 && Math.hypot(p[0] - station.at[0], p[2] - station.at[2]) <= station.radius;
}
export const IBD_CARGO_HOME: Record<IbdSlot, Vec3> = {
  'coil-front': [-12, 2.35, -4], 'coil-rear': [-12, 2.35, -9],
  'parts-a': [10, 1.1, -12], 'parts-b': [18, 1.1, -12],
};
export const IBD_TRUCK: Partial<Record<IbdSlot, Vec3>> = { 'parts-a': [16, 2, 10.5], 'parts-b': [16, 2, 14.5] };
export const IBD_MOVED_COIL: Vec3 = [-20, 2.35, -4];
export const IBD_GALLERY_HEIGHT = 4;
/** Gentle 4 m rise over 17 m. North deck joins a side gallery; both have a ground return route. */
export const IBD_RAMP = { center: [-24, 2, -5] as Vec3, length: 17, width: 2.6, rise: 4 };
