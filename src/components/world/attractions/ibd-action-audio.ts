import { useWorldStore } from '../store';
import { worldAudioLevel } from '../world-audio-settings';
import { parkAudio, type ParkAudio, type PcmCueHandle } from '../WorldParkAudio';
import { useIbdYardStore } from './ibd-yard-store.ts';
import { ibdStation, ibdWorld } from './ibd-yard-layout.ts';
import { yardItemId, type IbdAction, type IbdYardGame } from './ibd-yard-game.ts';

export type IbdSound = 'paper' | 'tool' | 'metal' | 'wood' | 'machine' | 'release';
const RATE = 24000;
const LENGTH: Record<IbdSound, number> = { paper: .24, tool: .22, metal: .34, wood: .28, machine: .43, release: .58 };
export function ibdActionSound(action: IbdAction): IbdSound {
  if (action.kind === 'brief' || action.kind === 'verify') return 'paper';
  if (action.kind === 'kit') return 'tool';
  if (action.kind === 'release') return 'release';
  if (['crane', 'turn'].includes(action.kind)) return 'machine';
  if (action.kind === 'replace' && (action.slot === 'coil-front' || action.slot === 'coil-rear')) return 'machine';
  if (['open', 'contents', 'load', 'unload', 'replace'].includes(action.kind)) return 'wood';
  return 'metal';
}
/** Only a successful state commit emits. Requests, stale tokens and cancellation do not. */
export function committedIbdAction(before: IbdYardGame, after: IbdYardGame): IbdAction | null {
  if (before === after) return null;
  if (!before.pending && !after.pending && !before.started && after.started && before.round === after.round)
    return { kind: 'brief', station: 'manifest' };
  const pending = before.pending;
  if (!pending || after.pending || after.revision !== pending.token || before.round !== after.round) return null;
  return before.core !== after.core || before.equipped !== after.equipped || before.released !== after.released
    || before.exchanges !== after.exchanges ? pending.action : null;
}
type PackContact = 'pickup' | 'measure' | 'return';
const PACK_SOUND: Record<PackContact, { kind: IbdSound; level: number }> = {
  pickup: { kind: 'tool', level: .58 }, measure: { kind: 'metal', level: .72 }, return: { kind: 'wood', level: .6 },
};
/** State changes here follow the motion controller's verified palm contacts, not button presses.
 * Empty-slot viewing, failed jaws, recovery and repeated callbacks have no material impact. */
export function committedIbdPackContact(before: IbdYardGame, after: IbdYardGame):
  { station: 'parts-a' | 'parts-b'; contact: PackContact } | null {
  if (before === after || before.pending || after.pending || before.round !== after.round
    || after.revision !== before.revision + 1 || before.packInspections === after.packInspections) return null;
  for (const station of ['parts-a', 'parts-b'] as const) {
    const id = yardItemId(after, station);
    if (yardItemId(before, station) !== id) continue;
    const previous = before.packInspections[id], next = after.packInspections[id];
    if (!next || previous === next) continue;
    if ((previous?.held ?? null) === null && next.held !== null && next.notice === 'held')
      return { station, contact: 'pickup' };
    if (!previous || previous.held === null) continue;
    if (next.held === previous.held
      && next.measurement !== null && next.measurement !== previous.measurement && next.notice === 'measured')
      return { station, contact: 'measure' };
    if (next.held === null && next.notice === 'returned'
      && !previous.slots[previous.held].complete && next.slots[previous.held].complete)
      return { station, contact: 'return' };
  }
  return null;
}
export function ibdSoundDistance(listener: readonly number[], source: readonly number[]) {
  const d = Math.hypot(...source.map((n, i) => n - listener[i]));
  if (!Number.isFinite(d) || d >= 16) return 0;
  const x = Math.max(0, (d - 2) / 14);
  return (1 - x) ** 2;
}

/** Small deterministic material transients, synthesized here rather than recorded Foley.
 * Three variants rotate per material. Every envelope ends within .58 s; no loops. */
export function renderIbdSound(kind: IbdSound, variant = 0) {
  const data = new Float32Array(Math.round(RATE * LENGTH[kind]));
  const v = ((variant % 3) + 3) % 3, pitch = 1 + (v - 1) * .055;
  let seed = 1777 + v * 811, low = 0, slow = 0;
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1, t = i / RATE;
    low += .28 * (noise - low); slow += .045 * (noise - slow);
    const pulse = (at: number, decay: number) => t < at ? 0 : Math.min(1, (t - at) / .0015) * Math.exp(-(t - at) / decay);
    const mode = (f: number, decay: number, at = 0) => Math.sin(2 * Math.PI * f * pitch * Math.max(0, t - at)) * pulse(at, decay);
    let value = 0;
    if (kind === 'paper') value = .38 * (noise - low) * (pulse(.008, .035) + .65 * pulse(.078, .035))
      + .19 * slow * pulse(.14, .025); // Two rustles and a dry stamp.
    else if (kind === 'tool') value = .24 * low * (pulse(0, .012) + pulse(.085, .015))
      + .16 * mode(710, .026) + .1 * mode(1100, .022, .085); // Kit latch and handle.
    else if (kind === 'metal') value = .15 * mode(670, .09) + .11 * mode(1087, .075)
      + .08 * mode(1771, .05) + .28 * low * pulse(.005, .012); // Inharmonic gauge contact.
    else if (kind === 'wood') value = .25 * mode(147, .035) + .16 * mode(283, .022)
      + .5 * low * (pulse(0, .016) + .5 * pulse(.075, .018)); // Damped box landing and rattle.
    else if (kind === 'machine') value = .26 * slow * (pulse(0, .07) + pulse(.065, .06))
      + .2 * mode(118, .065) + .13 * mode(362, .04, .17) + .24 * low * pulse(.17, .014); // Travel settling into a latch.
    else value = .21 * slow * (pulse(0, .07) + pulse(.16, .07)) + .18 * mode(156, .06)
      + .18 * mode(460, .07, .23) + .12 * mode(737, .08, .23); // Gate release, then short metal latch.
    // Remove the final tail completely, independent of natural decay.
    data[i] = value * Math.min(1, (data.length - 1 - i) / (RATE * .025));
  }
  return data;
}

type Voice = { handle: PcmCueHandle; at: readonly number[]; distance: number; level: number };
/** Domain-to-audio adapter only. The shared ParkAudio owns playback and browser authorization. */
export class IbdActionAudio {
  private variants = new Map<IbdSound, number>();
  private voices = new Set<Voice>();
  private mounted = false;
  private subscriptions: (() => void)[] = [];
  private release: (() => void) | null = null;
  private updates = 0;
  constructor(private audio: ParkAudio = parkAudio) {}
  private hasActiveVoice() { for (const voice of this.voices) if (voice.handle.active) return true; return false; }
  private available() {
    const w = useWorldStore.getState();
    return this.mounted && !document.hidden && useIbdYardStore.getState().active
      && !w.paused && !w.poolInspect && !w.shot && !w.card && !w.activeVehicle && !w.seat && !w.clubMode && worldAudioLevel('sfx') > 0;
  }
  mount() {
    if (this.mounted) return this.dispose;
    this.mounted = true; this.release = this.audio.retain();
    this.subscriptions.push(useWorldStore.subscribe((s, p) => {
      const lifecycle = s.paused !== p.paused || s.poolInspect !== p.poolInspect || s.shot !== p.shot || s.card !== p.card
        || s.activeVehicle !== p.activeVehicle || s.seat !== p.seat || s.clubMode !== p.clubMode;
      if (lifecycle || s.position !== p.position && this.voices.size > 0
        && useIbdYardStore.getState().active && this.hasActiveVoice()) this.sync();
    }),
      useIbdYardStore.subscribe((s, before) => {
        const action = committedIbdAction(before.game, s.game);
        const pack = committedIbdPackContact(before.game, s.game);
        const station = pack?.station ?? action?.station;
        if (station && this.available()) {
          const at = ibdWorld(ibdStation(station, s.game.core.moved).at);
          const { kind, level } = pack ? PACK_SOUND[pack.contact] : { kind: ibdActionSound(action!), level: 1 };
          const distance = ibdSoundDistance(useWorldStore.getState().position, at);
          if (distance) {
            const variant = this.variants.get(kind) ?? 0;
            const handle = this.audio.pcmCue(`ibd:${kind}:${variant}`, () => renderIbdSound(kind, variant), RATE, distance * level);
            if (handle.active) {
              this.variants.set(kind, (variant + 1) % 3);
              this.voices.add({ handle, at, distance, level });
            }
          }
        }
        if (action || pack || s.active !== before.active) this.sync();
      }));
    return this.dispose;
  }
  private sync = () => {
    this.updates++;
    const available = this.available();
    for (const voice of this.voices) {
      if (!voice.handle.active) { this.voices.delete(voice); continue; }
      const distance = available ? ibdSoundDistance(useWorldStore.getState().position, voice.at) : 0;
      if (!distance) { voice.handle.cancel(); this.voices.delete(voice); }
      else if (Math.abs(distance - voice.distance) > .005) {
        voice.distance = distance; voice.handle.setVolume(distance * voice.level);
      }
    }
  };
  inspect() {
    return { activeHandles: [...this.voices].filter(v => v.handle.active).length, updates: this.updates, timers: 0 };
  }
  dispose = () => {
    this.mounted = false;
    for (const voice of this.voices) voice.handle.cancel();
    this.voices.clear();
    this.subscriptions.forEach(stop => stop()); this.subscriptions = [];
    this.variants.clear(); this.release?.(); this.release = null;
  };
}
