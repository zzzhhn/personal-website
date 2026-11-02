// Coordinator-only bounded batch5 ABA fixture. Frozen protocol, waiting for R6.
(async()=>{
 const sleep=ms=>new Promise(r=>setTimeout(r,ms)),nav=document.createElement('nav');
 nav.setAttribute('aria-label','Coordinator batch5');nav.style='position:fixed;left:160px;bottom:4px;z-index:10000;background:#152b2c;color:white;padding:5px;font:12px monospace;max-width:1250px';document.body.append(nav);
 const out=document.createElement('output');out.style='display:block;max-height:100px;overflow:auto';nav.append(out);out.textContent='Waiting';
 const deadline=Date.now()+90000;while(!window.__worldDebug?.state().ready||!window.__worldCampQA){if(Date.now()>deadline)return out.textContent='Unavailable';await sleep(100)}
 const d=window.__worldDebug,art=window.__worldCampQA,params=new URLSearchParams(location.search),mode=params.get('facilityCraft')==='legacy'?'legacy':'candidate',run=params.get('run')||'unknown';
 const positions={camp:[-30.5,6.5,41.45],street:[13.3,2.03,-24.8]};let active=null,stage='idle',serial=0,busy=false;const buttons=[];
 const button=(name,fn)=>{const b=document.createElement('button');b.textContent=name;b.onclick=async()=>{if(busy)return;busy=true;buttons.forEach(x=>x.disabled=true);try{await fn()}catch(e){out.textContent='Error: '+e.message}finally{busy=false;buttons.forEach(x=>x.disabled=false)}};buttons.push(b);nav.append(b)};
 const save=async(kind,obj)=>{const name=run+'-'+mode+'-'+(active||'idle')+'-'+kind+'-'+(++serial),r=await fetch('/result/'+name,{method:'POST',body:JSON.stringify(obj)});if(!r.ok)throw Error('Save failed');return name};
 const read=()=>{const s=d.state(),p=d.snapshot();return {mode,run,active,stage,at:performance.now(),url:location.href,settings:{paused:s.paused,shot:s.shot,quality:s.quality,weather:s.weather,light:s.light,worldMinutes:s.worldMinutes,timeRunning:s.timeRunning,seat:s.seat,card:s.card,clubMode:s.clubMode,hidden:document.hidden,activeVehicle:s.activeVehicle},player:p.player,velocity:p.playerVelocity,grounded:p.grounded,camera:d.camera(),renderInfo:d.renderInfo(),stats:d.stats(),loop:d.renderLoop(),shadowWork:d.shadowChunkWork?.()??null}};
 const sig=s=>[s.calls,s.triangles,s.geometries,s.textures,s.programs].join('/');
 const delta=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
 const next=()=>new Promise(resolve=>{let id;const t=setTimeout(()=>{cancelAnimationFrame(id);resolve()},250);id=requestAnimationFrame(()=>{clearTimeout(t);resolve()})});
 const gates=r=>{
  const s=r.settings,c=r.camera;
  if(typeof d.shadowChunkWork!=='function')throw Error('Shadow settling telemetry unavailable');
  if(s.hidden||s.paused||s.shot||s.seat||s.card||s.clubMode||!r.grounded||r.loop.mode!=='always')throw Error('Need visible normal grounded running');
  if(s.quality!=='balanced'||s.weather!=='clear'||s.light!=='noon'||s.worldMinutes!==720||s.timeRunning||Math.abs(r.loop.night)>.001)throw Error('Need fixed Noon/Clear/Balanced');
  if(r.renderInfo.drawingBuffer.join('x')!=='1710x931'||r.renderInfo.cssSize.join('x')!=='1710x931'||r.renderInfo.pixelRatio!==1)throw Error('Need CSS/buffer1710x931 DPR1');
  if(Math.abs(c.yaw-.9272952180016123)>.003||Math.abs(c.pitch-.7853981633974483)>.003||Math.abs(c.distance-12)>.01||Math.abs(c.fov-50)>.01||c.firstPerson)throw Error('Native camera alignment required');
 };
 for(const key of ['camp','street'])button('Normal '+key,async()=>{
  active=key;stage='priming';art.release();d.set({paused:false,shot:null,seat:null,card:null,timeRunning:false,quality:'balanced',weather:'clear',zoom:1});if(!d.teleportPlayer(positions[key]))throw Error('Player unavailable');
  d.set({light:'noon',worldMinutes:720,timeRunning:false,timeRevision:d.state().timeRevision+1});
  const t=performance.now();while(performance.now()-t<7000){await sleep(160);if(performance.now()-t>1400&&Math.abs(d.renderLoop().night)<.001)break;d.set({timeRevision:d.state().timeRevision+1})}
  await sleep(3000);stage='normal';out.textContent=JSON.stringify({ready:key,mode,run,camera:d.camera(),nativeDrag:{dx:(.9272952180016123-d.camera().yaw)/.0055,dy:(.7853981633974483-d.camera().pitch)/.0055}});
 });
 button('Bounded sample',async()=>{
  if(stage!=='normal'||!positions[active])throw Error('Choose normal camp/street');
  const arrival=read(),samples=[],settleStart=performance.now();let before=null,after=null,warm=0,last=arrival.loop.frame,stable=0,previous='',reason=null,settled=null;out.textContent='Settling10s + stable60frames, then90+300; no input';
  try{
   gates(arrival);
   while(performance.now()-settleStart<20000){await next();const loop=d.renderLoop(),s=d.state();if(s.paused||s.shot||document.hidden)throw Error('Settling interrupted');if(loop.frame===last)continue;last=loop.frame;const key=sig(d.stats());stable=key===previous&&!d.shadowChunkWork?.().pending?stable+1:0;previous=key;if(performance.now()-settleStart>=10000&&stable>=60){settled=read();gates(settled);break}}
   if(!settled)throw Error('No geometric/shadow settling within20s');
   const sourceNodes=d.sceneObjects();const assets={campRoots:sourceNodes.filter(n=>/^camp-facility-/.test(n)),treeRoots:sourceNodes.filter(n=>/^camp-tree-craft-G17-/.test(n)),fallbacks:sourceNodes.filter(n=>/camp-(fallback|loading)-(G1[678]|G2[123]|C09)/.test(n))};
   if(assets.fallbacks.length)throw Error('Fallback still mounted');if(mode==='candidate'&&(!assets.campRoots.length||!assets.treeRoots.length))throw Error('Candidate roots missing');if(mode==='legacy'&&(assets.campRoots.length||assets.treeRoots.length))throw Error('Legacy has candidate roots');
   const start=performance.now();out.textContent='Sampling90+300; no screenshots or controls';
   while(samples.length<300&&performance.now()-start<30000){await next();const loop=d.renderLoop(),s=d.state();if(document.hidden||s.paused||s.shot||s.seat||loop.mode!=='always')throw Error('Interrupted');if(last===loop.frame)continue;last=loop.frame;if(warm++<90)continue;
    if(!before){before=read();gates(before)}const stats=d.stats(),p=s.position;
    samples.push({frame:loop.frame,dt:loop.delta*1000,calls:stats.calls,triangles:stats.triangles,geometries:stats.geometries,textures:stats.textures,programs:stats.programs,camera:stats.camera,player:p,shadowPending:d.shadowChunkWork?.().pending??null});
   }
   after=read();gates(after);if(samples.length!==300)throw Error('Incomplete');if(samples.some(s=>sig(s)!==sig(before.stats)||s.shadowPending))throw Error('Geometry/counter/shadow transition during sample');if(delta(after.player,before.player)>.0001||samples.some(s=>delta(s.camera,before.stats.camera)>.0001||delta(s.player,before.player)>.0001))throw Error('Camera/player drift');
   const sorted=samples.map(s=>s.dt).sort((a,b)=>a-b),summary={frames:300,warmupFrames:90,fps:300000/sorted.reduce((a,b)=>a+b,0),p50:sorted[149],p95:sorted[284],max:sorted[299],over33_4ms:sorted.filter(x=>x>33.4).length,gpuMs:null};
   const name=await save('sample',{valid:true,summary,arrival,settleElapsedMs:settled.at-arrival.at,stableFrames:stable,settled,assets,before,after,samples});out.textContent=JSON.stringify({saved:name,...summary});
  }catch(e){reason=e.message;const name=await save('failed',{valid:false,reason,arrival,settled,before,after,samples});throw Error(reason+'; retained '+name)}
 });
 button('Go shelter seat',async()=>{const item=window.__worldInteract?.list().find(i=>i.id==='street-shelter-seat');if(!item)throw Error('Missing shelter seat');art.release();active='shelter';stage='interaction';d.set({shot:null,paused:false,card:null,quality:'balanced',weather:'clear'});d.teleportPlayer([item.position[0],item.position[1]+.6,item.position[2]]);await sleep(1500);out.textContent=JSON.stringify({nearby:d.state().nearbyInteract,camera:d.camera(),item:{id:item.id,position:item.position}})});
 button('Snapshot',async()=>out.textContent='Saved '+await save('snapshot',read()));
 button('Read camera',()=>out.textContent=JSON.stringify({camera:d.camera(),seat:d.state().seat}));
 button('Hide QA4s',()=>{nav.hidden=true;setTimeout(()=>nav.hidden=false,4000)});button('Pause',()=>d.set({paused:true}));
 out.textContent='Ready '+run+' '+mode;
})();
