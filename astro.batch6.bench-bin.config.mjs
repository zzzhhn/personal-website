/** Task-only ordinary-view controls. No production source transform. */
import config from './astro.batch6.facilities.config.mjs';
import { readFileSync } from 'node:fs';
const views=JSON.parse(readFileSync(new URL('./tools/world/facility-craft/batch6/next-bench-bin/review-views.json',import.meta.url),'utf8'));
const review={name:'bench-bin-review',enforce:'pre',transform(source,id){
  if(!id.split('?')[0].endsWith('/WorldFacilityCraftQA.tsx'))return;
  const start=source.indexOf('  const views = useMemo(() => {'),end=source.indexOf('  }, []);',start);
  if(start<0||end<0)throw new Error('Review source boundary changed');
  source=source.slice(0,start)+`  const views = useMemo(() => (${JSON.stringify(views)} as Array<{id:string;eye:Vec3;target:Vec3}>), []);`+source.slice(end+'  }, []);'.length);
  source=source.replace("baseline: '7702c3d'","baseline: 'ad7ee76', group: 'bench-bin', surfaceMode: new URLSearchParams(location.search).get('benchBin') === 'baseline' ? 'baseline' : 'candidate'")
    .replace('materialRevision: 2','materialRevision: 3');
  return {code:source,map:null};
}};
export default {...config,vite:{...config.vite,plugins:[review,...config.vite.plugins],
  server:{...config.vite.server,fs:{allow:[...config.vite.server.fs.allow,
    '/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-craft-batch6-facilities/public']}}}};
