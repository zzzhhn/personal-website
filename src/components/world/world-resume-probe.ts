type Method = (...args: any[]) => any;
type State = { paused: boolean; hidden: boolean; shot: string | null; poolInspect: boolean };
type Renderer = {
  render: Method; renderBufferDirect?: Method; shadowMap?: { render: Method };
  info: { render: { frame: number }; programs?: readonly unknown[] | null; memory?: { geometries: number } };
};
type Binding = { renderer: Renderer; world: { step: Method }; scene: unknown; camera: unknown; state: () => State };
type Growth = { programsAdded: number; drawCpuMs: number; pass: 'shadow' | 'other'; object: string; materialType: string; materialId: string };
type Frame = {
  index: number; entryAtMs: number; endAtMs: number | null; rawDeltaMs: number;
  state: State; lastRenderFrameAtEntry: number; lastRenderFrameAtEnd: number | null;
  worldStepCalls: number | null; worldStepCpuMs: number | null; worldStepThrew: boolean;
  firstWorldStepAtMs: number | null; lastWorldStepEndAtMs: number | null;
  rendererCalls: number; rendererCpuMs: number | null; shadowCalls: number | null; shadowCpuMs: number | null;
  firstRenderAtMs: number | null; lastRenderEndAtMs: number | null; entryToFirstRenderMs: number | null;
  programsAtEntry: number | null; programsAtEnd: number | null; programNetGrowth: number | null;
  drawGrowthEvents: number | null; drawProgramsAdded: number | null; largestGrowthDraws: Growth[];
  completion: 'rendered' | 'render-threw' | 'render-not-reached';
};
type Report = {
  status: 'idle' | 'armed' | 'complete' | 'cancelled'; reason: string; limit: 5;
  triggerAtMs: number | null; clockResetAtMs: number | null; clockResets: number; endAtMs: number | null;
  baseline: { atMs: number; state: State; lastRenderFrame: number; programs: number | null } | null;
  coverage: { worldStep: boolean; renderer: boolean; shadow: boolean; programGrowthDraws: boolean };
  unavailable: { fullPhysicsCpuMs: null; actorBeforeAfterStepCpuMs: null; reactCommitCpuMs: null; gpuMs: null };
  meanings: Record<string, string>; restorationConflicts: string[]; unattributedWorldStepCalls: number; frames: Frame[];
};
const meanings = {
  clock: 'All timestamps and CPU wall spans use performance.now; rawDeltaMs is the unchanged R3F callback delta.',
  entry: 'DEV priority -1000 useFrame entry, before default-priority physics and scene callbacks; not browser RAF entry.',
  baseline: 'Trigger-time state and counters from the previous render; no pre-trigger CPU frame was sampled.',
  worldStep: 'Actual world.step calls (fixed simulation ticks, not internal CCD/solver iterations), including Rapier and hooks invoked inside it; excludes React-Rapier before/after-step callbacks, interpolation and event processing outside world.step.',
  render: 'Sum of outermost renderer.render wall spans, inclusive of shadow rendering, JS submission and possible driver stalls; not GPU execution time.',
  shadow: 'Sum of outermost shadowMap.render spans; normally nested inside rendererCpuMs, so do not add them together.',
  growth: 'Net program count and at most 3 largest draw spans with count growth per frame; a draw span is not shader-compile-only CPU. Names are truncated to 120 characters.',
  overhead: 'This explicit five-frame probe times draw calls and perturbs timing. No per-draw log, GPU wait or continuous sampling.',
};
const emptyReport = (): Report => ({ status: 'idle', reason: '', limit: 5, triggerAtMs: null, clockResetAtMs: null, clockResets: 0, endAtMs: null,
  baseline: null, coverage: { worldStep: false, renderer: false, shadow: false, programGrowthDraws: false },
  unavailable: { fullPhysicsCpuMs: null, actorBeforeAfterStepCpuMs: null, reactCommitCpuMs: null, gpuMs: null }, meanings,
  restorationConflicts: [], unattributedWorldStepCalls: 0, frames: [] });
const name = (value: unknown) => typeof value === 'string' ? value.slice(0, 120) : '';

/** Bound only by the DEV bridge. Wrappers are installed on explicit arm and
 * removed after five frames, cancel, hide or unmount. No timer or polling. */
export class WorldResumeProbe {
  private binding: Binding | null = null;
  private report = emptyReport();
  private current: Frame | null = null;
  private restores: (() => void)[] = [];
  private renderDepth = 0;
  private shadowDepth = 0;
  constructor(private now = () => performance.now()) {}

  bind(binding: Binding) {
    this.cancel('binding-replaced'); this.binding = binding;
    return () => { if (this.binding === binding) { this.cancel('unmounted'); this.binding = null; } };
  }
  read(): Report { return structuredClone(this.report); }
  private programs() { return this.binding?.renderer.info.programs?.length ?? null; }
  private active() { return this.report.status === 'armed'; }

  arm(): { started: boolean; reason: string } {
    const b = this.binding;
    if (!b) return { started: false, reason: 'DEV runtime is not bound' };
    const state = b.state();
    if (!state.paused || state.hidden || state.shot || state.poolInspect) return { started: false, reason: 'Use the ordinary pause menu in a visible page' };
    this.cancel('rearmed'); this.report = emptyReport(); this.report.status = 'armed';
    const atMs = this.now(); this.report.triggerAtMs = atMs;
    this.report.baseline = { atMs, state: { ...state }, lastRenderFrame: b.renderer.info.render.frame, programs: this.programs() };
    this.install(b);
    if (!this.report.coverage.renderer) { this.cancel('renderer wrapper unavailable'); return { started: false, reason: this.report.reason }; }
    return { started: true, reason: '' };
  }
  clockReset() { if (this.active()) { this.report.clockResetAtMs = this.now(); this.report.clockResets++; } }
  beginFrame(deltaSeconds: number) {
    if (!this.active() || !this.binding) return;
    if (this.current) this.finishFrame('render-not-reached');
    if (!this.active()) return;
    const state = this.binding.state();
    if (state.hidden) { this.cancel('hidden'); return; }
    const c = this.report.coverage;
    this.current = { index: this.report.frames.length + 1, entryAtMs: this.now(), endAtMs: null, rawDeltaMs: deltaSeconds * 1000,
      state: { ...state }, lastRenderFrameAtEntry: this.binding.renderer.info.render.frame, lastRenderFrameAtEnd: null,
      worldStepCalls: c.worldStep ? 0 : null, worldStepCpuMs: c.worldStep ? 0 : null, worldStepThrew: false,
      firstWorldStepAtMs: null, lastWorldStepEndAtMs: null, rendererCalls: 0, rendererCpuMs: null, shadowCalls: c.shadow ? 0 : null, shadowCpuMs: c.shadow ? 0 : null,
      firstRenderAtMs: null, lastRenderEndAtMs: null, entryToFirstRenderMs: null, programsAtEntry: this.programs(), programsAtEnd: null, programNetGrowth: null,
      drawGrowthEvents: c.programGrowthDraws ? 0 : null, drawProgramsAdded: c.programGrowthDraws ? 0 : null, largestGrowthDraws: [], completion: 'render-not-reached' };
  }
  cancel(reason = 'explicit-cancel') {
    if (!this.active()) return;
    if (this.current) this.finishFrame('render-not-reached', false);
    this.stop('cancelled', reason);
  }
  private stop(status: 'complete' | 'cancelled', reason: string) {
    this.report.status = status; this.report.reason = reason; this.report.endAtMs = this.now();
    for (const restore of this.restores.splice(0).reverse()) restore();
  }
  private finishFrame(completion: Frame['completion'], autoStop = true) {
    const row = this.current; if (!row) return;
    this.current = null; row.completion = completion; row.endAtMs = this.now();
    row.lastRenderFrameAtEnd = this.binding!.renderer.info.render.frame; row.programsAtEnd = this.programs();
    if (row.programsAtEntry !== null && row.programsAtEnd !== null) row.programNetGrowth = row.programsAtEnd - row.programsAtEntry;
    this.report.frames.push(row);
    if (autoStop && (completion === 'render-threw' || this.report.frames.length >= 5)) this.stop(completion === 'render-threw' ? 'cancelled' : 'complete', completion);
  }
  private patch(target: object, key: string, wrap: (original: Method) => Method, label: string) {
    const object = target as Record<string, Method>, original = object[key];
    if (typeof original !== 'function') return false;
    const wrapper = wrap(original);
    try { object[key] = wrapper; } catch { return false; }
    if (object[key] !== wrapper) return false;
    this.restores.push(() => {
      // Never overwrite a newer wrapper owned by another diagnostic. Our retained
      // inner wrapper is inert after stop and only forwards to its original.
      if (object[key] === wrapper) {
        try { object[key] = original; } catch { this.report.restorationConflicts.push(label); }
      } else this.report.restorationConflicts.push(label);
    });
    return true;
  }
  private install(b: Binding) {
    const probe = this, report = this.report, coverage = report.coverage;
    const active = () => probe.report === report && probe.active();
    coverage.worldStep = this.patch(b.world, 'step', original => function(this: unknown, ...args: unknown[]) {
      const row = active() ? probe.current : null;
      if (!row) { if (active()) report.unattributedWorldStepCalls++; return original.apply(this, args); }
      const start = probe.now(); row.worldStepCalls!++; row.firstWorldStepAtMs ??= start;
      try { return original.apply(this, args); }
      catch (error) { row.worldStepThrew = true; throw error; }
      finally { const end = probe.now(); row.worldStepCpuMs! += end - start; row.lastWorldStepEndAtMs = end; }
    }, 'world.step');
    coverage.renderer = this.patch(b.renderer, 'render', original => function(this: unknown, ...args: unknown[]) {
      const row = active() ? probe.current : null;
      if (!row) return original.apply(this, args);
      const outer = probe.renderDepth++ === 0, main = outer && args[0] === b.scene && args[1] === b.camera;
      const start = outer ? probe.now() : 0;
      if (outer) { row.rendererCalls++; row.firstRenderAtMs ??= start; row.entryToFirstRenderMs ??= start - row.entryAtMs; }
      let threw = false;
      try { return original.apply(this, args); }
      catch (error) { threw = true; throw error; }
      finally {
        probe.renderDepth--;
        if (outer) { const end = probe.now(); row.rendererCpuMs = (row.rendererCpuMs ?? 0) + end - start; row.lastRenderEndAtMs = end; }
        if (main && probe.current === row) probe.finishFrame(threw ? 'render-threw' : 'rendered');
      }
    }, 'renderer.render');
    coverage.shadow = !!b.renderer.shadowMap && this.patch(b.renderer.shadowMap, 'render', original => function(this: unknown, ...args: unknown[]) {
      const row = active() ? probe.current : null;
      if (!row) return original.apply(this, args);
      const outer = probe.shadowDepth++ === 0, start = outer ? probe.now() : 0;
      if (outer) row.shadowCalls!++;
      try { return original.apply(this, args); }
      finally { probe.shadowDepth--; if (outer) row.shadowCpuMs! += probe.now() - start; }
    }, 'shadowMap.render');
    coverage.programGrowthDraws = this.programs() !== null && this.patch(b.renderer, 'renderBufferDirect', original => function(this: unknown, ...args: any[]) {
      const row = active() ? probe.current : null;
      if (!row) return original.apply(this, args);
      const before = probe.programs(), start = probe.now(), pass = probe.shadowDepth ? 'shadow' : 'other';
      try { return original.apply(this, args); }
      finally {
        const end = probe.now(), after = probe.programs();
        if (before !== null && after !== null && after > before) {
          const added = after - before; row.drawGrowthEvents!++; row.drawProgramsAdded! += added;
          row.largestGrowthDraws.push({ programsAdded: added, drawCpuMs: end - start, pass, object: name(args[4]?.name), materialType: name(args[3]?.type), materialId: name(args[3]?.uuid) });
          row.largestGrowthDraws.sort((a, b) => b.drawCpuMs - a.drawCpuMs); row.largestGrowthDraws.length = Math.min(row.largestGrowthDraws.length, 3);
        }
      }
    }, 'renderer.renderBufferDirect');
  }
}

export const worldResumeProbe = new WorldResumeProbe();
