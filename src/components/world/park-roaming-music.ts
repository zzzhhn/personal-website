/** The Boardwalk Morning recording streams through the caller's existing mix. */
export const PARK_ROAMING_TRACK = {
  url: '/assets/world/park/audio/boardwalk-longform.mp3', seconds: 22_146_482 / 44_100, fileBytes: 10_045_221,
} as const;

const HANDOFF_SECONDS = .18;
const DURATION_TOLERANCE = .25; // Media containers may report encoder delay and padding.
type Stream = { ctx: AudioContext; media: HTMLAudioElement; source: MediaElementAudioSourceNode; gain: GainNode };

export class ParkRoamingMusic {
  private stream: Stream | null = null;
  private attempt: { pending: boolean } | null = null;
  private fade: { timer: number; at: number; position: number } | null = null;
  private seconds = 0;
  private offset = 0;
  private level = -1;
  phase: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  constructor(private changed: () => void) {}

  get fading() { return this.fade !== null; }
  retry() { if (this.phase === 'error') this.phase = 'idle'; }

  private connect(ctx: AudioContext, output: AudioNode) {
    const media = document.createElement('audio');
    media.preload = 'none';
    media.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const source = ctx.createMediaElementSource(media);
    this.stream = { ctx, media, source, gain };
    source.connect(gain).connect(output);
    return this.stream;
  }

  private load(stream: Stream) {
    const { media } = stream;
    this.phase = 'loading';
    const readDuration = () => {
      if (media.onloadedmetadata !== readDuration || media.readyState < 1) return;
      const seconds = media.duration;
      if (!Number.isFinite(seconds) || Math.abs(seconds - PARK_ROAMING_TRACK.seconds) > DURATION_TOLERANCE) {
        this.fail();
        return;
      }
      const wasLoading = this.phase === 'loading';
      this.seconds = seconds;
      this.phase = 'ready';
      if (wasLoading) this.changed();
    };
    const mediaError = () => { if (media.onerror === mediaError) this.fail(); };
    media.onloadedmetadata = media.ondurationchange = readDuration;
    media.onerror = mediaError;
    media.src = PARK_ROAMING_TRACK.url;
  }

  private unload() {
    const media = this.stream?.media;
    if (media?.onloadedmetadata) {
      media.onloadedmetadata = media.ondurationchange = media.onerror = null;
      media.removeAttribute('src');
      media.load(); // Abort selection, pending play and browser buffering for this resource.
    }
    this.seconds = 0;
  }

  private fail() {
    this.stop();
    this.unload();
    this.phase = 'error';
    this.changed();
  }

  /** Call inside the trusted gesture as well as after context resume. The gain
   * stays at zero until both the media and the shared context are ready. */
  play(ctx: AudioContext, output: AudioNode, volume: number) {
    if (this.phase === 'error' || ctx.state === 'closed') return;
    try {
      const stream = this.stream ?? this.connect(ctx, output);
      const { media, gain } = stream;
      if (this.fade && ctx.currentTime >= this.fade.at + HANDOFF_SECONDS) this.stop();
      if (this.fade) {
        this.clearFade();
        this.holdGain(stream);
        gain.gain.setTargetAtTime(volume, ctx.currentTime, .08);
        this.level = volume;
      }
      if (!this.attempt) {
        if (this.phase === 'idle') this.load(stream);
        if (media.currentTime !== this.offset) media.currentTime = this.offset;
        const attempt = this.attempt = { pending: true };
        void media.play().then(() => {
          if (this.attempt !== attempt) return;
          attempt.pending = false;
          this.changed();
        }, () => {
          if (this.attempt === attempt) this.fail();
        });
      }
      if (!this.attempt.pending && this.phase === 'ready' && ctx.state === 'running' && this.level < 0) {
        gain.gain.setTargetAtTime(volume, ctx.currentTime, .08);
        this.level = volume;
      }
    } catch { this.fail(); }
  }

  volume(volume: number) {
    if (this.fading || !this.stream || this.level < 0 || Math.abs(volume - this.level) < .0001) return;
    const { ctx, gain } = this.stream;
    const lowering = volume < this.level;
    this.level = volume;
    gain.gain.setTargetAtTime(volume, ctx.currentTime, lowering ? .045 : .22);
  }

  private holdGain({ ctx, gain: { gain } }: Stream) {
    const now = ctx.currentTime;
    if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(now);
    else {
      const current = gain.value;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(current, now);
    }
  }

  /** Only musical hand-off has a tail. Gain reaches zero on the audio clock
   * even if a long frame delays the one-shot media pause. */
  handoff() {
    const stream = this.stream;
    if (!stream || !this.attempt) return;
    const { ctx, gain, media } = stream;
    if (ctx.state !== 'running' || this.level < 0 || media.paused) { this.stop(); return; }
    if (this.fade) return;
    this.holdGain(stream);
    const at = ctx.currentTime;
    gain.gain.linearRampToValueAtTime(0, at + HANDOFF_SECONDS);
    const timer = window.setTimeout(() => {
      if (this.fade?.timer !== timer) return;
      this.stop();
      this.changed();
    }, HANDOFF_SECONDS * 1000);
    this.fade = { timer, at, position: media.currentTime };
  }

  private clearFade() {
    if (!this.fade) return;
    window.clearTimeout(this.fade.timer);
    this.fade = null;
  }

  private position() {
    if (!this.stream || this.level < 0) return this.offset;
    const { ctx, media } = this.stream;
    const position = media.currentTime;
    if (!this.fade || !this.seconds) return position;
    const elapsed = (position - this.fade.position + this.seconds) % this.seconds;
    return (this.fade.position + Math.min(elapsed, ctx.currentTime - this.fade.at, HANDOFF_SECONDS)) % this.seconds;
  }

  stop() {
    const buffering = this.phase === 'loading' || this.attempt?.pending;
    this.offset = this.position();
    this.clearFade();
    if (this.stream && this.attempt) {
      const { ctx, gain, media } = this.stream;
      this.attempt = null; // Older play promise results cannot touch a later attempt.
      this.level = -1;
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      media.pause();
    }
    if (buffering) { this.unload(); this.phase = 'idle'; }
  }

  inspect() {
    return {
      phase: this.phase, sources: this.level >= 0 ? 1 : 0, buffers: 0, loading: this.phase === 'loading', decoding: false,
      bytes: 0, // App-owned decoded PCM only. The browser manages its own media buffers.
      streaming: this.stream !== null, playPending: !!this.attempt?.pending,
      seconds: this.seconds, offset: this.offset, position: this.position(), level: this.level, fading: this.fading,
    };
  }

  dispose() {
    this.stop();
    this.unload();
    this.stream?.source.disconnect();
    this.stream?.gain.disconnect();
    this.stream = null;
    this.offset = 0;
    this.phase = 'idle';
  }
}
