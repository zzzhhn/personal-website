import { create } from 'zustand';
import type { Lang, Vec3, VehicleId } from './types';
/** Content card opened by an interactable (rendered by WorldCards). `id` selects the content source. */
export interface WorldCard { kind: 'project' | 'experience' | 'about' | 'note'; id: string; page?: number }
/** Interactable currently in reach (prompt shown by the HUD). */
export interface NearbyInteract { id: string; label: { en: string; zh: string }; kind: string }
interface WorldState {
  lang: Lang;
  light: 'dusk' | 'night';
  paused: boolean;
  activeVehicle: VehicleId | null;
  nearbyVehicle: VehicleId | null;
  /** Nearest interactable in reach when walking (null while driving). */
  nearbyInteract: NearbyInteract | null;
  /** Open content card (Esc / E / walking away closes it). */
  card: WorldCard | null;
  /** Seated pose: the guide sits at `position` facing `yaw`; any movement key stands up. */
  seat: { id: string; position: Vec3; yaw: number } | null;
  /** Short bilingual notice (place names, hints); `at` is performance.now() ms when shown. */
  toast: { en: string; zh: string; at: number } | null;
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
  /** UI only: map waypoint (x, z), set from the Esc map; cleared on arrival. Navigation, no reward. */
  waypoint: [number, number] | null;
  /** UI only: id of the interactable chosen with Q when several are in reach (null = nearest). */
  interactPick: string | null;
}
export const useWorldStore = create<WorldState>(() => ({
  lang: 'en', light: 'dusk', paused: false, activeVehicle: null, nearbyVehicle: null, nearbyInteract: null, card: null, seat: null, toast: null,
  canRecover: false, recoverRequest: 0, speed: 0, zone: 'camp', position: [-42, 5, 30],
  ready: false, zoom: 1, quality: 'high', shot: null, waypoint: null, interactPick: null,
}));
