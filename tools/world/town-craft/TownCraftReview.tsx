/** Review-build only, bounded user-visible controls and measurements. */
import {useEffect,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {useWorldStore,selectWorldTime} from '../../../src/components/world/store';
import {WORLD_SHOTS} from '../../../src/components/world/layout';
import {climate} from '../../../src/components/world/WorldNight';
import {shadowChunkWork} from '../../../src/components/world/WorldShadows';
import {worldActorDebug} from '../../../src/components/world/WorldActors';

export default function TownCraftReview({stats,variant}:{stats:unknown;variant:string}){
 const {gl,camera,scene,invalidate}=useThree();
 const state=useRef({active:false,previous:0,warm:0,start:0,values:[] as number[],calls:[] as number[],tris:[] as number[],output:null as HTMLOutputElement|null});
 const result=useRef<unknown>(null);
 useEffect(()=>{
  const root=document.createElement('aside');root.setAttribute('aria-label','城区资产验收');root.style.cssText='position:fixed;z-index:9998;top:10px;left:10px;background:#102c32ed;color:white;padding:8px;font:12px system-ui;max-width:510px';
  const body=document.createElement('div');
  const toggle=document.createElement('button');toggle.textContent='收起验收';toggle.onclick=()=>{body.hidden=!body.hidden;toggle.textContent=body.hidden?'展开验收':'收起验收';};root.append(toggle,body);
  const add=(name:string,fn:()=>void)=>{const b=document.createElement('button');b.textContent=name;b.style.cssText='margin:3px;padding:5px';b.onclick=fn;body.append(b);};
  const shots=document.createElement('select');shots.setAttribute('aria-label','城区验收视角');
  for(const shot of WORLD_SHOTS.filter(s=>s.id.startsWith('town-craft-')))shots.append(new Option(shot.id,shot.id));
  shots.value=useWorldStore.getState().shot??'';
  shots.onchange=()=>{state.current.active=false;useWorldStore.setState({shot:shots.value,paused:false,timeRunning:false});selectWorldTime(shots.value.endsWith('-night')?'night':'noon');invalidate();};body.append(shots);
  const out=document.createElement('output');out.setAttribute('aria-label','城区验收结果');out.style.cssText='display:block;white-space:pre-wrap;max-height:140px;overflow:auto';state.current.output=out;
  add('读取材质',()=>{
   const town=scene.getObjectByName('world-town-assets');const mats=new Map();let meshes=0;
   town?.traverse((o:any)=>{if(!o.isMesh)return;meshes++;const m=o.material;if(m?.name&&!mats.has(m.name))mats.set(m.name,{name:m.name,uv:!!o.geometry.attributes.uv,map:!!m.map,normal:!!m.normalMap,rough:!!m.roughnessMap,env:!!m.envMap});});
   out.textContent=JSON.stringify({variant,stats,meshes,materials:[...mats.values()],loading:useWorldStore.getState().loading.active,shadow:shadowChunkWork().pending});
  });
  add('测量 360 帧',()=>{Object.assign(state.current,{active:true,previous:0,warm:0,start:performance.now(),values:[],calls:[],tris:[]});out.textContent='等待加载收敛，预热 90 帧并采集 360 帧';invalidate();});
  add('输出测量',()=>{out.textContent=JSON.stringify(result.current);});
  add('门前试玩',()=>{state.current.active=false;worldActorDebug.teleportPlayer([14,1.9,-2.5]);useWorldStore.setState({shot:null,paused:false,timeRunning:false});invalidate();});
  add('暂停',()=>{state.current.active=false;useWorldStore.setState({paused:true});});
  body.append(out);document.body.append(root);
  return()=>{state.current.active=false;root.remove();};
 },[variant,stats,gl,camera,scene,invalidate]);
 useFrame(()=>{
  const p=state.current;if(!p.active)return;const now=performance.now(),w=useWorldStore.getState();
  if(document.hidden||w.paused){p.active=false;if(p.output)p.output.textContent='测量中断';return;}
  if(w.loading.active||shadowChunkWork().pending||climate.blend<1){p.previous=0;p.warm=0;invalidate();if(now-p.start>60000){p.active=false;if(p.output)p.output.textContent='加载未收敛';}return;}
  if(p.previous&&p.warm++>=90){p.values.push(now-p.previous);p.calls.push(gl.info.render.calls);p.tris.push(gl.info.render.triangles);}p.previous=now;
  if(p.values.length>=360){
   const summary=(a:number[])=>{const s=[...a].sort((a,b)=>a-b);return{n:s.length,p50:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)],max:s.at(-1)};};
   result.current={variant,shot:w.shot,camera:camera.position.toArray(),quaternion:camera.quaternion.toArray(),canvas:[gl.domElement.width,gl.domElement.height],dpr:gl.getPixelRatio(),frameMs:summary(p.values),calls:summary(p.calls),triangles:summary(p.tris),memory:gl.info.memory,stats};p.active=false;if(p.output)p.output.textContent=JSON.stringify(result.current);
  }else invalidate();
 },-58);
 return null;
}
