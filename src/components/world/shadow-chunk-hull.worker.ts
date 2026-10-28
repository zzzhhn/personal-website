import { computeShadowHull, type ShadowHullInput } from './shadow-chunk-hull';

self.onmessage = (event: MessageEvent<ShadowHullInput>) => {
  try {
    const result = computeShadowHull(event.data);
    const transfers = [result.positions.buffer, result.normals.buffer];
    if (result.wind) transfers.push(result.wind.buffer);
    self.postMessage(result, { transfer: transfers });
  } catch {
    self.postMessage({ error: 'Shadow hull computation failed' });
  }
};
