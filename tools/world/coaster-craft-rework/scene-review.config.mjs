import { execFileSync } from 'node:child_process';
import { basename, dirname, resolve } from 'node:path';
import base from './intake-night-review.config.mjs';

const baseline = '9c23282';
const source = 'src/components/world/attractions';
const snapshots = new Map(['coaster-geometry.ts', 'intent-workshop-geometry.ts', 'WorldWorkshopSigns.tsx'].map(file => [
  file.replace(/\.(tsx?)$/, '.baseline.$1'),
  execFileSync('git', ['show', `${baseline}:${source}/${file}`], { encoding: 'utf8' }),
]));
const variant = "new URLSearchParams(window.location.search).get('sceneCraft') !== 'baseline'";
function replace(code, marker, patch) {
  if (!code.includes(marker)) throw new Error(`Missing scene review marker: ${marker}`);
  return code.replace(marker, patch);
}
function sceneReview() {
  return { name: 'coaster-scene-review', enforce: 'pre',
    resolveId(id, importer) {
      if (id.startsWith('./') && snapshots.has(id.slice(2))) return resolve(dirname(importer), id);
    },
    load(id) { return snapshots.get(basename(id)); },
    transform(code, id) {
      if (id.endsWith('/layout-v4-flag.ts')) {
        const shots = ['day', 'night'].flatMap(time => [
          { id: `craft-short-bay-${time}`, position: [69, 5.6, -321], target: [63.2, 7.3, -334.1] },
        ]);
        return replace(code, 'export const WORLD_SHOTS_V4 = [', `export const WORLD_SHOTS_V4 = [
          ${shots.map(({id,position,target})=>`{id:${JSON.stringify(id)},position:${JSON.stringify(position)} as Vec3,target:${JSON.stringify(target)} as Vec3},`).join('\n')}`);
      }
      if (id.endsWith('/WorldIntentCoaster.tsx')) {
        code=replace(code, 'import { WorldIntentReflectiveSurface }', 'import WorldIntentSurface, { WorldIntentReflectiveSurface }');
        code=replace(code, '<WorldIntentReflectiveSurface roughness={.82}', `<WorldIntentReflectiveSurface reflect={${variant}} roughness={.82}`);
        return `import {createCoasterStructure as createBaselineStructure,createCoasterCar as createBaselineCar} from './coaster-geometry.baseline.ts';
`+replace(replace(replace(code, 'useMemo(createCoasterCar, [])', `useMemo(${variant} ? createCoasterCar : createBaselineCar, [])`), '<WorldIntentReflectiveSurface roughness={.65} metalness={.12} />', `{${variant} ? <WorldIntentReflectiveSurface roughness={.65} metalness={.12} /> : <WorldIntentSurface roughness={.65} metalness={.12} />}`), 'new CoasterStructureCache(createCoasterStructure, buildCoasterInWorker)',
          `new CoasterStructureCache(near => ${variant} ? createCoasterStructure(near, true) : createBaselineStructure(near), buildCoasterInWorker)`);
      }
      if (id.endsWith('/coaster-structure-job.ts')) {
        return replace(code, 'worker.postMessage(near)', `worker.postMessage({near, candidate:${variant}})`);
      }
      if (id.endsWith('/coaster-structure.worker.ts')) {
        code=replace(code, 'MessageEvent<boolean>', 'MessageEvent<{near:boolean;candidate:boolean}>');
        return `import {createCoasterStructure as createBaselineStructure} from './coaster-geometry.baseline.ts';
`+replace(code,'createCoasterStructure(event.data)', 'event.data.candidate ? createCoasterStructure(event.data.near, true) : createBaselineStructure(event.data.near)');
      }
      if (id.endsWith('/WorldIntentWorkshop.tsx')) {
        code=replace(code, '<WorldIntentReflectiveSurface roughness={.65}', `<WorldIntentReflectiveSurface reflect={${variant}} roughness={.65}`);
        return `import {createWorkshopGeometry as baselineWorkshop, createWorkshopCapsule as baselineCapsule} from './intent-workshop-geometry.baseline.ts';
import BaselineWorkshopSigns from './WorldWorkshopSigns.baseline.tsx';
`+replace(replace(replace(replace(code, 'useMemo(createWorkshopGeometry, [])', `useMemo(${variant} ? createWorkshopGeometry : baselineWorkshop, [])`),
          'useMemo(createWorkshopCapsule, [])', `useMemo(${variant} ? createWorkshopCapsule : baselineCapsule, [])`),
          '<WorldWorkshopSigns />', `{${variant} ? <WorldWorkshopSigns /> : <BaselineWorkshopSigns />}`),
          'roughness={.5} craft', `roughness={.5} craft={${variant}}`);
      }
    },
  };
}
const readback = base.vite.plugins[0];
const reviewReadback = { ...readback, transform(code,id) {
  const result = readback.transform(code,id);
  if (!result) return;
  const controlled = replace(result, '  useFrame(() => {\n    const s = useWorldStore.getState();\n    const canvas = gl.domElement;', `
  useEffect(() => {
    const views = ['workshop-day','workshop-night','craft-station-day','craft-station-night',
      'coaster-entrance-day','coaster-entrance-night','coaster-overview-day','coaster-overview-night','craft-short-bay-day','craft-short-bay-night'];
    const select = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.altKey || !/^Digit[0-9]$/.test(event.code)) return;
      event.preventDefault();
      const shot = views[(Number(event.code.at(-1)) + 9) % 10];
      const dark = shot.endsWith('-night');
      useWorldStore.setState(s => ({shot, paused:false, timeRunning:false, light:dark?'night':'noon',
        worldMinutes:dark?0:720, timeRevision:s.timeRevision+1}));
      invalidate();
    };
    window.addEventListener('keydown', select);
    return () => window.removeEventListener('keydown', select);
  }, [invalidate]);
  useFrame(() => {
    const s = useWorldStore.getState();
    const canvas = gl.domElement;`);
  return replace(replace(controlled, 's.shot?.startsWith("craft-intake-")', 's.shot'),
    'loading:s.loading.active,frame:gl.info.render.frame,', `loading:s.loading.active,frame:gl.info.render.frame,
    candidate:${variant}, assets:s.loading, drawCalls:gl.info.render.calls, triangles:gl.info.render.triangles,
    craftPrograms:gl.info.programs?.filter(program=>program.cacheKey.includes('intent-baked-night-v2-local-craft-')).length,
    reflectivePrograms:gl.info.programs?.filter(program=>program.cacheKey.includes('intent-baked-night-v2-local-craft-reflect-r1')).length,`);
}};
export default {...base,vite:{...base.vite,
  plugins:[sceneReview(),reviewReadback,...base.vite.plugins.slice(1)],
  worker:{...base.vite.worker,plugins:()=>[sceneReview()]},
}};
