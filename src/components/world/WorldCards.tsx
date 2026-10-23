import { useWorldStore } from './store';
import type { WorldContent } from './types';

/**
 * DOM layer for content cards and interaction prompts (owner: ui session). Reads store.card /
 * store.nearbyInteract / store.toast. Minimal placeholder until the ui session replaces it.
 */
export default function WorldCards(_props: { content: WorldContent }) {
  const nearby = useWorldStore(s => s.nearbyInteract);
  const lang = useWorldStore(s => s.lang);
  const driving = useWorldStore(s => s.activeVehicle);
  if (!nearby || driving) return null;
  return <div className="world-interact-prompt" aria-live="polite"><span>E · {nearby.label[lang]}</span></div>;
}
