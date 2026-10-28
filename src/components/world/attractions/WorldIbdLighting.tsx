import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { PointLight } from 'three';
import { night } from '../WorldNight';
import { useWorldStore } from '../store';
import { IBD_YARD } from './attraction-layout.ts';
import { IBD_FIXTURES, nearestIbdFixtures } from './ibd-yard-lighting.ts';
import { WORLD_SHOTS } from '../layout';

/** Static fill follows the shared clock; exactly two nearby fixtures shade the player and moving cargo. */
export default function WorldIbdLighting({ active, uniform }: { active: boolean; uniform: { value: number } }) {
  const lights = useRef<(PointLight | null)[]>([null, null]);
  const selection = useRef([-1, -1]);
  const previous = useRef([-1, -1]);
  const last = useRef({ x: Infinity, z: Infinity, night: -1 });
  const shot = useWorldStore(s => s.shot);
  const shotTarget = useMemo(() => WORLD_SHOTS.find(view => view.id === shot)?.target, [shot]);
  useEffect(() => { if (!active) for (const light of lights.current) if (light) light.intensity = 0; }, [active]);
  useFrame((_, delta) => {
    if (document.hidden) return;
    uniform.value = night.value;
    if (!active) return;
    const world = useWorldStore.getState();
    // Evidence cameras must sample the fixtures at the inspected object, just as
    // a player standing there does; the dormant spawn is often outside the shed.
    const focus = shotTarget ?? world.position;
    const unchanged = last.current.x === focus[0] && last.current.z === focus[2] && last.current.night === night.value;
    if ((world.paused || world.shot || world.poolInspect || world.card) && unchanged) return;
    last.current.x = focus[0]; last.current.z = focus[2]; last.current.night = night.value;
    nearestIbdFixtures(focus[0] - IBD_YARD.center[0], focus[2] - IBD_YARD.center[2], selection.current);
    for (let i = 0; i < 2; i++) {
      const light = lights.current[i], index = selection.current[i];
      if (!light) continue;
      if (index < 0) { light.intensity = 0; previous.current[i] = -1; continue; }
      const fixture = IBD_FIXTURES[index];
      if (previous.current[i] !== index) { light.position.set(...fixture.at); light.intensity = 0; previous.current[i] = index; }
      light.distance = fixture.reach;
      const target = night.value * (fixture.pendant ? 80 : 24) * fixture.power;
      const frozen = world.paused || world.shot || world.poolInspect || world.card;
      light.intensity += (target - light.intensity) * (frozen ? 1 : 1 - Math.exp(-Math.min(delta, .05) * 12));
    }
  });
  return <group name="ibd-nearby-light-pair">
    {[0, 1].map(i => <pointLight key={i} ref={light => { lights.current[i] = light; }} color="#ffd39a" intensity={0}
      distance={16} decay={2} castShadow={false} />)}
  </group>;
}
