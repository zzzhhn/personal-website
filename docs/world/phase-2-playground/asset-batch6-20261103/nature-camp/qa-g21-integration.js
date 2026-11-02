// One ordinary night view of the actual minimal integration build.
(async()=>{
 const sleep=ms=>new Promise(r=>setTimeout(r,ms)),nav=document.createElement('nav');
 nav.setAttribute('aria-label','G21 integrated night');nav.style='position:fixed;bottom:4px;left:160px;background:#183434;color:white;z-index:10000;padding:5px;font:12px monospace';
 const out=document.createElement('output');out.style='display:block;max-height:90px;overflow:auto';nav.append(out);document.body.append(nav);out.textContent='Waiting';
 const end=Date.now()+90000;
 while(!window.__worldDebug?.state().ready||!window.__worldCampQA||Object.keys(window.__worldG21Craft??{}).length<3){if(Date.now()>end){out.textContent='Unavailable';return}await sleep(150)}
 const d=window.__worldDebug,view={player:[-57,6.5,43],zoom:1},buttons=[];let active=false;
 const button=(name,fn)=>{const b=document.createElement('button');b.textContent=name;b.onclick=async()=>{buttons.forEach(x=>x.disabled=true);try{await fn()}catch(e){out.textContent='Error: '+e.message}finally{buttons.forEach(x=>x.disabled=false)}};buttons.push(b);nav.append(b)};
 button('rock-walk',async()=>{active=true;window.__worldCampQA.release();d.set({paused:false,shot:null,seat:null,card:null,weather:'clear',quality:'balanced',timeRunning:false,zoom:1});if(!d.teleportPlayer(view.player))throw Error('Player not ready');await sleep(3500);const c=d.camera();out.textContent=JSON.stringify({ready:'rock-walk',camera:c,nativeDrag:{dx:(.9272952180016123-c.yaw)/.0055,dy:(.7853981633974483-c.pitch)/.0055}})});
 button('Late night',async()=>{d.set({light:'night',worldMinutes:0,timeRunning:false,timeRevision:d.state().timeRevision+1});const start=Date.now();while(Date.now()-start<12000){await sleep(160);if(Date.now()-start>2000&&Math.abs(d.renderLoop().night-1)<.001){out.textContent='Time ready Late night';return}d.set({timeRevision:d.state().timeRevision+1})}throw Error('Night unsettled')});
 button('Snapshot',async()=>{
  if(!active)throw Error('Choose rock-walk');const end=Date.now()+20000;let idle=Date.now();
  while(Date.now()<end){const w=d.shadowChunkWork?.();if(!w||w.pending||w.error)idle=Date.now();if(Date.now()-idle>=3000)break;await sleep(160)}
  const s=d.state(),data={scope:'G21 minimal integration, single ordinary night view',url:location.href,view,review:window.__worldCampQA.review(),settings:{paused:s.paused,shot:s.shot,quality:s.quality,weather:s.weather,light:s.light,worldMinutes:s.worldMinutes,timeRunning:s.timeRunning,seat:s.seat,card:s.card,zoom:s.zoom},camera:d.camera(),renderInfo:d.renderInfo(),loop:d.renderLoop(),shadowWork:d.shadowChunkWork?.()??null,materials:Object.fromEntries(Object.entries(window.__worldG21Craft).map(([k,fn])=>[k,fn()])),fallbacks:d.sceneObjects().filter(n=>/^camp-(loading|fallback)-(G21|C03)/.test(n)),resources:[...new Set(performance.getEntriesByType('resource').map(r=>new URL(r.name)).filter(u=>u.origin===location.origin).map(u=>u.pathname))].sort()};
  if(data.settings.paused||data.settings.shot||data.fallbacks.length)throw Error('Need ordinary loaded running view');
  if(s.light!=='night'||s.weather!=='clear'||s.quality!=='balanced'||s.timeRunning||Math.abs(data.loop.night-1)>.001)throw Error('Need fixed clear balanced night');
  if(!data.shadowWork||data.shadowWork.pending||data.shadowWork.error||Date.now()-idle<3000)throw Error('Need fresh idle shadow window');
  if(data.renderInfo.pixelRatio!==1||data.review.toneMappingExposure!==1)throw Error('Need DPR1/exposure1');
  if(!data.resources.includes('/assets/world/camp/C03.glb')||data.resources.some(p=>p.includes('nature-camp-craft/C03')))throw Error('C03 original path proof missing');
  const response=await fetch('/result/b6-g21-integrated-night-snapshot-1',{method:'POST',body:JSON.stringify(data)});if(!response.ok)throw Error('Save failed '+response.status);out.textContent=JSON.stringify({saved:'b6-g21-integrated-night-snapshot-1',camera:data.camera,materials:Object.keys(data.materials),fallbacks:data.fallbacks});
 });
 button('Hide QA4s',()=>{nav.hidden=true;setTimeout(()=>nav.hidden=false,4000)});button('Pause',()=>d.set({paused:true}));out.textContent='Ready integrated G21';
})();
