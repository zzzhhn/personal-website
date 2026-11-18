import { useEffect, useMemo } from 'react';

/** Each mounted visual owns its private resources. React may replay setup before
 * the pending release runs, or replace the visual while its old release waits. */
export function useOwnedWorldVisual(visual: { dispose(): void }) {
  const lease = useMemo(() => ({ generation: 0 }), [visual]);
  useEffect(() => {
    const generation = ++lease.generation;
    return () => queueMicrotask(() => {
      if (lease.generation === generation) visual.dispose();
    });
  }, [lease, visual]);
}
