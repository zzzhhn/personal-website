// Local evidence UI only; serves unchanged production bundles and assets.
(async()=>{
 const ui=document.createElement('nav');ui.setAttribute('aria-label','DJC daybed QA');ui.style='position:fixed;bottom:4px;left:170px;z-index:10000;background:#14242a;color:white;padding:5px;font:11px monospace;max-width:650px';
 const title=document.createElement('div');title.textContent='Instrumented local QA · unchanged production bundle';ui.append(title);
 const output=document.createElement('output');output.id='qa-readout';output.style='display:block;max-height:30px;overflow:auto';output.textContent='Waiting for QA';ui.append(output);
 const label=document.createElement('input');label.setAttribute('aria-label','Evidence label');label.value=new URLSearchParams(location.search).get('case')||'candidate';label.style='width:110px';ui.append(label);document.body.append(ui);
 const sleep=ms=>new Promise(r=>setTimeout(r,ms)), raf=()=>new Promise(requestAnimationFrame);
 const until=Date.now()+90000;while(!window.__worldDebug?.state().ready){if(Date.now()>until){output.textContent='QA interface unavailable';return}await sleep(100)}
 const d=window.__worldDebug;
 const button=(text,fn)=>{let b=document.createElement('button');b.textContent=text;b.onclick=()=>Promise.resolve(fn()).catch(e=>output.textContent='Error: '+e.message);ui.append(b)};
 let serial=0;
 const read=()=>{const s=d.state(),st=d.stats(),r=d.renderLoop(),info=d.renderInfo();return {at:performance.now(),...st,...r,frameMs:undefined,position:s.position,paused:s.paused,shot:s.shot,seat:s.seat,quality:s.quality,weather:s.weather,light:s.light,worldMinutes:s.worldMinutes,drawingBuffer:info.drawingBuffer,cssSize:info.cssSize,pixelRatio:info.pixelRatio,hidden:document.hidden,url:location.href}};
 const show=()=>{const x=read();output.textContent=JSON.stringify(x);return x};
 const save=async(kind,data)=>{const name=label.value.startsWith('perf-')?label.value:'perf-'+label.value;await fetch('/result/'+name+'-'+kind+'-'+(++serial),{method:'POST',body:JSON.stringify(data)})};
 const locate=p=>{d.teleportPlayer(p);d.set({shot:null,paused:false,timeRunning:false,weather:'clear'});output.textContent='Moving to '+p};
 button('Snapshot',async()=>{const value=show();const info=d.renderInfo();delete info.coasterVegetation;const actor=d.snapshot();await save('snapshot',{...value,renderInfo:info,camera:d.camera(),player:actor.player,grounded:actor.grounded,velocity:actor.playerVelocity,daybedObjects:d.sceneObjects().filter(n=>/djc.*daybed/i.test(n)),daybedRequests:performance.getEntriesByType('resource').filter(r=>r.name.includes('/assets/world/club/daybed/')).map(r=>({url:r.name,duration:r.duration,transferSize:r.transferSize,decodedBodySize:r.decodedBodySize}))})});
 button('Entry',()=>locate([30,1.94,39]));
 button('Daybed approach',()=>locate([62,2.6,39.5]));
 button('Seat left',()=>locate([61.05,2.574,40.45]));
 button('Front shot',()=>d.set({shot:'djc-daybed-front-day',paused:false,timeRunning:false}));
 button('Close shot',()=>d.set({shot:'djc-daybed-close-day',paused:false,timeRunning:false}));
 button('Noon',()=>d.set({light:'noon',worldMinutes:720,timeRunning:false,timeRevision:d.state().timeRevision+1}));
 button('Evening',()=>d.set({light:'night',worldMinutes:1140,timeRunning:false,timeRevision:d.state().timeRevision+1}));
 button('Late night',()=>d.set({light:'night',worldMinutes:0,timeRunning:false,timeRevision:d.state().timeRevision+1}));
 button('Draw probe',async()=>{if(!d.budget?.frame)throw Error('budget API unavailable');const result=await d.budget.frame(500);await save('draw-probe',result);output.textContent='Draw probe saved'});
 button('Pause / resume',()=>{d.set({paused:!d.state().paused});show()});
 button('Sample 300',async()=>{
  if(d.state().paused)throw Error('resume before measuring');
  if(d.state().shot)throw Error('Use Daybed approach before measuring');
  const samples=[];let last=-1,wait=0;const start=performance.now();
  while(samples.length<300&&performance.now()-start<60000){
   await raf();if(document.hidden||d.state().paused||d.state().shot)throw Error('sampling interrupted');
   const r=d.renderLoop();if(r.frame===last)continue;last=r.frame;
   if(wait++<30)continue;const s=d.stats();samples.push({frame:r.frame,dt:r.delta*1000,draws:s.calls,tri:s.triangles});
  }
  const all=samples.map(x=>x.dt).sort((a,b)=>a-b),n=all.length;
  const summary={frames:n,fps:n*1000/all.reduce((a,b)=>a+b,0),p50:all[Math.ceil(n*.5)-1],p95:all[Math.ceil(n*.95)-1],gpuMs:null};
  await save('sample',{summary,meta:read(),samples});output.textContent=JSON.stringify(summary);
 });
 button('Pause check 5s',async()=>{
  d.set({paused:true});await sleep(2500);const a=read();await sleep(5000);const b=read();const result={frames:b.frame-a.frame,first:a,last:b};
  await save('pause',result);output.textContent='Pause window frames='+result.frames;
 });
 show();
})();
