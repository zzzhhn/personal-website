import { Raycaster, Vector3 } from 'three';
import { lazy, memo, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics, useRapier } from '@react-three/rapier';
import WorldEnvironment from './WorldEnvironment';
import WorldObstacles from './WorldObstacles';
import WorldActors, { worldActorDebug } from './WorldActors';
import { useWorldStore } from './store';
import { CAMP_SPAWN, LAYOUT_V4, ROAD_POINTS, VEHICLES, WORLD_SHOTS } from './layout';
import { trackPortfolioEvent } from '../../lib/analytics';
import type { WorldContent } from './types';
import { useWindClock, windUniforms } from './WorldWind';
import { campColliderRecords } from './WorldCampPhysics';
import { useWorldResolution, visualInventory, objectIdentity, colliderBounds, renderSize } from './WorldQuality';
import { guideSkinEvidence } from './WorldGuideEvidence';
import { night, NightClock } from './WorldNight';
import { claimedKeys } from './WorldVisualClaims';
// District mount points are imported statically so their greybox claims (WorldVisualClaims) are
// registered before the greybox layout is first built. Heavy GLBs still load lazily inside them.
import WorldTown from './WorldTown';
import WorldPark from './WorldPark';
import WorldStreet from './WorldStreet';
import WorldCampContent from './WorldCampContent';
import WorldEntry from './WorldEntry';
import WorldAlphaMine from './WorldAlphaMine';
import WorldWeather from './WorldWeather';
import { setRenderReadoutSource } from './world-render-readout';
import { clubWaterFrameWindow } from './WorldClubWaterBudget';

// Layout v4 greybox (?layout=v4) loads as its own chunk; the default entry never fetches it.
const WorldDistricts = LAYOUT_V4 ? lazy(() => import('./WorldDistricts')) : null;

function usePageVisible() {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    update();
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}

function SceneLifecycle({ setOverlay }: { setOverlay: (on: boolean) => void }) {
  useWindClock();
  useWorldResolution();
  const { world, colliderStates, rapier } = useRapier();
  const { camera, gl, scene, clock, invalidate, size, get } = useThree();
  const shot = useWorldStore(s => s.shot);
  const paused = useWorldStore(s => s.paused || s.poolInspect);
  const light = useWorldStore(s => s.light);
  const timeRevision = useWorldStore(s => s.timeRevision);
  const weather = useWorldStore(s => s.weather);
  const quality = useWorldStore(s => s.quality);
  const frames = useRef(0);
  const frameDelta = useRef(0);
  const [frameSample] = useState(() => import.meta.env.DEV && new URLSearchParams(window.location.search).get('qa') === '1'
    ? { values: new Float32Array(180), count: 0, cursor: 0, warm: 0 } : null);
  useLayoutEffect(() => {
    if (import.meta.env.DEV) clubWaterFrameWindow.invalidate();
    if (document.hidden) return;
    // A demand frame must not include the time spent asleep. This also covers
    // menu edits and resize without changing the requested drawing resolution.
    clock.getDelta();
    if (frameSample && !paused) { frameSample.count = 0; frameSample.cursor = 0; frameSample.warm = 0; }
    invalidate();
  }, [paused, light, timeRevision, weather, quality, size.width, size.height, clock, invalidate, frameSample]);
  useEffect(() => { useWorldStore.setState(s => ({ loading: { ...s.loading, phase: 'scene' } })); }, []);
  useEffect(() => {
    if (!shot) return;
    const view = WORLD_SHOTS.find(v => v.id === shot);
    if (view) { camera.position.set(...view.position); camera.lookAt(...view.target); camera.updateProjectionMatrix(); }
  }, [shot, camera]);
  useFrame((_, delta) => {
    frameDelta.current = delta;
    if (frameSample && !paused && !document.hidden && delta > 0) {
      if (frameSample.warm < 30) frameSample.warm++;
      else {
        clubWaterFrameWindow.record(delta * 1000);
        frameSample.values[frameSample.cursor] = delta * 1000;
        frameSample.cursor = (frameSample.cursor + 1) % frameSample.values.length;
        frameSample.count = Math.min(frameSample.count + 1, frameSample.values.length);
      }
    }
    frames.current++;
    // Loading may finish while paused; still deliver the existing ready signal.
    if (frames.current < 3) invalidate();
    if (frames.current === 3) useWorldStore.setState(s => ({ ready: true, loading: { ...s.loading, phase: 'ready' } }));
  });
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('qa') !== '1') return;
    const debug = {
      ...worldActorDebug,
      actorSkin: (topology = false) => guideSkinEvidence(scene, topology),
      state: () => useWorldStore.getState(),
      // Bots read routes / spots from the running layout instead of hand-copied coordinates.
      layout: () => (window as unknown as { __worldDistricts?: { layout: () => unknown } }).__worldDistricts?.layout()
        ?? { version: LAYOUT_V4 ? 'v4-loading' : 'v3', timeline: ROAD_POINTS, vehicles: Object.fromEntries(VEHICLES.map(v => [v.id, { position: v.position, yaw: v.yaw }])) },
      set: (value: Partial<ReturnType<typeof useWorldStore.getState>>) => useWorldStore.setState(value),
      campColliders: campColliderRecords,
      motionInventory: () => {
        const out: unknown[] = [];
        scene.traverse(o => {
          const m = o as unknown as { name: string; geometry?: { attributes: Record<string, { count: number }>; userData: Record<string, unknown> }; customDepthMaterial?: unknown; customDistanceMaterial?: unknown };
          if (m.geometry?.attributes._cloth || m.geometry?.attributes._wind) out.push({ name: m.name, cloth: !!m.geometry.attributes._cloth, wind: !!m.geometry.attributes._wind,
            curtainShells: m.geometry.userData.curtainShells ?? null, matchingDepth: !!m.customDepthMaterial, matchingDistance: !!m.customDistanceMaterial });
        });
        return { time: windUniforms.uWindTime.value, strength: windUniforms.uWindStrength.value, meshes: out };
      },
      visualInventory: () => visualInventory(scene),
      visualRaycast: (origin: [number, number, number], direction: [number, number, number], assetId: string) => {
        const ray = new Raycaster(new Vector3(...origin), new Vector3(...direction).normalize(), 0, 3);
        return ray.intersectObjects(scene.children, true).filter(hit => objectIdentity(hit.object).assetId === assetId)
          .slice(0, 8).map(hit => ({ point: hit.point.toArray(), distance: hit.distance, name: hit.object.name, instanceId: hit.instanceId ?? null }));
      },
      // Isolated QA query for elevated small props that the player's body cannot reach
      // without first touching their supporting furniture. No movement or collider mutation.
      probeAsset: (assetId: string, origin: [number, number, number], direction: [number, number, number], radius = .05) => {
        const dir = new Vector3(...direction).normalize();
        const hit = world.castShape(new Vector3(...origin), {x:0,y:0,z:0,w:1}, dir, new rapier.Ball(radius), 0, 3, true,
          undefined, undefined, undefined, undefined,
          c => !c.isSensor() && objectIdentity(colliderStates.get(c.handle)?.object, c.parent()?.userData).assetId === assetId);
        if (!hit) return null;
        // World.castShape returns the fixed collider witness in world coordinates (verified
        // against a translated cuboid in the installed Rapier version); no guessed sphere edge.
        const point = new Vector3(hit.witness1.x, hit.witness1.y, hit.witness1.z);
        const normal = new Vector3(hit.normal1.x, hit.normal1.y, hit.normal1.z).normalize();
        const ray = new Raycaster(point.clone().addScaledVector(normal, .4), normal.clone().negate(), 0, 3);
        const visual = ray.intersectObjects(scene.children, true).filter(h => objectIdentity(h.object).assetId === assetId);
        return { radius, toi: hit.time_of_impact, point: point.toArray(), normal: normal.toArray(),
          visualBoundaryGap: visual.length ? Math.min(...visual.map(h => Math.abs(h.distance - .4))) : null };
      },
      physicsInventory: () => {
        const out: unknown[] = [];
        world.forEachCollider(c => {
          const object = colliderStates.get(c.handle)?.object;
          const meta = objectIdentity(object, c.parent()?.userData);
          const shape = c.shape, translation = c.translation(), rotation = c.rotation();
          const name = rapier.ShapeType[shape.type];
          out.push({ ...meta, handle: c.handle, kind: c.isSensor() ? 'sensor' : meta.kind,
            shape: name.toLowerCase(), translation: [translation.x, translation.y, translation.z],
            rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
            aabb: colliderBounds(shape, translation, rotation, name === 'Capsule'), visualRef: object?.name || null });
        });
        return out;
      },
      setColliderOverlay: (on: boolean) => setOverlay(on),
      animationClock: () => Object.fromEntries(['flags', 'fire', 'nature', 'water', 'cloth'].map(k => [k, windUniforms.uWindTime.value])),
      renderInfo: () => {
        const buffer = gl.getDrawingBufferSize(renderSize), rect = gl.domElement.getBoundingClientRect(), ctx = gl.getContext();
        let shadowMapSize = 0;
        scene.traverse(o => { const l = o as unknown as { isDirectionalLight?: boolean; shadow?: { mapSize: { x: number } } }; if (l.isDirectionalLight && l.shadow) shadowMapSize = l.shadow.mapSize.x; });
        return { drawingBuffer: [buffer.x, buffer.y], cssSize: [rect.width, rect.height], pixelRatio: gl.getPixelRatio(), dprRange: [0, useWorldStore.getState().quality === 'high' ? 2 : 1.5],
          quality: useWorldStore.getState().quality, antialias: ctx.getContextAttributes()?.antialias, msaaSamples: ctx.getParameter(ctx.SAMPLES), toneMapping: gl.toneMapping, outputColorSpace: gl.outputColorSpace,
          shadowMapSize, shadowType: gl.shadowMap.type, postprocessing: [] };
      },
      stats: () => ({ calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, programs: gl.info.programs?.length ?? 0, camera: camera.position.toArray() }),
      renderLoop: () => ({ mode: get().frameloop, frame: gl.info.render.frame, delta: frameDelta.current, night: night.value, windTime: windUniforms.uWindTime.value,
        frameMs: (() => {
          if (!frameSample?.count) return null;
          const values = Array.from(frameSample.values.subarray(0, frameSample.count)).sort((a,b) => a-b);
          return { samples: values.length, p50: values[Math.floor(values.length*.5)], p95: values[Math.floor(values.length*.95)], max: values[values.length-1] };
        })() }),
      sceneObjects: () => { const result: string[] = []; scene.traverse(o => { if (o.name) result.push(o.name); }); return result; },
      claimedGreybox: () => claimedKeys(),
    };
    Object.assign(window, { __worldDebug: debug });
    if(import.meta.env.DEV)setRenderReadoutSource(()=>({sampledAt:new Date().toISOString(),...debug.stats(),...debug.renderLoop(),...debug.renderInfo()}));
    return () => { if(import.meta.env.DEV)setRenderReadoutSource(null);delete (window as Window & { __worldDebug?: unknown }).__worldDebug; };
  }, [camera, gl, scene, get, world, colliderStates, rapier, setOverlay]);
  return null;
}

export default memo(function WorldRuntime({ content }: { content: WorldContent }) {
  const [overlay, setOverlay] = useState(false);
  const paused = useWorldStore(s => s.paused || s.poolInspect);
  const shot = useWorldStore(s => s.shot);
  const visible = usePageVisible();
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
  return <Canvas frameloop={!visible ? 'never' : paused ? 'demand' : 'always'} shadows="percentage" dpr={[1, 2]} camera={{ position: [CAMP_SPAWN[0] + 10, CAMP_SPAWN[1] + 13, CAMP_SPAWN[2] + 10], fov: 50, near: .1, far: 600 }} gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}>
    <Suspense fallback={null}><Physics debug={overlay} gravity={[0, -9.81, 0]} timeStep={1 / 60} paused={paused || !visible || !!shot} colliders={false}>
      <NightClock />
      <WorldWeather />
      <WorldEnvironment experiences={content.experiences} />{WorldDistricts && <WorldDistricts />}<WorldObstacles /><WorldActors />
      {/* Each district suspends on its own GLBs without holding back the island or the player. */}
      <Suspense fallback={null}><WorldTown experiences={content.experiences} /></Suspense>
      <Suspense fallback={null}><WorldPark projects={content.projects} /></Suspense>
      <WorldAlphaMine content={content} />
      <Suspense fallback={null}><WorldStreet experiences={content.experiences} /></Suspense>
      <Suspense fallback={null}><WorldCampContent /></Suspense>
      <Suspense fallback={null}><WorldEntry /></Suspense>
      <SceneLifecycle setOverlay={setOverlay} />
    </Physics></Suspense>
  </Canvas>;
});
