/** Bin-only matched R1/R2 ordinary review. Production modules stay uninstrumented. */
import config from './astro.batch6.bench-bin.config.mjs';
import {readFileSync}from'node:fs';
const views=JSON.parse(readFileSync(new URL('./tools/world/facility-craft/batch6/next-bench-bin/review-views.json',import.meta.url),'utf8')).reverse();
const review={name:'bin-r2-review',enforce:'pre',transform(source,id){
 if(!id.split('?')[0].endsWith('/WorldFacilityCraftQA.tsx'))return;
 const start=source.indexOf('  const views = useMemo(() => {'),end=source.indexOf('  }, []);',start);
 if(start<0||end<0)throw new Error('Review source boundary changed');
 source=source.slice(0,start)+`  const views = useMemo(() => (${JSON.stringify(views)} as Array<{id:string;eye:Vec3;target:Vec3}>), []);`+source.slice(end+'  }, []);'.length);
 source="import { installFacilityInteractionQA } from '../../../tools/world/facility-craft/batch6/interactions';\n"+source;
 source=source.replace('  const views = useMemo(', '  useEffect(() => installFacilityInteractionQA(gl, invalidate), [gl, invalidate]);\n  const views = useMemo(');
 source=source.replace("baseline: '7702c3d'","baseline: '7107b14', group: 'bin-r2', surfaceMode: new URLSearchParams(location.search).get('benchBin') === 'r1' ? 'r1' : 'r2'").replace('materialRevision: 2','materialRevision: 4');
 return{code:source,map:null};
}};
export default{...config,vite:{...config.vite,plugins:[review,...config.vite.plugins.slice(1)]}};
