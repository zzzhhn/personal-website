import { useEffect,useMemo,useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody,TrimeshCollider,ConvexHullCollider } from '@react-three/rapier';
import { BufferGeometry,CanvasTexture,Color,DoubleSide,Group,Mesh,MeshBasicMaterial,MeshStandardMaterial,InstancedMesh,Object3D,Quaternion,SRGBColorSpace,SphereGeometry,TubeGeometry,CatmullRomCurve3,Vector3,Float32BufferAttribute,LatheGeometry,Vector2 } from 'three';
import { AlphaBuilder,alphaLanternGeometry,type AlphaFinish } from './alpha-art';
import AlphaStationStructure from './AlphaStationStructure';
import { createLodgeRamp } from './alpha-station-structures';
import { surfaceColliderBuffers } from '../static-surface-asset';
import { ALPHA_MAIN_PATH,ALPHA_STATIONS,ALPHA_WIND_GATE_Y } from './alpha-layout';
import { alphaGroundHeight as alphaHeight,alphaPathDistance } from './alpha-terrain';
import AlphaPathFence from './AlphaPathFence';
import { createAlphaBoulderField } from './alpha-rocks';
import { alphaMaterial,alphaMaterialUniforms } from './alpha-materials';
import AlphaGrammarTree from './AlphaGrammarTree';
import { createSummitCairns } from './alpha-summit-cairns';
import { useOwnedWorldVisual } from '../useOwnedWorldVisual';
import AlphaVisitorWayfinding from './AlphaVisitorWayfinding';
import { alphaTrailSignPosition,alphaTrailLampLocations as lampLocations,createAlphaTrailLampParts as lampParts } from './alpha-trail-placement';
import { alphaMotion,useAlphaStore } from './alpha-state';
import type { Vec3 } from '../types';
function Craft({build,name,position=[0,0,0]}:{build:()=>{finish:AlphaFinish;geometry:BufferGeometry}[];name:string;position?:Vec3}){
 const b=useMemo(build,[build]),m=useMemo(()=>new Map(b.map(p=>[p.finish,alphaMaterial(p.finish)])),[b]);useEffect(()=>()=>{b.forEach(p=>p.geometry.dispose());m.forEach(x=>x.dispose());},[b,m]);return <group name={name} position={position}>{b.map(p=><mesh key={p.finish} geometry={p.geometry} material={m.get(p.finish)} castShadow receiveShadow />)}</group>;
}
export function AlphaLantern({position=[0,0,0],scale=1,rootRef}:{position?:Vec3;scale?:number;rootRef?:React.RefObject<Group|null>}){return <group ref={rootRef} position={position} scale={scale}><Craft build={alphaLanternGeometry} name="alpha-paper-lantern"/></group>;}
function treeRope(){const b=new AlphaBuilder();b.beam('rope',[-.7,3.2,1.3],[-.7,1.2,1.3],.028);b.cyl('darkwood',[-.7,1.2,1.3],.075,.25);return b.finish();}
function windGate(){const b=new AlphaBuilder();for(const x of [-1,1]){
 // Extend the same stone foot into the actual sloping triangles. Keep its top,
 // post and crossbar together, rather than lowering only an invisible target.
 let bottom=0;for(let iz=0;iz<=4;iz++)for(let ix=0;ix<=4;ix++)bottom=Math.min(bottom,alphaHeight(16+x-.3+ix*.15,-44-.325+iz*.1625)-ALPHA_WIND_GATE_Y-.08);
 b.box('stone',[x,(bottom+.32)/2,0],[.6,.32-bottom,.65],.07);b.beam('wood',[x,.2,0],[x,1.5,0],.16);
}b.beam('metal',[-1.1,1.05,0],[1.1,1.05,0],.065);for(let i=0;i<6;i++)b.box('wood',[-.8+i*.32,1.2,0],[.2,.8,.12]);return b.finish();}
function plateauRocks(){const b=new AlphaBuilder();for(let i=0;i<120;i++){const a=i*2.399,r=27+(i%17)*3.3,x=Math.cos(a)*r,z=Math.sin(a)*r*1.2,y=alphaHeight(x,z);if(y<-.8||alphaPathDistance(x,z)<4.5)continue;const g=new SphereGeometry(1,10,7);const at=g.getAttribute('position');for(let k=0;k<at.count;k++){const v=new Vector3().fromBufferAttribute(at,k);v.multiplyScalar(1+.12*Math.sin(v.y*9+v.x*7+i));at.setXYZ(k,v.x,v.y,v.z);}g.computeVertexNormals();b.add(g,'stone',[x,y-.28,z],new Quaternion().setFromAxisAngle(new Vector3(0,1,0),i*1.7),[1.3+(i%4)*.4,.9+(i%3)*.35,1.3]);}return b.finish();}
export function AlphaSign({position,text,width=3.3,height=1.35,nightLegible=true}:{position:Vec3;text:string;width?:number;height?:number;nightLegible?:boolean}){
 const material=useRef<MeshStandardMaterial>(null),textures=useMemo(()=>{
  const c=document.createElement('canvas');c.width=1024;c.height=256;const x=c.getContext('2d')!;x.fillStyle='#63503b';x.fillRect(0,0,1024,256);x.strokeStyle='#baa075';x.lineWidth=10;x.strokeRect(15,15,994,226);x.fillStyle='#fff0cc';x.textAlign='center';x.textBaseline='middle';x.font='500 48px sans-serif';x.fillText(text,512,128,940);
  const t=new CanvasTexture(c);t.colorSpace=SRGBColorSpace;
  const glow=document.createElement('canvas');glow.width=1024;glow.height=256;const g=glow.getContext('2d')!;g.fillStyle='#000000';g.fillRect(0,0,1024,256);g.fillStyle='#fff0cc';g.textAlign='center';g.textBaseline='middle';g.font='500 48px sans-serif';g.fillText(text,512,128,940);const e=new CanvasTexture(glow);e.colorSpace=SRGBColorSpace;return{t,e};
 },[text]);
 useFrame(()=>{if(material.current)material.current.emissiveIntensity=nightLegible ? .025+alphaMaterialUniforms.night.value*.4 : 0;});
 useEffect(()=>()=>{textures.t.dispose();textures.e.dispose();},[textures]);
 return <group position={position} userData={{worldCollision:'none',collisionReason:'Nonblocking trail or pier sign'}}><mesh position={[0,(height+.05)/2,0]}><cylinderGeometry args={[.065,.085,height+.05,8]}/><meshStandardMaterial color="#75583d" roughness={.95}/></mesh><mesh position={[0,height,.07]}><boxGeometry args={[width,width/4,.09]}/><meshStandardMaterial ref={material} map={textures.t} emissiveMap={nightLegible?textures.e:undefined} emissive="#fff0cc" emissiveIntensity={0} roughness={.88}/></mesh></group>;
}
export default function AlphaScenery(){return <group name="alpha-craft-assemblies">
 <AlphaStationStructure station="lodge"/>
 <AlphaVisitorWayfinding/><LodgeRamp/><BellMechanism/><WindHandle/><SandMiniature/><TrailLamps/>
 <AlphaPathFence/><BoulderField/>
 <AlphaGrammarTree/><Craft name="alpha-grammar-tree-pull-rope" build={treeRope} position={ALPHA_STATIONS.tree}/>
 <Craft name="alpha-wind-gate" build={windGate} position={[16,ALPHA_WIND_GATE_Y,-44]}/>
 <CairnField/>
 <AlphaStationStructure station="rack"/>
 <AlphaSign position={alphaTrailSignPosition(-68.6,-36.6)} width={2.4} height={1.04} nightLegible text="一切，从一个想法开始。"/>
 <AlphaSign position={alphaTrailSignPosition(-46,-26)} text="先看清枝干，再向上生长。"/>
 <AlphaSign position={alphaTrailSignPosition(16,-38)} text="在风里，还站得住吗？"/>
 <AlphaSign position={alphaTrailSignPosition(-2,44)} text="一块一块，垒向云上。"/>
 </group>;}

function LodgeRamp() {
 const ramp = useMemo(() => {
  const geometry=createLodgeRamp(), material=alphaMaterial('lodgeFloor');
  const surface={id:'alpha-lodge-access-ramp',space:'alpha-island',role:'floor',collision:'solid',reason:'Walkable threshold from trail to floorboards',geometry} as const;
  return {geometry,material,surface,buffers:surfaceColliderBuffers(surface)!,dispose(){geometry.dispose();material.dispose();}};
 },[]);
 useOwnedWorldVisual(ramp);
 return <RigidBody name="alpha-lodge-threshold" type="fixed" colliders={false} userData={{surface:true}}>
  <TrimeshCollider name={ramp.surface.id+'/floor'} args={[ramp.buffers.vertices,ramp.buffers.indices]}/>
  <mesh name={ramp.surface.id} geometry={ramp.geometry} material={ramp.material} dispose={null} userData={{worldCollision:'solid',surfaceId:ramp.surface.id+'/floor',surfaceRole:'floor'}} receiveShadow/>
 </RigidBody>;
}
function bellParts(){const b=new AlphaBuilder();b.beam('metal',[0,0,0],[0,.35,0],.04);b.add(new LatheGeometry([[.04,0],[.11,-.06],[.15,-.32],[.28,-.49],[.27,-.53],[.23,-.5],[.12,-.3],[.08,-.07]].map(p=>new Vector2(p[0],p[1])),20),'metal');b.beam('rope',[0,-.35,0],[0,-1.3,0],.022);b.cyl('wood',[0,-1.3,0],.075,.2);b.cyl('metal',[0,-.43,0],.055,.19);const parts=b.finish();parts.forEach(p=>p.geometry.translate(0,-.35,0));return parts;}
function BellMechanism(){const ref=useRef<Group>(null);useFrame(()=>{if(!ref.current)return;const age=alphaMotion.time-alphaMotion.bellAt;ref.current.rotation.z=age<4?Math.sin(age*14)*Math.exp(-age)*.28:0;});return <group ref={ref} name="alpha-copper-bell-pivot" position={[-61.3,6.6,-36.35]}><Craft build={bellParts} name="alpha-hollow-copper-bell"/></group>;}
function SandMiniature(){const built=useMemo(()=>{const b=new AlphaBuilder(),ps:number[]=[],ix:number[]=[],n=24;for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){const x=(i/n-.5)*1.95,z=(j/n-.5)*1.4;ps.push(-64+x,5.4+Math.max(0,alphaHeight(x*95,z*100))/180,-39.9+z);}for(let j=0;j<n;j++)for(let i=0;i<n;i++){const a=j*(n+1)+i;ix.push(a,a+n+1,a+1,a+1,a+n+1,a+n+2);}const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(ps,3));g.setIndex(ix);g.computeVertexNormals();b.add(g,'stone');const curve=new CatmullRomCurve3(ALPHA_MAIN_PATH.map(p=>new Vector3(-64+p[0]/95,5.415+p[1]/180,-39.9+p[2]/100)));b.add(new TubeGeometry(curve,90,.012,5,false),'metal');return b.finish();},[]);return <Craft build={()=>built} name="alpha-physical-sand-route-model"/>;}
function TrailLamps(){
 const ref=useRef<InstancedMesh>(null),dummy=useMemo(()=>new Object3D(),[]),color=useMemo(()=>new Color(),[]);
 const last=useRef<boolean[]>([]);
 useEffect(()=>{const mesh=ref.current;if(!mesh)return;lampLocations.forEach((p,i)=>{dummy.position.set(p[0],alphaHeight(p[0],p[2])+1.5,p[2]);dummy.scale.set(.25,.28,.25);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);color.set('#5a5544');mesh.setColorAt(i,color);});mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();last.current=lampLocations.map(()=>false);},[dummy,color]);
 useFrame(()=>{const mesh=ref.current;if(!mesh)return;const age=alphaMotion.time-alphaMotion.bellAt;let changed=false;for(let i=0;i<lampLocations.length;i++){const lit=age>i*.25&&age<28;if(lit===last.current[i])continue;last.current[i]=lit;color.set(lit?'#ffd893':'#5a5544');mesh.setColorAt(i,color);changed=true;}if(changed&&mesh.instanceColor)mesh.instanceColor.needsUpdate=true;});
 return <group userData={{worldCollision:'none',collisionReason:'Decorative trail lamps'}}><Craft build={lampParts} name="alpha-timber-trail-lamps"/><instancedMesh ref={ref} args={[undefined,undefined,lampLocations.length]} name="alpha-trail-lamp-sequence"><boxGeometry args={[1,1,1]}/><meshStandardMaterial emissive="#e0ab64" emissiveIntensity={.5}/></instancedMesh></group>;
}

function CairnField() {
 const visual=useMemo(()=>{
  const material=alphaMaterial('stone');
  material.vertexColors=false;
  const mesh=createSummitCairns(material);
  return { mesh, dispose(){ mesh.geometry.dispose(); material.dispose(); mesh.dispose(); } };
 },[]);
 useOwnedWorldVisual(visual);
 return <primitive object={visual.mesh} dispose={null}/>;
}

function handleParts(){const b=new AlphaBuilder();b.beam('metal',[0,0,0],[.6,0,0],.06);b.beam('wood',[.6,0,0],[.6,0,.4],.08);b.cyl('metal',[0,0,0],.1,.12);return b.finish();}
function WindHandle(){const ref=useRef<Group>(null);useFrame((_,dt)=>{if(ref.current)ref.current.rotation.y+=(useAlphaStore.getState().wind*.7-ref.current.rotation.y)*Math.min(1,dt*8);});return <group ref={ref} position={[16.8,ALPHA_WIND_GATE_Y+1.05,-44]}><Craft build={handleParts} name="alpha-working-wind-crank"/></group>;}

function BoulderField(){const field=useMemo(createAlphaBoulderField,[]),m=useMemo(()=>alphaMaterial('stone'),[]);useEffect(()=>()=>{field.parts.forEach(p=>p.geometry.dispose());m.dispose();},[field,m]);return <group name="alpha-supported-boulder-field">{field.parts.map((p,i)=><mesh key={i} name="alpha-supported-rock-batch" userData={{worldCollisionSources:field.sources}} geometry={p.geometry} material={m} castShadow receiveShadow/>)}<RigidBody type="fixed" colliders={false} userData={{solid:true}}>{field.colliders.map(c=><ConvexHullCollider key={c.id} name={c.id} args={[c.points]}/>)}</RigidBody></group>;}
