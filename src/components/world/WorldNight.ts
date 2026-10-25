import { useFrame, useThree } from '@react-three/fiber';
import { useWorldStore } from './store';

/**
 * Shared dusk -> night blend, 0 = dusk, 1 = night, eased over the locked 2 s transition. One clock
 * for every district (window glow, lamp heads, signs, hut light), so nothing switches on its own.
 * WorldRuntime mounts <NightClock /> once; consumers read `night.value` inside useFrame.
 */
export const night = { value: 0 };
const state = { start: 0, target: 0, elapsed: 2 };
let last: 'dusk' | 'night' | null = null;

export function NightClock() {
  const invalidate = useThree(s => s.invalidate);
  useFrame((_, delta) => {
    const light = useWorldStore.getState().light;
    if (light !== last) {
      state.start = night.value; state.target = light === 'night' ? 1 : 0; state.elapsed = last === null ? 2 : 0; last = light;
      if (state.elapsed >= 2) night.value = state.target;
    }
    if (state.elapsed >= 2) return;
    state.elapsed = Math.min(2, state.elapsed + Math.min(delta, .1));
    const t = state.elapsed / 2;
    night.value = state.start + (state.target - state.start) * (t * t * (3 - 2 * t));
    // Keep menu light changes moving in demand mode, then let the canvas sleep.
    if (state.elapsed < 2) invalidate();
  });
  return null;
}
