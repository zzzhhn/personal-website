// Visible QA only. Serve with a coordinator-approved frozen package; never alter product assets.
(async()=>{
  const packs={
    club:{flag:'djcFurniture',url:'/assets/world/club/furniture/furniture-v1.glb',roots:['djc-crafted-furniture','djc-furniture-lounger','djc-furniture-console','djc-furniture-speaker']},
    camp:{flag:'campCraft',url:'/assets/world/camp/craft/camp-props-v1.glb',roots:['camp-craft-C05','camp-craft-C06','camp-craft-C07']},
    ibd:{flag:'ibdStatic',url:'/assets/world/ibd/static-craft/static-craft-v1.glb',roots:['ibd-static-craft']},
  };
  const params=new URLSearchParams(location.search),legacy=Object.fromEntries(Object.entries(packs).map(([k,p])=>[k,params.get(p.flag)==='legacy']));
  const mode=Object.values(legacy).every(Boolean)?'legacy':Object.values(legacy).every(v=>!v)?'candidate':'mixed';
  const runId=(params.get('run')||Date.now().toString(36)).replace(/[^a-z0-9-]/g,'').slice(0,12)||Date.now().toString(36);
  const nav=document.createElement('nav');nav.setAttribute('aria-label','Batch 3 candidate QA');nav.style='position:fixed;bottom:4px;left:165px;z-index:10000;background:#14242a;color:white;padding:5px;font:11px monospace;max-width:1000px';
  const out=document.createElement('output');out.id='qa-readout';out.style='display:block;max-height:90px;overflow:auto';out.textContent='Waiting for world';nav.append(out);document.body.append(nav);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms)),until=Date.now()+90000;
  while(!window.__worldDebug?.state().ready||!window.__worldCampQA){if(Date.now()>until){out.textContent='QA unavailable';return}await sleep(100)}
  const d=window.__worldDebug,art=window.__worldCampQA;let active=null,area=null,stage='idle',serial=0,busy=false,sampling=false;
  const controls=[];
  const button=(name,fn)=>{const b=document.createElement('button');b.textContent=name;b.onclick=async()=>{
    if(busy)return;busy=true;controls.forEach(x=>x.disabled=true);
    try{await fn()}catch(e){out.textContent='Error: '+e.message}finally{busy=false;controls.forEach(x=>x.disabled=false)}
  };controls.push(b);nav.append(b)};
  const config=async()=>{const response=await fetch('/__views.json',{cache:'no-store'});if(!response.ok)throw Error('View configuration unavailable');return response.json()};
  const settings=()=>{const s=d.state();return {ready:s.ready,loadingPhase:s.loading?.phase,position:s.position,seat:s.seat,clubMode:s.clubMode,paused:s.paused,shot:s.shot,quality:s.quality,weather:s.weather,light:s.light,worldMinutes:s.worldMinutes,timeRunning:s.timeRunning,hidden:document.hidden}};
  const resourceEvidence=()=>Object.fromEntries(Object.entries(packs).map(([key,p])=>{
    const r=performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname===p.url).at(-1);
    return [key,r?{url:r.name,bytes:r.decodedBodySize,responseEnd:r.responseEnd,duration:r.duration}:null];
  }));
  const evidence=()=>{const names=d.sceneObjects();return {resources:resourceEvidence(),nodes:Object.fromEntries(Object.entries(packs).map(([key,p])=>[key,p.roots.map(root=>({root,present:names.includes(root),namedDescendants:names.filter(n=>n.startsWith(root+'-')).length}))]))}};
  const gates=(key,e)=>legacy[key]?e.nodes[key].every(n=>!n.present):!!e.resources[key]&&e.nodes[key].every(n=>n.present);
  const ensureExit=()=>{const s=d.state();if(s.seat)throw Error('Stand up using product controls first');if(s.clubMode==='dj'||s.clubMode==='dance')throw Error('Leave DJ/dance using product controls first');if(s.activeVehicle)throw Error('Exit the vehicle first')};
  const setTime=async(light)=>{
    const target=light==='night'?1:0;d.set({light,worldMinutes:light==='night'?0:720,timeRunning:false,timeRevision:d.state().timeRevision+1});
    const start=performance.now();let refresh=start;
    while(performance.now()-start<6000){await sleep(150);if(performance.now()-start>1500&&Math.abs(d.renderLoop().night-target)<.001){out.textContent='Time ready '+light+' · '+active;return}
      if(performance.now()-refresh>800){d.set({timeRevision:d.state().timeRevision+1});refresh=performance.now()}
    }
    throw Error('Lighting transition not settled; inspect readout before capture');
  };
  const prime=async(id,p,key)=>{
    ensureExit();stage='priming';active=id;area=key;art.release();d.set({shot:null,paused:false,timeRunning:false,quality:'balanced',weather:'clear',zoom:1});d.teleportPlayer(p);
    const start=performance.now(),first=d.renderLoop().frame;out.textContent='Normal play activation '+id;
    while(performance.now()-start<60000){await sleep(250);const s=d.state(),e=evidence();
      if(s.paused||s.shot||document.hidden)throw Error('Activation interrupted');
      const near=Math.hypot(s.position[0]-p[0],s.position[2]-p[2])<2;
      if(performance.now()-start>=1800&&near&&d.renderLoop().frame>first+30&&gates(key,e)){stage='normal-ready';out.textContent='Normal ready '+id+' · '+mode+' · frame '+d.renderLoop().frame;return e}
    }
    stage='unready';throw Error('Activation timed out; inspect resource/node evidence, do not capture fallback');
  };
  const areaFor=id=>id.includes('club')?'club':id.includes('camp')?'camp':'ibd';
  const views=await config();
  for(const id of Object.keys(views).filter(k=>k.startsWith('v')))button('Art '+id,async()=>{
    const v=(await config())[id];await prime(id,v.player,areaFor(id));art.close(v.position,v.target);d.set({timeRevision:d.state().timeRevision+1});await sleep(1800);
    const e=evidence();if(!gates(area,e))throw Error('Craft nodes disappeared after art lock');stage='art-ready';out.textContent='Art ready '+id+' · actual '+d.stats().camera.join(',');
  });
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const alignment=async()=>{if(!active?.startsWith('n'))return null;const v=(await config())[active],c=d.camera();return {target:{yaw:v.yaw,pitch:v.pitch,distance:v.distance},current:{yaw:c.yaw,pitch:c.pitch,distance:c.distance,fov:c.fov},nativeDragPixels:{dx:wrap(v.yaw-c.yaw)/.0055,dy:(v.pitch-c.pitch)/.0055}}};
  for(const id of Object.keys(views).filter(k=>k.startsWith('n')))button('Normal '+id,async()=>{
    const v=(await config())[id];await prime(id,v.player,v.area);out.textContent=JSON.stringify({normalReady:id,alignment:await alignment()});
  });
  const goto=async(name,p,key)=>{await prime(name,p,key);out.textContent='Use actual product E/button · '+name};
  button('Go bench seat',async()=>{const seat=window.__worldCampContent?.seats()?.[0];if(!seat)throw Error('Camp seat API unavailable');await goto('interaction-seat',[seat.anchor[0],seat.anchor[1]+.8,seat.anchor[2]],'camp')});
  button('Go DJ decks',()=>goto('interaction-dj',[31,4,55],'club'));
  button('Go IBD manifest',()=>goto('interaction-manifest',[-91,3.8,-150],'ibd'));
  button('Go IBD kit',()=>goto('interaction-kit',[-94,3.8,-157],'ibd'));
  button('Go IBD crate',()=>goto('interaction-crate',[-78,3.8,-186],'ibd'));
  button('Noon',()=>setTime('noon'));button('Midnight',()=>setTime('night'));
  const read=()=>{const s=settings(),r=d.renderInfo(),a=d.snapshot(),stats=d.stats(),loop=d.renderLoop();return {runId,mode,active,area,stage,settings:s,
    drawingBuffer:r.drawingBuffer,cssSize:r.cssSize,pixelRatio:r.pixelRatio,actualCameraPosition:stats.camera,camera:d.camera(),player:a.player,grounded:a.grounded,
    velocity:a.playerVelocity,frame:loop.frame,renderMode:loop.mode,night:loop.night,renderer:{calls:stats.calls,triangles:stats.triangles,geometries:stats.geometries,textures:stats.textures,programs:stats.programs},
    evidence:evidence(),ibdHud:document.querySelector('[data-ibd-hud]')?.innerText?.slice(0,2500)||null,url:location.href,at:performance.now()}};
  const save=async(kind,value)=>{const name=mode+'-'+runId+'-'+(active||'idle')+'-'+kind+'-'+(++serial),response=await fetch('/result/'+name,{method:'POST',body:JSON.stringify(value)});if(!response.ok)throw Error('Save '+response.status);return name};
  button('Read alignment',async()=>{out.textContent=JSON.stringify({alignment:await alignment(),settings:settings(),camera:d.camera()})});
  button('Snapshot',async()=>{
    const value=read();if(!area||!gates(area,value.evidence))throw Error('Resource/node gate failed');
    if(Math.abs(value.night-(value.settings.light==='night'?1:0))>.001)throw Error('Wait for Noon/Midnight lighting transition before Snapshot');
    const v=(await config())[active];if(v)value.configuration=v;
    const name=await save('snapshot',value);out.textContent=JSON.stringify({saved:name,frame:value.frame,buffer:value.drawingBuffer,stage,settings:value.settings,evidence:value.evidence});
  });
  const nextPaint=()=>new Promise(resolve=>{let frame;const timer=setTimeout(()=>{cancelAnimationFrame(frame);resolve()},250);frame=requestAnimationFrame(()=>{clearTimeout(timer);resolve()})});
  button('Sample 90 + 300',async()=>{
    if(mode==='mixed'||!active?.startsWith('n'))throw Error('Use one of the three normal presets in full candidate or full legacy mode');
    const before=read(),v=(await config())[active],c=before.camera;
    if(before.settings.paused||before.settings.shot||before.settings.seat||before.settings.hidden||before.renderMode!=='always'||!before.grounded)throw Error('Need normal unpaused grounded running frames');
    if(!gates(area,before.evidence))throw Error('Assets not ready');
    if(before.drawingBuffer.join('x')!=='1710x931'||before.cssSize.join('x')!=='1710x931')throw Error('Require matched 1710x931 actual buffer and CSS');
    if(before.settings.light!=='noon'||before.settings.worldMinutes!==720||before.settings.timeRunning||before.settings.weather!=='clear'||before.settings.quality!=='balanced')throw Error('Require fixed Noon/Clear/Balanced');
    if(Math.abs(before.night)>.001)throw Error('Wait for noon lighting transition');
    if(Math.abs(wrap(c.yaw-v.yaw))>.003||Math.abs(c.pitch-v.pitch)>.003||Math.abs(c.distance-v.distance)>.01||c.firstPerson)throw Error('Align camera with native drag first');
    const samples=[],start=performance.now();let last=before.frame,warm=0;sampling=true;out.textContent='Sampling · do not screenshot or use controls';
    try{
      while(samples.length<300&&performance.now()-start<60000){
        await nextPaint();const s=d.state(),loop=d.renderLoop();if(document.hidden||s.paused||s.shot||s.seat)throw Error('Sampling interrupted');if(loop.mode!=='always')throw Error('Not normal running');if(loop.frame===last)continue;last=loop.frame;if(warm++<90)continue;
        const stats=d.stats();samples.push({frame:loop.frame,dt:loop.delta*1000,draws:stats.calls,tri:stats.triangles});
      }
      if(samples.length!==300)throw Error('Sampling deadline, incomplete window');
      const sorted=samples.map(s=>s.dt).sort((a,b)=>a-b),summary={frames:300,warmupFrames:90,fps:300000/sorted.reduce((a,b)=>a+b,0),p50:sorted[149],p95:sorted[284],max:sorted[299],over33_4ms:sorted.filter(n=>n>33.4).length,gpuMs:null};
      const after=read();if(after.drawingBuffer.join('x')!==before.drawingBuffer.join('x')||after.cssSize.join('x')!==before.cssSize.join('x'))throw Error('Buffer changed during window');
      const name=await save('sample',{summary,before,after,samples,startedAt:start,endedAt:performance.now()});out.textContent=JSON.stringify({saved:name,...summary});
    }catch(error){await save('sample-failed',{reason:error.message,before,samples});throw error}finally{sampling=false}
  });
  button('Hide QA 3s',()=>{if(sampling)throw Error('No screenshots during sampling');nav.hidden=true;setTimeout(()=>nav.hidden=false,3000)});
  button('Pause',()=>d.set({paused:true}));
  out.textContent='Ready · '+mode+' · run '+runId+' · resource and crafted-node gates enabled';
})();
