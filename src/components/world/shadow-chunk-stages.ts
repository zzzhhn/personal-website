/** Yield labels describe the work just completed, not the next unit. */
export type ShadowChunkStage = 'transform' | 'bin' | 'buffer' | 'bounds' | 'source' | 'hull-copy' | 'hull-submit' | 'hull-wait' | 'hull-hydrate' | 'validate' | 'publish';
type Summary = { phase: ShadowChunkStage; count: number; totalMs: number; maxMs: number; maxFrame: number; source: string };

/** Constant-size per-phase aggregates. A late maximum survives any number of
 * earlier units; no raw samples, scene references, or source-name histories. */
export class ShadowChunkStages {
  private rows = new Map<ShadowChunkStage, Summary>();
  record(phase: ShadowChunkStage, ms: number, frame: number, source = '') {
    let row = this.rows.get(phase);
    if (!row) { row = { phase, count: 0, totalMs: 0, maxMs: 0, maxFrame: frame, source: '' }; this.rows.set(phase, row); }
    row.count++; row.totalMs += ms;
    if (ms >= row.maxMs) { row.maxMs = ms; row.maxFrame = frame; row.source = source.slice(0, 120); }
  }
  snapshot() { return [...this.rows.values()].map(row => ({ ...row })); }
}
