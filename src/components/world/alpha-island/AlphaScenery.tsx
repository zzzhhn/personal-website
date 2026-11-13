import { useEffect,useMemo,useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider,RigidBody,TrimeshCollider } from '@react-three/rapier';
import { BufferGeometry,CanvasTexture,Color,DoubleSide,Group,Mesh,MeshBasicMaterial,InstancedMesh,Object3D,Quaternion,SRGBColorSpace,SphereGeometry,TubeGeometry,CatmullRomCurve3,Vector3,Float32BufferAttribute,LatheGeometry,Vector2 } from 'three';
import { AlphaBuilder,createAlphaLodge,createAlphaRack,alphaLanternGeometry,type AlphaFinish } from './alpha-art';
import { ALPHA_MAIN_PATH,ALPHA_STATIONS,ALPHA_SOCKETS } from './alpha-layout';
import { alphaHeight,alphaPathDistance } from './alpha-terrain';
import { alphaMaterial } from './alpha-materials';
import { alphaMotion,useAlphaStore } from './alpha-state';
import type { Vec3 } from '../types';
function Craft({build,name,position=[0,0,0]}:{build:()=>{finish:AlphaFinish;geometry:BufferGeometry}[];name:string;position?:Vec3}){
 const b=useMemo(build,[build]),m=useMemo(()=>new Map(b.map(p=>[p.finish,alphaMaterial(p.finish)])),[b]);useEffect(()=>()=>{b.forEach(p=>p.geometry.dispose());m.forEach(x=>x.dispose());},[b,m]);return <group name={name} position={position}>{b.map(p=><mesh key={p.finish} geometry={p.geometry} material={m.get(p.finish)} castShadow receiveShadow />)}</group>;
}
export function AlphaLantern({position=[0,0,0],scale=1,rootRef}:{position?:Vec3;scale?:number;rootRef?:React.RefObject<Group|null>}){return <group ref={rootRef} position={position} scale={scale}><Craft build={alphaLanternGeometry} name="alpha-paper-lantern"/></group>;}
function routeRails(){const b=new AlphaBuilder();for(let i=2;i<ALPHA_MAIN_PATH.length;i++){const a=ALPHA_MAIN_PATH[i-1],c=ALPHA_MAIN_PATH[i],dx=c[0]-a[0],dz=c[2]-a[2],len=Math.hypot(dx,dz);if(a[1]<8||len<2)continue;const nx=-dz/len,nz=dx/len;
 for(const side of [-1,1]){const samples=Math.ceil(len/3);for(let j=0;j<=samples;j++){const t=j/samples,x=a[0]+dx*t+nx*2.15*side,z=a[2]+dz*t+nz*2.15*side,y=alphaHeight(x,z);b.cyl('wood',[x,y+.55,z],.095,1.18,.085);b.cyl('metal',[x,y+.13,z],.105,.045);if(j){const u=(j-1)/samples,px=a[0]+dx*u+nx*2.15*side,pz=a[2]+dz*u+nz*2.15*side,py=alphaHeight(px,pz);b.beam('wood',[px,py+.94,pz],[x,y+.94,z],.1);b.beam('rope',[px,py+.48,pz],[x,y+.48,z],.035);}}}}
 return b.finish();}
function grammarTree(){const b=new AlphaBuilder();const branches:Vec3[][]=[[[0,0,0],[.2,3,0],[-.1,6,0],[.3,9,0]],[[0,2.8,0],[-2,4.5,.3],[-3.5,6.6,.8] ],[[0,3.7,0],[2.3,5.3,-.4],[3.8,7.5,-.2]],[[0,5.8,0],[-1.5,7.5,-1.7],[-2.5,9,-2]],[[0,6.3,0],[1.2,8,1.5],[1.8,10,2.1]]];
 branches.forEach((ps,i)=>{const g=new TubeGeometry(new CatmullRomCurve3(ps.map(p=>new Vector3(...p))),14,i===0?.46:.18,9,false);b.add(g,'darkwood');});
 for(let i=0;i<9;i++){const a=i/9*Math.PI*2;b.beam('darkwood',[Math.cos(a)*1.5,.05,Math.sin(a)*1.5],[Math.cos(a)*.35,1.4,Math.sin(a)*.35],.22);}
 for(let i=0;i<24;i++){const a=i*2.399,r=1.2+(i%4)*.75,y=6+(i%7)*.6;b.box('wood',[Math.cos(a)*r,y,Math.sin(a)*r*.65],[.65,.38,.1],.05,new Quaternion().setFromAxisAngle(new Vector3(0,1,0),a));b.beam('rope',[Math.cos(a)*r,y+.19,Math.sin(a)*r*.65],[Math.cos(a)*r,y+.48,Math.sin(a)*r*.65],.018);}
 b.beam('rope',[-.7,4,.8],[-.7,1.2,1.3],.028);b.cyl('wood',[-.7,1.2,1.3],.075,.25);return b.finish();}
function windGate(){const b=new AlphaBuilder();for(const x of [-1,1]){b.box('stone',[x,.16,0],[.6,.32,.65],.07);b.beam('wood',[x,.2,0],[x,1.5,0],.16);}b.beam('metal',[-1.1,1.2,0],[1.1,1.2,0],.065);for(let i=0;i<6;i++)b.box('wood',[-.8+i*.32,1.2,0],[.2,.8,.12]);b.beam('metal',[.8,1.2,0],[1.4,1.2,0],.06);b.beam('wood',[1.4,1.2,0],[1.4,1.2,.4],.08);return b.finish();}
function summitCairns(){const b=new AlphaBuilder();for(let i=0;i<108;i++){const a=i*2.399,r=4.3+Math.sqrt(i)*1.6,x=2+Math.cos(a)*r,z=39+Math.sin(a)*r,y=alphaHeight(x,z);if(y<70||Math.hypot(x+7,z-43)<4||Math.hypot(x-2,z-39)<3)continue;for(let j=0;j<3+(i%3);j++){const g=new SphereGeometry(.28-j*.035,10,6);g.scale(1.4,.48,1);b.add(g,'stone',[x+Math.sin(j+i)*.07,y+.12+j*.22,z]);}}return b.finish();}
function plateauRocks(){const b=new AlphaBuilder();for(let i=0;i<120;i++){const a=i*2.399,r=27+(i%17)*3.3,x=Math.cos(a)*r,z=Math.sin(a)*r*1.2,y=alphaHeight(x,z);if(y<-.8||alphaPathDistance(x,z)<4.5)continue;const g=new SphereGeometry(1,10,7);const at=g.getAttribute('position');for(let k=0;k<at.count;k++){const v=new Vector3().fromBufferAttribute(at,k);v.multiplyScalar(1+.12*Math.sin(v.y*9+v.x*7+i));at.setXYZ(k,v.x,v.y,v.z);}g.computeVertexNormals();b.add(g,'stone',[x,y-.28,z],new Quaternion().setFromAxisAngle(new Vector3(0,1,0),i*1.7),[1.3+(i%4)*.4,.9+(i%3)*.35,1.3]);}return b.finish();}
export function AlphaSign({position,text}:{position:Vec3;text:string}){const tex=useMemo(()=>{const c=document.createElement('canvas');c.width=1024;c.height=256;const x=c.getContext('2d')!;x.fillStyle='#63503b';x.fillRect(0,0,1024,256);x.strokeStyle='#baa075';x.lineWidth=10;x.strokeRect(15,15,994,226);x.fillStyle='#fff0cc';x.textAlign='center';x.textBaseline='middle';x.font='500 48px sans-serif';x.fillText(text,512,128,940);const t=new CanvasTexture(c);t.colorSpace=SRGBColorSpace;return t;},[text]);useEffect(()=>()=>tex.dispose(),[tex]);return <group position={position}><mesh position={[0,.7,0]}><cylinderGeometry args={[.065,.085,1.4,8]}/><meshStandardMaterial color="#75583d" roughness={.95}/></mesh><mesh position={[0,1.35,.07]}><boxGeometry args={[3.3,.825,.09]}/><meshStandardMaterial map={tex} roughness={.88}/></mesh></group>;}
export default function AlphaScenery(){const [lx,ly,lz]=ALPHA_STATIONS.lodge;return <group name="alpha-craft-assemblies">
 <Craft name="alpha-dock-lodge" build={createAlphaLodge} position={[lx,ly,lz]}/>
 <RigidBody type="fixed" colliders={false} position={[lx,ly,lz]} userData={{solid:true}}>
 <CuboidCollider args={[3.6,.26,2.85]} position={[0,.26,0]}/>
 {[-3.25,3.25].map(x=><CuboidCollider key={x} args={[.12,1.7,2.7]} position={[x,2,0]}/>)}
 <CuboidCollider args={[3.3,1.7,.12]} position={[0,2,-2.65]}/>
 {[-2.25,2.25].map(x=><CuboidCollider key={x} args={[.85,1.4,.12]} position={[x,1.9,2.65]}/>)}
 <CuboidCollider args={[1.22,.1,.95]} position={[0,1.43,.1]}/>
 </RigidBody>
 <LodgeRamp/><BellMechanism/><SandMiniature/><TrailLamps/>
 <Craft name="alpha-path-fence" build={routeRails}/><Craft name="alpha-strata-boulders" build={plateauRocks}/>
 <Craft name="alpha-grammar-tree" build={grammarTree} position={ALPHA_STATIONS.tree}/>
 <RigidBody type="fixed" colliders={false} position={ALPHA_STATIONS.tree} userData={{solid:true}}><CuboidCollider args={[.5,3,.5]} position={[0,3,0]}/></RigidBody>
 <Craft name="alpha-wind-gate" build={windGate} position={[16,38,-44]}/>
 <Craft name="alpha-summit-cairns-decorative" build={summitCairns}/>
 <Craft name="alpha-lantern-rack" build={createAlphaRack} position={[-8,83,42]}/>
 <AlphaSign position={[-66,3.8,-36]} text="一切，从一个想法开始。"/>
 <AlphaSign position={[-46,18,-26]} text="先看清枝干，再向上生长。"/>
 <AlphaSign position={[16,38,-38]} text="在风里，还站得住吗？"/>
 <AlphaSign position={[-2,83,44]} text="一块一块，垒向云上。"/>
 </group>;}

function LodgeRamp(){const data=useMemo(()=>{const p=new Float32Array([-65.1,3.8,-35.4,-62.9,3.8,-35.4,-65.1,4.32,-37.6,-62.9,4.32,-37.6]);const ix=new Uint32Array([0,1,2,1,3,2]);const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setIndex(Array.from(ix));g.computeVertexNormals();return{p,ix,g};},[]);const m=useMemo(()=>alphaMaterial('wood'),[]);useEffect(()=>()=>{data.g.dispose();m.dispose();},[data,m]);return <RigidBody type="fixed" colliders={false} userData={{surface:true}}><TrimeshCollider args={[data.p,data.ix]}/><mesh name="alpha-lodge-access-ramp" geometry={data.g} material={m} receiveShadow/></RigidBody>;}
function bellParts(){const b=new AlphaBuilder();b.add(new LatheGeometry([[.04,0],[.11,-.06],[.15,-.32],[.28,-.49],[.27,-.53],[.23,-.5],[.12,-.3],[.08,-.07]].map(p=>new Vector2(p[0],p[1])),20),'metal');b.beam('rope',[0,-.35,0],[0,-1.3,0],.022);b.cyl('wood',[0,-1.3,0],.075,.2);b.cyl('metal',[0,-.43,0],.055,.19);return b.finish();}
function BellMechanism(){const ref=useRef<Group>(null);useFrame(()=>{if(!ref.current)return;const age=alphaMotion.time-alphaMotion.bellAt;ref.current.rotation.z=age<4?Math.sin(age*14)*Math.exp(-age)*.28:0;});return <group ref={ref} name="alpha-copper-bell-pivot" position={[-61.3,6.25,-36.35]}><Craft build={bellParts} name="alpha-hollow-copper-bell"/></group>;}
function SandMiniature(){const built=useMemo(()=>{const b=new AlphaBuilder(),ps:number[]=[],ix:number[]=[],n=24;for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){const x=(i/n-.5)*1.95,z=(j/n-.5)*1.4;ps.push(-64+x,5.4+Math.max(0,alphaHeight(x*95,z*100))/180,-39.9+z);}for(let j=0;j<n;j++)for(let i=0;i<n;i++){const a=j*(n+1)+i;ix.push(a,a+n+1,a+1,a+1,a+n+1,a+n+2);}const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(ps,3));g.setIndex(ix);g.computeVertexNormals();b.add(g,'stone');const curve=new CatmullRomCurve3(ALPHA_MAIN_PATH.map(p=>new Vector3(-64+p[0]/95,5.415+p[1]/180,-39.9+p[2]/100)));b.add(new TubeGeometry(curve,90,.012,5,false),'metal');return b.finish();},[]);return <Craft build={()=>built} name="alpha-physical-sand-route-model"/>;}
const lampLocations=ALPHA_MAIN_PATH.filter((_,i)=>i%3===0).slice(0,9).map((p,i)=>[p[0]-2.6,p[1],p[2]+.4] as Vec3);
function lampParts(){const b=new AlphaBuilder();for(const p of lampLocations){const y=alphaHeight(p[0],p[2]);b.box('stone',[p[0],y+.12,p[2]],[.38,.24,.38],.04);b.beam('wood',[p[0],y+.2,p[2]],[p[0],y+1.5,p[2]],.09);b.box('roof',[p[0],y+1.68,p[2]],[.4,.08,.4],.025);}return b.finish();}
function TrailLamps(){const ref=useRef<InstancedMesh>(null),dummy=useMemo(()=>new Object3D(),[]),c=useMemo(()=>new Color(),[]);useFrame(()=>{const m=ref.current;if(!m)return;const age=alphaMotion.time-alphaMotion.bellAt;lampLocations.forEach((p,i)=>{dummy.position.set(p[0],alphaHeight(p[0],p[2])+1.5,p[2]);dummy.scale.set(.25,.28,.25);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);c.set(age>i*.25&&age<28?'#ffd893':'#5a5544');m.setColorAt(i,c);});m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;m.computeBoundingSphere();});return <group><Craft build={lampParts} name="alpha-timber-trail-lamps"/><instancedMesh ref={ref} args={[undefined,undefined,lampLocations.length]} name="alpha-trail-lamp-sequence"><boxGeometry args={[1,1,1]}/><meshStandardMaterial emissive="#e0ab64" emissiveIntensity={.5}/></instancedMesh></group>;}
