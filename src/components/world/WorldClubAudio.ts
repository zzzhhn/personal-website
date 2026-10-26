import { useSyncExternalStore } from 'react';
import { useWorldStore } from './store';

export const CLUB_TRACKS = [
  { title: 'Mirror Ball', genre: 'Disco', bpm: 118, url: '/assets/world/club/audio/mirror-ball.mp3' },
  { title: 'Neon Drive', genre: 'House', bpm: 124, url: '/assets/world/club/audio/neon-drive.mp3' },
] as const;
export const clubGains = (x: number) => [Math.cos(Math.max(0, Math.min(1, x)) * Math.PI / 2), Math.sin(Math.max(0, Math.min(1, x)) * Math.PI / 2)];
type Deck = { node: AudioBufferSourceNode | null; gain: GainNode; filter: BiquadFilterNode; buffer: AudioBuffer | null; offset: number; at: number; playing: boolean };
type Snapshot = { phase: 'off' | 'loading' | 'ready' | 'error'; playing: readonly boolean[]; crossfade: number; volume: number; filter: number; muted: boolean };

/** Two finite buffers, one context, no scheduling timer/worker/analyser. Sources exist only while audible. */
export class ClubAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private decks: Deck[] = [];
  private listeners = new Set<() => void>();
  private owners = 0;
  private stopStore: (() => void) | null = null;
  private abort: AbortController | null = null;
  private load: Promise<void> | null = null;
  private distance = 0;
  private blocked = false;
  private pageInactive = false;
  private transition: Promise<void> | null = null;
  private snapshot: Snapshot = { phase: 'off', playing: [false, false], crossfade: 0, volume: .55, filter: 1, muted: false };
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  read = () => this.snapshot;
  private publish(patch: Partial<Snapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach(fn => fn()); }
  private allowed() { const s = useWorldStore.getState(); return this.owners > 0 && !this.pageInactive && !document.hidden && !s.paused && !s.poolInspect && !s.shot && this.distance > .001 && !this.snapshot.muted && !this.blocked; }
  private pageHide = (event: PageTransitionEvent) => { this.pageInactive = true; if (event.persisted) this.sync(); else this.dispose(); };
  private pageShow = () => { this.pageInactive = false; this.sync(); };
  retain() {
    if (++this.owners === 1) {
      this.pageInactive = false;
      this.stopStore = useWorldStore.subscribe((s, p) => { if (s.paused !== p.paused || s.poolInspect !== p.poolInspect || s.shot !== p.shot) this.sync(); });
      document.addEventListener('visibilitychange', this.sync);
      window.addEventListener('pagehide', this.pageHide);
      window.addEventListener('pageshow', this.pageShow);
    }
    let released = false;
    return () => { if (!released) { released = true; if (--this.owners === 0) this.dispose(); } };
  }
  private position(d: Deck) { return d.buffer ? (d.offset + (d.node && this.ctx ? this.ctx.currentTime - d.at : 0)) % d.buffer.duration : 0; }
  private stop(d: Deck) { if (!d.node) return; d.offset = this.position(d); d.node.onended = null; d.node.stop(); d.node.disconnect(); d.node = null; }
  private start(d: Deck) {
    if (!this.ctx || !d.buffer || d.node || !d.playing) return;
    const node = this.ctx.createBufferSource(); node.buffer = d.buffer; node.loop = true; node.connect(d.filter);
    d.node = node; d.at = this.ctx.currentTime; node.start(0, d.offset);
  }
  sync = () => {
    const ctx = this.ctx; if (!ctx) return;
    const active = this.allowed() && this.snapshot.phase === 'ready' && this.decks.some(d => d.playing);
    if (!active) this.decks.forEach(d => this.stop(d));
    if (this.transition || ctx.state === 'closed') return;
    if (active && ctx.state === 'running') { this.decks.forEach(d => this.start(d)); return; }
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
      const ctx = this.ctx; this.master = ctx.createGain(); this.master.connect(ctx.destination);
      this.decks = CLUB_TRACKS.map(() => {
        const gain = ctx.createGain(), filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 11000;
        filter.connect(gain); gain.connect(this.master!); return { gain, filter, node: null, buffer: null, offset: 0, at: 0, playing: false };
      });
    }
    // Resume inside the user's click/keypress, before any fetch resolves (Safari autoplay).
    if (!this.transition) {
      const ctx = this.ctx;
      this.transition = ctx.resume().then(() => { if(this.ctx===ctx){this.transition=null;this.sync();} }).catch(() => {
        if(this.ctx===ctx){this.transition=null;this.blocked=true;this.publish({phase:'error'});}
      });
    }
    if (this.snapshot.phase === 'ready') { this.decks[0].playing = true; this.publish({ playing: this.decks.map(d => d.playing) }); this.sync(); return; }
    if (this.load) return this.load;
    const ctx = this.ctx, decks = this.decks, abort = this.abort = new AbortController();
    this.publish({ phase: 'loading' });
    this.load = (async () => {
      try {
        // Sequential decoding keeps peak memory bounded; no whole-workstation worklets or stem models.
        for (let i = 0; i < CLUB_TRACKS.length; i++) {
          const response = await fetch(CLUB_TRACKS[i].url, { signal: abort.signal }); if (!response.ok) throw new Error('track unavailable');
          const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
          if (this.ctx !== ctx || abort.signal.aborted) return; decks[i].buffer = buffer;
        }
        decks[0].playing = true; this.publish({ phase: 'ready', playing: decks.map(d => d.playing) }); this.updateLevels(); this.sync();
      } catch { if (this.ctx === ctx && !abort.signal.aborted) { this.publish({ phase: 'error' }); this.sync(); } }
      finally { if (this.ctx === ctx) this.load = null; }
    })();
    return this.load;
  }
  toggle(i: number) { const d = this.decks[i]; if (!d?.buffer) return; this.blocked = false; d.playing = !d.playing; if (!d.playing) this.stop(d); this.publish({ playing: this.decks.map(d => d.playing) }); this.sync(); }
  cue(i: number) { const d = this.decks[i]; if (!d) return; this.stop(d); d.offset = 0; this.sync(); }
  crossfade(x: number) { this.publish({ crossfade: Math.max(0, Math.min(1, x)) }); this.updateLevels(); }
  volume(x: number) { this.publish({ volume: Math.max(0, Math.min(1, x)) }); this.updateLevels(); }
  filter(x: number) { this.publish({ filter: Math.max(0, Math.min(1, x)) }); this.updateLevels(); }
  mute() { this.publish({ muted: !this.snapshot.muted }); this.sync(); }
  proximity(distance: number) {
    const gain = Math.max(0, Math.min(1, (70 - distance) / 40));
    if (Math.abs(gain - this.distance) < .005) return;
    this.distance = gain; this.updateLevels(); this.sync();
  }
  private updateLevels() {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(this.snapshot.volume * this.distance * .65, this.ctx.currentTime, .12);
    const gains = clubGains(this.snapshot.crossfade);
    this.decks.forEach((d, i) => { d.gain.gain.setTargetAtTime(gains[i], this.ctx!.currentTime, .025); d.filter.frequency.setTargetAtTime(220 * 50 ** this.snapshot.filter, this.ctx!.currentTime, .04); });
  }
  beat = () => { let i = this.snapshot.crossfade > .5 ? 1 : 0; if(!this.decks[i]?.node)i=1-i; const d=this.decks[i]; return d?.node ? this.position(d) * CLUB_TRACKS[i].bpm / 60 : 0; };
  energy = () => this.allowed() ? this.snapshot.volume * clubGains(this.snapshot.crossfade).reduce((sum,gain,i)=>sum+(this.decks[i]?.node?gain:0),0) : 0;
  inspect = () => ({ phase: this.snapshot.phase, context: this.ctx?.state ?? 'absent', sources: this.decks.filter(d => d.node).length, buffers: this.decks.filter(d => d.buffer).length,
    bufferBytes: this.decks.reduce((n, d) => n + (d.buffer ? d.buffer.length * d.buffer.numberOfChannels * 4 : 0), 0), owners: this.owners, timers: 0 });
  dispose = () => {
    this.abort?.abort(); this.abort = null; this.load = null; this.transition = null;
    this.decks.forEach(d => { this.stop(d); d.filter.disconnect(); d.gain.disconnect(); d.buffer = null; }); this.decks = [];
    this.master?.disconnect(); this.master = null; const ctx = this.ctx; this.ctx = null; if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
    this.stopStore?.(); this.stopStore = null; document.removeEventListener('visibilitychange', this.sync); window.removeEventListener('pagehide', this.pageHide); window.removeEventListener('pageshow', this.pageShow);
    this.publish({ phase: 'off', playing: [false, false] });
  };
}
export const clubAudio = new ClubAudio();
export const useClubAudio = () => useSyncExternalStore(clubAudio.subscribe, clubAudio.read, clubAudio.read);
