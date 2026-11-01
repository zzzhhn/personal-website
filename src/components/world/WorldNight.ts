import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useWorldStore } from './store';
import { advanceWorldMinutes, sampleTimeLight, timePresetAt, TIME_PRESETS } from './world-climate';

/** Shared by every district; no per-particle state or independent interval timers. */
export const night = { value: 0 };
export const climate = { minutes: 1050, rain: 0, snow: 0, blend: 1 };
export const weatherUniforms = { uRain: { value: 0 }, uSnow: { value: 0 } };

export function NightClock() {
  const invalidate = useThree(s => s.invalidate);
  const state = useRef({ revision: -1, light: useWorldStore.getState().light, weather: useWorldStore.getState().weather,
    published: -1, transition: 2, sample: sampleTimeLight(1050) });
  useFrame((_, delta) => {
    const s = useWorldStore.getState(), r = state.current;
    if (r.revision !== s.timeRevision || r.light !== s.light) {
      climate.minutes = r.revision !== s.timeRevision ? s.worldMinutes : TIME_PRESETS.find(p => p.id === s.light)!.minutes;
      r.revision = s.timeRevision; r.light = s.light; r.transition = 0;
    }
    if (r.weather !== s.weather) { r.weather = s.weather; r.transition = 0; }
    const running = s.ready && !s.paused && !s.poolInspect && !s.shot && !document.hidden;
    climate.minutes = advanceWorldMinutes(climate.minutes, delta, running && s.timeRunning);
    const minute = Math.floor(climate.minutes);
    if (minute !== r.published) {
      r.published = minute; r.light = timePresetAt(climate.minutes);
      useWorldStore.setState({ worldMinutes: climate.minutes, light: r.light });
    }
    r.transition = Math.min(2, r.transition + Math.min(delta, .1));
    climate.blend = r.transition >= 2 ? 1 : 1 - Math.exp(-Math.min(delta, .1) * 5);
    night.value += (sampleTimeLight(climate.minutes, r.sample).night - night.value) * climate.blend;
    climate.rain += ((s.weather === 'rain' ? 1 : 0) - climate.rain) * climate.blend;
    climate.snow += ((s.weather === 'snow' ? 1 : 0) - climate.snow) * climate.blend;
    weatherUniforms.uRain.value = climate.rain; weatherUniforms.uSnow.value = climate.snow;
    // A menu edit gets a finite transition, then demand rendering sleeps again.
    if (r.transition < 2 && !document.hidden) invalidate();
  }, -5);
  return null;
}
