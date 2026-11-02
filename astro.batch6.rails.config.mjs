/** Two actual rail representatives, matched against the installed 97c9546 baseline. */
import config from './astro.batch6.facilities.config.mjs';import{readFileSync}from'node:fs';
const views=JSON.parse(readFileSync(new URL('./tools/world/facility-craft/batch6/rails/baseline/views.json',import.meta.url),'utf8'));
const review={name:'rails-review',enforce:'pre',transform(source,id){
 if(!id.split('?')[0].endsWith('/WorldFacilityCraftQA.tsx'))return;
 const start=source.indexOf('  const views = useMemo(() => {'),end=source.indexOf('  }, []);',start);if(start<0||end<0)throw new Error('Review boundary changed');
 source=source.slice(0,start)+`  const views = useMemo(() => (${JSON.stringify(views)} as Array<{id:string;eye:Vec3;target:Vec3}>), []);`+source.slice(end+'  }, []);'.length);
 source=source.replace("baseline: '7702c3d'","baseline: '97c9546', group: 'rails', surfaceMode: new URLSearchParams(location.search).get('railCraft') === 'baseline' ? 'baseline' : 'candidate'").replace('materialRevision: 2','materialRevision: 5');
 return{code:source,map:null};
}};
export default{...config,vite:{...config.vite,plugins:[review,...config.vite.plugins],server:{...config.vite.server,fs:{allow:[...config.vite.server.fs.allow,
 '/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-craft-batch6-facilities/public',
 '/Users/a22309/Desktop/Side-projects/Artifacts/personal-world-craft-batch6-bench-bin/public']}}}};
