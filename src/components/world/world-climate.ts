export const TIME_PRESETS = [
  { id: 'morning', minutes: 360 }, { id: 'noon', minutes: 720 },
  { id: 'afternoon', minutes: 900 }, { id: 'dusk', minutes: 1050 },
  { id: 'evening', minutes: 1140 }, { id: 'night', minutes: 0 },
] as const;
export type TimePreset = typeof TIME_PRESETS[number]['id'];
export type Weather = 'clear' | 'rain' | 'snow';
export const wrapMinutes = (minutes: number) => ((minutes % 1440) + 1440) % 1440;
export function advanceWorldMinutes(minutes: number, seconds: number, running: boolean) {
  return wrapMinutes(minutes + (running && Number.isFinite(seconds) ? Math.max(0, seconds) : 0));
}
export function timePresetAt(minutes: number): TimePreset {
  const m = wrapMinutes(minutes);
  return m < 300 || m >= 1260 ? 'night' : m < 600 ? 'morning' : m < 840 ? 'noon'
    : m < 1020 ? 'afternoon' : m < 1110 ? 'dusk' : 'evening';
}
export function formatWorldTime(minutes: number) {
  const m = Math.floor(wrapMinutes(minutes));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
/** Authored coastal light anchors. Midnight wraps back to the same palette without a flash. */
export const TIME_LIGHT = {
  morning: { top: '#7899BA', horizon: '#F8D3AC', sea: '#427F86', sun: '#FFE3BE', sky: '#BFDAE7', ground: '#887E72', key: 2.6, fill: 1.6, night: .12 },
  noon: { top: '#4286B7', horizon: '#C5E3E9', sea: '#247A87', sun: '#FFF5DF', sky: '#BCDDEC', ground: '#938C76', key: 3.8, fill: 1.9, night: 0 },
  afternoon: { top: '#638EAF', horizon: '#EDD6AE', sea: '#36797D', sun: '#FFE1B1', sky: '#BDD1DC', ground: '#8B7F68', key: 3.5, fill: 1.7, night: 0 },
  dusk: { top: '#6F86A8', horizon: '#F2B98A', sea: '#1E5A5E', sun: '#FFD9A8', sky: '#8FA6C4', ground: '#82715F', key: 3.4, fill: 1.65, night: 0 },
  evening: { top: '#33456A', horizon: '#B58583', sea: '#193E4D', sun: '#B3C4E4', sky: '#8A9CBF', ground: '#5E5E70', key: .9, fill: .95, night: .72 },
  night: { top: '#121A33', horizon: '#38425B', sea: '#0E2A33', sun: '#A5BCE5', sky: '#7E94BD', ground: '#4F5369', key: .32, fill: .7, night: 1 },
} as const;
const ANCHORS: readonly [number, TimePreset][] = [[0, 'night'], [300, 'night'], [360, 'morning'],
  [720, 'noon'], [900, 'afternoon'], [1050, 'dusk'], [1140, 'evening'], [1260, 'night'], [1440, 'night']];
export interface LightSample { from: TimePreset; to: TimePreset; mix: number; night: number }
export function sampleTimeLight(minutes: number, out: LightSample = { from: 'dusk', to: 'dusk', mix: 0, night: 0 }) {
  const m = wrapMinutes(minutes);
  for (let i = 1; i < ANCHORS.length; i++) if (m < ANCHORS[i][0]) {
    const [a, from] = ANCHORS[i - 1], [b, to] = ANCHORS[i];
    const t = (m - a) / (b - a), eased = t * t * (3 - 2 * t);
    out.from = from; out.to = to; out.mix = eased;
    out.night = TIME_LIGHT[from].night + (TIME_LIGHT[to].night - TIME_LIGHT[from].night) * eased;
    break;
  }
  return out;
}
