import { useWorldStore } from './store';
import { useWorldAudioSettings, worldAudioLevel } from './world-audio-settings';
import { isClubAudible, subscribeClubAudible } from './world-music-focus';
import { renderWalkMusic, renderWorkshopCandidate, WALK_RATE, type AudioCandidate } from './walk-music-candidate';

/**
 * Finite world interaction cues and a retained legacy two-loop music API (no current UI caller).
 * WebAudio synthesis only; music and cues have separate shared volume controls.
 * Deck A "warm": soft kick on 1 and 3, brushed clap, sustained triangle pads, round sine bass.
 * Deck B "bright": four-on-the-floor kick, offbeat hats, 16th-note arpeggio over the same chords.
 * Alpha event cues share the graph and wake it only until their finite voices have ended.
 */
const BPM = 92, STEP = 60 / BPM / 4, BAR = 16;
/** Am7 - Fmaj7 - Cmaj7 - G6 (MIDI). */
const CHORDS = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 64]];
const BASS = [45, 41, 48, 43];
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

export const WORKSHOP_SOUND_SECONDS = { intake: .24, route: .36, process: 2.35, success: .48, error: .4, bell: .7, unlock: .8 } as const;
export type WorkshopSound = keyof typeof WORKSHOP_SOUND_SECONDS;
export interface PcmCueHandle {
  cancel: () => void;
  setVolume: (volume: number) => void;
  readonly active: boolean;
}
/** Small deterministic mono Foley sketches, not recordings or an external music model.
 * Short attacks identify the material; space between impacts identifies the action. */
export function renderWorkshopSound(kind: WorkshopSound, sampleRate = 24000) {
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new RangeError('Unsupported sample rate');
  const samples = new Float32Array(Math.ceil(WORKSHOP_SOUND_SECONDS[kind] * sampleRate));
  let seed = 1709 + Object.keys(WORKSHOP_SOUND_SECONDS).indexOf(kind);
  const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
  const hit = (at: number, duration: number, frequency: number, gain: number, metal = false) => {
    const start = Math.round(at * sampleRate), count = Math.round(duration * sampleRate);
    for (let i = 0; i < count && start + i < samples.length; i++) {
      const t = i / sampleRate, attack = Math.min(1, t / .002), tail = Math.min(1, (count - 1 - i) / (sampleRate * .006));
      const modes = Math.sin(2 * Math.PI * frequency * t) * Math.exp(-5 * t / duration)
        + .36 * Math.sin(2 * Math.PI * frequency * (metal ? 2.14 : 2.76) * t) * Math.exp(-9 * t / duration)
        + .12 * Math.sin(2 * Math.PI * frequency * (metal ? 3.53 : 4.9) * t) * Math.exp(-16 * t / duration);
      samples[start + i] += gain * attack * tail * (modes + .2 * noise() * Math.exp(-t / .007));
    }
  };
  const rub = (at: number, duration: number, gain: number, motor = false) => {
    const start = Math.round(at * sampleRate), count = Math.round(duration * sampleRate);
    let low = 0;
    for (let i = 0; i < count && start + i < samples.length; i++) {
      const t = i / sampleRate, phase = i / count;
      low += (noise() - low) * (1 - Math.exp(-2 * Math.PI * 1100 / sampleRate));
      const envelope = Math.min(1, t / .025, (count - 1 - i) / (sampleRate * .045));
      const body = motor ? .22 * Math.sin(2 * Math.PI * (118 * t + 5 * t * t)) + .08 * Math.sin(2 * Math.PI * 247 * t) : 0;
      samples[start + i] += gain * envelope * (low + body) * (motor ? .7 + .3 * Math.cos(2 * Math.PI * 7 * t) : 1 - .6 * phase);
    }
  };
  switch (kind) {
    case 'intake': hit(0, .13, 210, .29); rub(.025, .14, .1); hit(.15, .07, 390, .12); break;
    case 'route': hit(0, .1, 155, .25); rub(.03, .22, .11); hit(.17, .1, 270, .16); hit(.28, .07, 420, .09); break;
    case 'process':
      rub(0, 2.3, .08, true);
      // Unequal intervals and a quiet gap before the result, not a metronomic alarm.
      [.08, .39, .77, 1.21, 1.55, 1.94].forEach((at, i) => hit(at, .1, 180 + i % 3 * 32, .07));
      break;
    case 'success': hit(0, .17, 392, .23); hit(.14, .29, 523.25, .24); rub(.02, .09, .055); break;
    case 'error': hit(0, .15, 205, .24); rub(.06, .26, .15); hit(.21, .14, 135, .18); break;
    case 'bell': hit(0, .64, 660, .22, true); hit(.055, .4, 990, .07, true); break;
    case 'unlock':
      hit(0, .07, 730, .12, true); rub(.045, .16, .11); hit(.12, .11, 240, .17);
      hit(.24, .47, 330, .17, true); hit(.28, .43, 495, .1, true); break;
  }
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    samples[i] *= Math.min(1, i / (sampleRate * .003), (samples.length - 1 - i) / (sampleRate * .008));
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  if (peak > .5) for (let i = 0; i < samples.length; i++) samples[i] *= .5 / peak;
  return samples;
}

export class ParkAudio {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null; private deck: [GainNode, GainNode] | null = null;
  private cueOutput: GainNode | null = null;
  private workshopBuffers = new Map<WorkshopSound, AudioBuffer>();
  private pcmBuffers = new Map<string, AudioBuffer>();
  private stopSettings: (() => void) | null = null;
  private stopClub: (() => void) | null = null;
  private candidate: AudioCandidate | null = null;
  private previewAttempted = false;
  private previewPending: { variant: AudioCandidate; at: number } | null = null;
  private previewSource: AudioBufferSourceNode | null = null;
  private previewGain: GainNode | null = null;
  private previewBuffer: { variant: AudioCandidate; buffer: AudioBuffer } | null = null;
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
    if (this.owners++ === 0) {
      this.pageInactive = false;
      const params = new URLSearchParams(window.location?.search ?? '');
      const candidate = params.get('audioCandidate');
      if (params.get('qa') === '1' && (candidate === 'a' || candidate === 'b')) {
        this.candidate = candidate;
        this.listen(); // QA opt-in only. Default mounting still allocates/subscribes nothing.
      }
    }
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
  private onGesture = (event: Event) => {
    if (!event.isTrusted) return;
    this.cueBlocked = false;
    if (this.candidate && !this.previewAttempted && this.musicEnabled()) {
      this.previewAttempted = true;
      this.previewMusic(this.candidate, event);
    }
  };
  private listen() {
    if (this.unsubscribe) return;
    this.unsubscribe = useWorldStore.subscribe((s, p) => { if (s.paused !== p.paused || s.poolInspect !== p.poolInspect || s.shot !== p.shot) this.sync(); });
    this.stopSettings = useWorldAudioSettings.subscribe(() => { this.applyFade(false); this.sync(); });
    this.stopClub = subscribeClubAudible(() => this.sync());
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('pageshow', this.onPageShow);
    window.addEventListener('keydown', this.onGesture); window.addEventListener('pointerdown', this.onGesture);
  }
  private available() {
    const s = useWorldStore.getState();
    return this.owners > 0 && !this.pageInactive && !document.hidden && !s.paused && !s.poolInspect && !s.shot;
  }
  private musicEnabled() { return this.available() && !this.muted && worldAudioLevel('music') > 0 && !isClubAudible(); }
  private cuesEnabled() { return this.available() && !this.muted && worldAudioLevel('sfx') > 0; }
  private canRun() { return (this.musicEnabled() && (this.started || !!this.previewPending || !!this.previewSource)) || (this.cuesEnabled() && (!!this.pendingCue || this.cueVoices.size > 0)); }
  private stopTimer() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }
  private startTimer() {
    if (this.timer !== null || !this.started || !this.ctx || this.ctx.state !== 'running' || !this.musicEnabled()) return;
    this.next = this.ctx.currentTime + 0.05;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }
  private sync() {
    const ctx = this.ctx; if (!ctx) return;
    if (ctx.state === 'closed') { this.dispose(); return; }
    if (!this.cuesEnabled()) this.clearCues();
    if (!this.musicEnabled()) {
      this.stopPreview();
      for (const [source, release] of this.voices) if (!this.cueVoices.has(source)) {
        try { source.stop(); } catch { /* Already ended. */ } release();
      }
      this.stopTimer();
    }
    this.updatePreviewLevel();
    const running = this.canRun();
    if (!running || ctx.state !== 'running') this.stopTimer();
    if (this.transitioning) return;
    if (running && ctx.state === 'running') { this.flushPreview(); this.flushCue(); this.startTimer(); return; }
    if (!running && ctx.state === 'suspended') return;
    // Serialize transitions. A pause/unmount can arrive before resume resolves.
    this.transitioning = true;
    void (running ? ctx.resume() : ctx.suspend()).then(() => {
      if (this.ctx !== ctx) return;
      this.transitioning = false;
      this.cueBlocked = false;
      if (this.canRun() !== running) this.sync();
      else if (running && ctx.state === 'running') { this.flushPreview(); this.flushCue(); this.startTimer(); }
    }).catch(() => {
      if (this.ctx !== ctx) return;
      this.transitioning = false;
      this.pendingCue = null;
      this.stopPreview();
      this.cueBlocked = true;
      this.stopTimer(); // Retry only on another gesture/state change, not a busy loop.
    });
  }
  /** Explicit trusted-gesture audition only. QA query starts it once; no default island BGM.
   * A pause, mute or actual Club playback cancels it. Restoration never replays the excerpt. */
  previewMusic(variant: AudioCandidate, gesture: Event) {
    if (!gesture?.isTrusted || (variant !== 'a' && variant !== 'b') || !this.musicEnabled() || this.cueBlocked || this.started) return;
    this.listen();
    if (!this.ensureContext()) return;
    this.stopPreview();
    this.previewPending = { variant, at: performance.now() };
    this.sync();
  }
  private flushPreview() {
    const pending = this.previewPending; this.previewPending = null;
    if (!pending || !this.ctx || !this.musicEnabled()) return;
    if (performance.now() - pending.at > 250) { this.sync(); return; }
    const ctx = this.ctx;
    if (this.previewBuffer?.variant !== pending.variant) {
      const channels = renderWalkMusic(pending.variant);
      const buffer = ctx.createBuffer(2, channels[0].length, WALK_RATE);
      channels.forEach((pcm, i) => buffer.getChannelData(i).set(pcm));
      this.previewBuffer = { variant: pending.variant, buffer }; // One cached excerpt, never both.
    }
    const source = this.previewSource = ctx.createBufferSource(), gain = this.previewGain = ctx.createGain();
    source.buffer = this.previewBuffer.buffer; source.loop = false;
    gain.gain.value = this.previewLevel();
    source.connect(gain).connect(this.master!);
    source.onended = () => { if (this.previewSource === source) { this.stopPreview(); this.sync(); } };
    const at = ctx.currentTime + .005; source.start(at); source.stop(at + source.buffer.duration);
  }
  private stopPreview() {
    this.previewPending = null;
    if (this.previewSource) {
      this.previewSource.onended = null;
      try { this.previewSource.stop(); } catch { /* Already ended. */ }
      this.previewSource.disconnect(); this.previewSource = null;
    }
    this.previewGain?.disconnect(); this.previewGain = null;
  }
  private previewLevel() { return worldAudioLevel('music') * .8 * (this.pendingCue || this.cueVoices.size ? .4 : 1); }
  private updatePreviewLevel() {
    if (this.ctx && this.previewGain) this.previewGain.gain.setTargetAtTime(this.previewLevel(), this.ctx.currentTime, .035);
  }
  start() {
    if (!this.owners) return;
    this.cueBlocked = false;
    this.listen();
    if (this.started) { this.sync(); return; }
    if (!this.available() || !this.ensureContext()) return;
    this.stopPreview(); // The retained legacy API and a QA excerpt never stack.
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
    this.cueOutput = ctx.createGain(); this.cueOutput.connect(master);
    this.applyFade(true);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  /** Finite Alpha events. Does not start the DJ loop; calls during pause/mute are discarded. */
  cue(kind: 'scan' | 'strike' | 'splash', intensity = 1) {
    const level = Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity)) : 0;
    const cost = kind === 'strike' ? 2 : 1;
    if (!level || !this.cuesEnabled() || this.cueBlocked || this.cueVoices.size + cost > 8) return;
    this.listen();
    if (!this.ensureContext()) return;
    // At most the latest event waits for resume, never a queue of missed physics steps.
    const requestedAt = performance.now();
    this.pendingCue = () => {
      if (performance.now() - requestedAt > 250) return;
      const t = this.ctx!.currentTime + 0.005, out = this.cueOutput!;
      if (kind === 'scan') this.tone(out, 'sine', 980, t, 0.09, 0.24 * level, 0.007, 0, true);
      else if (kind === 'strike') {
        this.tone(out, 'triangle', 1600, t, 0.055, 0.3 * level, 0.002, 5000, true);
        this.hiss(out, t, 0.045, 0.17 * level, 'highpass', 1800, true);
      } else this.hiss(out, t, 0.32, 0.2 * level, 'lowpass', 950, true, 0.025);
    };
    this.sync();
  }
  /** One finite source per action. The returned cancellation also invalidates a pending resume. */
  workshopCue(kind: WorkshopSound, intensity = .45): () => void {
    const level = Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity)) : 0;
    if (!level || !this.cuesEnabled() || this.cueBlocked || this.cueVoices.size >= 8) return () => {};
    this.listen();
    if (!this.ensureContext()) return () => {};
    const ctx = this.ctx!, requestedAt = performance.now();
    let source: AudioBufferSourceNode | null = null, cancelled = false;
    const play = () => {
      if (cancelled || this.ctx !== ctx || performance.now() - requestedAt > 250 || !this.cuesEnabled() || this.cueVoices.size >= 8) return;
      let buffer = this.workshopBuffers.get(kind);
      if (!buffer) {
        const pcm = this.candidate === 'b' && (kind === 'intake' || kind === 'bell' || kind === 'success')
          ? renderWorkshopCandidate(kind) : renderWorkshopSound(kind);
        buffer = ctx.createBuffer(1, pcm.length, 24000); buffer.getChannelData(0).set(pcm);
        this.workshopBuffers.set(kind, buffer);
      }
      source = ctx.createBufferSource(); source.buffer = buffer;
      const gain = ctx.createGain(); gain.gain.value = level;
      source.connect(gain).connect(this.cueOutput!); this.ownVoice(source, [gain], true);
      const at = ctx.currentTime + .005; source.start(at); source.stop(at + buffer.duration);
    };
    this.pendingCue = play; this.sync();
    return () => {
      cancelled = true;
      if (this.pendingCue === play) this.pendingCue = null;
      if (source) { try { source.stop(); } catch { /* Already ended. */ } this.voices.get(source)?.(); }
      this.sync();
    };
  }
  /** Finite mono material cue on the existing SFX graph. No new context/player per caller.
   * Cache is LRU-bounded to 24 keys / 1 MiB; each rendered cue is at most three seconds.
   * Cancellation and volume updates affect this handle only, including a pending resume. */
  pcmCue(key: string, render: () => Float32Array, sampleRate = 24000, intensity = 1): PcmCueHandle {
    let level = Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity)) : 0;
    const noop: PcmCueHandle = { cancel() {}, setVolume() {}, active: false };
    if (!key || key.length > 128 || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000
      || !level || !this.cuesEnabled() || this.cueBlocked || this.cueVoices.size >= 8) return noop;
    this.listen();
    if (!this.ensureContext()) return noop;
    const ctx = this.ctx!, requestedAt = performance.now(), cacheKey = `${sampleRate}:${key}`;
    let source: AudioBufferSourceNode | null = null, gain: GainNode | null = null, cancelled = false;
    const play = () => {
      if (cancelled || !level || this.ctx !== ctx || performance.now() - requestedAt > 250 || !this.cuesEnabled() || this.cueVoices.size >= 8) return;
      let buffer = this.pcmBuffers.get(cacheKey);
      if (buffer) { this.pcmBuffers.delete(cacheKey); this.pcmBuffers.set(cacheKey, buffer); }
      else {
        let pcm: Float32Array;
        try { pcm = render(); } catch { return; }
        if (!(pcm instanceof Float32Array) || !pcm.length || pcm.length > sampleRate * 3 || pcm.byteLength > 1048576
          || !pcm.every(v => Number.isFinite(v) && Math.abs(v) <= 1)) return;
        const bytes = () => [...this.pcmBuffers.values()].reduce((n, b) => n + b.length * 4, 0);
        while (this.pcmBuffers.size >= 24 || bytes() + pcm.byteLength > 1048576)
          this.pcmBuffers.delete(this.pcmBuffers.keys().next().value!);
        buffer = ctx.createBuffer(1, pcm.length, sampleRate); buffer.getChannelData(0).set(pcm); this.pcmBuffers.set(cacheKey, buffer);
      }
      source = ctx.createBufferSource(); source.buffer = buffer; source.loop = false;
      gain = ctx.createGain(); gain.gain.value = level;
      source.connect(gain).connect(this.cueOutput!); this.ownVoice(source, [gain], true);
      const at = ctx.currentTime + .005; source.start(at); source.stop(at + buffer.duration);
    };
    const cancel = () => {
      cancelled = true;
      if (this.pendingCue === play) this.pendingCue = null;
      if (source) { try { source.stop(); } catch { /* Already ended. */ } this.voices.get(source)?.(); }
      this.sync();
    };
    const owner = this;
    const handle: PcmCueHandle = { cancel,
      setVolume(volume) {
        if (cancelled || !Number.isFinite(volume)) return;
        level = Math.max(0, Math.min(1, volume));
        if (!level) { cancel(); return; }
        if (gain && source && owner.voices.has(source)) gain.gain.setTargetAtTime(level, ctx.currentTime, .02);
      },
      get active() { return !cancelled && owner.ctx === ctx && (owner.pendingCue === play || !!source && owner.voices.has(source)); },
    };
    this.pendingCue = play; this.sync();
    return handle;
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
    const [a, b] = this.gains().map(g => g * worldAudioLevel('music')), t = this.ctx.currentTime;
    if (this.cueOutput) {
      if (now) this.cueOutput.gain.value = worldAudioLevel('sfx');
      else this.cueOutput.gain.setTargetAtTime(worldAudioLevel('sfx'), t, .025);
    }
    this.updatePreviewLevel();
    if (now) { this.deck[0].gain.value = a; this.deck[1].gain.value = b; return; }
    this.deck[0].gain.setTargetAtTime(a, t, 0.25); this.deck[1].gain.setTargetAtTime(b, t, 0.25);
  }
  private schedule() {
    this.ticks++;
    const ctx = this.ctx; if (!this.started || !ctx || ctx.state !== 'running' || !this.musicEnabled()) { this.sync(); return; }
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
    cueVoices: this.cueVoices.size, cuePending: !!this.pendingCue, pcmKeys: this.pcmBuffers.size,
    pcmBytes: [...this.pcmBuffers.values()].reduce((n, b) => n + b.length * b.numberOfChannels * 4, 0),
    candidate: this.candidate, previewPlaying: !!this.previewSource, previewPending: !!this.previewPending,
    previewBytes: this.previewBuffer ? this.previewBuffer.buffer.length * this.previewBuffer.buffer.numberOfChannels * 4 : 0 }; }
  dispose() {
    this.stopTimer();
    this.unsubscribe?.(); this.unsubscribe = null;
    this.stopSettings?.(); this.stopSettings = null;
    this.stopClub?.(); this.stopClub = null;
    this.stopPreview(); this.previewBuffer = null; this.candidate = null; this.previewAttempted = false;
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide); window.removeEventListener('pageshow', this.onPageShow);
    window.removeEventListener('keydown', this.onGesture); window.removeEventListener('pointerdown', this.onGesture);
    const ctx = this.ctx; this.ctx = null; this.started = false; this.transitioning = false;
    this.pendingCue = null; this.cueVoices.clear(); this.cueBlocked = false;
    this.workshopBuffers.clear();
    this.pcmBuffers.clear();
    ctx?.removeEventListener('statechange', this.onContextState);
    for (const [source, release] of this.voices) { try { source.stop(); } catch { /* Already ended. */ } release(); }
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
    this.master = null; this.deck = null; this.cueOutput = null; this.noise = null; this.step = 0; this.next = 0;
  }
}
export const parkAudio = new ParkAudio();
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('qa') === '1') Object.assign(window, { __parkAudio: parkAudio });
if (import.meta.hot) import.meta.hot.dispose(() => parkAudio.dispose());
