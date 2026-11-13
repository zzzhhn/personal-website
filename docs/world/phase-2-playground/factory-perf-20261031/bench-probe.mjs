// Loaded only by the dedicated production QA page on loopback.
export async function run(d) {
 const {useWorldStore:w,factoryControl:fc,useFactoryStore:f}=d;
 const box=document.createElement('output');box.style='position:fixed;bottom:0;left:0;z-index:99999;background:#222;color:white;font:14px monospace;padding:4px';document.body.append(box);
 const say=s=>{box.textContent=s}, sleep=ms=>new Promise(r=>setTimeout(r,ms)), raf=()=>new Promise(requestAnimationFrame);
 const save=async(name,obj)=>{const r=await fetch('/result/'+(variant==='diag'?'':variant+'-')+name,{method:'POST',body:JSON.stringify(obj)});if(!r.ok)throw Error('save '+r.status)};
 const until=async(fn,ms=120000)=>{const t=performance.now();while(!fn()){if(performance.now()-t>ms)throw Error('timeout: '+box.textContent);await sleep(100)}};
 const variant=new URLSearchParams(location.search).get('run')||'diag';
 try{
 say('Loading production world');await until(()=>w.getState().ready&&d._roots.size);
 const root=[...d._roots.values()][0].store, st=()=>root.getState(), {gl,scene,camera}=st(), ctx=gl.getContext(), ext=ctx.getExtension('EXT_disjoint_timer_query_webgl2');
 const game=d.createFactoryGame('carrier-review-fixture');for(const m of d.FACTORY_MODULES)game.parts[m]={id:'review-'+m,module:m,materialId:'review-'+m,manufacturedFor:'nimble'};
 const actor=d.factoryWorld([-32,.95,-11]);if(!d.worldActorDebug.teleportPlayer(actor))throw Error('could not place actor');
 w.setState({position:actor,shot:null,paused:false,quality:'balanced',weather:'clear',timeRunning:false,factoryStation:'frame'});d.selectWorldTime('noon');w.setState({timeRunning:false});
 await until(()=>f.getState().active&&scene.getObjectByName('factory-carrier-frame'));f.setState({game});fc.operation=d.createFactoryOperation({type:'process',module:'frame'});
 const factory=scene.getObjectByName('world-factory');const targets=new Set();factory.traverse(o=>targets.add(o));
 let native=false; const rays={};for(const name of ['factory-structure','factory-roofs','factory-walks','factory-driven-rollers','factory-state-driven-belt-chains']){
  const o=scene.getObjectByName(name);if(!o)continue;const orig=o.raycast,stock=Object.getPrototypeOf(o).raycast;o.raycast=function(...args){const t=performance.now();try{return (native&&name==='factory-structure'?stock:orig).apply(this,args)}finally{(rays[name]??={count:0,ms:0}).count++;rays[name].ms+=performance.now()-t}}
 }
 const beforeRender=gl.render, draw=gl.renderBufferDirect;
 let row=null,rows=null,last=0,start=0,diagnose=false,solo=false,cycle=false,phaseNow=null,profiling=false, totals={}, capture=false, shot=null, qPending=[], opT=0,drawFrame=0;
 const types=new Map();
 const classify=(o,shadow)=>{const k=o.uuid+shadow;if(types.has(k))return types.get(k);let p=o,anc=[];while(p){if(p.name)anc.push(p.name);p=p.parent}
 const key=(shadow?'shadow':'color')+':'+(targets.has(o)?'factory':'island')+':'+(anc[0]||o.type);types.set(k,key);return key};
 gl.renderBufferDirect=function(...args){
  if(!diagnose&&!solo)return draw.apply(this,args);
  const o=args[4];if(solo&&!targets.has(o))return;
  if(!diagnose||!row)return draw.apply(this,args);
  const a=gl.info.render.calls,b=gl.info.render.triangles;const r=draw.apply(this,args);
  const k=classify(o,args[0]!==camera),e=totals[k]??=[0,0];e[0]+=gl.info.render.calls-a;e[1]+=gl.info.render.triangles-b;return r;
 };
 const off=d.addEffect(()=>{start=performance.now();if(cycle&&!w.getState().paused&&!document.hidden){
   const now=performance.now();if(variant==='diag'&&fc.operation.phase==='done')fc.operation=d.createFactoryOperation({type:'process',module:'frame'});
   d.stepFactoryOperation(fc.operation,{x:0,z:0,held:true,confirm:false},opT?(now-opT)/1000:0,false);opT=now;
 }phaseNow=fc.operation?.phase;});
 gl.render=function(...args){if(args[0]!==scene)return beforeRender.apply(this,args);
 const t=performance.now();row=rows?{dt:last?t-last:null,pre:t-start,phase:phaseNow,gpu:null}:null;last=t;drawFrame++;
 if(ext){const dis=ctx.getParameter(ext.GPU_DISJOINT_EXT);qPending=qPending.filter(x=>{if(dis||ctx.getQueryParameter(x.q,ctx.QUERY_RESULT_AVAILABLE)){if(!dis)x.r.gpu=ctx.getQueryParameter(x.q,ctx.QUERY_RESULT)/1e6;ctx.deleteQuery(x.q);return false}return true})}
 let q=null;if(row&&ext&&drawFrame%5===0&&!ctx.getQuery(ctx.TIME_ELAPSED_EXT??ext.TIME_ELAPSED_EXT,ctx.CURRENT_QUERY)){q=ctx.createQuery();ctx.beginQuery(ext.TIME_ELAPSED_EXT,q)}
 const a=performance.now();const res=beforeRender.apply(this,args);const b=performance.now();if(q){ctx.endQuery(ext.TIME_ELAPSED_EXT);qPending.push({q,r:row})}
 if(row){row.submit=b-a;row.draws=gl.info.render.calls;row.tri=gl.info.render.triangles;row.rays=Object.fromEntries(Object.entries(rays).map(([k,v])=>[k,[v.count,v.ms]]));rows.push(row)}
 for(const k in rays){rays[k].count=0;rays[k].ms=0}
 if(capture){shot=gl.domElement.toDataURL('image/jpeg',.9);capture=false}return res;
 };
 const frames=async n=>{const initial=drawFrame;while(drawFrame-initial<n){if(document.hidden)throw Error('foreground lost');await raf()}};
 // Same CSS and physical canvas as the supplied sample, independent of host monitor scale.
 await frames(4);st().setDpr(1.5);say('Settle fixed live frame station');await frames(90);
 const meta=()=>({production:true,tag:variant,frame:drawFrame,buffer:[ctx.drawingBufferWidth,ctx.drawingBufferHeight],css:[gl.domElement.clientWidth,gl.domElement.clientHeight],camera:camera.position.toArray(),actor:w.getState().position,station:w.getState().factoryStation,quality:w.getState().quality,light:w.getState().light,weather:w.getState().weather,minutes:w.getState().worldMinutes,paused:w.getState().paused,hidden:document.hidden,frameloop:st().frameloop,msaa:ctx.getParameter(ctx.SAMPLES),gpuTimer:!!ext,ua:navigator.userAgent,renderer:ctx.getParameter(ctx.RENDERER)});
 const snap={...meta(),indexed:!!scene.getObjectByName('factory-structure').geometry.boundsTree,viewport:[innerWidth,innerHeight]};if(snap.camera.some((v,i)=>Math.abs(v-[-236.5,6.2,5][i])>.025)||snap.buffer.join()!=='1920,1080'||snap.station!=='frame')throw Error('fixture mismatch '+JSON.stringify(snap));
 await save('meta',snap);
 async function windowRun(name,n=96){say('Measuring '+name);await frames(24);last=0;const samples=[];totals={};rows=samples;await frames(n);rows=null;await frames(8);await save(name,{meta:meta(),samples,drawParts:totals});}
 if(variant==='cross'){
   if(!snap.indexed)throw Error('cross needs B production build');
   for(const [i,v] of [true,false,false,true].entries()){native=v;await windowRun('idle-'+(v?'stock':'index')+'-'+i,120);if(i<2){capture=true;await frames(2);await save('visual-'+(v?'stock':'index'),{jpeg:shot})}}
 }else await windowRun('idle',variant==='diag'?96:180);
 capture=true;await frames(2);await save('work-day',{jpeg:shot});
 if(variant==='diag'){diagnose=true;await windowRun('draw-composition',4);diagnose=false;solo=true;await windowRun('factory-only');solo=false;
 st().setDpr(.75);await windowRun('quarter-pixels');st().setDpr(1.5);await windowRun('idle-return');}
 if(variant==='diag'){cycle=true;opT=0;await windowRun('processing',160);cycle=false;}
 else for(const [i,v] of (variant==='cross'?[false,true,true,false]:[false]).entries()){
   native=v;fc.operation=d.createFactoryOperation({type:'process',module:'frame'});await frames(12);
   say('Measuring complete press + outfeed');last=0;const samples=[];rows=samples;cycle=true;opT=0;
   while(fc.operation.phase!=='done'){await frames(1);if(performance.now()-opT>2000||samples.length>4000)throw Error('cycle stalled');}
   cycle=false;rows=null;await frames(8);await save(variant==='cross'?'process-'+(v?'stock':'index')+'-'+i:'processing',{meta:meta(),samples});
 }
 if(variant==='cross'){
  const geom=scene.getObjectByName('factory-structure').geometry, Tree=geom.boundsTree.constructor;
  const t=performance.now(), tree=new Tree(geom,{strategy:0,indirect:true,setBoundingBox:false}), ms=performance.now()-t;
  const data=Tree.serialize(tree,{cloneBuffers:false});await save('index-cost',{buildMs:ms,bufferBytes:data.roots.reduce((n,b)=>n+b.byteLength,data.indirectBuffer.byteLength),includesRenderIndex:false,afterTimingWindows:true});
 }
 w.setState({paused:true});await sleep(1500);const hold=drawFrame;await sleep(1500);const pausedDelta=drawFrame-hold;
 w.setState({paused:false});await frames(12);await save('pause-resume',{pausedDelta,resumedFrames:drawFrame-hold,meta:meta()});w.setState({paused:true});off();gl.render=beforeRender;gl.renderBufferDirect=draw;say('Complete: '+variant+'; paused');
 }catch(e){w.setState({paused:true});say('Failed: '+e.message);await save('error',{error:String(e),trace:e.stack})}
}
