import base from './intake-night-review.config.mjs';

const views = [
  ['arrival-portal', [56,4.1,-127.5], [48,6.2,-146]],
  ['arrival-boarding', [45.2,3.2,-153.9], [50,2.45,-152]],
  ['arrival-services', [27,5.1,-165], [14,5.1,-181]],
  ['arrival-tower', [19,7,-318], [6,34,-344]],
  ['arrival-lookout', [111,10.8,-169], [105,8.9,-180]],
  ['arrival-chest', [43.2,3.25,-129.8], [42,2.1,-135.5]],
].flatMap(([id, position, target]) => ['day','night'].map(time => ({id:`${id}-${time}`,position,target})));

function replace(code, marker, value) {
  if (!code.includes(marker)) throw new Error(`Missing arrival review marker ${marker}`);
  return code.replace(marker, value);
}
function arrivalReview() {
  return {name:'coaster-arrival-review', enforce:'pre', transform(code,id) {
    if (id.endsWith('/layout-v4-flag.ts')) {
      const marker = 'export const WORLD_SHOTS_V4 = [';
      return replace(code, marker, `${marker}
        ${views.map(view=>`{id:${JSON.stringify(view.id)},position:${JSON.stringify(view.position)} as Vec3,target:${JSON.stringify(view.target)} as Vec3},`).join('\n')}`);
    }
    // Use the same structure mode in the main-thread and Worker graphs.
    if (id.endsWith('/coaster-geometry.ts') && process.env.COASTER_SHORT_BAY === '1') {
      return replace(code, 'craftSample = false', 'craftSample = true');
    }
  }};
}
const readback = base.vite.plugins[0];
const capture = {...readback, transform(code,id) {
  const result = readback.transform(code,id);
  if (!result) return result;
  const marker = '  useFrame(() => {\n    const s = useWorldStore.getState();\n    const canvas = gl.domElement;';
  const controlled = replace(result, marker, `
  useEffect(() => {
    const views = ${JSON.stringify(views.map(view=>view.id))};
    const select = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.altKey || !/^Digit[0-9]$/.test(event.code)) return;
      event.preventDefault();
      const index = Number(event.code.at(-1));
      if (index < 1 || index > views.length / 2) return;
      const current = useWorldStore.getState().shot;
      const shot = views[(index - 1) * 2 + (current === views[(index - 1) * 2] ? 1 : 0)];
      const dark = shot.endsWith('-night');
      useWorldStore.setState(s => ({shot, paused:false, timeRunning:false, light:dark?'night':'noon',
        worldMinutes:dark?0:720, timeRevision:s.timeRevision+1}));
      invalidate();
    };
    window.addEventListener('keydown', select);
    return () => window.removeEventListener('keydown', select);
  }, [invalidate]);
  ${marker}`);
  return replace(replace(controlled,'s.shot?.startsWith("craft-intake-")','s.shot'),
    'loading:s.loading.active,frame:gl.info.render.frame,',`loading:s.loading.active,frame:gl.info.render.frame,
    assets:s.loading,drawCalls:gl.info.render.calls,triangles:gl.info.render.triangles,
    reflectivePrograms:gl.info.programs?.filter(program=>program.cacheKey.includes('intent-baked-night-v2-local-craft-reflect-r2')).length,`);
}};
export default {...base,vite:{...base.vite,
  plugins:[arrivalReview(),capture,...base.vite.plugins.slice(1)],
  worker:{...base.vite.worker,plugins:()=>[arrivalReview()]},
}};
