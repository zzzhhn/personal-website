/** Visible, bounded diagnostics compiled only into the local review build. */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useWorldStore, selectWorldTime } from '../../../src/components/world/store';
import { WORLD_SHOTS } from '../../../src/components/world/layout';
import { climate } from '../../../src/components/world/WorldNight';
import { shadowChunkWork } from '../../../src/components/world/WorldShadows';
import { worldActorDebug } from '../../../src/components/world/WorldActors';
import { campColliderRecords } from '../../../src/components/world/WorldCampPhysics';
import { windUniforms } from '../../../src/components/world/WorldWind';
import { occlusionQa } from '../../../src/components/world/WorldOcclusion';
import { readCampPropActivity } from '../../../src/components/world/camp-prop-interactions';
import { parkAudio } from '../../../src/components/world/WorldParkAudio';

export default function CampFeedbackReview() {
  const { gl, camera, scene, invalidate } = useThree();
  const variant = new URLSearchParams(location.search).get('campSurface') === 'legacy' ? 'before' : 'after';
  const probe = useRef({ active: false, previous: 0, warm: 0, start: 0, frame: [] as number[], calls: [] as number[], tris: [] as number[], output: null as HTMLOutputElement | null });
  const result = useRef<unknown>(null);
  const frameFacts = () => ({ variant, shot: useWorldStore.getState().shot, camera: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: 'fov' in camera ? camera.fov : null, exposure: gl.toneMappingExposure, canvas: [gl.domElement.width, gl.domElement.height], dpr: gl.getPixelRatio(), time: useWorldStore.getState().worldMinutes });
  useEffect(() => {
    const root = document.createElement('aside'); root.setAttribute('aria-label', '营地验收');
    root.style.cssText = 'position:fixed;z-index:9998;top:10px;left:10px;background:#102c32ed;color:white;padding:8px;font:12px system-ui;max-width:550px';
    const body = document.createElement('div'), toggle = document.createElement('button');
    toggle.textContent = '收起验收'; toggle.onclick = () => { body.hidden = !body.hidden; toggle.textContent = body.hidden ? '展开验收' : '收起验收'; }; root.append(toggle, body);
    const add = (name: string, action: () => void) => { const b = document.createElement('button'); b.textContent = name; b.style.cssText = 'margin:3px;padding:5px'; b.onclick = action; body.append(b); };
    const shots = document.createElement('select'); shots.setAttribute('aria-label', '营地验收视角');
    for (const s of WORLD_SHOTS.filter(s => s.id.startsWith('camp-batch-'))) shots.append(new Option(s.id, s.id));
    shots.value = useWorldStore.getState().shot ?? '';
    shots.onchange = () => { probe.current.active = false; useWorldStore.setState({ shot: shots.value, paused: false, timeRunning: false }); selectWorldTime(shots.value.endsWith('-night') ? 'night' : 'noon'); invalidate(); }; body.append(shots);
    const out = document.createElement('output'); out.setAttribute('aria-label', '营地验收结果'); out.style.cssText = 'display:block;white-space:pre-wrap;max-height:120px;overflow:auto'; probe.current.output = out;
    add('读取营地', () => {
      const materials = new Map<string, unknown>(); let meshes = 0, cloth = 0;
      scene.traverse((o: any) => { if (!o.isMesh) return; let p = o, inside = false; while(p) { if(p.name === 'world-camp-slice' || p.name === 'world-camp-content') inside = true; p = p.parent; } if(!inside) return;
        meshes++; cloth += o.geometry.attributes._cloth?.count ?? 0;
        for(const m of [o.material].flat()) if(m?.name && !materials.has(m.name)) materials.set(m.name, { name:m.name, uv:!!o.geometry.attributes.uv,map:!!m.map,normal:!!m.normalMap,rough:!!m.roughnessMap,env:!!m.envMap });
      });
      const actor = worldActorDebug.snapshot();
      const flags = ['flag_01','flag_02','flag_03','flag_04'].map(name => { const node=scene.getObjectByName(name);return {name,rotation:node?.rotation.toArray().slice(0,3),lift:node?.userData.campFlagLift}; });
      const page=scene.getObjectByName('camp-content-page-flip')?.parent;
      const tools=scene.getObjectByName('camp-content-C11-tools')?.children[0];
      const occlusion=occlusionQa.last?.debug();
      out.textContent = JSON.stringify({ ...frameFacts(), meshes, cloth, materials:[...materials.values()].slice(0,90), player:actor.player,grounded:actor.grounded,wind:windUniforms.uWindTime.value,loading:useWorldStore.getState().loading.active,shadow:shadowChunkWork().pending, motion:{flags,tools:tools?.rotation.toArray().slice(0,3),page:{visible:page?.visible,rotation:page?.rotation.z}}, camp:readCampPropActivity(),input:worldActorDebug.inputState(),audio:parkAudio.snapshot(), occlusion:occlusion&&{candidates:occlusion.candidates,tested:occlusion.tested,ms:occlusion.ms},colliders:campColliderRecords().filter(c=>['C04','C08','C10'].includes(c.id)) });
    });
    add('测量 360 帧', () => { Object.assign(probe.current, {active:true,previous:0,warm:0,start:performance.now(),frame:[],calls:[],tris:[]}); out.textContent='等待加载与阴影收敛，预热 90 帧并采集 360 帧'; invalidate(); });
    add('输出测量', () => { out.textContent=JSON.stringify(result.current); });
    const places: Record<string, [number,number]> = {'帐篷试玩':[-33,17],'书桌试玩':[-51.79,39.79],'工具墙试玩':[-31.84,19.84],'旗杆试玩':[-55.6,30],'哑铃试玩':[-41.10,16.10],'行李箱试玩':[-26.40,30],'出口试玩':[-31.2,34]};
    for(const [label,[x,z]] of Object.entries(places)) add(label,()=>{probe.current.active=false;worldActorDebug.teleportPlayer([x,4.8+worldActorDebug.snapshot().playerCollider.centerHeight,z]);useWorldStore.setState({shot:null,paused:false,timeRunning:false});invalidate();});
    add('近看动作',()=>useWorldStore.setState({zoom:0}));
    add('暂停',()=>{probe.current.active=false;useWorldStore.setState({paused:true});});
    body.append(out); document.body.append(root); return()=>{probe.current.active=false;root.remove();};
  }, [gl,camera,scene,invalidate,variant]);
  useFrame(()=>{
    const p=probe.current;if(!p.active)return;const now=performance.now(),s=useWorldStore.getState();
    if(document.hidden || s.paused){p.active=false;if(p.output)p.output.textContent='测量中断';return;}
    if(s.loading.active || shadowChunkWork().pending || climate.blend<1){p.previous=0;p.warm=0;invalidate();if(now-p.start>60000){p.active=false;if(p.output)p.output.textContent='加载未收敛';}return;}
    if(p.previous && p.warm++>=90){p.frame.push(now-p.previous);p.calls.push(gl.info.render.calls);p.tris.push(gl.info.render.triangles);}p.previous=now;
    if(p.frame.length>=360){const stats=(a:number[])=>{const v=[...a].sort((a,b)=>a-b);return{n:v.length,p50:v[Math.floor(v.length*.5)],p95:v[Math.floor(v.length*.95)],max:v.at(-1)};};result.current={...frameFacts(),frameMs:stats(p.frame),calls:stats(p.calls),triangles:stats(p.tris),memory:{...gl.info.memory}};p.active=false;if(p.output)p.output.textContent=JSON.stringify(result.current);}else invalidate();
  },-58);
  return null;
}
