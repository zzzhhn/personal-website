import { useEffect, useLayoutEffect, useMemo } from 'react';
import { useWorldStore } from '../store';
import { useIbdYardStore } from './ibd-yard-store.ts';
import { createIbdSigns } from './ibd-signs.ts';
import { sceneWorkProbe } from '../world-scene-work';

export default function WorldIbdSigns() {
  const lang = useWorldStore(s => s.lang);
  const moved = useIbdYardStore(s => s.game.core.moved);
  // Artwork changes only with language. Moving or resetting cargo keeps the same GPU resources.
  const data = useMemo(() => sceneWorkProbe.measure('ibd-signs', () =>
    createIbdSigns(document.createElement('canvas'), lang)), [lang]);
  useLayoutEffect(() => {
    sceneWorkProbe.measure('ibd-sign-position', () => data.updateMoved(moved));
  }, [data, moved]);
  useEffect(() => () => data.dispose(), [data]);
  return <mesh name="ibd-physical-sign-atlas" geometry={data.geometry} material={data.material} dispose={null} />;
}
