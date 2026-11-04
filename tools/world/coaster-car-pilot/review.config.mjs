import base from '../coaster-craft-rework/full-scene-review.config.mjs';

// Same source, environment, camera, exposure and rendering settings for A/B.
// Only the inner car visual changes; train transforms/physics/ride are untouched.
const pilot={name:'single-car-astra-review',enforce:'pre',transform(code,id){
  if(id.endsWith('/layout-v4-flag.ts'))return code.replace('export const WORLD_SHOTS_V4 = [',`export const WORLD_SHOTS_V4 = [
    {id:'pilot-front-day',position:[46.5,3.8,-156.5] as Vec3,target:[50,2.5,-152] as Vec3},
    {id:'pilot-front-night',position:[46.5,3.8,-156.5] as Vec3,target:[50,2.5,-152] as Vec3},
    {id:'pilot-ordinary-day',position:[43.3,4.5,-147] as Vec3,target:[50,2.45,-152] as Vec3},
    {id:'pilot-ordinary-night',position:[43.3,4.5,-147] as Vec3,target:[50,2.45,-152] as Vec3},
    {id:'pilot-chest-day',position:[46.8,3.65,-130.8] as Vec3,target:[42,2,-135.5] as Vec3},
    {id:'pilot-chest-night',position:[46.8,3.65,-130.8] as Vec3,target:[42,2,-135.5] as Vec3},`);
  if(id.endsWith('/WorldRuntime.tsx'))return "import CarPerformanceReview from './attractions/CarPerformanceReview';\n"+code.replace('  return null;\n}\n\nexport default memo','  return <CarPerformanceReview />;\n}\n\nexport default memo').replace('dpr={[1, 2]}','dpr={1}').replace('  const { camera, gl, scene, clock, invalidate, size, get } = useThree();',`  const { camera, gl, scene, clock, invalidate, size, get } = useThree();
  useEffect(()=>{
    const bar=document.createElement('nav');bar.setAttribute('aria-label','列车精修对照');
    bar.style.cssText='position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;gap:5px;padding:7px;background:#172c34e8;border:1px solid #73888d;border-radius:12px;font:13px system-ui;';
    const button=(title:string,fn:()=>void)=>{const b=document.createElement('button');b.textContent=title;b.style.cssText='color:#f3ead9;background:#29424c;border:1px solid #56717b;border-radius:6px;padding:8px 13px;cursor:pointer;white-space:nowrap';b.onclick=fn;bar.append(b);return b;};
    const mark=(variant:string)=>{Array.from(bar.querySelectorAll('button')).slice(0,3).forEach((b,i)=>{const on=['before','after','optimized'][i]===variant;b.setAttribute('aria-pressed',String(on));b.style.background=on?'#b57644':'#29424c';});};
    const view=(name:string)=>{const s=useWorldStore.getState(),dark=s.light==='night';useWorldStore.setState(v=>({shot:name+(dark?'-night':'-day'),paused:false,timeRunning:false,weather:'clear',worldMinutes:dark?0:720,light:dark?'night':'noon',timeRevision:v.timeRevision+1}));invalidate();};
    const variant=(value:string)=>{document.documentElement.dataset.carPilot=value;window.dispatchEvent(new CustomEvent('car-pilot',{detail:value}));mark(value);invalidate();};
    button('原版',()=>variant('before'));
    button('精修原始',()=>variant('after'));
    button('精修优化',()=>variant('optimized'));
    button('侧面',()=>view('scene-train'));button('前侧',()=>view('pilot-front'));button('常规距离',()=>view('pilot-ordinary'));
    button('宝箱原版',()=>{window.dispatchEvent(new CustomEvent('chest-pilot',{detail:false}));view('pilot-chest');});
    button('宝箱精修',()=>{window.dispatchEvent(new CustomEvent('chest-pilot',{detail:true}));view('pilot-chest');});
    button('日 / 夜',()=>{const s=useWorldStore.getState(),dark=s.light!=='night';useWorldStore.setState(v=>({shot:(s.shot??'scene-train-day').replace(/-(day|night)$/,'')+(dark?'-night':'-day'),timeRunning:false,weather:'clear',worldMinutes:dark?0:720,light:dark?'night':'noon',timeRevision:v.timeRevision+1}));invalidate();});
    document.body.append(bar);document.documentElement.dataset.carPilot=new URLSearchParams(location.search).get('car')??'optimized';mark(document.documentElement.dataset.carPilot);view('pilot-front');
    return()=>bar.remove();
  },[invalidate]);`);
  if(id.endsWith('/WorldIntentDevices.tsx'))return `import { Suspense, useState } from 'react';\nimport WorldCoasterChestTransfer from './WorldCoasterChestTransfer';\n`+code.replace('<IntentChest />','<ChestTransferChoice />')+`
function ChestTransferChoice(){const [on,setOn]=useState(false);useEffect(()=>{const fn=(e:Event)=>setOn((e as CustomEvent<boolean>).detail);window.addEventListener('chest-pilot',fn);return()=>window.removeEventListener('chest-pilot',fn);},[]);return on?<Suspense fallback={<IntentChest/>}><WorldCoasterChestTransfer/></Suspense>:<IntentChest/>;}
`;
  if(!id.endsWith('/WorldIntentCoaster.tsx'))return;
  const old='<mesh geometry={geometry} castShadow receiveShadow><WorldIntentReflectiveSurface roughness={.65} metalness={.12} /></mesh>';
  if(!code.includes(old))throw new Error('Frozen baseline car marker changed');
  return `import { Suspense } from 'react';\nimport WorldCoasterCarPilot from './WorldCoasterCarPilot';\nimport WorldCoasterTrainCraft from './WorldCoasterTrainCraft';\n`+code.replace('function CoasterTrain({ active }: { active: boolean }) {',`function CoasterTrain({ active }: { active: boolean }) {
    const [pilot,setPilot]=useState(new URLSearchParams(window.location.search).get('car')??'optimized');
    useEffect(()=>{const listener=(event:Event)=>setPilot((event as CustomEvent<string>).detail);window.addEventListener('car-pilot',listener);return()=>window.removeEventListener('car-pilot',listener);},[]);`).replace(old,
    `{pilot==='before' ? (${old}) : pilot==='after' ? <Suspense fallback={${old}}><WorldCoasterCarPilot /></Suspense> : null}`).replace('{[0, 1, 2].map(i => {',`{pilot==='optimized' && <Suspense fallback={null}><WorldCoasterTrainCraft cars={cars}/></Suspense>}
    {[0, 1, 2].map(i => {`);
}};
// Bound DOM diagnostics, equally for all variants; do not stringify the entire
// loading/camera record on every rendered frame while profiling.
const plugins=base.vite.plugins.map(plugin=>plugin.name==='independent-coaster-scene-review'?{...plugin,transform(code,id){
  const result=plugin.transform(code,id);
  return typeof result==='string'?result.replace('if (!probe.active || now-probe.updated > 500)', 'if (now-probe.updated > 500 || probe.updated === 0)'):result;
}}:plugin);
export default {...base,vite:{...base.vite,plugins:[pilot,...plugins]}};
