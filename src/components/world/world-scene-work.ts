type WorkToken = { name: string; startMs: number; lastRenderFrame: number | null };
/** One explicitly requested QA window. Uses the renderer's frame counter and the
 * same performance clock as slow-frame observations; never polls or keeps scene objects. */
export class SceneWorkProbe {
  private active = false;
  private readFrame: (() => number) | null = null;
  private samples: (WorkToken & { endMs: number; durationMs: number })[] = [];
  constructor(private now = () => performance.now()) {}
  bind(readFrame: () => number) { this.readFrame = readFrame; return () => { if (this.readFrame === readFrame) this.readFrame = null; }; }
  start() { this.samples = []; this.active = true; }
  begin(name: string): WorkToken | null {
    if (!this.active || this.samples.length >= 64) return null;
    return { name, startMs: this.now(), lastRenderFrame: this.readFrame?.() ?? null };
  }
  end(token: WorkToken | null) {
    if (!token || !this.active || this.samples.length >= 64) return;
    const endMs = this.now(); this.samples.push({ ...token, endMs, durationMs: endMs - token.startMs });
  }
  measure<T>(name: string, work: () => T): T {
    const token = this.begin(name);
    try { return work(); } finally { this.end(token); }
  }
  stop() { this.active = false; return this.samples.map(s => ({ ...s })); }
}
export const sceneWorkProbe = new SceneWorkProbe();
