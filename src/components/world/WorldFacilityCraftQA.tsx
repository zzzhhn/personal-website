/** Task-owned controls for matched real-world screenshots, only ?craftReview=1. */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from 'three';
import { HUTS } from './WorldParkLayout';
import { solidsV4 } from './layout-v4';
import { selectWorldTime, useWorldStore } from './store';
import type { Vec3 } from './types';
import { climate, night } from './WorldNight';
import { WORLD_SHOTS } from './layout';
import { shadowChunkWork, shadowTelemetry } from './WorldShadows';

export default function WorldFacilityCraftQA() {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('craftReview') === '1'
    ? <CraftReview /> : null;
}
function CraftReview() {
  const { gl, camera, setDpr, invalidate } = useThree(), selected = useRef(0);
  const recordButton = useRef<HTMLButtonElement | null>(null);
  const warm = useRef({ ready: false, frames: 0, stable: 0 });
  const views = useMemo(() => {
    const shelter = solidsV4().find(s => s.kind === 'shelter')!;
    const root: Vec3 = [shelter.position[0], shelter.position[1] - shelter.size[1] / 2, shelter.position[2]];
    const world = (p: Vec3): Vec3 => [root[0] + Math.cos(shelter.yaw) * p[0] + Math.sin(shelter.yaw) * p[2], root[1] + p[1], root[2] - Math.sin(shelter.yaw) * p[0] + Math.cos(shelter.yaw) * p[2]];
    const hut = HUTS[0];
    return [
      { id: 'shelter-normal', eye: world([-5.5, 2.2, -5.4]), target: world([0, 1.2, 0]) },
      { id: 'shelter-close', eye: world([-2.4, 1.6, -2.2]), target: world([.2, 1.25, 0]) },
      { id: 'hut-normal', eye: hut.local(-6.3, 3.6, 8.2), target: hut.local(0, 1.35, -1.1) },
      { id: 'hut-close', eye: hut.local(-3.8, 1.8, 2.8), target: hut.local(-1.2, 1.6, -.9) },
    ];
  }, []);
  useEffect(() => {
    const previous = useWorldStore.getState().shot;
    const shots = views.map(view => ({ id: 'craft6-' + view.id, position: view.eye, target: view.target }));
    WORLD_SHOTS.push(...shots);
    useWorldStore.setState({ shot: shots[0].id, timeRunning: false, weather: 'clear' });
    selectWorldTime('noon');
    const panel = document.createElement('div'), report = document.createElement('pre');
    panel.dataset.facilityReview = 'true';
    panel.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99999;background:#111e;color:white;padding:8px;font-size:12px;max-width:850px';
    report.style.whiteSpace = 'pre-wrap'; report.textContent = views[0].id;
    const button = (text: string, action: () => void) => {
      const b = document.createElement('button'); b.textContent = text; b.onclick = action; panel.appendChild(b); return b;
    };
    views.forEach((view, i) => button(view.id, () => { panel.style.opacity = '1'; report.hidden = false; selected.current = i;
      warm.current.ready = false; warm.current.frames = 0; warm.current.stable = 0; useWorldStore.setState({ shot: shots[i].id }); report.textContent = view.id; invalidate(); }));
    const time = (value: 'noon' | 'night') => { warm.current.ready = false; warm.current.frames = 0; warm.current.stable = 0;
      if (recordButton.current) recordButton.current.disabled = true; selectWorldTime(value); invalidate(); };
    button('Craft noon', () => time('noon'));
    button('Craft night', () => time('night'));
    recordButton.current = button('Craft record', () => { report.textContent = JSON.stringify({ baseline: '7702c3d', view: views[selected.current], fov: 50,
      time: useWorldStore.getState().worldMinutes, canvas: [gl.domElement.width, gl.domElement.height], exposure: gl.toneMappingExposure,
      renderer: { render: gl.info.render, memory: gl.info.memory }, quality: useWorldStore.getState().quality, night: night.value, blend: climate.blend,
      shadow: { ...shadowChunkWork(), centre: shadowTelemetry()?.centre } });
      if (shadowChunkWork().pending) { warm.current.ready = false; warm.current.stable = 0; invalidate(); }
    });
    button('Compact craft controls', () => { report.hidden = true; });
    panel.append(' H：hide/show '); panel.appendChild(report); document.body.appendChild(panel);
    const key = (event: KeyboardEvent) => { if (event.key.toLowerCase() === 'h') panel.hidden = !panel.hidden; };
    window.addEventListener('keydown', key);
    return () => { panel.remove(); useWorldStore.setState({ shot: previous }); window.removeEventListener('keydown', key);
      for (const shot of shots) { const index = WORLD_SHOTS.indexOf(shot); if (index >= 0) WORLD_SHOTS.splice(index, 1); } };
  }, [views, gl]);
  useFrame(() => {
    if (gl.getPixelRatio() !== 1) setDpr(1);
    // Finite QA warm-up, stopped after climate and the actual shadow job settle.
    if (!warm.current.ready && ++warm.current.frames % 4 === 0) {
      warm.current.stable = climate.blend === 1 && !shadowChunkWork().pending ? warm.current.stable + 1 : 0;
      warm.current.ready = warm.current.stable >= 3;
    }
    if (!warm.current.ready) invalidate();
    if (recordButton.current && recordButton.current.disabled === warm.current.ready) recordButton.current.disabled = !warm.current.ready;
    const view = views[selected.current];
    camera.position.set(...view.eye); camera.up.set(0, 1, 0); camera.lookAt(...view.target);
    if (camera instanceof PerspectiveCamera && camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
  });
  return null;
}
