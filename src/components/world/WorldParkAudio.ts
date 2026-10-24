import { useWorldStore } from './store';

/**
 * DJC exhibit background music (PRD 3.3): two procedurally synthesised loops in the same key and tempo
 * (WebAudio only, no third-party audio, nothing to license), crossfaded with an equal-power law by the
 * DJ table's crossfader. Starts on the first E press (a user gesture, so autoplay policy allows it),
 * then plays island-wide. Suspended while the world is paused or the tab is hidden.
 * Deck A "warm": soft kick on 1 and 3, brushed clap, sustained triangle pads, round sine bass.
 * Deck B "bright": four-on-the-floor kick, offbeat hats, 16th-note arpeggio over the same chords.
 */
const BPM = 92, STEP = 60 / BPM / 4, BAR = 16;
/** Am7 - Fmaj7 - Cmaj7 - G6 (MIDI). */
const CHORDS = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 64]];
const BASS = [45, 41, 48, 43];
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

class ParkAudio {
  ctx: AudioContext | null = null;
  private master!: GainNode; private deck!: [GainNode, GainNode];
  private noise!: AudioBuffer;
  private step = 0; private next = 0; private timer: number | null = null;
  private x = 0; private muted = false;
  started = false;
  /** 0 = deck A only, 1 = deck B only. */
  get crossfade() { return this.x; }
  start() {
    if (this.started) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = this.ctx = new Ctx();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.16;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.deck = [ctx.createGain(), ctx.createGain()];
    this.deck.forEach(g => g.connect(this.master));
    this.applyFade(true);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.next = ctx.currentTime + 0.1; this.started = true;
    this.timer = window.setInterval(() => this.schedule(), 25);
    useWorldStore.subscribe(s => { if (s.paused || s.shot) void ctx.suspend(); else if (!document.hidden) void ctx.resume(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) void ctx.suspend(); else if (!useWorldStore.getState().paused && !useWorldStore.getState().shot) void ctx.resume(); });
  }
  setCrossfade(x: number) { this.x = Math.max(0, Math.min(1, x)); this.applyFade(false); }
  setMuted(m: boolean) { this.muted = m; if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.16, this.ctx.currentTime, 0.1); }
  /** Current deck gains for visuals (platter speed). */
  gains(): [number, number] { return [Math.cos(this.x * Math.PI / 2), Math.sin(this.x * Math.PI / 2)]; }
  private applyFade(now: boolean) {
    if (!this.ctx) return;
    const [a, b] = this.gains(), t = this.ctx.currentTime;
    if (now) { this.deck[0].gain.value = a; this.deck[1].gain.value = b; return; }
    this.deck[0].gain.setTargetAtTime(a, t, 0.25); this.deck[1].gain.setTargetAtTime(b, t, 0.25);
  }
  private schedule() {
    const ctx = this.ctx; if (!ctx || ctx.state !== 'running') { if (ctx) this.next = Math.max(this.next, ctx.currentTime + 0.05); return; }
    while (this.next < ctx.currentTime + 0.12) { this.play(this.step, this.next); this.step = (this.step + 1) % (BAR * 4); this.next += STEP; }
  }
  private tone(out: AudioNode, type: OscillatorType, f: number, t: number, dur: number, peak: number, attack = 0.01, cutoff = 0) {
    const ctx = this.ctx!, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    let node: AudioNode = o;
    if (cutoff) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; o.connect(lp); node = lp; }
    node.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  private kick(out: AudioNode, t: number, peak: number) {
    const ctx = this.ctx!, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.32);
  }
  private hiss(out: AudioNode, t: number, dur: number, peak: number, type: BiquadFilterType, f: number) {
    const ctx = this.ctx!, s = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise; flt.type = type; flt.frequency.value = f;
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(flt).connect(g).connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  private play(step: number, t: number) {
    const s = step % BAR, bar = Math.floor(step / BAR), chord = CHORDS[bar], [A, B] = this.deck;
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
  dispose() { if (this.timer !== null) clearInterval(this.timer); void this.ctx?.close(); }
}
export const parkAudio = new ParkAudio();
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('qa') === '1') Object.assign(window, { __parkAudio: parkAudio });
