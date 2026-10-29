import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useWorldStore } from './store';
import { readDrivingTelemetry, type DrivingTelemetry } from './vehicle-telemetry';
import { useWorldAudioSettings, worldAudioLevel } from './world-audio-settings';

/** Event-driven lifecycle; the existing frame callback supplies only current engine parameters. */
export class DrivingAudio {
  private sound: { ctx: AudioContext; master: GainNode; engine: OscillatorNode; harmonic: OscillatorNode;
    source: AudioBufferSourceNode; motor: GainNode; tyre: GainNode; boost: GainNode; filter: BiquadFilterNode } | null = null;
  private attached = false;
  private inactive = false;
  private blocked = false;
  private transition: Promise<void> | null = null;
  private stopWorld: (() => void) | null = null;
  private stopSettings: (() => void) | null = null;
  private allowed() {
    const s = useWorldStore.getState();
    return this.attached && !this.inactive && !this.blocked && s.activeVehicle === 'coupe'
      && !s.paused && !s.poolInspect && !s.shot && !document.hidden && worldAudioLevel('sfx') > 0;
  }
  private pageHide = (event: PageTransitionEvent) => {
    this.inactive = true;
    if (event.persisted) this.sync(); else this.dispose();
  };
  private pageShow = () => { this.inactive = false; this.sync(); };
  private gesture = (event: Event) => {
    if (!event.isTrusted) return;
    this.blocked = false;
    if (!this.allowed()) return;
    if (!this.sound) this.create();
    this.sync();
  };
  mount() {
    if (this.attached) return this.dispose;
    this.attached = true; this.inactive = false; this.blocked = false;
    this.stopWorld = useWorldStore.subscribe((s, p) => {
      if (s.activeVehicle !== p.activeVehicle || s.paused !== p.paused || s.poolInspect !== p.poolInspect || s.shot !== p.shot) this.sync();
    });
    this.stopSettings = useWorldAudioSettings.subscribe(this.sync);
    window.addEventListener('keydown', this.gesture); window.addEventListener('pointerdown', this.gesture);
    window.addEventListener('pagehide', this.pageHide); window.addEventListener('pageshow', this.pageShow);
    document.addEventListener('visibilitychange', this.sync);
    return this.dispose;
  }
  private create() {
    const Ctx = window.AudioContext;
    if (!Ctx) return;
    let ctx: AudioContext;
    try { ctx = new Ctx(); } catch { this.blocked = true; return; }
    const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    const engine = ctx.createOscillator(), harmonic = ctx.createOscillator(), motor = ctx.createGain(), filter = ctx.createBiquadFilter();
    engine.type = 'triangle'; harmonic.type = 'sine'; motor.gain.value = 0; filter.type = 'lowpass'; filter.frequency.value = 420;
    engine.connect(motor); harmonic.connect(motor); motor.connect(filter).connect(master); engine.start(); harmonic.start();
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource(); source.buffer = noise; source.loop = true;
    const tyre = ctx.createGain(), boost = ctx.createGain(), scrub = ctx.createBiquadFilter(), air = ctx.createBiquadFilter();
    tyre.gain.value = 0; boost.gain.value = 0; scrub.type = 'bandpass'; scrub.frequency.value = 950; scrub.Q.value = 2;
    air.type = 'highpass'; air.frequency.value = 1800; source.connect(scrub).connect(tyre).connect(master);
    source.connect(air).connect(boost).connect(master); source.start();
    this.sound = { ctx, master, engine, harmonic, source, motor, tyre, boost, filter };
    ctx.addEventListener('statechange', this.sync);
  }
  private silence() {
    const a = this.sound; if (!a) return;
    // Remove old gain automation before resuming; no stale boost or tyre burst can escape.
    for (const node of [a.master, a.motor, a.tyre, a.boost]) {
      node.gain.cancelScheduledValues(a.ctx.currentTime); node.gain.setValueAtTime(0, a.ctx.currentTime);
    }
  }
  private sync = () => {
    const a = this.sound; if (!a) return;
    if (a.ctx.state === 'closed') { this.dispose(); return; }
    const active = this.allowed();
    if (!active) this.silence();
    if (this.transition) return;
    if (active && a.ctx.state === 'running') { this.update(readDrivingTelemetry()); return; }
    if (!active && a.ctx.state === 'suspended') return;
    this.transition = (active ? a.ctx.resume() : a.ctx.suspend()).then(() => {
      if (this.sound !== a) return;
      this.transition = null; this.sync();
    }).catch(() => {
      if (this.sound !== a) return;
      this.transition = null; this.blocked = true; this.silence();
    });
  };
  update(d: DrivingTelemetry | null) {
    const a = this.sound; if (!a || !this.allowed() || a.ctx.state !== 'running') return;
    if (!d) { this.silence(); return; }
    const speed = Math.abs(d.speed), load = Math.abs(d.power), t = a.ctx.currentTime;
    const gear = Math.min(4, Math.floor(speed / 7)), pitch = 38 + (speed - gear * 5) * 3 + load * 12;
    a.master.gain.setTargetAtTime(.12 * worldAudioLevel('sfx'), t, .025);
    a.engine.frequency.setTargetAtTime(pitch, t, .08); a.harmonic.frequency.setTargetAtTime(pitch * 2, t, .08);
    a.motor.gain.setTargetAtTime(.12 + load * .16, t, .08); a.filter.frequency.setTargetAtTime(300 + load * 550, t, .12);
    const scrub = d.contacts >= 2 ? Math.min(.28, Math.max(0, Math.abs(d.slipAngle) - .08) * .45) * Math.min(1, speed / 6) : 0;
    a.tyre.gain.setTargetAtTime(scrub, t, .06); a.boost.gain.setTargetAtTime(d.boosting ? .15 : 0, t, .08);
  }
  dispose = () => {
    this.attached = false; this.transition = null;
    this.stopWorld?.(); this.stopWorld = null; this.stopSettings?.(); this.stopSettings = null;
    window.removeEventListener('keydown', this.gesture); window.removeEventListener('pointerdown', this.gesture);
    window.removeEventListener('pagehide', this.pageHide); window.removeEventListener('pageshow', this.pageShow);
    document.removeEventListener('visibilitychange', this.sync);
    const a = this.sound; this.sound = null;
    if (!a) return;
    a.ctx.removeEventListener('statechange', this.sync);
    for (const source of [a.engine, a.harmonic, a.source]) { try { source.stop(); } catch { /* Already stopped. */ } source.disconnect(); }
    a.master.disconnect();
    if (a.ctx.state !== 'closed') void a.ctx.close().catch(() => {});
  };
}

/** Quiet procedural engine, tyre scrub and boost. No downloads, timers, or persistent audio after
 * unmount. The AudioContext is created only by a gesture while actually driving the benchmark car. */
export default function WorldDrivingFeedback() {
  const audio = useRef<DrivingAudio | null>(null);
  useEffect(() => {
    const service = new DrivingAudio(); audio.current = service;
    const release = service.mount();
    return () => { audio.current = null; release(); };
  }, []);
  useFrame(() => audio.current?.update(readDrivingTelemetry()));
  return null;
}
