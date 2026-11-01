import { createCoasterStructure } from './coaster-geometry';
import { packCoasterStructure } from './coaster-structure-transfer';

// A single requested LOD, then the caller terminates this worker on every outcome.
self.onmessage = (event: MessageEvent<boolean>) => {
  try {
    const start = performance.now();
    const { packet, transfer } = packCoasterStructure(createCoasterStructure(event.data));
    self.postMessage({ packet, workerMs: performance.now() - start }, { transfer });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
