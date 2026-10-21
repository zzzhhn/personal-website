import { create } from 'zustand';
import type { Lang, Vec3, VehicleId } from './types';
interface WorldState {
  lang: Lang;
  light: 'dusk' | 'night';
  paused: boolean;
  activeVehicle: VehicleId | null;
  nearbyVehicle: VehicleId | null;
  canRecover: boolean;
  recoverRequest: number;
  speed: number;
  zone: 'camp' | 'town' | 'park';
  position: Vec3;
  ready: boolean;
  zoom: 0 | 1 | 2;
  shot: string | null;
}
export const useWorldStore = create<WorldState>(() => ({
  lang: 'en', light: 'dusk', paused: false, activeVehicle: null, nearbyVehicle: null,
  canRecover: false, recoverRequest: 0, speed: 0, zone: 'camp', position: [-42, 5, 30],
  ready: false, zoom: 1, shot: null,
}));
