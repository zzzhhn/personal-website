import { ACESFilmicToneMapping, BoxGeometry, CapsuleGeometry, Color, DirectionalLight, Fog, Group, HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, SphereGeometry, Vector3, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { THRILL_CREST, THRILL_ELEMENTS, THRILL_LENGTH } from '../../src/components/world/attractions/coaster-thrill-layout';
import { thrillFrame, thrillRidePose, thrillSectionAt } from '../../src/components/world/attractions/coaster-thrill-frame';
import { THRILL_DURATION, THRILL_RUN, thrillDistanceAt, thrillSpeedAt } from '../../src/components/world/attractions/coaster-thrill-motion';
import { buildThrillTrack } from '../../src/components/world/attractions/coaster-thrill-geometry';
import { createCoasterCar } from '../../src/components/world/attractions/coaster-geometry';
import { attractionCameraPose, turnAttractionLook } from '../../src/components/world/attractions/attraction-camera';

const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=document.querySelector('canvas')!,renderer=new WebGLRenderer({canvas,antialias:true,powerPreference:'low-power'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));renderer.toneMapping=ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
const scene=new Scene();scene.background=new Color('#91b7c6');scene.fog=new Fog('#91b7c6',450,1000);
const camera=new PerspectiveCamera(49,1,.1,1500),controls=new OrbitControls(camera,canvas);
controls.enableDamping=false;controls.minDistance=4;controls.maxDistance=600;controls.maxPolarAngle=Math.PI*.49;
const hemi=new HemisphereLight('#d2e9f2','#53604b',2.4),sun=new DirectionalLight('#ffdfa6',3.3);
sun.position.set(-100,180,80);scene.add(hemi,sun);
const ground=new Mesh(new PlaneGeometry(700,700),new MeshStandardMaterial({color:'#536c62',roughness:1}));
ground.rotation.x=-Math.PI/2;ground.position.set(90,.4,-260);scene.add(ground);
const sample=buildThrillTrack(),track=new Mesh(sample.geometry,new MeshStandardMaterial({vertexColors:true,roughness:.5,metalness:.3}));scene.add(track);
const platform=new Mesh(new BoxGeometry(17,1.5,26),new MeshStandardMaterial({color:'#a2a89b',roughness:1}));platform.position.set(46,.2,-153);scene.add(platform);
const carGeometry=createCoasterCar(),carMaterial=new MeshStandardMaterial({vertexColors:true,roughness:.5,metalness:.2});
const cars=Array.from({length:3},()=>{const car=new Group();car.add(new Mesh(carGeometry,carMaterial));scene.add(car);return car;});
// A seated clearance mannequin is a sizing aid, not a replacement for the island character.
const rider=new Group(),suit=new MeshStandardMaterial({color:'#294b61'}),helmet=new MeshStandardMaterial({color:'#e3e7df'});
const body=new Mesh(new CapsuleGeometry(.25,.45,4,8),suit);body.position.set(-.15,1.12,0);rider.add(body);
const head=new Mesh(new SphereGeometry(.32,12,8),helmet);head.position.set(-.1,1.8,0);rider.add(head);
for(const side of [-.18,.18]){const leg=new Mesh(new BoxGeometry(.75,.2,.22),suit);leg.position.set(.35,.75,side);rider.add(leg);}
cars[0].add(rider);
const time=$<HTMLInputElement>('time'),play=$<HTMLButtonElement>('play'),element=$<HTMLSelectElement>('element');
time.max=String(THRILL_DURATION);
const timeFor=(u:number)=>u<=THRILL_CREST?27:29+(THRILL_RUN.find(p=>p.u>=u)?.time??0);
[{label:'内扣首降',u:THRILL_CREST},...THRILL_ELEMENTS.map(e=>({label:e.label,u:e.peaks[0]}))].forEach(e=>{
  const option=document.createElement('option');option.textContent=e.label;option.value=String(timeFor(e.u));element.append(option);
});
let seconds=0,playing=false,raf=0,previous=0,view:'overview'|'chase'|'first'='overview',isNight=false,disposed=false;
let drag:{x:number;y:number}|null=null,lastUi=-1,visibleFrames=0;
const frameTimes:number[]=[];
function overview(){camera.up.set(0,1,0);camera.position.set(300,110,-75);controls.target.set(94,30,-276);controls.update();}
overview();
function updateScene() {
  const u=thrillDistanceAt(seconds);
  cars.forEach((car,i)=>{const frame=thrillFrame(u-i*3.55/THRILL_LENGTH);car.position.copy(frame.point);car.quaternion.copy(frame.rotation);});
  if(view!=='overview') {
    const pose=attractionCameraPose(thrillRidePose(u,view==='first'));camera.position.fromArray(pose.cameraPosition);camera.up.fromArray(pose.cameraUp!);camera.lookAt(new Vector3(...pose.cameraTarget));
    camera.fov=pose.fov;camera.updateProjectionMatrix();
  }
  rider.visible=view!=='first';
  if(Math.floor(seconds*5)!==lastUi||!playing) {
    lastUi=Math.floor(seconds*5);time.value=String(seconds);$('clock').textContent=`${seconds.toFixed(1)} s`;
    $('status').textContent=`${thrillSectionAt(u)} · ${(thrillSpeedAt(seconds)*3.6).toFixed(0)} km/h`;
  }
}
function render(){if(disposed)return;updateScene();renderer.render(scene,camera);}
function setPlaying(value:boolean) {
  playing=value;play.textContent=value?'暂停':'开始乘坐';cancelAnimationFrame(raf);raf=0;previous=0;
  if(value){if(seconds>=THRILL_DURATION)seconds=0;raf=requestAnimationFrame(tick);}else render();
}
function tick(now:number) {
  raf=0;if(!playing||document.hidden||disposed)return;
  const dt=previous?(now-previous)/1000:0;previous=now;
  if(dt>0&&dt<.25)seconds=Math.min(THRILL_DURATION,seconds+dt);
  if(dt>0&&++visibleFrames>30&&frameTimes.length<180) {
    frameTimes.push(dt*1000);
    if(frameTimes.length===180){const sorted=[...frameTimes].sort((a,b)=>a-b);$('metrics').textContent+=` · 帧间隔 p50/p95 ${sorted[90].toFixed(1)}/${sorted[171].toFixed(1)} ms`;}
  }
  render();
  if(seconds>=THRILL_DURATION)setPlaying(false);else raf=requestAnimationFrame(tick);
}
play.onclick=()=>setPlaying(!playing);
for(const mode of ['overview','chase','first'] as const)$(mode).onclick=()=>{
  view=mode;controls.enabled=mode==='overview';for(const id of ['overview','chase','first'])$(id).setAttribute('aria-pressed',String(id===mode));
  if(mode==='overview'){camera.fov=49;camera.updateProjectionMatrix();overview();}render();
};
time.oninput=()=>{seconds=Number(time.value);render();};
element.onchange=()=>{seconds=Number(element.value);render();};
$('night').onclick=()=>{
  isNight=!isNight;$('night').setAttribute('aria-pressed',String(isNight));
  scene.background=new Color(isNight?'#0b1a2c':'#91b7c6');(scene.fog as Fog).color.copy(scene.background);
  hemi.intensity=isNight?1.1:2.4;sun.intensity=isNight?.8:3.3;sun.color.set(isNight?'#a6c9ef':'#ffdfa6');render();
};
controls.addEventListener('change',()=>{if(view==='overview'&&!playing)render();});
canvas.addEventListener('pointerdown',e=>{if(view==='overview')return;drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!drag)return;turnAttractionLook((e.clientX-drag.x)*.0055,(e.clientY-drag.y)*.0055);drag={x:e.clientX,y:e.clientY};render();});
const endDrag=()=>{drag=null;};canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);
document.addEventListener('visibilitychange',()=>{if(document.hidden)setPlaying(false);});
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();render();}
addEventListener('resize',resize);resize();
$('metrics').textContent=`轨道 ${(THRILL_LENGTH/1000).toFixed(2)} km · 8 次倒置 · ${Math.round(THRILL_DURATION)} s\n${renderer.info.render.calls} draw calls · ${renderer.info.render.triangles.toLocaleString()} triangles`;
addEventListener('pagehide',()=>{
  disposed=true;playing=false;cancelAnimationFrame(raf);controls.dispose();
  const geometries=new Set(),materials=new Set();scene.traverse(o=>{if(o instanceof Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
  geometries.forEach((g:any)=>g.dispose());materials.forEach((m:any)=>m.dispose());renderer.dispose();
});
