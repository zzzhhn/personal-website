import config from '../../../astro.config.mjs';
import { execFileSync } from 'node:child_process';
const before=process.env.IBD_CRAFT_BASELINE==='1';
const changed=new Set(['WorldIbdYard.tsx','ibd-beam-crate-craft.ts','ibd-craft-geometry.ts','ibd-yard-architecture.ts','ibd-yard-geometry.ts','ibd-yard-lighting.ts']);
const review={name:'ibd-coil-review',enforce:'pre',transform(source,id){
 const clean=id.split('?')[0],name=clean.split('/').at(-1);
 if(before&&changed.has(name))source=execFileSync('git',['show','0a2fe29:src/components/world/attractions/'+name],{encoding:'utf8'});
 if(name==='CarPerformanceReview.tsx')source=("import {createBudgetProbe} from '../WorldQuality';\n"+source)
  .replace('camera:camera.position.toArray(),','camera:camera.position.toArray(),quaternion:camera.quaternion.toArray(),fov:camera.fov,')
  .replace("    button('输出记录',",`    button('QA 绘制构成',()=>{
      const pending=createBudgetProbe(scene,()=>gl).frame(20);invalidate();
      pending.then(value=>{const result={source:'${before?'0a2fe29':'ibd-craft-candidate'}',camera:camera.position.toArray(),quaternion:camera.quaternion.toArray(),fov:camera.fov,focus:useWorldStore.getState().position,value};gl.domElement.dataset.ibdPass=JSON.stringify(result);output.textContent=JSON.stringify(result);});
    });
    button('输出记录',`)

  .replace("if(shadow.pending || climate.blend<1 || useWorldStore.getState().loading.active)","if(false)")
  .replace(" || shadowChunkWork().pending)",")")
  .replace('    if(p.previous && p.warm++>=90)', `    if(shadowChunkWork().pending || climate.blend<1 || w.loading.active) {
      p.previous=0;p.warm=0;
      if(now-p.started>45000){p.active=false;if(p.output)p.output.textContent='加载未收敛，本窗作废';return;}
      invalidate();return;
    }
    if(p.previous && p.warm++>=90)`);
 if(name==='WorldIbdYard.tsx')source="import CarPerformanceReview from './CarPerformanceReview';\n"+source.replace('<WorldIbdAudio />',"<WorldIbdAudio />{new URLSearchParams(location.search).get('ibdPerf')==='1' && <CarPerformanceReview />}");
 return source;
}};
export default {...config,publicDir:'/tmp/ibd-craft-20261106/empty',outDir:before?'/tmp/ibd-craft-20261106/baseline-review':'/tmp/ibd-craft-20261106/site',vite:{...config.vite,plugins:[review,...config.vite.plugins]}};
