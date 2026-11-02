// Task-only fixture, injected by the temporary server; never shipped in the build.
(async()=>{
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const panel=document.createElement('nav');panel.setAttribute('aria-label','Facilities final QA');
 panel.style='position:fixed;bottom:4px;left:150px;z-index:10000;background:#142b2f;color:white;padding:6px;font:12px monospace;max-width:1400px';document.body.append(panel);
 const out=document.createElement('output');out.style='display:block;max-height:120px;overflow:auto';panel.append(out);out.textContent='Waiting for real runtime';
 const deadline=Date.now()+90000;while(!window.__worldDebug?.state().ready||!window.__worldCampQA){if(Date.now()>deadline)return out.textContent='Runtime unavailable';await sleep(100)}
 const d=window.__worldDebug,art=window.__worldCampQA,loadId=Date.now();let point='none',serial=0,busy=false;
 const views={shelter:{p:[26.6,2.03,-20.4],yaw:Math.PI},hut:{p:[68.4,2.03,-39.0],yaw:2.87027}};
 const read=()=>{const s=d.state(),p=d.snapshot();return {at:performance.now(),point,url:location.href,settings:{paused:s.paused,shot:s.shot,quality:s.quality,weather:s.weather,light:s.light,worldMinutes:s.worldMinutes,timeRunning:s.timeRunning,seat:s.seat,card:s.card,clubMode:s.clubMode,loading:s.loading,nearby:s.nearbyInteract,hidden:document.hidden},player:p.player,grounded:p.grounded,velocity:p.playerVelocity,camera:d.camera(),renderInfo:d.renderInfo(),stats:d.stats(),loop:d.renderLoop(),shadow:d.shadowChunkWork?.()??null}};
 const save=async(kind,data)=>{const name=point+'-'+loadId+'-'+kind+'-'+(++serial);const r=await fetch('/result/'+name,{method:'POST',body:JSON.stringify(data)});if(!r.ok)throw Error('Save failed');return name};
 const button=(label,fn)=>{const b=document.createElement('button');b.textContent=label;panel.append(b);b.onclick=async()=>{if(busy)return;busy=true;try{await fn()}catch(e){out.textContent='Error: '+e.message}finally{busy=false}}};
 const setup=async(name,p)=>{point=name;art.release();d.set({paused:false,shot:null,seat:null,card:null,timeRunning:false,quality:'balanced',weather:'clear',zoom:1,light:'noon',worldMinutes:720,timeRevision:d.state().timeRevision+1});if(!d.teleportPlayer(p))throw Error('Player unavailable');await sleep(3500);out.textContent=JSON.stringify({ready:name,desiredYaw:views[name]?.yaw,camera:d.camera(),player:d.snapshot().player,nearby:d.state().nearbyInteract})};
 button('Normal shelter',()=>setup('shelter',views.shelter.p));button('Normal hut',()=>setup('hut',views.hut.p));
 button('Seat approach',async()=>{const seat=window.__worldInteract.list().find(x=>x.id==='street-shelter-seat');if(!seat)throw Error('No real seat');await setup('shelter',[seat.position[0]-1.25,seat.position[1]+.8,seat.position[2]]);out.textContent=JSON.stringify({seat,read:read()})});
 button('Hut approach',()=>setup('hut',[67.55,2.03,-38.76]));
 button('Far shelter',()=>setup('shelter',[0,2.03,-20.4]));
 // Functional LOD/fade observation only. These fixed shots are excluded by the sample gate.
 for(const distance of [145,154,166])button('Fade '+distance,async()=>{
  point='shelter';d.set({paused:false,seat:null,card:null,timeRunning:false});
  const u=[-9,12,5],length=Math.hypot(...u),target=[29.6,1.15,-20];
  art.close(target.map((v,i)=>v+u[i]*distance/length),target);await sleep(2000);
  const r=read();out.textContent=JSON.stringify({saved:await save('fade-'+distance,r),distance,read:r});
 });
 button('Snapshot',async()=>{const r=read();out.textContent=JSON.stringify({saved:await save('snapshot',r),read:r})});
 button('Read camera',()=>out.textContent=JSON.stringify({camera:d.camera(),player:d.snapshot().player}));
 const sig=s=>[s.calls,s.triangles,s.geometries,s.textures,s.programs].join('/');
 const gate=r=>{const s=r.settings,c=r.camera;if(s.hidden||s.paused||s.shot||s.seat||s.card||s.clubMode||!r.grounded||r.loop.mode!=='always')throw Error('Need normal visible grounded running state');if(s.quality!=='balanced'||s.weather!=='clear'||s.light!=='noon'||s.worldMinutes!==720||s.timeRunning||Math.abs(r.loop.night)>.001)throw Error('Noon/Clear/Balanced required');if(r.renderInfo.drawingBuffer.join('x')!=='1710x931'||r.renderInfo.cssSize.join('x')!=='1710x931'||r.renderInfo.pixelRatio!==1)throw Error('CSS/buffer1710x931 DPR1 required');if(Math.abs(c.yaw-views[point].yaw)>.003||Math.abs(c.pitch-Math.PI/4)>.003||Math.abs(c.distance-12)>.01||Math.abs(c.fov-50)>.01||c.firstPerson)throw Error('Align native camera first')};
 const next=()=>new Promise(r=>{let id;const t=setTimeout(()=>{cancelAnimationFrame(id);r()},250);id=requestAnimationFrame(()=>{clearTimeout(t);r()})});
 button('Bounded sample',async()=>{
  const arrival=read(),samples=[];let settled=null,before=null,after=null,stable=0,prev='',last=arrival.loop.frame,warm=0;
  try{gate(arrival);out.textContent='Settling10s/stable60, then90warm+300frames';const start=performance.now();
   while(performance.now()-start<20000){await next();const l=d.renderLoop();if(l.frame===last)continue;last=l.frame;const key=sig(d.stats());stable=key===prev&&!d.shadowChunkWork?.().pending?stable+1:0;prev=key;if(performance.now()-start>=10000&&stable>=60){settled=read();gate(settled);break}}
   if(!settled)throw Error('Geometry/shadow not settled within20s');const t=performance.now();
   while(samples.length<300&&performance.now()-t<30000){await next();const l=d.renderLoop(),s=d.state();if(document.hidden||s.paused||s.shot||s.seat||l.mode!=='always')throw Error('Interrupted');if(l.frame===last)continue;last=l.frame;if(warm++<90)continue;if(!before){before=read();gate(before)}samples.push({frame:l.frame,dt:l.delta*1000,...d.stats(),player:s.position,shadowPending:d.shadowChunkWork?.().pending??null})}
   after=read();gate(after);if(samples.length!==300)throw Error('Incomplete sample');const drift=(a,b)=>Math.max(...a.map((x,i)=>Math.abs(x-b[i])));if(samples.some(s=>sig(s)!==sig(before.stats)||s.shadowPending||drift(s.camera,before.stats.camera)>.0001||drift(s.player,before.player)>.0001))throw Error('Counters, shadow or pose changed');
   const a=samples.map(s=>s.dt).sort((a,b)=>a-b),summary={frames:300,warmupFrames:90,fps:300000/a.reduce((a,b)=>a+b,0),p50:a[149],p95:a[284],max:a[299],gpuMs:null};out.textContent=JSON.stringify({saved:await save('sample',{valid:true,summary,arrival,settled,before,after,samples}),summary});
  }catch(e){out.textContent=JSON.stringify({saved:await save('sample-failed',{valid:false,reason:e.message,arrival,settled,before,after,samples}),reason:e.message})}
 });
 // Passive read-only probe works while the real modal makes outside QA buttons inert.
 // No invalidate, render request, or world mutation. Bounded to twelve readings.
 let menuReadings=0,lastMenuReading=-Infinity;
 const menuTimer=setInterval(async()=>{
  const s=d.state(),now=performance.now();
  if(!s.ready||!s.paused||s.shot||s.loading?.active||now-lastMenuReading<5000)return;
  lastMenuReading=now;menuReadings++;
  await save('menu-probe',{at:now,paused:s.paused,shot:s.shot,quality:s.quality,light:s.light,worldMinutes:s.worldMinutes,timeRunning:s.timeRunning,loading:s.loading,hidden:document.hidden,loop:d.renderLoop(),stats:d.stats()});
  if(menuReadings>=12)clearInterval(menuTimer);
 },500);
 setTimeout(()=>clearInterval(menuTimer),120000);
 out.textContent='Ready facilities final QA';
})();
