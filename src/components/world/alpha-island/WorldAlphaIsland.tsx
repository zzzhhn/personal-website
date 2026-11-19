import { lazy, useEffect } from 'react';
import RegionSceneBoundary from '../RegionSceneBoundary';
import { downloadTerrainArtifact } from '../load-terrain-artifact';
import manifest from '../terrain-artifacts.generated.json';
import { useFrame } from '@react-three/fiber';
import { ALPHA_ORIGIN } from './alpha-layout';
import { alphaMaterialUniforms } from './alpha-materials';
import { alphaMotion,cancelAlphaHand } from './alpha-state';
import { localWind } from '../rides/local-wind';
import { useAlphaStore } from './alpha-state';
import { night } from '../WorldNight';
import AlphaTerrain from './AlphaTerrain';
import AlphaScenery from './AlphaScenery';
import AlphaInteractions from './AlphaInteractions';
import AlphaNature from './AlphaNature';
import AlphaCloudSea from './AlphaCloudSea';
import AlphaTransports from './transports/AlphaTransports';
import { ALPHA_TRANSPORT_ROUTES, alphaFerryRoute } from './transports/alpha-routes';
import AlphaMainlandPier from './AlphaMainlandPier';
import AlphaDebug from './AlphaDebug';
import { alphaGroundHeight as alphaHeight } from './alpha-terrain';
const AlphaWaterwheel = lazy(async () => {
  const { installWaterwheelArtifact, decodeWaterwheelArtifact } = await import('./batch2/waterwheel-artifact');
  installWaterwheelArtifact(decodeWaterwheelArtifact(await downloadTerrainArtifact(manifest.waterwheel)));
  return import('./batch2/AlphaWaterwheel');
});
const AlphaEchoCave = lazy(async () => {
  const { installCaveArtifact, decodeCaveArtifact } = await import('./batch2/cave-artifact');
  installCaveArtifact(decodeCaveArtifact(await downloadTerrainArtifact(manifest.cave)));
  return import('./batch2/AlphaEchoCave');
});

const islandTransports = [...ALPHA_TRANSPORT_ROUTES, alphaFerryRoute()];
export default function WorldAlphaIsland() {
  useFrame(() => {
    Object.assign(localWind, { center: [254,38,148], radius: 14, strength: useAlphaStore.getState().wind, direction: [1,.15] });
    alphaMaterialUniforms.night.value = night.value;
    alphaMaterialUniforms.time.value = alphaMotion.time;
  });
  useEffect(() => () => { cancelAlphaHand(); localWind.strength = 0; localWind.radius = 0; }, []);
  return <>
    <group name="alpha-island-batch2" position={ALPHA_ORIGIN}
      userData={{worldContactCounts: () => ({'alpha-personal-cairn': useAlphaStore.getState().stones})}}>
      <AlphaTerrain /><AlphaScenery /><AlphaNature /><AlphaInteractions /><AlphaCloudSea />
      <RegionSceneBoundary id="alpha-waterwheel"><AlphaWaterwheel /></RegionSceneBoundary>
      <RegionSceneBoundary id="alpha-cave"><AlphaEchoCave /></RegionSceneBoundary>
    </group>
    <AlphaMainlandPier />
    <AlphaTransports routes={islandTransports} groundHeight={alphaHeight} />
    <AlphaDebug />
  </>;
}
