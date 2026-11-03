import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import base from './intake-night-review.config.mjs';

const snapshot = execFileSync('git', ['show', '7789327:src/components/world/attractions/intent-workshop-geometry.ts'], {encoding:'utf8'});
const virtual = 'intent-workshop-geometry-intake-baseline.ts';
const review = {name:'intake-support-isolated-review',enforce:'pre',
  resolveId(id, importer) {
    if (id === './' + virtual) return resolve(dirname(importer), virtual);
  },
  load(id) {
    if (id.endsWith('/' + virtual)) return snapshot;
  },
  transform(code,id) {
    if (id.endsWith('/layout-v4-flag.ts')) {
      return code.replace('export const WORLD_SHOTS_V4 = [', 'export const WORLD_SHOTS_V4 = [{id:"craft-intake-close-day",position:[35.05,3.03,-120.55] as Vec3,target:[33.12,2.45,-121.84] as Vec3},');
    }
    if (id.endsWith('/WorldIntentWorkshop.tsx')) {
      const marker = 'useMemo(createWorkshopGeometry, [])';
      if (!code.includes(marker)) throw Error('Missing workshop geometry hook');
      return `import {createWorkshopGeometry as createBaseline} from './${virtual}';
` + code.replace(marker, `useMemo(() => {
        const baseline = new URLSearchParams(window.location.search).get('intakeSupports') === 'baseline';
        const result = baseline ? createBaseline() : createWorkshopGeometry();
        const roles = {};
        for (const role of result.body.getAttribute('intentCraftSurface').array) roles[role] = (roles[role] ?? 0) + 1;
        document.documentElement.dataset.intakeAssembly = JSON.stringify({baseline,roles,vertices:result.body.getAttribute('position').count});
        return result;
      }, [])`);
    }
  }
};
const readback = base.vite.plugins[0];
const extendedReadback = {...readback, transform(code,id) {
  const result = readback.transform(code,id);
  if (!result) return result;
  return result.replace('loading:s.loading.active,frame:gl.info.render.frame,',
    `loading:s.loading.active,frame:gl.info.render.frame, shadowCancelled:shadow.cancelled,
      compiledCraftPrograms:gl.info.programs?.filter(program => program.cacheKey.includes('intent-baked-night-v2-local-craft-r4')).length,
      drawCalls:gl.info.render.calls,triangles:gl.info.render.triangles,`);
}};
export default {...base,vite:{...base.vite,plugins:[review,extendedReadback,...base.vite.plugins.slice(1)]}};
