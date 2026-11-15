import { worldAudioLevel } from '../../world-audio-settings';
import { alphaWorld } from '../alpha-layout';
import type { CaveEcho } from './cave-state';

/** One scene-owned context, at most twelve short voices. Never opened by mounting,
 * walking, mute changes or a ring. Native audio-clock delays are real echoes. */
export function createCaveAudio() {
  let context: AudioContext | null = null, master: GainNode | null = null, generation = 0;
  const voices = new Set<{ oscillator: OscillatorNode; gain: GainNode; pan: PannerNode }>();
  function stop(suspend = true) {
    generation++;
    for (const v of voices) { try { v.oscillator.stop(); } catch { /* Already ended. */ }
      v.oscillator.disconnect(); v.gain.disconnect(); v.pan.disconnect(); }
    voices.clear();
    if (suspend && context?.state === 'running') void context.suspend().catch(() => {});
  }
  function sync() {
    const level = worldAudioLevel('sfx');
    if (master && context) master.gain.setValueAtTime(level * .19, context.currentTime);
    if (!level) stop();
  }
  return {
    stop, sync,
    play(sequence: CaveEcho[]) {
      stop(false);
      if (!worldAudioLevel('sfx') || typeof window === 'undefined' || document.hidden) return;
      try {
        if (!context || context.state === 'closed') {
          const Ctx = window.AudioContext;
          if (!Ctx) return;
          context = new Ctx(); master = context.createGain(); master.connect(context.destination);
        }
        const ctx = context, token = generation, triggeredAt=performance.now();
        const schedule = () => {
          if (token !== generation || ctx.state !== 'running' || document.hidden || !worldAudioLevel('sfx')) return;
          sync(); const now = ctx.currentTime + .02,elapsed=(performance.now()-triggeredAt)/1000;
          for (const echo of sequence.slice(0, 4).filter(e=>e.delay>=elapsed-.1)) for (let partial = 0; partial < 3; partial++) {
            const oscillator = ctx.createOscillator(), gain = ctx.createGain(), pan = ctx.createPanner();
            const p = alphaWorld(echo.position), at = now + Math.max(0,echo.delay-elapsed);
            pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 4; pan.maxDistance = 36; pan.rolloffFactor = .7;
            pan.positionX.value = p[0]; pan.positionY.value = p[1]; pan.positionZ.value = p[2];
            oscillator.type = 'sine'; oscillator.frequency.value = echo.pitch * [1, 2.07, 2.86][partial];
            gain.gain.setValueAtTime(.0001, at); gain.gain.exponentialRampToValueAtTime(echo.strength / (partial + 1), at + .008);
            gain.gain.exponentialRampToValueAtTime(.0001, at + .7 - partial * .12);
            oscillator.connect(gain); gain.connect(pan); pan.connect(master!);
            const voice = { oscillator, gain, pan }; voices.add(voice);
            oscillator.onended = () => { voices.delete(voice); oscillator.disconnect(); gain.disconnect(); pan.disconnect(); };
            oscillator.start(at); oscillator.stop(at + .75 - partial * .12);
          }
        };
        if (ctx.state === 'suspended') void ctx.resume().then(schedule).catch(() => {}); else schedule();
      } catch { stop(); }
    },
    listener(position: readonly number[], forward: readonly number[], up: readonly number[]) {
      if (!context || !voices.size || context.state !== 'running') return;
      const l = context.listener;
      l.positionX.value = position[0]; l.positionY.value = position[1]; l.positionZ.value = position[2];
      l.forwardX.value = forward[0]; l.forwardY.value = forward[1]; l.forwardZ.value = forward[2];
      l.upX.value = up[0]; l.upY.value = up[1]; l.upZ.value = up[2];
    },
    dispose() { stop(false); const ctx = context; context = null; master?.disconnect(); master = null;
      if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {}); },
  };
}
