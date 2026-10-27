import type { Vec3 } from '../types';
import type { IntentClass, IntentText } from './intent-tasks.ts';
import { coasterWorld } from './coaster-track.ts';

export const WORKSHOP_INTAKE: Vec3 = [-16, 0, 73];
export const WORKSHOP_RAIL_Y = 3.65;
export const WORKSHOP_POST_TOP = 4.45;
export const WORKSHOP_CARRIER_Y = 3.15;
export const WORKSHOP_HUB: Vec3 = [-16, WORKSHOP_RAIL_Y, 67];
export const WORKSHOP_TOOLS: { id: IntentClass; at: Vec3; label: IntentText }[] = [
  { id: 'lookup', at: [-24, 0, 65], label: { zh: '空位探照仪', en: 'Seat scanner' } },
  { id: 'plan', at: [-20, 0, 60], label: { zh: '路线编排台', en: 'Route arranger' } },
  { id: 'debug', at: [-15, 0, 59], label: { zh: '循环检修机', en: 'Loop repair' } },
  { id: 'rewrite', at: [-10, 0, 62], label: { zh: '告示改写辊', en: 'Notice rollers' } },
  { id: 'extract', at: [-8, 0, 67], label: { zh: '字段分离器', en: 'Field separator' } },
  { id: 'act', at: [-9, 0, 73], label: { zh: '预订执行杆', en: 'Booking lever' } },
];
export type WorkshopTarget = 'intake' | 'bell' | IntentClass;
export const workshopLocal = (id: WorkshopTarget): Vec3 => id === 'intake' ? WORKSHOP_INTAKE
  : id === 'bell' ? [-18.5, 0, 73] : WORKSHOP_TOOLS.find(tool => tool.id === id)!.at;
export const workshopTarget = (id: WorkshopTarget): Vec3 => {
  const [x, y, z] = workshopLocal(id); return coasterWorld([x, y + 1.3, z + 1.7]);
};
export const WORKSHOP_TARGETS: WorkshopTarget[] = ['intake', 'bell', ...WORKSHOP_TOOLS.map(tool => tool.id)];

/** Solid cabinet frames and carrier rails also stop a jumping actor and the camera. */
export function workshopColliders() {
  const colliders: { position: Vec3; half: Vec3; rotation?: Vec3 }[] = [];
  for (const [x, , z] of [WORKSHOP_INTAKE, ...WORKSHOP_TOOLS.map(tool => tool.at)]) {
    colliders.push({ position: coasterWorld([x, .68, z]), half: [1.4, .68, 1.15] });
    for (const side of [-1, 1]) colliders.push({ position: coasterWorld([x + side * 1.15, (WORKSHOP_POST_TOP + .3) / 2, z - .85]), half: [.1, (WORKSHOP_POST_TOP - .3) / 2, .1] });
    colliders.push({ position: coasterWorld([x, WORKSHOP_RAIL_Y, z - .85]), half: [1.25, .13, .13] });
    colliders.push({ position: coasterWorld([x, 2.55, z - .92]), half: [1.4, .325, .09] });
    const dx = x + 16, dz = z - .85 - 67;
    colliders.push({ position: coasterWorld([(x - 16) / 2, WORKSHOP_RAIL_Y, (z - .85 + 67) / 2]),
      half: [Math.hypot(dx, dz) / 2, .15, .15], rotation: [0, -Math.atan2(dz, dx), 0] });
  }
  colliders.push({ position: coasterWorld([-16, WORKSHOP_RAIL_Y + .23, 67]), half: [.52, .23, .52] });
  colliders.push({ position: coasterWorld([-18.5, .65, 73]), half: [.4, .65, .4] });
  return colliders;
}
