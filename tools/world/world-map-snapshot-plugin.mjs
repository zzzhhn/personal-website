import { ensureMapSnapshots } from './world-map-snapshot.mjs';
import { ensureTerrainArtifacts } from './build-terrain-artifacts.mjs';

/** Run before Vite reads the lightweight map import; never generate terrain in the browser. */
export function worldMapSnapshotPlugin() {
  let sources = new Set();
  let pending = Promise.resolve();
  const refresh = () => pending = pending.catch(() => {}).then(async () => {
    const terrain = await ensureTerrainArtifacts();
    const result = await ensureMapSnapshots();
    sources = new Set([...result.sources, ...terrain.sources]);
    return result;
  });
  return {
    name: 'world-map-snapshot',
    async buildStart() {
      await refresh();
      for (const file of sources) this.addWatchFile(file);
    },
    async handleHotUpdate(context) {
      if (!sources.has(context.file)) return;
      await refresh();
      // Snapshot and lightweight authored markers update together, without an intermediate old map.
      context.server.ws.send({ type: 'full-reload' });
      return [];
    },
  };
}
