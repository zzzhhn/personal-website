import { useSyncExternalStore } from 'react';
import { useWorldStore } from './store';
import { useWorldAudioSettings, worldAudioLevel } from './world-audio-settings';
import { setClubAudible } from './world-music-focus';

export const CLUB_TRACKS = [
  { title: 'Backbay Lounge', genre: 'Lounge', bpm: 118, url: '/assets/world/club/audio/backbay-lounge-club.mp3' },
  { title: 'Disco con Tutti', genre: 'Disco', bpm: 118, url: '/assets/world/club/audio/disco-con-tutti-club.mp3' },
] as const;
export const CLUB_BPM = 118;
const LOOP_SECONDS = 64 * 60 / CLUB_BPM;
const AUDIBLE_GAIN = .001;
export function clubMixPlan(beat: number, from: 0 | 1) {
  const start = Math.ceil((beat + .15) / 4) * 4;
  return { from, to: (1 - from) as 0 | 1, start, fade: start + 4, end: start + 8 };
}
export function clubPerformanceCrossfade(plan: ReturnType<typeof clubMixPlan>, beat: number) {
  const progress = Math.max(0, Math.min(1, (beat - plan.fade) / (plan.end - plan.fade)));
  return plan.from + (plan.to - plan.from) * progress;
}
export const clubGains = (x: number) => [Math.cos(Math.max(0, Math.min(1, x)) * Math.PI / 2), Math.sin(Math.max(0, Math.min(1, x)) * Math.PI / 2)];
type Deck = { node: AudioBufferSourceNode | null; gain: GainNode; filter: BiquadFilterNode; buffer: AudioBuffer | null; offset: number; at: number; playing: boolean };
type Snapshot = { phase: 'off' | 'loading' | 'ready' | 'error'; playing: readonly boolean[]; crossfade: number; volume: number; filter: number; muted: boolean;
  performance: 'idle' | 'queued' | 'build' | 'landed'; beatsLeft: number };

/** Two finite buffers, one context, no scheduling timer/worker/analyser.
 * Keep mixed decks in phase; suspend when the whole manual mix is silent. */
export class ClubAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private decks: Deck[] = [];
  private listeners = new Set<() => void>();
  private owners = 0;
  private stopStore: (() => void) | null = null;
  private stopSettings: (() => void) | null = null;
  private abort: AbortController | null = null;
  private load: Promise<void> | null = null;
  private distance = 0;
  private blocked = false;
  private pageInactive = false;
  private transition: Promise<void> | null = null;
  private transportOrigin = 0;
  private performance: ReturnType<typeof clubMixPlan> | null = null;
  private lastBeat = -1;
  private landedUntil = -1;
  private snapshot: Snapshot = { phase: 'off', playing: [false, false], crossfade: 0, volume: .55, filter: 1, muted: false, performance: 'idle', beatsLeft: 0 };
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  read = () => this.snapshot;
  private publish(patch: Partial<Snapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach(fn => fn()); }
  private allowed() { const s = useWorldStore.getState(); return this.owners > 0 && !this.pageInactive && !document.hidden && !s.paused && !s.poolInspect && !s.shot && this.distance > AUDIBLE_GAIN && !this.snapshot.muted && this.snapshot.volume > 0 && worldAudioLevel('music') > 0 && !this.blocked; }
  private pageHide = (event: PageTransitionEvent) => { this.pageInactive = true; if (event.persisted) this.sync(); else this.dispose(); };
  private pageShow = () => { this.pageInactive = false; this.sync(); };
  private contextState = () => this.sync();
  retain() {
    if (++this.owners === 1) {
      this.pageInactive = false;
      this.stopStore = useWorldStore.subscribe((s, p) => { if (s.paused !== p.paused || s.poolInspect !== p.poolInspect || s.shot !== p.shot) this.sync(); });
      this.stopSettings = useWorldAudioSettings.subscribe(() => { this.updateLevels(); this.sync(); });
      document.addEventListener('visibilitychange', this.sync);
      window.addEventListener('pagehide', this.pageHide);
      window.addEventListener('pageshow', this.pageShow);
    }
    let released = false;
    return () => { if (!released) { released = true; if (--this.owners === 0) this.dispose(); } };
  }
  private position(d: Deck) { return d.buffer ? (d.offset + (d.node && this.ctx ? Math.max(0, this.ctx.currentTime - d.at) : 0)) % Math.min(LOOP_SECONDS, d.buffer.duration) : 0; }
  private stop(d: Deck) { if (!d.node) return; d.offset = this.position(d); d.node.onended = null; d.node.stop(); d.node.disconnect(); d.node = null; }
  private start(d: Deck) {
    if (!this.ctx || !d.buffer || d.node || !d.playing) return;
    const node = this.ctx.createBufferSource(); node.buffer = d.buffer; node.loop = true; node.loopEnd = Math.min(LOOP_SECONDS, d.buffer.duration); node.connect(d.filter);
    d.node = node; d.at = this.ctx.currentTime; node.start(0, d.offset);
  }
  private notifyAudibility() {
    const x = this.performance ? clubPerformanceCrossfade(this.performance, this.beat()) : this.snapshot.crossfade;
    const gains = clubGains(x);
    setClubAudible(this, !!this.ctx && this.ctx.state === 'running' && this.allowed()
      && this.decks.some((d, i) => d.node && gains[i] * this.snapshot.volume * this.distance * worldAudioLevel('music') > AUDIBLE_GAIN));
  }
  sync = () => {
    const ctx = this.ctx; if (!ctx) return;
    const gains = clubGains(this.snapshot.crossfade);
    // A queued transition needs its musical clock even before the next deck fades in.
    const active = this.allowed() && this.snapshot.phase === 'ready'
      && this.decks.some((d, i) => d.playing && (this.performance !== null || gains[i] > AUDIBLE_GAIN));
    if (!active) this.decks.forEach(d => this.stop(d));
    this.notifyAudibility();
    if (this.transition || ctx.state === 'closed') return;
    if (active && ctx.state === 'running') { this.decks.forEach(d => this.start(d)); this.notifyAudibility(); return; }
    if (!active && ctx.state === 'suspended') return;
    this.transition = (active ? ctx.resume() : ctx.suspend()).then(() => {
      if (this.ctx !== ctx) return;
      this.transition = null; this.sync();
    }).catch(() => {
      if (this.ctx !== ctx) return;
      this.transition = null; this.blocked = true; this.publish({ phase: 'error' });
    });
  };
  async enable() {
    if (!this.owners) return;
    this.blocked = false;
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
      if (!Ctx) { this.publish({phase:'error'}); return; }
      try { this.ctx = new Ctx({ sampleRate: 24000 }); } catch { this.ctx = new Ctx(); }
      this.ctx.addEventListener?.('statechange', this.contextState);
      const ctx = this.ctx; this.master = ctx.createGain(); this.master.connect(ctx.destination);
      this.decks = CLUB_TRACKS.map(() => {
        const gain = ctx.createGain(), filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 11000;
        filter.connect(gain); gain.connect(this.master!); return { gain, filter, node: null, buffer: null, offset: 0, at: 0, playing: false };
      });
    }
    // Resume inside the user's click/keypress, before any fetch resolves (Safari autoplay).
    if (!this.transition && this.allowed()) {
      const ctx = this.ctx;
      this.transition = ctx.resume().then(() => { if(this.ctx===ctx){this.transition=null;this.sync();} }).catch(() => {
        if(this.ctx===ctx){this.transition=null;this.blocked=true;this.publish({phase:'error'});}
      });
    }
    if (this.snapshot.phase === 'ready') { if (!this.decks.some(d => d.playing)) this.decks[this.snapshot.crossfade > .5 ? 1 : 0].playing = true; this.publish({ playing: this.decks.map(d => d.playing) }); this.sync(); return; }
    if (this.load) return this.load;
    const ctx = this.ctx, decks = this.decks, abort = this.abort = new AbortController();
    this.publish({ phase: 'loading' });
    this.sync();
    this.load = (async () => {
      try {
        // Sequential decoding keeps peak memory bounded; no whole-workstation worklets or stem models.
        for (let i = 0; i < CLUB_TRACKS.length; i++) {
          if (decks[i].buffer) continue; // A retry only fetches the missing deck.
          const response = await fetch(CLUB_TRACKS[i].url, { signal: abort.signal }); if (!response.ok) throw new Error('track unavailable');
          const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
          if (this.ctx !== ctx || abort.signal.aborted) return; decks[i].buffer = buffer;
        }
        this.transportOrigin = ctx.currentTime;
        decks[0].playing = true; this.publish({ phase: 'ready', playing: decks.map(d => d.playing) }); this.updateLevels(); this.sync();
      } catch { if (this.ctx === ctx && !abort.signal.aborted) { this.publish({ phase: 'error' }); this.sync(); } }
      finally { if (this.ctx === ctx) this.load = null; }
    })();
    return this.load;
  }
  toggle(i: number) { const d = this.decks[i]; if (!d?.buffer) return; this.cancelPerformance(); this.blocked = false; d.playing = !d.playing; if (!d.playing) this.stop(d); else d.offset = this.beat() * 60 / CLUB_BPM % Math.min(LOOP_SECONDS, d.buffer.duration); this.publish({ playing: this.decks.map(d => d.playing) }); this.sync(); }
  cue(i: number) { const d = this.decks[i]; if (!d) return; this.cancelPerformance(); this.stop(d); d.offset = this.beat() * 60 / CLUB_BPM % LOOP_SECONDS; this.sync(); }
  crossfade(x: number) { this.cancelPerformance(); this.publish({ crossfade: Math.max(0, Math.min(1, x)) }); this.updateLevels(); this.sync(); }
  volume(x: number) { this.publish({ volume: Math.max(0, Math.min(1, x)) }); this.updateLevels(); this.sync(); }
  filter(x: number) { this.cancelPerformance(); this.publish({ filter: Math.max(0, Math.min(1, x)) }); this.updateLevels(); }
  mute() { this.publish({ muted: !this.snapshot.muted }); this.sync(); }
  proximity(distance: number) {
    const gain = Math.max(0, Math.min(1, (70 - distance) / 40));
    const crossesAudibility = (gain > AUDIBLE_GAIN) !== (this.distance > AUDIBLE_GAIN);
    if (!crossesAudibility && Math.abs(gain - this.distance) < .005) return;
    this.distance = gain; this.updateLevels(); this.sync();
  }
  private updateLevels() {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(this.snapshot.volume * this.distance * .65 * worldAudioLevel('music'), this.ctx.currentTime, .12);
    this.notifyAudibility();
    if (this.performance) return;
    const gains = clubGains(this.snapshot.crossfade);
    this.decks.forEach((d, i) => { d.gain.gain.setTargetAtTime(gains[i], this.ctx!.currentTime, .025); d.filter.frequency.setTargetAtTime(220 * 50 ** this.snapshot.filter, this.ctx!.currentTime, .04); });
  }
  // One monotonically increasing musical clock. Changing decks or looping a file cannot
  // snap the player's pose or the guests' phrase order back to the beginning.
  beat = () => this.ctx && this.snapshot.phase === 'ready' ? Math.max(0, this.ctx.currentTime - this.transportOrigin) * CLUB_BPM / 60 : 0;
  performTransition = () => {
    if (!this.ctx || this.snapshot.phase !== 'ready' || !this.allowed() || this.performance) return;
    const from: 0 | 1 = this.snapshot.crossfade > .5 ? 1 : 0, plan = clubMixPlan(this.beat(), from), ctx = this.ctx;
    this.cancelPerformance(); const initialGains=clubGains(this.snapshot.crossfade); this.performance = plan;
    this.decks.forEach(d => { d.playing = true; if (!d.node) d.offset = this.beat() * 60 / CLUB_BPM % LOOP_SECONDS; });
    const start = this.transportOrigin + plan.start * 60 / CLUB_BPM, fade = this.transportOrigin + plan.fade * 60 / CLUB_BPM, end = this.transportOrigin + plan.end * 60 / CLUB_BPM;
    this.decks.forEach((d, i) => {
      if(typeof d.gain.gain.cancelAndHoldAtTime==='function')d.gain.gain.cancelAndHoldAtTime(ctx.currentTime);
      else {d.gain.gain.cancelScheduledValues(ctx.currentTime);d.gain.gain.setValueAtTime(initialGains[i],ctx.currentTime);}
      d.gain.gain.linearRampToValueAtTime(i === from ? 1 : 0,Math.min(start,ctx.currentTime+.18));
      const curve = Float32Array.from({ length: 65 }, (_, j) => { const p = j / 64; return i === from ? Math.cos(p * Math.PI / 2) : Math.sin(p * Math.PI / 2); });
      d.gain.gain.setValueCurveAtTime(curve, fade, end - fade);
      d.filter.frequency.cancelScheduledValues(ctx.currentTime); d.filter.frequency.setValueAtTime(11000, ctx.currentTime);
      if (i === from) { d.filter.frequency.setTargetAtTime(650, start, .45); }
      else { d.filter.frequency.setValueAtTime(1800, start); d.filter.frequency.setTargetAtTime(11000, end - .12, .035); }
    });
    this.publish({ performance: 'queued', beatsLeft: Math.ceil(plan.start - this.beat()), playing: [true, true], crossfade: from, filter: 1 }); this.sync();
  };
  private cancelPerformance() {
    const crossfade = this.performance ? clubPerformanceCrossfade(this.performance, this.beat()) : this.snapshot.crossfade;
    if (this.ctx) for (const [i,d] of this.decks.entries()) {
      const now=this.ctx.currentTime;
      for(const [param,value] of [[d.gain.gain,clubGains(crossfade)[i]],[d.filter.frequency,d.filter.frequency.value]] as const) {
        // Cancelling a running curve alone can restore its old value. Hold the current
        // sound first; manual controls then take over with the existing short ramp.
        if(typeof param.cancelAndHoldAtTime==='function')param.cancelAndHoldAtTime(now);
        else {param.cancelScheduledValues(now);param.setValueAtTime(value,now);}
      }
    }
    this.performance = null; this.landedUntil = -1;
    if (this.snapshot.performance !== 'idle') this.publish({ performance: 'idle', beatsLeft: 0, crossfade });
    this.updateLevels();
  }
  /** Called by the world's existing frame loop. AudioParam schedules carry the sound;
   * React status changes only on a musical beat, never on an interval or per frame. */
  tick = () => {
    const b = this.beat(), p = this.performance;
    if (p && b >= p.end) {
      this.performance = null; this.landedUntil = b + 4;
      this.decks[p.from].playing = false; this.stop(this.decks[p.from]);
      this.publish({ performance: 'landed', beatsLeft: 0, crossfade: p.to, playing: this.decks.map(d => d.playing) }); this.updateLevels();
    } else if (p && Math.floor(b) !== this.lastBeat) {
      this.publish({ performance: b < p.start ? 'queued' : 'build', beatsLeft: Math.ceil((b < p.start ? p.start : p.end) - b), crossfade: clubPerformanceCrossfade(p,b) });
    } else if (!p && this.snapshot.performance === 'landed' && b > this.landedUntil) this.publish({ performance: 'idle' });
    this.lastBeat = Math.floor(b);
  };
  energy = () => this.allowed() ? worldAudioLevel('music') * this.snapshot.volume * clubGains(this.snapshot.crossfade).reduce((sum,gain,i)=>sum+(this.decks[i]?.node?gain:0),0) : 0;
  inspect = () => ({ phase: this.snapshot.phase, context: this.ctx?.state ?? 'absent', sources: this.decks.filter(d => d.node).length, buffers: this.decks.filter(d => d.buffer).length,
    contextSeconds: this.ctx?.currentTime ?? 0, transportBeats: this.beat(), decodedSeconds: this.decks.map(d => d.buffer?.duration ?? 0),
    bufferBytes: this.decks.reduce((n, d) => n + (d.buffer ? d.buffer.length * d.buffer.numberOfChannels * 4 : 0), 0), owners: this.owners, timers: 0 });
  dispose = () => {
    this.cancelPerformance(); this.transportOrigin = 0; this.lastBeat = -1;
    this.abort?.abort(); this.abort = null; this.load = null; this.transition = null;
    this.decks.forEach(d => { this.stop(d); d.filter.disconnect(); d.gain.disconnect(); d.buffer = null; }); this.decks = [];
    this.master?.disconnect(); this.master = null; const ctx = this.ctx; this.ctx = null;
    ctx?.removeEventListener?.('statechange', this.contextState);
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
    setClubAudible(this, false);
    this.stopStore?.(); this.stopStore = null; document.removeEventListener('visibilitychange', this.sync); window.removeEventListener('pagehide', this.pageHide); window.removeEventListener('pageshow', this.pageShow);
    this.stopSettings?.(); this.stopSettings = null;
    this.publish({ phase: 'off', playing: [false, false] });
  };
}
export const clubAudio = new ClubAudio();
export const useClubAudio = () => useSyncExternalStore(clubAudio.subscribe, clubAudio.read, clubAudio.read);
