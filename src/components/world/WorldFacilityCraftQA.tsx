/** Task-owned controls for matched real-world screenshots, only ?craftReview=1. */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, type Mesh, type Object3D } from 'three';
import { HUTS } from './WorldParkLayout';
import { solidsV4 } from './layout-v4';
import { selectWorldTime, useWorldStore } from './store';
import type { Vec3 } from './types';
import { climate, night } from './WorldNight';
import { WORLD_SHOTS } from './layout';
import { shadowChunkWork, shadowTelemetry } from './WorldShadows';

/** Registered geometry and hierarchy visibility, not a GPU/performance estimate.
 * Asset IDs plus loaded URLs explain late mounts that gl.info alone cannot. */
function assetSnapshot(scene: Object3D) {
  const digest = (values: string[]) => { let hash = 2166136261; for (const c of values.sort().join('|')) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619); return (hash >>> 0).toString(16); };
  return Object.fromEntries(['world-park','world-street','djc-beach-club','djc-north-bar-visual','djc-furniture-visuals','world-camp-slice'].map(name => {
    const root = scene.getObjectByName(name), meshes: string[] = [], visibleMeshes: string[] = [], ids = new Set<string>();
    let nominalTriangles = 0;
    root?.traverse(object => {
      const mesh = object as Mesh; if (!mesh.isMesh) return;
      let owner: Object3D | null = mesh, visible = true, asset = '';
      while (owner) { visible &&= owner.visible; asset ||= owner.userData.assetId ?? ''; owner = owner.parent; }
      const triangles = (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position')?.count ?? 0) / 3;
      const key = `${asset}:${mesh.name}:${triangles}`;
      meshes.push(key); if (visible) visibleMeshes.push(key); if (asset) ids.add(asset); nominalTriangles += triangles;
    });
    const assetIds = [...ids].sort();
    return [name, { present: !!root, meshes: meshes.length, visible: visibleMeshes.length, nominalTriangles,
      registeredSet: digest(meshes), visibleSet: digest(visibleMeshes), assetIds: assetIds.slice(0,12), assetIdsCount: ids.size }];
  }));
}

export default function WorldFacilityCraftQA() {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('craftReview') === '1'
    ? <CraftReview /> : null;
}
function CraftReview() {
  const { gl, camera, scene, setDpr, invalidate } = useThree(), selected = useRef(0);
  const recordButton = useRef<HTMLButtonElement | null>(null);
  const warm = useRef({ ready: false, frames: 0, stable: 0, signature: '', changed: 0 });
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
      { id: 'shelter-glass-grazing', eye: world([-1.6, 1.55, -4.4]), target: world([.63, 1.3, 0]) },
      { id: 'shelter-glass-rear', eye: world([2.4, 1.55, -2.2]), target: world([.63, 1.3, 0]) },
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
      loading: useWorldStore.getState().loading, registeredAssets: assetSnapshot(scene),
      loadedGlbs: [...new Set(performance.getEntriesByType('resource').map(entry => new URL(entry.name, location.href).pathname)
        .filter(url => url.endsWith('.glb') && /park|facility|djc|bar|camp/.test(url)))].sort().slice(0,24),
      materialRevision: 2,
      shadow: { ...shadowChunkWork(), centre: shadowTelemetry()?.centre } });
      if (shadowChunkWork().pending) { warm.current.ready = false; warm.current.stable = 0; invalidate(); }
    });
    button('Compact craft controls', () => { report.hidden = true; });
    panel.append(' H：hide/show '); panel.appendChild(report); document.body.appendChild(panel);
    const key = (event: KeyboardEvent) => { if (event.key.toLowerCase() === 'h') panel.hidden = !panel.hidden; };
    window.addEventListener('keydown', key);
    return () => { panel.remove(); useWorldStore.setState({ shot: previous }); window.removeEventListener('keydown', key);
      for (const shot of shots) { const index = WORLD_SHOTS.indexOf(shot); if (index >= 0) WORLD_SHOTS.splice(index, 1); } };
  }, [views, gl, scene]);
  useFrame(() => {
    if (gl.getPixelRatio() !== 1) setDpr(1);
    // Finite QA warm-up, stopped after climate and the actual shadow job settle.
    if (!warm.current.ready && ++warm.current.frames % 4 === 0) {
      const loading = useWorldStore.getState().loading;
      const targetReady = HUTS.every(h => !!scene.getObjectByName(`park-hut-${h.id}-solid`)) && !!scene.getObjectByName('street-fixed');
      const signature = JSON.stringify([gl.info.memory, loading, assetSnapshot(scene)]);
      if (signature !== warm.current.signature) { warm.current.signature = signature; warm.current.changed = performance.now(); }
      warm.current.stable = climate.blend === 1 && !shadowChunkWork().pending && !loading.active && targetReady
        && performance.now() - warm.current.changed >= 1000 ? warm.current.stable + 1 : 0;
      warm.current.ready = warm.current.stable >= 3;
      if (recordButton.current) recordButton.current.title = JSON.stringify({ blend: climate.blend, loading: loading.active, targetReady,
        shadowPending: shadowChunkWork().pending, stableAgeMs: Math.round(performance.now() - warm.current.changed), checks: warm.current.stable });
    }
    if (!warm.current.ready) invalidate();
    if (recordButton.current && recordButton.current.disabled === warm.current.ready) recordButton.current.disabled = !warm.current.ready;
    const view = views[selected.current];
    camera.position.set(...view.eye); camera.up.set(0, 1, 0); camera.lookAt(...view.target);
    if (camera instanceof PerspectiveCamera && camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
  });
  return null;
}
