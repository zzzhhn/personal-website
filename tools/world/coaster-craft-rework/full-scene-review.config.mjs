import base from '../../../astro.config.mjs';

// This harness is applied to two independent source trees. It deliberately does
// not substitute a handful of baseline files into the candidate dependency graph.
const views = [
  ['workshop', [48, 10, -110], [34, 2, -129]],
  ['station', [56, 4.1, -127.5], [48, 6.2, -146]],
  ['entrance', [50, 4.2, -114], [50, 14, -194]],
  ['overview', [147, 76, -83], [50, 16, -192]],
  ['short-bay', [69, 5.6, -321], [63.2, 7.3, -334.1]],
  ['train', [45.2, 3.2, -153.9], [50, 2.45, -152]],
  ['lookout', [128, 16, -155], [105, 6, -180]],
  ['rocks', [30, 12, -235], [7, 3, -260]],
  ['tower', [19, 7, -318], [6, 34, -344]],
  ['machines', [27, 4, -125], [34, 2.3, -130]],
];
const extraViews = [
  ['services', [27, 5.1, -165], [14, 5.1, -181]],
  ['chest', [43.2, 3.25, -129.8], [42, 2.1, -135.5]],
  ['tunnel', [14.12651, 5.47945, -193.83161], [2.54973, 5.16395, -185.96531]],
];
const shotIds = views.map(([id]) => `scene-${id}`);
const source = process.env.COASTER_REVIEW_SOURCE ?? 'unspecified';
function replace(code, marker, patch) {
  if (!code.includes(marker)) throw new Error(`Missing full-scene review marker: ${marker}`);
  return code.replace(marker, patch);
}
const review = { name: 'independent-coaster-scene-review', enforce: 'pre', transform(code, id) {
  if (id.endsWith('/WorldQuality.ts')) {
    code = replace(code, 'const quality = useWorldStore(s => s.quality);',
      'const quality = useWorldStore(s => s.quality);\n  const reviewShot = useWorldStore(s => s.shot);');
    code = replace(code, 'setDpr(Math.min(high ? 2 : 1.5, desired, Math.sqrt(budget / (size.width * size.height))));', 'setDpr(1);');
    return replace(code, '[size.width, size.height, quality, frameloop, setDpr]', '[size.width, size.height, quality, frameloop, setDpr, reviewShot]');
  }
  if (id.endsWith('/layout-v4-flag.ts')) return replace(code, 'export const WORLD_SHOTS_V4 = [',
    `export const WORLD_SHOTS_V4 = [\n${[...views,...extraViews].flatMap(([name, position, target]) => ['day', 'night'].map(time =>
      `{id:'scene-${name}-${time}',position:${JSON.stringify(position)} as Vec3,target:${JSON.stringify(target)} as Vec3},`)).join('\n')}`);
  if (!id.endsWith('/WorldRuntime.tsx')) return;
  const marker = '  const { camera, gl, scene, clock, invalidate, size, get } = useThree();';
  return `import { climate as sceneReviewClimate } from './WorldNight';
import { shadowChunkWork as sceneReviewShadow } from './WorldShadows';
import { commitIntentEvent as qaCommitIntentEvent } from './attractions/intent-state';
import { INTENT_TASKS as qaIntentTasks } from './attractions/intent-tasks';
import { INTENT_TARGETS as qaIntentTargets } from './attractions/intent-stations';
import { COASTER_BOARDING as qaBoarding } from './attractions/coaster-transition';
import { PLAYER_CENTER_HEIGHT as qaPlayerHeight } from './actor-physics';
` + replace(code, marker, `${marker}
  const sceneReview = useRef({active:false, warm:0, samples:[] as number[], previous:0,
    started:0, result:null as null | {samples:number;p50:number;p95:number;max:number}, updated:0});
  useEffect(() => {
    const select = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.altKey) return;
      const state = useWorldStore.getState();
      if (/^Digit[0-9]$/.test(event.code)) {
        event.preventDefault();
        const name = ${JSON.stringify(shotIds)}[(Number(event.code.at(-1)) + 9) % 10];
        const dark = state.light === 'night';
        sceneReview.current.result = null;
        useWorldStore.setState(s => ({shot:name+(dark?'-night':'-day'), paused:false,
          timeRunning:false,weather:'clear',worldMinutes:dark?0:720,light:dark?'night':'noon',timeRevision:s.timeRevision+1}));
      } else if (['KeyK','KeyS','KeyL'].includes(event.code)) {
        event.preventDefault();
        const name = ({KeyK:'chest',KeyS:'services',KeyL:'tunnel'} as Record<string,string>)[event.code];
        const dark = state.light === 'night';
        useWorldStore.setState(s=>({shot:'scene-'+name+(dark?'-night':'-day'),paused:false,timeRunning:false,
          worldMinutes:dark?0:720,light:dark?'night':'noon',timeRevision:s.timeRevision+1}));
      } else if (event.code === 'KeyU') {
        // Test fixture completes only the six prerequisite answers. Actual
        // chest, key, gate and boarding actions still use their normal E path.
        event.preventDefault();
        for (const task of qaIntentTasks.filter(task=>!task.clarification).slice(0,6))
          qaCommitIntentEvent({type:'submit',taskId:task.id,answer:task.intent});
        const p=qaIntentTargets.chest;
        worldActorDebug.teleportPlayer([p[0],1.14+qaPlayerHeight,p[2]+1.65]);
        useWorldStore.setState({shot:null,paused:false,seat:null,timeRunning:false});
      } else if (event.code === 'KeyG' || event.code === 'KeyB') {
        event.preventDefault();
        const p=event.code==='KeyB'?qaBoarding.approach:qaIntentTargets.gate;
        worldActorDebug.teleportPlayer([p[0],(event.code==='KeyB'?p[1]:1.14)+qaPlayerHeight,p[2]+(event.code==='KeyG'?1.6:0)]);
        useWorldStore.setState({shot:null,paused:false,seat:null,timeRunning:false});
      } else if (event.code === 'KeyN') {
        event.preventDefault();
        const dark = state.light !== 'night';
        useWorldStore.setState(s => ({shot:s.shot?.replace(/-(day|night)$/,'')+(dark?'-night':'-day'),
          timeRunning:false,weather:'clear',worldMinutes:dark?0:720,light:dark?'night':'noon',timeRevision:s.timeRevision+1}));
      } else if (event.code === 'KeyP') {
        event.preventDefault();
        Object.assign(sceneReview.current,{active:true,warm:0,samples:[],previous:0,started:performance.now(),result:null});
      } else if (event.code === 'KeyR') {
        event.preventDefault(); useWorldStore.setState({shot:null,paused:false,timeRunning:false});
      } else return;
      invalidate();
    };
    window.addEventListener('keydown',select);
    return () => window.removeEventListener('keydown',select);
  },[invalidate]);
  useFrame(() => {
    const state = useWorldStore.getState(), probe = sceneReview.current, now = performance.now();
    const shadow = sceneReviewShadow();
    if (state.shot && (shadow.pending || sceneReviewClimate.blend < 1 || state.loading.active)) invalidate();
    if (probe.active && !document.hidden) {
      if (probe.previous && probe.warm++ >= 30) probe.samples.push(now-probe.previous);
      probe.previous = now;
      if (probe.samples.length >= 180 || now-probe.started > 30000) {
        const values = probe.samples.sort((a,b)=>a-b);
        probe.result = values.length ? {samples:values.length,p50:values[Math.floor(values.length*.5)],
          p95:values[Math.floor(values.length*.95)],max:values.at(-1)!} : null;
        probe.active = false;
      } else invalidate();
    }
    if (!probe.active || now-probe.updated > 500) {
      probe.updated=now;
      gl.domElement.dataset.coasterReadback = JSON.stringify({source:${JSON.stringify(source)},shot:state.shot,
        quality:state.quality,time:state.worldMinutes,weather:state.weather,
        camera:camera.position.toArray(),direction:camera.getWorldDirection(camera.position.clone()).toArray(),
        fov:'fov' in camera?camera.fov:null,exposure:gl.toneMappingExposure,canvas:[gl.domElement.width,gl.domElement.height],
        dpr:gl.getPixelRatio(),night:night.value,blend:sceneReviewClimate.blend,shadowPending:shadow.pending,
        shadowError:shadow.error,loading:state.loading.active,failed:state.loading,
        calls:gl.info.render.calls,triangles:gl.info.render.triangles,geometries:gl.info.memory.geometries,
        textures:gl.info.memory.textures,programs:gl.info.programs?.length,frame:gl.info.render.frame,
        hidden:document.hidden,paused:state.paused,active:probe.active,frameIntervals:probe.result,
        player:state.position,nearby:state.nearbyInteract,ride:useIntentStore.getState().ridePhase,
        second:intentRideClock.elapsed,progress:useIntentStore.getState().progress});
    }
  });
`);
}};
export default {...base, publicDir:process.env.COASTER_CRAFT_EMPTY_PUBLIC,
  vite:{...base.vite,plugins:[review,...base.vite.plugins]}};
