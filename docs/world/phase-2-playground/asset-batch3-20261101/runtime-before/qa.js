// Visible local art-reference controls. Frozen production files remain unchanged.
(async()=>{
  const views={
    'v1-club-lounger':{families:['Club flat lounger'],player:[78,3,59],position:[78.5,4.2,59],target:[74,1.65,63]},
    'v2-club-dj':{families:['DJ console shell','Monitor speaker pair'],player:[40,4,55],position:[41,5.6,55],target:[33,3,55]},
    'v3-camp-fire':{families:['C05 fire pit','C06 benches'],player:[-34,7,39],position:[-33.6,9.2,39],target:[-42,5.2,30]},
    'v4-camp-desk':{families:['C07 desk and stool'],player:[-48,7,36],position:[-48.5,8.2,36.5],target:[-52.6066017178,5.6,40.6066017178]},
    'v5-ibd-inspection':{families:['IBD inspection bench','IBD control pedestal shell'],player:[-74,3.8,-184.5],position:[-74,5.6,-181.5],target:[-74,1.8,-189]},
    'v6-ibd-utility':{families:['IBD utility bench'],player:[-88,3,-151],position:[-85.7,4.8,-149],target:[-92.5,2,-154.5]},
  };
  const ui=document.createElement('nav');ui.setAttribute('aria-label','Batch 3 reference QA');ui.style='position:fixed;bottom:4px;left:165px;z-index:10000;background:#14242a;color:white;padding:6px;font:11px monospace;max-width:850px';
  const out=document.createElement('output');out.id='qa-readout';out.style='display:block';out.textContent='Waiting for world';ui.append(out);document.body.append(ui);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));const deadline=Date.now()+90000;
  while(!window.__worldDebug?.state().ready||!window.__worldCampQA){if(Date.now()>deadline){out.textContent='QA unavailable';return}await sleep(100)}
  const d=window.__worldDebug,cam=window.__worldCampQA;let active=null,revision=0;
  const button=(name,fn)=>{const b=document.createElement('button');b.textContent=name;b.onclick=()=>Promise.resolve(fn()).catch(e=>out.textContent='Error: '+e.message);ui.append(b)};
  const quiet=()=>performance.now()-Math.max(0,...performance.getEntriesByType('resource').map(e=>e.responseEnd||0));
  const settle=async()=>{const current=++revision,start=performance.now(),frame=d.renderLoop().frame;out.textContent='Settling '+active;
    d.set({timeRevision:d.state().timeRevision+1});
    while(performance.now()-start<12000){await sleep(100);if(current!==revision)return;if(performance.now()-start>=1800&&quiet()>=700&&d.renderLoop().frame>frame){out.textContent='Ready '+active+' · frame '+d.renderLoop().frame;return}}
    out.textContent='Check loading '+active;
  };
  for(const [id,v] of Object.entries(views))button(id,async()=>{const response=await fetch('/__views.json',{cache:'no-store'});if(response.ok)Object.assign(v,(await response.json())[id]||{});active=id;d.teleportPlayer(v.player);d.set({paused:false,timeRunning:false,quality:'balanced',weather:'clear',zoom:1});cam.close(v.position,v.target);await settle()});
  button('Noon',async()=>{d.set({light:'noon',worldMinutes:720,timeRunning:false});await settle()});
  button('Midnight',async()=>{d.set({light:'night',worldMinutes:0,timeRunning:false});await settle()});
  button('Snapshot',async()=>{
    if(!active)throw Error('Select a view');const s=d.state(),r=d.renderInfo(),stats=d.stats(),loop=d.renderLoop(),a=d.snapshot();
    const resources=performance.getEntriesByType('resource').filter(e=>/\.glb(?:\?|$)/i.test(e.name));
    const value={view:active,configuration:views[active],cameraSource:'existing __worldCampQA.close art camera',actualCameraPosition:stats.camera,fov:d.camera()?.fov,
      drawingBuffer:r.drawingBuffer,cssSize:r.cssSize,pixelRatio:r.pixelRatio,quality:s.quality,weather:s.weather,light:s.light,worldMinutes:s.worldMinutes,timeRunning:s.timeRunning,
      paused:s.paused,shot:s.shot,frame:loop.frame,mode:loop.mode,night:loop.night,player:a.player,grounded:a.grounded,resourceQuietMs:quiet(),glbCount:resources.length,
      recentGlbs:resources.slice(-12).map(e=>({url:e.name,bytes:e.decodedBodySize,responseEnd:e.responseEnd})),renderer:{calls:stats.calls,triangles:stats.triangles,geometries:stats.geometries,textures:stats.textures,programs:stats.programs},url:location.href};
    const name='before-'+active+'-'+(s.light==='night'?'midnight':'noon');const result=await fetch('/result/'+name,{method:'POST',body:JSON.stringify(value)});if(!result.ok)throw Error('Snapshot save '+result.status);
    out.textContent='Saved '+name+' · frame '+value.frame+' · buffer '+r.drawingBuffer.join('x')+' · quiet '+Math.round(value.resourceQuietMs)+' ms';
  });
  button('Hide QA 3s',()=>{ui.hidden=true;setTimeout(()=>ui.hidden=false,3000)});
  button('Pause',()=>d.set({paused:true}));
  out.textContent='Ready · select view';
})();
