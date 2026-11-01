import { useWorldStore } from '../store';
import { useWorldAudioSettings, worldAudioLevel } from '../world-audio-settings';
import { attractionRide } from './attraction-ride';
import { intentRideClock, useIntentStore } from './intent-state';
import { COASTER_DURATION, COASTER_LENGTH, coasterDistanceAt, coasterPhase } from './coaster-track';

type Phase = ReturnType<typeof coasterPhase>;
type Channel = 'chain' | 'wind' | 'rail';
export type CoasterSoundMotion = { eligible: boolean; riding: boolean; speed: number; phase: Phase };
const CHANNELS: Channel[] = ['chain', 'wind', 'rail'];
const SAMPLE_RATE = 24000;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Derivative of the same distance curve used to place the train, in world metres/second. */
export function coasterSoundSpeed(seconds: number) {
  if (!Number.isFinite(seconds)) return 0;
  const lo = clamp(seconds - .02, 0, COASTER_DURATION), hi = clamp(seconds + .02, 0, COASTER_DURATION);
  return hi > lo ? Math.max(0, (coasterDistanceAt(hi) - coasterDistanceAt(lo)) * COASTER_LENGTH / (hi - lo)) : 0;
}
export function readCoasterSoundMotion(): CoasterSoundMotion {
  const s = useIntentStore.getState(), w = useWorldStore.getState();
  const riding = s.riding && attractionRide.active && attractionRide.transition?.phase === 'riding'
    && intentRideClock.riding && intentRideClock.revision === attractionRide.revision;
  return { eligible: s.active && (s.riding || w.nearbyInteract?.id === 'intent-board'), riding,
    speed: riding ? coasterSoundSpeed(intentRideClock.elapsed) : 0, phase: coasterPhase(intentRideClock.elapsed) };
}
export function coasterSoundPlan(speed: number, phase: Phase) {
  const v = Number.isFinite(speed) ? clamp(speed, 0, 90) : 0;
  const motion = clamp(v / 35, 0, 1), air = clamp((v - 3) / 42, 0, 1);
  // PCM textures already have low RMS; compensate locally for texture/filter
  // attenuation. The filtered mix is calibrated in the offline regression test.
  return {
    chain: { gain: phase === 'lift' ? 1.2 * clamp(v / 4, 0, 1) : 0, rate: clamp(v / 4, .25, 2.5), cutoff: 1700 },
    wind: { gain: air ** 1.5, rate: 1, cutoff: 550 + 2600 * air },
    rail: { gain: 1.8 * Math.sqrt(motion), rate: clamp(.55 + v / 25, .55, 2.4),
      cutoff: phase === 'return' ? 300 + 450 * (1 - motion) : 120 + 500 * motion },
  };
}

/** Three small deterministic PCM textures. No external assets; 240,000 bytes total. */
export function renderCoasterTexture(channel: Channel) {
  const count = SAMPLE_RATE * (channel === 'chain' ? .5 : 1), fade = 384;
  const raw = new Float32Array(count + fade);
  let seed = 3181 + CHANNELS.indexOf(channel), low = 0, slow = 0;
  for (let i = 0; i < raw.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = seed / 2147483648 - 1, t = i / SAMPLE_RATE;
    low += (white - low) * .22; slow += (white - slow) * .025;
    if (channel === 'chain') {
      const tooth = t % .25;
      raw[i] = .4 * (low + .22 * Math.sin(2 * Math.PI * 348 * tooth)) * Math.exp(-tooth / .018) * Math.min(1, tooth / .0015);
    } else if (channel === 'wind') raw[i] = .32 * low;
    else {
      const joint = t % .25;
      raw[i] = .42 * slow + .12 * low * Math.exp(-joint / .022);
    }
  }
  const data = raw.slice(0, count);
  // Blend the extra continuation into the beginning to soften the periodic noise splice.
  for (let i = 0; i < fade; i++) {
    const x = i / (fade - 1), blend = x * x * (3 - 2 * x);
    data[i] = raw[count + i] * (1 - blend) + raw[i] * blend;
  }
  return data;
}

type Voice = { buffer: AudioBuffer; gain: GainNode; filter: BiquadFilterNode; source: AudioBufferSourceNode | null };
let currentSnapshot: (() => ReturnType<CoasterMotionAudio['inspect']>) | null = null;
/** Called by the visible QA readout only; never creates audio resources or schedules work. */
export function readCoasterMotionAudioSnapshot() { return currentSnapshot?.() ?? null; }
/** One gesture-created context, at most three sources, no timer or standalone RAF. */
export class CoasterMotionAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices: Voice[] = [];
  private mounted = false;
  private inactive = false;
  private blocked = false;
  private transition: Promise<void> | null = null;
  private subscriptions: (() => void)[] = [];
  private updates = 0;
  private controlUpdates = 0;
  private controlledAt = -Infinity;
  private controlledPhase: Phase | null = null;
  private controlledLevel = -1;
  private silent = true;
  private motion: CoasterSoundMotion = { eligible: false, riding: false, speed: 0, phase: 'lift' };
  private snapshot = () => this.inspect();
  constructor(private readMotion: () => CoasterSoundMotion = readCoasterSoundMotion) {}
  private pageHide = (event: PageTransitionEvent) => {
    this.inactive = true;
    if (event.persisted) this.sync(); else this.dispose();
  };
  private pageShow = () => { this.inactive = false; this.sync(); };
  private gesture = (event: Event) => {
    if (!event.isTrusted || !this.mounted || this.inactive || document.hidden || !this.readMotion().eligible || !worldAudioLevel('sfx')) return;
    this.blocked = false;
    if (!this.ctx) this.prepare();
    else this.sync();
  };
  mount() {
    if (this.mounted) return this.dispose;
    this.mounted = true; this.inactive = false;
    this.motion = this.readMotion(); currentSnapshot = this.snapshot;
    this.subscriptions.push(useWorldAudioSettings.subscribe(this.sync), useWorldStore.subscribe((s, p) => {
      if (s.paused !== p.paused || s.poolInspect !== p.poolInspect || s.shot !== p.shot || s.card !== p.card || s.activeVehicle !== p.activeVehicle) this.sync();
    }), useIntentStore.subscribe((s, p) => {
      if (s.riding !== p.riding || s.ridePhase !== p.ridePhase || s.active !== p.active) this.sync();
    }));
    for (const name of ['keydown', 'pointerdown', 'click']) window.addEventListener(name, this.gesture);
    window.addEventListener('pagehide', this.pageHide); window.addEventListener('pageshow', this.pageShow);
    document.addEventListener('visibilitychange', this.sync);
    return this.dispose;
  }
  private prepare() {
    const Ctx = window.AudioContext;
    if (!Ctx) return;
    let ctx: AudioContext;
    try { ctx = new Ctx(); } catch { this.blocked = true; return; }
    this.ctx = ctx; this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
    this.voices = CHANNELS.map(channel => {
      const data = renderCoasterTexture(channel), buffer = ctx.createBuffer(1, data.length, SAMPLE_RATE);
      buffer.getChannelData(0).set(data);
      const filter = ctx.createBiquadFilter(), gain = ctx.createGain();
      filter.type = channel === 'wind' ? 'lowpass' : 'bandpass'; filter.Q.value = channel === 'wind' ? .5 : .7;
      gain.gain.value = 0; filter.connect(gain).connect(this.master!);
      return { buffer, filter, gain, source: null };
    });
    ctx.addEventListener('statechange', this.sync);
    // Unlock during this real gesture, with no sources. Boarding may still be in progress.
    this.transition = ctx.resume().then(() => {
      if (this.ctx !== ctx) return;
      this.transition = null; this.sync();
    }).catch(() => { if (this.ctx === ctx) { this.transition = null; this.blocked = true; this.stopAll(); } });
  }
  private stop(voice: Voice) {
    if (voice.source) {
      try { voice.source.stop(); } catch { /* Context may already have closed. */ }
      voice.source.disconnect(); voice.source = null;
    }
    if (this.ctx) { voice.gain.gain.cancelScheduledValues(this.ctx.currentTime); voice.gain.gain.setValueAtTime(0, this.ctx.currentTime); }
  }
  private stopAll() {
    if (this.silent) return;
    this.silent = true;
    this.controlledAt = -Infinity;
    this.voices.forEach(v => this.stop(v));
    if (this.ctx && this.master) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime); this.master.gain.setValueAtTime(0, this.ctx.currentTime);
    }
  }
  /** May be called by the existing train frame; it never allocates an AudioContext. */
  update = () => { this.updates++; this.sync(); };
  private sync = () => {
    this.motion = this.readMotion();
    const ctx = this.ctx; if (!ctx) return;
    if (ctx.state === 'closed') { this.dispose(); return; }
    const w = useWorldStore.getState(), motion = this.motion, plan = coasterSoundPlan(motion.speed, motion.phase);
    const active = this.mounted && !this.inactive && !this.blocked && !document.hidden && !w.paused
      && !w.poolInspect && !w.shot && !w.card && !w.activeVehicle && worldAudioLevel('sfx') > 0
      && motion.eligible && motion.riding && CHANNELS.some(c => plan[c].gain > .0001);
    if (!active) this.stopAll();
    if (this.transition) return;
    if (active && ctx.state === 'running') {
      const level = worldAudioLevel('sfx');
      // AudioParam smoothing bridges these control samples. Settings and phase changes bypass the cap.
      if (ctx.currentTime - this.controlledAt < .05 && this.controlledPhase === motion.phase && this.controlledLevel === level) return;
      this.controlledAt = ctx.currentTime; this.controlledPhase = motion.phase; this.controlledLevel = level;
      this.controlUpdates++; this.silent = false;
      this.master!.gain.setTargetAtTime(.6 * level, ctx.currentTime, .04);
      this.voices.forEach((voice, index) => {
        const p = plan[CHANNELS[index]];
        if (p.gain <= .0001) { if (voice.source) this.stop(voice); return; }
        voice.gain.gain.setTargetAtTime(p.gain, ctx.currentTime, .07);
        voice.filter.frequency.setTargetAtTime(p.cutoff, ctx.currentTime, .12);
        if (!voice.source) {
          const source = ctx.createBufferSource(); source.buffer = voice.buffer; source.loop = true;
          source.playbackRate.value = p.rate; source.connect(voice.filter); source.start(); voice.source = source;
        } else voice.source.playbackRate.setTargetAtTime(p.rate, ctx.currentTime, .08);
      });
      return;
    }
    if (!active && ctx.state === 'suspended') return;
    this.transition = (active ? ctx.resume() : ctx.suspend()).then(() => {
      if (this.ctx !== ctx) return;
      this.transition = null; this.sync();
    }).catch(() => { if (this.ctx === ctx) { this.transition = null; this.blocked = true; this.stopAll(); } });
  };
  inspect() {
    return { context: this.ctx?.state ?? 'absent', sources: this.voices.filter(v => v.source).length,
      bufferBytes: this.voices.reduce((n, v) => n + v.buffer.length * v.buffer.numberOfChannels * 4, 0),
      timers: 0, mounted: this.mounted, ...this.motion, updates: this.updates, controlUpdates: this.controlUpdates };
  }
  dispose = () => {
    if (currentSnapshot === this.snapshot) currentSnapshot = null;
    this.mounted = false; this.stopAll(); this.transition = null;
    this.subscriptions.forEach(stop => stop()); this.subscriptions = [];
    for (const name of ['keydown', 'pointerdown', 'click']) window.removeEventListener(name, this.gesture);
    window.removeEventListener('pagehide', this.pageHide); window.removeEventListener('pageshow', this.pageShow);
    document.removeEventListener('visibilitychange', this.sync);
    this.voices.forEach(v => { v.filter.disconnect(); v.gain.disconnect(); }); this.voices = [];
    this.master?.disconnect(); this.master = null;
    const ctx = this.ctx; this.ctx = null;
    ctx?.removeEventListener('statechange', this.sync);
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
  };
}
