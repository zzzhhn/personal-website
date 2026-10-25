import { useWorldStore } from './store';

/**
 * DJC exhibit background music (PRD 3.3): two procedurally synthesised loops in the same key and tempo
 * (WebAudio only, no third-party audio, nothing to license), crossfaded with an equal-power law by the
 * DJ table's crossfader. Starts on the first E press (a user gesture, so autoplay policy allows it),
 * then plays island-wide. Suspended while the world is paused or the tab is hidden.
 * Deck A "warm": soft kick on 1 and 3, brushed clap, sustained triangle pads, round sine bass.
 * Deck B "bright": four-on-the-floor kick, offbeat hats, 16th-note arpeggio over the same chords.
 * Alpha event cues share the graph and wake it only until their finite voices have ended.
 */
const BPM = 92, STEP = 60 / BPM / 4, BAR = 16;
/** Am7 - Fmaj7 - Cmaj7 - G6 (MIDI). */
const CHORDS = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 64]];
const BASS = [45, 41, 48, 43];
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

export class ParkAudio {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null; private deck: [GainNode, GainNode] | null = null;
  private noise: AudioBuffer | null = null;
  private step = 0; private next = 0; private timer: number | null = null;
  private x = 0; private muted = false;
  private owners = 0; private unsubscribe: (() => void) | null = null;
  private pageInactive = false; private transitioning = false; private ticks = 0;
  private voices = new Map<AudioScheduledSourceNode, () => void>();
  private cueVoices = new Set<AudioScheduledSourceNode>();
  private pendingCue: (() => void) | null = null;
  private cueBlocked = false;
  started = false;
  /** 0 = deck A only, 1 = deck B only. */
  get crossfade() { return this.x; }
  /** The district owns the service, not an individual DJ interaction. */
  retain() {
    if (this.owners++ === 0) this.pageInactive = false;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--this.owners === 0) this.dispose();
    };
  }
  private onVisibility = () => this.sync();
  private onPageHide = (event: PageTransitionEvent) => {
    this.pageInactive = true;
    if (event.persisted) this.sync(); else this.dispose();
  };
  private onPageShow = () => { this.pageInactive = false; this.sync(); };
  private onContextState = () => this.sync();
  private onGesture = (event: Event) => { if (event.isTrusted) this.cueBlocked = false; };
  private listen() {
    if (this.unsubscribe) return;
    this.unsubscribe = useWorldStore.subscribe((s, p) => { if (s.paused !== p.paused || s.poolInspect !== p.poolInspect || s.shot !== p.shot) this.sync(); });
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('pageshow', this.onPageShow);
    window.addEventListener('keydown', this.onGesture); window.addEventListener('pointerdown', this.onGesture);
  }
  private available() {
    const s = useWorldStore.getState();
    return this.owners > 0 && !this.pageInactive && !document.hidden && !s.paused && !s.poolInspect && !s.shot;
  }
  private canRun() { return this.available() && !this.muted && (this.started || !!this.pendingCue || this.cueVoices.size > 0); }
  private stopTimer() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }
  private startTimer() {
    if (this.timer !== null || !this.started || !this.ctx || this.ctx.state !== 'running' || !this.canRun()) return;
    this.next = Math.max(this.next, this.ctx.currentTime + 0.05);
    this.timer = window.setInterval(() => this.schedule(), 25);
  }
  private sync() {
    const ctx = this.ctx; if (!ctx) return;
    if (ctx.state === 'closed') { this.dispose(); return; }
    if (!this.available() || this.muted) this.clearCues();
    const running = this.canRun();
    if (!running || ctx.state !== 'running') this.stopTimer();
    if (this.transitioning) return;
    if (running && ctx.state === 'running') { this.flushCue(); this.startTimer(); return; }
    if (!running && ctx.state === 'suspended') return;
    // Serialize transitions. A pause/unmount can arrive before resume resolves.
    this.transitioning = true;
    void (running ? ctx.resume() : ctx.suspend()).then(() => {
      if (this.ctx !== ctx) return;
      this.transitioning = false;
      this.cueBlocked = false;
      if (this.canRun() !== running) this.sync();
      else if (running && ctx.state === 'running') { this.flushCue(); this.startTimer(); }
    }).catch(() => {
      if (this.ctx !== ctx) return;
      this.transitioning = false;
      this.pendingCue = null;
      this.cueBlocked = true;
      this.stopTimer(); // Retry only on another gesture/state change, not a busy loop.
    });
  }
  start() {
    if (!this.owners) return;
    this.cueBlocked = false;
    this.listen();
    if (this.started) { this.sync(); return; }
    if (!this.available() || !this.ensureContext()) return;
    this.next = this.ctx!.currentTime + 0.1; this.started = true;
    this.sync();
  }
  private ensureContext() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = this.ctx = new Ctx();
    ctx.addEventListener('statechange', this.onContextState);
    const master = this.master = ctx.createGain(); master.gain.value = this.muted ? 0 : 0.16;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    master.connect(comp).connect(ctx.destination);
    this.deck = [ctx.createGain(), ctx.createGain()];
    this.deck.forEach(g => g.connect(master));
    this.applyFade(true);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  /** Finite Alpha events. Does not start the DJ loop; calls during pause/mute are discarded. */
  cue(kind: 'scan' | 'strike' | 'splash', intensity = 1) {
    const level = Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity)) : 0;
    const cost = kind === 'strike' ? 2 : 1;
    if (!level || !this.available() || this.muted || this.cueBlocked || this.cueVoices.size + cost > 8) return;
    this.listen();
    if (!this.ensureContext()) return;
    // At most the latest event waits for resume, never a queue of missed physics steps.
    const requestedAt = performance.now();
    this.pendingCue = () => {
      if (performance.now() - requestedAt > 250) return;
      const t = this.ctx!.currentTime + 0.005, out = this.master!;
      if (kind === 'scan') this.tone(out, 'sine', 980, t, 0.09, 0.24 * level, 0.007, 0, true);
      else if (kind === 'strike') {
        this.tone(out, 'triangle', 1600, t, 0.055, 0.3 * level, 0.002, 5000, true);
        this.hiss(out, t, 0.045, 0.17 * level, 'highpass', 1800, true);
      } else this.hiss(out, t, 0.32, 0.2 * level, 'lowpass', 950, true, 0.025);
    };
    this.sync();
  }
  private flushCue() {
    const cue = this.pendingCue; this.pendingCue = null; cue?.();
    if (!this.canRun()) this.sync(); // An expired event must not leave an idle context running.
  }
  private clearCues() {
    this.pendingCue = null;
    const sources = [...this.cueVoices]; this.cueVoices.clear();
    for (const source of sources) { try { source.stop(); } catch { /* Already ended. */ } this.voices.get(source)?.(); }
  }
  setCrossfade(x: number) { this.x = Math.max(0, Math.min(1, x)); this.applyFade(false); }
  setMuted(m: boolean) { this.muted = m; if (this.ctx && this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.16, this.ctx.currentTime, 0.1); this.sync(); }
  /** Current deck gains for visuals (platter speed). */
  gains(): [number, number] { return [Math.cos(this.x * Math.PI / 2), Math.sin(this.x * Math.PI / 2)]; }
  private applyFade(now: boolean) {
    if (!this.ctx || !this.deck) return;
    const [a, b] = this.gains(), t = this.ctx.currentTime;
    if (now) { this.deck[0].gain.value = a; this.deck[1].gain.value = b; return; }
    this.deck[0].gain.setTargetAtTime(a, t, 0.25); this.deck[1].gain.setTargetAtTime(b, t, 0.25);
  }
  private schedule() {
    this.ticks++;
    const ctx = this.ctx; if (!this.started || !ctx || ctx.state !== 'running' || !this.canRun()) { this.sync(); return; }
    // A late main-thread task skips the gap instead of synthesizing a backlog.
    if (this.next < ctx.currentTime) this.next = ctx.currentTime + 0.05;
    while (this.next < ctx.currentTime + 0.12) { this.play(this.step, this.next); this.step = (this.step + 1) % (BAR * 4); this.next += STEP; }
  }
  private ownVoice(source: AudioScheduledSourceNode, nodes: AudioNode[], cue = false) {
    if (cue) this.cueVoices.add(source);
    const release = () => {
      source.onended = null; source.disconnect(); nodes.forEach(n => n.disconnect()); this.voices.delete(source);
      if (this.cueVoices.delete(source)) this.sync();
    };
    this.voices.set(source, release); source.onended = release;
  }
  private tone(out: AudioNode, type: OscillatorType, f: number, t: number, dur: number, peak: number, attack = 0.01, cutoff = 0, cue = false) {
    const ctx = this.ctx!, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    let node: AudioNode = o; const nodes: AudioNode[] = [g];
    if (cutoff) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; o.connect(lp); node = lp; nodes.push(lp); }
    this.ownVoice(o, nodes, cue);
    node.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  private kick(out: AudioNode, t: number, peak: number) {
    const ctx = this.ctx!, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    this.ownVoice(o, [g]);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.32);
  }
  private hiss(out: AudioNode, t: number, dur: number, peak: number, type: BiquadFilterType, f: number, cue = false, attack = 0) {
    const ctx = this.ctx!, s = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise; flt.type = type; flt.frequency.value = f;
    g.gain.setValueAtTime(attack ? 0 : peak, t);
    if (attack) g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    this.ownVoice(s, [flt, g], cue);
    s.connect(flt).connect(g).connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  private play(step: number, t: number) {
    const s = step % BAR, bar = Math.floor(step / BAR), chord = CHORDS[bar], [A, B] = this.deck!;
    // Deck A: warm
    if (s === 0 || s === 8) this.kick(A, t, 0.7);
    if (s === 4 || s === 12) this.hiss(A, t, 0.18, 0.18, 'bandpass', 1800);
    if (s === 0) chord.forEach(m => this.tone(A, 'triangle', hz(m), t, STEP * 15, 0.07, 0.25, 1400));
    if (s === 0 || s === 6 || s === 10) this.tone(A, 'sine', hz(BASS[bar] - 12), t, STEP * 3.5, 0.32, 0.01);
    if (s === 14) this.tone(A, 'sine', hz(chord[3] + 12), t, STEP * 2, 0.05, 0.01);
    // Deck B: bright
    if (s % 4 === 0) this.kick(B, t, 0.75);
    if (s % 4 === 2) this.hiss(B, t, 0.06, 0.12, 'highpass', 7000);
    const arp = [0, 1, 2, 3, 2, 1, 0, 2][s % 8];
    this.tone(B, 'square', hz(chord[arp] + 12), t, STEP * 0.9, 0.035, 0.005, 2600);
    if (s % 8 === 0 || s % 8 === 3) this.tone(B, 'sawtooth', hz(BASS[bar] - 12), t, STEP * 1.5, 0.12, 0.01, 500);
  }
  snapshot() { return { owners: this.owners, started: this.started, timer: this.timer !== null, subscribed: !!this.unsubscribe,
    state: this.ctx?.state ?? 'absent', transitioning: this.transitioning, voices: this.voices.size, ticks: this.ticks, muted: this.muted,
    cueVoices: this.cueVoices.size, cuePending: !!this.pendingCue }; }
  dispose() {
    this.stopTimer();
    this.unsubscribe?.(); this.unsubscribe = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide); window.removeEventListener('pageshow', this.onPageShow);
    window.removeEventListener('keydown', this.onGesture); window.removeEventListener('pointerdown', this.onGesture);
    const ctx = this.ctx; this.ctx = null; this.started = false; this.transitioning = false;
    this.pendingCue = null; this.cueVoices.clear(); this.cueBlocked = false;
    ctx?.removeEventListener('statechange', this.onContextState);
    for (const [source, release] of this.voices) { try { source.stop(); } catch { /* Already ended. */ } release(); }
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
    this.master = null; this.deck = null; this.noise = null; this.step = 0; this.next = 0;
  }
}
export const parkAudio = new ParkAudio();
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('qa') === '1') Object.assign(window, { __parkAudio: parkAudio });
if (import.meta.hot) import.meta.hot.dispose(() => parkAudio.dispose());
