import config from '../../../astro.config.mjs';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const helper=fileURLToPath(new URL('./frame-profile.ts',import.meta.url));
const ui=fileURLToPath(new URL('./LongFrameReview.tsx',import.meta.url));
const simpleUi=fileURLToPath(new URL('../camp-feedback-review/CampFeedbackReview.tsx',import.meta.url));
const comparedModules=['WorldShadows.ts','shadow-chunk-builder.ts','shadow-chunk-cache.ts','WorldDjcClubBar.tsx','djc-bar-layout.ts'];
const profile={name:'bounded-world-longframes',enforce:'pre',transform(source,id){
  const path=id.split('?')[0];if(!path.includes('/src/components/world/')||!/[.]tsx?$/.test(path))return;
  let changed=false,ordinal=0;const name=path.split('/').pop();
  const ref=process.env.CAMP_PERF_REF;
  const baselineSubstituted=!!ref&&comparedModules.includes(name);
  if(baselineSubstituted)source=execFileSync('git',['show',`${ref}:src/components/world/${name}`],{encoding:'utf8'});
  if(process.env.CAMP_PERF_SIMPLE==='1'){
    if(name==='WorldCamp.tsx')return `import CampFeedbackReview from ${JSON.stringify(simpleUi)};\n`+source.replace('<group name="world-camp-slice">','<group name="world-camp-slice"><CampFeedbackReview />');
    if(baselineSubstituted)return source;
    return;
  }
  source=source.replace(/\buseFrame\(/g,()=>{changed=true;return `useProfileFrame(${JSON.stringify(name+':frame'+(++ordinal))},`;});
  source=source.replace(/\buseBeforePhysicsStep\(/g,()=>{changed=true;return `useProfileBeforePhysicsStep(${JSON.stringify(name+':beforePhysics'+(++ordinal))},`;});
  if(name==='WorldShadows.ts'){
    if(process.env.CAMP_PERF_SHADOW_REF)source=execFileSync('git',['show',`${process.env.CAMP_PERF_SHADOW_REF}:src/components/world/WorldShadows.ts`],{encoding:'utf8'});
    // QA build only: bounded phase counters must begin before the cold chunk job.
    source=source.replace('profile: probing ? new ShadowChunkStages() : null','profile: new ShadowChunkStages()');
    const file=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true),edits=[];
    const wanted=new Set(['rescan','rebuildGroups','instanceSpheres','applySunPass']);
    const visit=n=>{if(ts.isFunctionDeclaration(n)&&n.name&&wanted.has(n.name.text)&&n.body){edits.push([n.body.getStart(file)+1,`const __profileAt=profileBegin();try{`],[n.body.end-1,`}finally{profileEnd(${JSON.stringify('shadow.'+n.name.text)},__profileAt);}`]);changed=true;}ts.forEachChild(n,visit);};visit(file);
    for(const [at,text] of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,at)+text+source.slice(at);
  }
  if(name==='WorldRuntime.tsx'){source=`import LongFrameReview from ${JSON.stringify(ui)};\n`+source.replace('<NightClock />','<NightClock /><LongFrameReview />');changed=true;}
  if(changed)return `import {useProfileFrame,useProfileBeforePhysicsStep,profileBegin,profileEnd} from ${JSON.stringify(helper)};\n`+source;
  if(baselineSubstituted)return source;
}};
export default {...config,publicDir:'/tmp/camp-longframes-20261107/empty',outDir:process.env.CAMP_PERF_OUTPUT||'/tmp/camp-longframes-20261107/baseline',vite:{...config.vite,plugins:[profile,...config.vite.plugins]}};
