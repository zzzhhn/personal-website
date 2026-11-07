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
  private seekOnResume = false;
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
        const reloading = this.phase === 'idle';
        if (reloading) this.load(stream);
        // A retained, paused element already owns the correct playback position.
        // Writing currentTime can trigger a byte-range request even for a tiny difference.
        if ((reloading || this.seekOnResume) && media.currentTime !== this.offset) media.currentTime = this.offset;
        this.seekOnResume = false;
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

  private clampFadePosition(position: number, audioTime: number) {
    if (!this.fade || !this.seconds) return position;
    const elapsed = position >= this.fade.position ? position - this.fade.position : position + this.seconds - this.fade.position;
    const limit = Math.min(audioTime - this.fade.at, HANDOFF_SECONDS);
    return elapsed <= limit ? position : (this.fade.position + limit) % this.seconds;
  }

  stop() {
    const buffering = this.phase === 'loading' || this.attempt?.pending;
    if (this.stream && this.attempt) {
      const { ctx, gain, media } = this.stream;
      this.attempt = null; // Older play promise results cannot touch a later attempt.
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      media.pause();
      const pausedAt = media.currentTime;
      if (this.level >= 0) this.offset = this.clampFadePosition(pausedAt, ctx.currentTime);
      this.seekOnResume = pausedAt !== this.offset; // Fade overshoot or progress before the gain opened.
      this.level = -1;
    }
    this.clearFade();
    if (buffering) { this.unload(); this.phase = 'idle'; }
  }

  inspect() {
    const position = this.stream && this.level >= 0
      ? this.clampFadePosition(this.stream.media.currentTime, this.stream.ctx.currentTime) : this.offset;
    return {
      phase: this.phase, sources: this.level >= 0 ? 1 : 0, buffers: 0, loading: this.phase === 'loading', decoding: false,
      bytes: 0, // App-owned decoded PCM only. The browser manages its own media buffers.
      streaming: this.stream !== null, playPending: !!this.attempt?.pending,
      seconds: this.seconds, offset: this.offset, position, level: this.level, fading: this.fading,
    };
  }

  dispose() {
    this.stop();
    this.unload();
    this.stream?.source.disconnect();
    this.stream?.gain.disconnect();
    this.stream = null;
    this.offset = 0;
    this.seekOnResume = false;
    this.phase = 'idle';
  }
}
