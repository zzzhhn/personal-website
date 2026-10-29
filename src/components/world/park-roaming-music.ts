/** The mastered 40-second daily exploration recording, decoded after a trusted gesture.
 * Owns one buffer/source on the caller's context. No synthesis, context, timer, RAF or global listeners. */
export const PARK_ROAMING_TRACK = {
  url: '/assets/world/park/audio/island-walk-daily-v1.wav', seconds: 40, fileBytes: 3840044,
  decodedBytesAt24k: 7680000, maxDecodedBytes: 15360000,
} as const;
export class ParkRoamingMusic {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private abort: AbortController | null = null;
  private decoding: Promise<AudioBuffer> | null = null;
  private revision = 0;
  private offset = 0;
  private at = 0;
  private level = -1;
  private fadeEnd = Infinity;
  fading = false;
  phase: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  constructor(private changed: () => void) {}
  retry() { if (this.phase === 'error') this.phase = 'idle'; }
  request(ctx: AudioContext) {
    if (this.phase !== 'idle') return;
    this.ctx = ctx;
    if (this.decoding) return; // An aborted decode cannot be interrupted; do not overlap another one.
    this.phase = 'loading';
    const abort = this.abort = new AbortController(), revision = ++this.revision;
    void (async () => {
      try {
        const response = await fetch(PARK_ROAMING_TRACK.url, { signal: abort.signal });
        if (!response.ok) throw new Error('Roaming music unavailable');
        const data = await response.arrayBuffer();
        if (data.byteLength !== PARK_ROAMING_TRACK.fileBytes) throw new Error('Unexpected music size');
        if (abort.signal.aborted || this.revision !== revision) return;
        const decoding = this.decoding = ctx.decodeAudioData(data);
        let buffer: AudioBuffer;
        try { buffer = await decoding; }
        finally { if (this.decoding === decoding) this.decoding = null; }
        if (abort.signal.aborted || this.revision !== revision || this.ctx !== ctx) return;
        const bytes = buffer.length * buffer.numberOfChannels * 4;
        if (buffer.numberOfChannels !== 2 || Math.abs(buffer.duration - PARK_ROAMING_TRACK.seconds) > .005
          || bytes > PARK_ROAMING_TRACK.maxDecodedBytes) throw new Error('Unexpected decoded music budget');
        this.buffer = buffer; this.phase = 'ready';
      } catch {
        if (abort.signal.aborted || this.revision !== revision) return;
        this.phase = 'error';
      } finally {
        if (this.revision === revision) { this.abort = null; this.changed(); }
        else if (this.ctx && this.phase === 'idle') this.changed();
      }
    })();
  }
  cancelLoading() {
    if (!this.abort) return;
    this.revision++; this.abort.abort(); this.abort = null; this.phase = 'idle';
  }
  play(ctx: AudioContext, output: AudioNode, volume: number) {
    // A quick Club boundary reversal cannot unschedule stop() on the old source.
    // Retire it first, keeping the current phrase position and one source only.
    if (this.fading) this.stop();
    if (this.source || !this.buffer || this.ctx !== ctx || ctx.state !== 'running') return;
    const gain = this.gain = ctx.createGain(), source = this.source = ctx.createBufferSource();
    this.level = volume; gain.gain.value = 0;
    // Club/pause restoration can land mid-waveform. Ease in on the audio clock
    // (95% in 240 ms); stop() still disconnects immediately at every silence gate.
    gain.gain.setTargetAtTime(volume, ctx.currentTime, .08);
    source.buffer = this.buffer; source.loop = true; source.loopStart = 0; source.loopEnd = PARK_ROAMING_TRACK.seconds;
    source.connect(gain).connect(output); this.at = ctx.currentTime;
    source.start(0, this.offset);
  }
  volume(volume: number) {
    if (this.fading || !this.ctx || !this.gain || Math.abs(volume - this.level) < .0001) return;
    const lowering = volume < this.level;
    this.level = volume; this.gain.gain.setTargetAtTime(volume, this.ctx.currentTime, lowering ? .045 : .22);
  }
  /** Only musical hand-off uses a bounded tail. Silence gates still call stop(). */
  handoff() {
    if (!this.source || this.fading) return;
    const ctx=this.ctx, gain=this.gain?.gain;
    if (!ctx || ctx.state!=='running' || !gain) { this.stop(); return; }
    const source=this.source, now=ctx.currentTime, end=now+.18;
    this.fading=true;this.fadeEnd=end;
    if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(now);
    else { const current=gain.value;gain.cancelScheduledValues(now);gain.setValueAtTime(current,now); }
    gain.linearRampToValueAtTime(0,end);
    source.onended=()=>{if(this.source!==source)return;this.stop(end);this.changed();};
    source.stop(end);
  }
  stop(endedAt=this.ctx?.currentTime??this.at) {
    if (!this.source) return;
    if (this.ctx) this.offset = (this.offset + Math.max(0, Math.min(endedAt,this.ctx.currentTime,this.fadeEnd) - this.at)) % PARK_ROAMING_TRACK.seconds;
    this.source.onended = null;
    try { this.source.stop(); } catch { /* Already stopped by browser shutdown. */ }
    this.source.disconnect(); this.source = null;
    this.gain?.disconnect(); this.gain = null; this.level = -1;this.fading=false;this.fadeEnd=Infinity;
  }
  inspect() {
    const position=(this.offset+(this.source&&this.ctx?Math.max(0,Math.min(this.ctx.currentTime,this.fadeEnd)-this.at):0))%PARK_ROAMING_TRACK.seconds;
    return { phase: this.phase, sources: this.source ? 1 : 0, buffers: this.buffer ? 1 : 0, loading: !!this.abort, decoding: !!this.decoding,
      bytes: this.buffer ? this.buffer.length * this.buffer.numberOfChannels * 4 : 0,
      seconds: this.buffer?.duration ?? 0, offset: this.offset, position, level: this.level, fading: this.fading };
  }
  dispose() {
    this.cancelLoading(); this.stop(); this.revision++; this.buffer = null; this.ctx = null;
    this.offset = 0; this.at = 0; this.phase = 'idle';
  }
}
