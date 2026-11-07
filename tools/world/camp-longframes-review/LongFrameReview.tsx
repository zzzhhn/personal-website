/** Local-only bounded profiler. No production import or unbounded sampling. */
import {useEffect,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {useRapier} from '@react-three/rapier';
import {useWorldStore,selectWorldTime} from '../../../src/components/world/store';
import {worldActorDebug} from '../../../src/components/world/WorldActors';
import {shadowChunkWork} from '../../../src/components/world/WorldShadows';
import {occlusionQa} from '../../../src/components/world/WorldOcclusion';
import {profileStart,profileStop,profileFrame,profileBegin,profileEnd} from './frame-profile';

const stats=(values:number[])=>{const s=[...values].sort((a,b)=>a-b);return {n:s.length,p50:s[Math.floor(s.length*.5)]??0,p95:s[Math.floor(s.length*.95)]??0,p99:s[Math.floor(s.length*.99)]??0,max:s.at(-1)??0,over50:s.filter(v=>v>50).length,over100:s.filter(v=>v>100).length};};
export default function LongFrameReview(){
  const {gl,scene,camera,invalidate}=useThree(),{world}=useRapier();
  const sample=useRef({active:false,previous:0,frames:[] as number[],calls:[] as number[],triangles:[] as number[],uploads:0,bytes:0,gpu:[] as number[],longTasks:[] as {start:number;duration:number}[],start:{} as unknown,out:null as HTMLOutputElement|null,stop:()=>{}});
  const facts=()=>{const s=useWorldStore.getState();return {shot:s.shot,paused:s.paused,hidden:document.hidden,loading:s.loading.active,quality:s.quality,worldMinutes:s.worldMinutes,camera:camera.position.toArray(),quaternion:camera.quaternion.toArray(),canvas:[gl.domElement.width,gl.domElement.height],dpr:gl.getPixelRatio(),exposure:gl.toneMappingExposure,shadow:shadowChunkWork(),memory:{...gl.info.memory,programs:gl.info.programs?.length??0},actor:worldActorDebug.snapshot().player,occlusion:occlusionQa.last?.debug()&&{ms:occlusionQa.last.debug().ms,tested:occlusionQa.last.debug().tested,candidates:occlusionQa.last.debug().candidates}};};
  useEffect(()=>{
    const p=sample.current,ctx=gl.getContext() as WebGL2RenderingContext;
    const ext=ctx.getExtension('EXT_disjoint_timer_query_webgl2');
    const queries:WebGLQuery[]=[];let renderNo=0,insideRender=false;
    const render=gl.render,step=world.step,upload=ctx.bufferSubData;
    gl.render=function(...args){
      const t=profileBegin();let query:WebGLQuery|null=null;
      if(p.active&&ext&&!insideRender&&++renderNo%8===0&&queries.length<8){query=ctx.createQuery();if(query)ctx.beginQuery(ext.TIME_ELAPSED_EXT,query);}
      const prior=insideRender;insideRender=true;
      try{return render.apply(this,args);}finally{
        insideRender=prior;profileEnd('renderer.render (includes shadow)',t);
        if(query){ctx.endQuery(ext.TIME_ELAPSED_EXT);queries.push(query);}
        if(!prior&&p.active&&queries.length&&ctx.getQueryParameter(queries[0],ctx.QUERY_RESULT_AVAILABLE)){
          const ready=queries.shift()!;if(!ctx.getParameter(ext.GPU_DISJOINT_EXT))p.gpu.push(ctx.getQueryParameter(ready,ctx.QUERY_RESULT)/1e6);ctx.deleteQuery(ready);
        }
      }
    };
    world.step=function(...args){const t=profileBegin();try{return step.apply(this,args);}finally{profileEnd('physics.world.step',t);}};
    ctx.bufferSubData=function(...args:any[]){if(p.active){p.uploads++;const data=args[2];p.bytes+=args[4]!==undefined?args[4]*(data.BYTES_PER_ELEMENT??1):Math.max(0,(data.byteLength??0)-(args[3]??0)*(data.BYTES_PER_ELEMENT??1));}return upload.apply(this,args as any);};
    let observer:PerformanceObserver|null=null;
    if(PerformanceObserver.supportedEntryTypes?.includes('longtask')){observer=new PerformanceObserver(list=>{if(p.active)for(const e of list.getEntries())if(p.longTasks.length<40)p.longTasks.push({start:e.startTime,duration:e.duration});});observer.observe({type:'longtask'});}
    const root=document.createElement('aside');root.setAttribute('aria-label','长帧验收');root.style.cssText='position:fixed;z-index:100001;top:8px;left:8px;background:#102b30ee;color:#fff;padding:8px;font:12px system-ui;max-width:600px';
    const body=document.createElement('div'),toggle=document.createElement('button');toggle.textContent='收起诊断';toggle.onclick=()=>{body.hidden=!body.hidden;toggle.textContent=body.hidden?'展开诊断':'收起诊断';};root.append(toggle,body);
    const out=document.createElement('output');out.setAttribute('aria-label','长帧结果');out.style.cssText='display:block;white-space:pre-wrap;max-height:100px;overflow:auto';p.out=out;
    const add=(label:string,act:()=>void)=>{const b=document.createElement('button');b.textContent=label;b.style.cssText='padding:5px;margin:3px';b.onclick=act;body.append(b);};
    const stop=()=>{if(!p.active)return;p.active=false;const timing=profileStop();out.textContent=JSON.stringify({start:p.start,end:facts(),frameMs:stats(p.frames),calls:stats(p.calls),triangles:stats(p.triangles),bufferSubData:{calls:p.uploads,bytes:p.bytes},gpuMs:ext?stats(p.gpu):null,longTasks:p.longTasks,timing,notes:'Nested timing buckets overlap. GPU samples cover every eighth renderer call; no finish/readPixels sync.'});};p.stop=stop;
    for(const [label,shot] of [['工具白天','camp-batch-tools-day'],['工具深夜','camp-batch-tools-night'],['营地总览','camp-batch-overview-day']])add(label,()=>{stop();useWorldStore.setState({shot,paused:false,timeRunning:false});selectWorldTime(shot.endsWith('night')?'night':'noon');invalidate();});
    add('正常营地',()=>{stop();worldActorDebug.teleportPlayer([-33,5.72,17]);useWorldStore.setState({shot:null,paused:false,timeRunning:false});selectWorldTime('noon');invalidate();});
    add('读取状态',()=>{out.textContent=JSON.stringify(facts());});
    add('采集600帧',()=>{stop();Object.assign(p,{active:true,previous:0,frames:[],calls:[],triangles:[],uploads:0,bytes:0,gpu:[],longTasks:[],start:facts()});profileStart();out.textContent='正在采集600帧';invalidate();});
    add('停止并读取',stop);add('暂停',()=>{stop();useWorldStore.setState({paused:true});});body.append(out);document.body.append(root);
    return()=>{stop();observer?.disconnect();gl.render=render;world.step=step;ctx.bufferSubData=upload;for(const q of queries)ctx.deleteQuery(q);root.remove();};
  },[gl,world,scene,camera,invalidate]);
  useFrame(()=>{const p=sample.current;if(!p.active)return;const now=performance.now();if(document.hidden||useWorldStore.getState().paused){p.stop();return;}profileFrame();if(p.previous){p.frames.push(now-p.previous);p.calls.push(gl.info.render.calls);p.triangles.push(gl.info.render.triangles);}p.previous=now;if(p.frames.length>=600)p.stop();else invalidate();},-100000);
  return null;
}
