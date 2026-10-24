import { DefaultLoadingManager } from 'three';
import { useWorldStore } from './store';

let attached = false;
/** Install before importing the runtime. Counts describe discovered items, never bytes or all future assets. */
export function attachLoadProgress() {
  if (attached) return;
  attached = true;
  const manager = DefaultLoadingManager;
  const previous = { start: manager.onStart, progress: manager.onProgress, load: manager.onLoad, error: manager.onError };
  const publish = (loaded: number, total: number, active: boolean) => useWorldStore.setState(s => ({
    loading: { ...s.loading, loaded, total, active, phase: s.loading.phase === 'runtime' ? 'assets' : s.loading.phase },
  }));
  manager.onStart = (url, loaded, total) => { publish(loaded, total, true); previous.start?.call(manager, url, loaded, total); };
  manager.onProgress = (url, loaded, total) => { publish(loaded, total, loaded < total); previous.progress?.call(manager, url, loaded, total); };
  // A completed batch can be followed by more discovered dependencies; it does not mean the island is ready.
  manager.onLoad = () => { useWorldStore.setState(s => ({ loading: { ...s.loading, active: false } })); previous.load?.call(manager); };
  manager.onError = url => { useWorldStore.setState(s => ({ loading: { ...s.loading, failed: s.loading.failed + 1 } })); previous.error?.call(manager, url); };
}
