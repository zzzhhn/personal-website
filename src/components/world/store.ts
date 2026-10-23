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
  /** v4 adds the north ridge and the open shore (west / south beach). */
  zone: 'camp' | 'town' | 'park' | 'ridge' | 'shore';
  position: Vec3;
  ready: boolean;
  /** Camera preset: 0 near, 1 mid, 2 far (third person), 3 first person; scroll zoom is continuous. */
  zoom: 0 | 1 | 2 | 3;
  quality: 'balanced' | 'high';
  shot: string | null;
}
export const useWorldStore = create<WorldState>(() => ({
  lang: 'en', light: 'dusk', paused: false, activeVehicle: null, nearbyVehicle: null,
  canRecover: false, recoverRequest: 0, speed: 0, zone: 'camp', position: [-42, 5, 30],
  ready: false, zoom: 1, quality: 'high', shot: null,
}));
