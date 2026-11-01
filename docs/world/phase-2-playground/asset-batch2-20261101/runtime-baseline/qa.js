// Local visible QA controls; frozen product bundles are served unchanged.
(async()=>{
 const ui=document.createElement('nav');ui.setAttribute('aria-label','Batch 2 baseline QA');ui.style='position:fixed;bottom:4px;left:170px;z-index:10000;background:#14242a;color:white;padding:5px;font:11px monospace;max-width:650px';
 const title=document.createElement('div');title.textContent='Instrumented local baseline';ui.append(title);
 const output=document.createElement('output');output.id='qa-readout';output.style='display:block;max-height:30px;overflow:auto';ui.append(output);document.body.append(ui);
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));const until=Date.now()+90000;
 while(!window.__worldDebug?.state().ready){if(Date.now()>until){output.textContent='QA unavailable';return}await sleep(100)}
 const d=window.__worldDebug;let serial=0;
 const label=document.createElement('input');label.setAttribute('aria-label','Evidence label');label.value=new URLSearchParams(location.search).get('case')||'before';label.style='width:130px';ui.append(label);
 const save=async(kind,value)=>fetch('/result/'+label.value+'-'+kind+'-'+(++serial),{method:'POST',body:JSON.stringify(value)});
 const read=()=>{const s=d.state(),r=d.renderInfo();return {...d.stats(),...d.renderLoop(),frameMs:undefined,at:performance.now(),position:s.position,seat:s.seat,shot:s.shot,paused:s.paused,worldMinutes:s.worldMinutes,light:s.light,weather:s.weather,quality:s.quality,hidden:document.hidden,drawingBuffer:r.drawingBuffer,cssSize:r.cssSize,pixelRatio:r.pixelRatio,url:location.href}};
 const button=(name,fn)=>{const b=document.createElement('button');b.textContent=name;b.onclick=()=>Promise.resolve(fn()).catch(e=>output.textContent='Error: '+e.message);ui.append(b)};
 const locate=p=>{d.teleportPlayer(p);d.set({shot:null,paused:false,timeRunning:false,weather:'clear',zoom:1});output.textContent='Moving to '+p};
 button('Umbrella approach',()=>locate([76.5,3.5,42]));
 button('IBD manifest',()=>locate([-91,3.8,-150]));
 button('IBD kit',()=>locate([-94,3.8,-157]));
 button('IBD crate',()=>locate([-78,3.8,-186]));
 button('Noon',()=>d.set({light:'noon',worldMinutes:720,timeRunning:false,timeRevision:d.state().timeRevision+1}));
 button('Midnight',()=>d.set({light:'night',worldMinutes:0,timeRunning:false,timeRevision:d.state().timeRevision+1}));
 button('Snapshot',async()=>{const a=d.snapshot(),v={...read(),camera:d.camera(),player:a.player,grounded:a.grounded,velocity:a.playerVelocity,objects:d.sceneObjects().filter(n=>/umbrella|ibd.*(?:parts|cargo|lid|pack)/i.test(n)).slice(0,60),ibdHud:document.querySelector('[data-ibd-hud]')?.innerText?.slice(0,3000)||null};await save('snapshot',v);output.textContent=JSON.stringify(v)});
 button('Sample 300',async()=>{
  if(d.state().paused||d.state().shot)throw Error('Use normal unpaused approach');
  const samples=[];let last=-1,warm=0;const start=performance.now();
  while(samples.length<300&&performance.now()-start<60000){await new Promise(requestAnimationFrame);if(document.hidden||d.state().paused||d.state().shot)throw Error('sampling interrupted');const r=d.renderLoop();if(r.frame===last)continue;last=r.frame;if(warm++<30)continue;const s=d.stats();samples.push({frame:r.frame,dt:r.delta*1000,draws:s.calls,tri:s.triangles})}
  const a=samples.map(v=>v.dt).sort((a,b)=>a-b),n=a.length,summary={frames:n,fps:n*1000/a.reduce((s,v)=>s+v,0),p50:a[Math.ceil(n*.5)-1],p95:a[Math.ceil(n*.95)-1],gpuMs:null};await save('sample',{summary,meta:read(),camera:d.camera(),samples});output.textContent=JSON.stringify(summary);
 });
 button('Pause / resume',()=>d.set({paused:!d.state().paused}));
 button('Hide QA 8s',()=>{ui.hidden=true;setTimeout(()=>ui.hidden=false,8000)});
 output.textContent='Ready';
})();
