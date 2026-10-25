import { create } from 'zustand';
import type { MinePoint } from './alpha-mine-state';

export interface MineManifest {
  schema: string;
  staticAsset: string; collisionAsset: string;
  veins: { id: string; level: number; socket: MinePoint; stand: MinePoint; oreRest: MinePoint }[];
  basin: { center: MinePoint; innerRadius: number; waterY: number; approach: MinePoint; impact: MinePoint };
  toolRack: { center: MinePoint; approach: MinePoint; detectorSocket: MinePoint; pickaxeSocket: MinePoint };
  route: { points: MinePoint[] };
  dynamicAssets: {
    ore: { url: string; root: string; tintMaterial: string };
    detector: { url: string; root: string }; pickaxe: { url: string; root: string };
    veins: { url: string; roots: Record<string,{ root: string; states: Record<'intact'|'cracked'|'open',string> }> };
  };
}
export const useMineManifest = create<{ manifest: MineManifest | null }>(() => ({ manifest: null }));
