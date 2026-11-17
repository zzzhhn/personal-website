import { Component, Suspense, useEffect, type ReactNode } from 'react';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { withWorldAssetDecoder as withDecoder } from './WorldAssetDecoder';
import type { GuideMineLayer } from './WorldGuideMine';
import { useAlphaMineStore } from './alpha-mine-state';
import { ALPHA_FACTORS } from './alpha-mine-data';
import { WorldGuidePresentation } from './world-guide-presentation';
import type { GuidePresentationFactory } from './guide-presentation';

class MineAssetBoundary extends Component<{ children: ReactNode; layer: GuideMineLayer }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { this.props.layer.unloadAssets(); console.warn('[world-guide-mine] tool assets unavailable', error); }
  render() { return this.state.failed ? null : this.props.children; }
}

function GuideMineAssets({ layer }: { layer: GuideMineLayer }) {
  const gltfs = useLoader(GLTFLoader, ['/world/alpha-mine/detector.glb', '/world/alpha-mine/pickaxe.glb', '/world/alpha-mine/ore.glb'], withDecoder) as GLTF[];
  useEffect(() => {
    const root = (index: number, name: string) => {
      const node = gltfs[index].scene.getObjectByName(name);
      if (!node) throw new Error(`Alpha mine asset missing ${name} root`);
      return node;
    };
    layer.installAssets({ detector: root(0, 'detector'), pickaxe: root(1, 'pickaxe'), ore: root(2, 'ore'),
      colors: Object.fromEntries(ALPHA_FACTORS.map(f => [f.id, f.color])) as Record<(typeof ALPHA_FACTORS)[number]['id'], string> });
    return () => layer.unloadAssets();
  }, [gltfs, layer]);
  return null;
}

function WorldGuideAssets({ layer }: { layer: GuideMineLayer }) {
  const needed = useAlphaMineStore(s => s.equipped || s.carried !== null || !!s.action);
  return needed ? <MineAssetBoundary layer={layer}><Suspense fallback={null}><GuideMineAssets layer={layer} /></Suspense></MineAssetBoundary> : null;
}

export const createWorldGuidePresentation: GuidePresentationFactory = scene => {
  const presentation = new WorldGuidePresentation(scene);
  return Object.assign(presentation, { assets: <WorldGuideAssets layer={presentation.mine} /> });
};
