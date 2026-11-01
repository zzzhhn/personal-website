/** DEV panel bridge. A player-triggered snapshot, never a sampling loop or global browser API. */
let source: (() => unknown) | null = null;
export function setRenderReadoutSource(next: (() => unknown) | null) { source = next; }
export function readRenderSnapshot() { return source?.() ?? null; }
