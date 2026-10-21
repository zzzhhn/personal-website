import { memo, Suspense, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import WorldEnvironment from './WorldEnvironment';
import WorldObstacles from './WorldObstacles';
import WorldActors, { worldActorDebug } from './WorldActors';
import { useWorldStore } from './store';
import { CAMP_SPAWN, WORLD_SHOTS } from './layout';
import { trackPortfolioEvent } from '../../lib/analytics';
import type { WorldContent } from './types';

function SceneLifecycle() {
  const { camera, gl, scene } = useThree();
  const shot = useWorldStore(s => s.shot);
  const frames = useRef(0);
  useEffect(() => {
    if (!shot) return;
    const view = WORLD_SHOTS.find(v => v.id === shot);
    if (view) { camera.position.set(...view.position); camera.lookAt(...view.target); camera.updateProjectionMatrix(); }
  }, [shot, camera]);
  useFrame(() => {
    frames.current++;
    if (frames.current === 3) useWorldStore.setState({ ready: true });
  });
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('qa') !== '1') return;
    const debug = {
      ...worldActorDebug,
      state: () => useWorldStore.getState(),
      set: (value: Partial<ReturnType<typeof useWorldStore.getState>>) => useWorldStore.setState(value),
      stats: () => ({ calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, camera: camera.position.toArray() }),
      sceneObjects: () => { const result: string[] = []; scene.traverse(o => { if (o.name) result.push(o.name); }); return result; },
    };
    Object.assign(window, { __worldDebug: debug });
    return () => { delete (window as Window & { __worldDebug?: unknown }).__worldDebug; };
  }, [camera, gl, scene]);
  return null;
}

export default memo(function WorldRuntime({ content: _content }: { content: WorldContent }) {
  const paused = useWorldStore(s => s.paused);
  const shot = useWorldStore(s => s.shot);
  useEffect(() => {
    const qa = new URLSearchParams(window.location.search).has('qa');
    if (qa || useWorldStore.getState().shot) return;
    let entered = false;
    const unsubscribe = useWorldStore.subscribe((state, previous) => {
      if (state.ready && !entered) { entered = true; trackPortfolioEvent('world_enter', 'island'); }
      if (state.activeVehicle && state.activeVehicle !== previous.activeVehicle) trackPortfolioEvent('world_vehicle_enter', state.activeVehicle);
    });
    return unsubscribe;
  }, []);
  return <Canvas shadows dpr={[1, 1.5]} camera={{ position: [CAMP_SPAWN[0] + 10, CAMP_SPAWN[1] + 13, CAMP_SPAWN[2] + 10], fov: 50, near: .1, far: 600 }} gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}>
    <Suspense fallback={null}><Physics gravity={[0, -9.81, 0]} timeStep={1 / 60} paused={paused || !!shot} colliders={false}><WorldEnvironment /><WorldObstacles /><WorldActors /><SceneLifecycle /></Physics></Suspense>
  </Canvas>;
});
