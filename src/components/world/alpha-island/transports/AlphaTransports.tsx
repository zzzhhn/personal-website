import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { CuboidCollider, RigidBody, TrimeshCollider, type RapierRigidBody } from '@react-three/rapier';
import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, Group, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { create } from 'zustand';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { useDjcFurnitureEnvironment } from '../../WorldDjcFurnitureEnvironment';
import { night } from '../../WorldNight';
import { useInteractable } from '../../WorldInteract';
import { useWorldStore } from '../../store';
import { attractionRide, beginDrivenAttractionRide, endAttractionRide, requestAttractionExit, updateAttractionRide } from '../../attractions/attraction-ride';
import { resetAttractionLook } from '../../attractions/attraction-camera';
import { transportBoardingGeometry } from '../../rides/transport-boarding';
import { TransportDriver } from '../../rides/transport-driver';
import { rideEnvironment, type WeatherLease } from '../../rides/ride-environment';
import { sampleTransport, transportCurve, transportWorld, tuple } from '../../rides/transport-route';
import { registerRideGround, type TransportRoute } from '../../rides/ride-contract';
import type { Vec3 } from '../../types';
export const useTransportStatus=create<{id:string|null;kind:TransportRoute['kind']|null;phase:string;progress:number;cancelled:boolean}>(()=>({id:null,kind:null,phase:'',progress:0,cancelled:false}));
const names={cable:{zh:'四季缆车',en:'Seasons cable car'},sled:{zh:'雪橇滑道',en:'Mountain sled'},ferry:{zh:'渡船',en:'Island ferry'}};
export interface AlphaTransportsProps { routes:TransportRoute[]; /** local terrain elevation; supports share scene ground */ groundHeight?:(x:number,z:number)=>number }
export default function AlphaTransports({routes,groundHeight}:AlphaTransportsProps){return <>{routes.map(route=><Transport key={route.id} route={route} groundHeight={groundHeight}/>)}</>;}
function Transport({route,groundHeight}: {route:TransportRoute;groundHeight?:AlphaTransportsProps['groundHeight']}){
 const floorBody=useRef<RapierRigidBody>(null),environmentLease=useRef<WeatherLease|null>(null);
 const vehicle=useRef<Group>(null),driver=useRef<TransportDriver|null>(null),parked=useRef<0|1>(0),empty=useRef<number|null>(null),emptyTarget=useRef<0|1>(0),lastPublish=useRef(0);
 const samples=useMemo(()=>{const curve=transportCurve(route);return {curve,parked:[sampleTransport(route,0,curve),sampleTransport(route,1,curve)]};},[route]);
 const initial=samples.parked[0];
 const begin=(source:0|1)=>{
  const w=useWorldStore.getState();if(attractionRide.active||w.paused||w.activeVehicle||w.seat||w.card||empty.current!==null||parked.current!==source)return;
  if(route.kind==='sled'&&source!==0)return;
  let release=()=>{};
  if(route.kind==='cable'){const lease=rideEnvironment.acquire(route.id,w.weather);environmentLease.current=lease;release=lease.release;}
  const d=new TransportDriver(route,source,release),sample=d.sample();
  if(beginDrivenAttractionRide(d,sample.pose,transportWorld(route.terminals[source].safeExit,route.transform))){driver.current=d;useTransportStatus.setState({id:route.id,kind:route.kind,phase:d.phase,progress:0,cancelled:false});}
  else d.dispose('recovery');
 };
 const boardOrCall=(source:0|1)=>{
  if(empty.current!==null||attractionRide.active)return;
  if(parked.current!==source){empty.current=parked.current;emptyTarget.current=source;useWorldStore.setState({toast:{zh:'交通正在沿线路驶来，请在站台等候。',en:'The transport is approaching along its route. Please wait on the platform.',at:performance.now()}});return;}
  begin(source);
 };
 useInteractable({id:route.id+'-board-0',kind:'board',position:transportWorld(route.terminals[0].boarding[0],route.transform),radius:2.1,label:names[route.kind],enabled:()=>!attractionRide.active&&empty.current===null,onInteract:()=>boardOrCall(0)});
 useInteractable(route.kind==='sled'?null:{id:route.id+'-board-1',kind:'board',position:transportWorld(route.terminals[1].boarding[0],route.transform),radius:2.1,label:names[route.kind],enabled:()=>!attractionRide.active&&empty.current===null,onInteract:()=>boardOrCall(1)});
 useEffect(()=>()=>{if(driver.current&&attractionRide.driver===driver.current)endAttractionRide();driver.current?.dispose('recovery');if(useTransportStatus.getState().id===route.id)useTransportStatus.setState({id:null,kind:null});},[route]);
 useFrame((_,dt)=>{
  const w=useWorldStore.getState(),frozen=w.paused||w.poolInspect||!!w.shot||document.hidden;
  const d=driver.current;
  let sample=samples.parked[parked.current];
  if(d&&attractionRide.active&&attractionRide.driver===d){
   sample=d.step(dt,frozen);updateAttractionRide(sample.pose);
   attractionRide.exit=transportWorld(route.terminals[d.phase==='stand'||d.phase==='turn-out'||d.phase==='walk-out'||d.phase==='complete'?d.destination:d.source].safeExit,route.transform);
   if(route.kind==='cable'){
    const u=d.u;environmentLease.current?.publish({rain:Math.max(0,1-Math.abs(u-.36)/.22),snow:Math.max(0,Math.min(1,(u-.55)/.28))});
   }
   lastPublish.current+=dt;if(lastPublish.current>.1){lastPublish.current=0;useTransportStatus.setState({phase:d.phase,progress:d.u,cancelled:d.exitRequested});}
  }else if(d){
   parked.current=d.u<.5?0:1;
   // An empty tow returns the sled visibly up its actual runner route. No rider teleports.
   if(route.kind==='sled'||d.u!==parked.current){empty.current=d.u;emptyTarget.current=0;}
   driver.current=null;if(useTransportStatus.getState().id===route.id)useTransportStatus.setState({id:null,kind:null});
  }
  if(empty.current!==null){
   if(!frozen&&dt>0&&dt<=.25){const direction=emptyTarget.current===0?-1:1;empty.current=Math.max(0,Math.min(1,empty.current+direction*dt/route.duration));}
   sample=sampleTransport(route,empty.current,samples.curve);
   if(empty.current===emptyTarget.current){parked.current=emptyTarget.current;empty.current=null;}
  }
  if(floorBody.current){floorBody.current.setTranslation({x:sample.vehicle[0],y:sample.vehicle[1],z:sample.vehicle[2]},true);floorBody.current.setRotation(new Quaternion(...sample.orientation),true);}
  if(vehicle.current){vehicle.current.position.set(...sample.vehicle);vehicle.current.quaternion.set(...sample.orientation);}
 },-60);
 return <group name={route.id} userData={{noOcclusionFade:true}}>
  <TransportInfrastructure route={route} groundHeight={groundHeight}/>
  <RigidBody ref={floorBody} type="kinematicPosition" colliders={false} position={initial.vehicle} quaternion={initial.orientation} userData={{surface:true,solid:true,assetId:route.id+'-vehicle-floor'}}>{route.kind==='sled'?<CuboidCollider position={[.51,.11,0]} args={[.2,.02,.34]}/>:<CuboidCollider position={[0,-.1,0]} args={[route.kind==='ferry'?3.5:1.6,.1,route.kind==='ferry'?1.45:1.2]}/>}{route.kind!=='sled'&&<CuboidCollider position={[0,2.25,0]} args={[route.kind==='ferry'?2.9:1.725,.1,route.kind==='ferry'?1.625:1.325]}/>}</RigidBody>
  <group ref={vehicle} position={initial.vehicle} quaternion={initial.orientation} userData={{shadowDynamic:true}}>
   <Suspense fallback={null}><TransportModel kind={route.kind}/></Suspense>
  </group>
 </group>;
}
function TransportModel({kind}:{kind:TransportRoute['kind']}){
 const gltf=useGLTF(`/assets/world/alpha-island/transports/${kind}.glb`),env=useDjcFurnitureEnvironment();
 const pack=useMemo(()=>{
  const root=new Group(),materials=new Map<MeshStandardMaterial,MeshStandardMaterial>(),parts=new Map<MeshStandardMaterial,BufferGeometry[]>(),owned:BufferGeometry[]=[];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o=>{if(!(o instanceof Mesh))return;const source=o.material as MeshStandardMaterial;let material=materials.get(source);if(!material){material=source.clone();materials.set(source,material);parts.set(material,[]);}parts.get(material)!.push(o.geometry.clone().applyMatrix4(o.matrixWorld));});
  for(const [material,geometries] of parts){const geometry=mergeGeometries(geometries,false)!;geometries.forEach(g=>g.dispose());owned.push(geometry);const mesh=new Mesh(geometry,material);mesh.castShadow=!material.transparent;mesh.receiveShadow=true;root.add(mesh);}
  return{root,materials,owned};
 },[gltf]);
 useEffect(()=>{for(const m of pack.materials.values()){m.envMap=env;m.needsUpdate=true;}},[pack,env]);
 useEffect(()=>()=>{for(const m of pack.materials.values())m.dispose();pack.owned.forEach(g=>g.dispose());},[pack]);
 useFrame(()=>{for(const m of pack.materials.values())m.envMapIntensity=.85*(1-night.value)+.5*night.value;});
 return <primitive object={pack.root} dispose={null}/>;
}
/** Shared curve samples generate the visible trough and its exact walkable/support triangles. */
function TransportInfrastructure({route,groundHeight}:{route:TransportRoute;groundHeight?:AlphaTransportsProps['groundHeight']}){
 const pack=useMemo(()=>{
  const curve=transportCurve(route),count=Math.ceil(curve.getLength()/1.4),p:number[]=[],ix:number[]=[],supports:{a:Vec3;b:Vec3}[]=[];
  const width=route.kind==='sled'?.73:.04;
  for(let i=0;i<=count;i++){
   const t=i/count,v=curve.getPointAt(t),forward=curve.getTangentAt(t),side=new Vector3(-forward.z,0,forward.x).normalize();
   const yOffset=route.kind==='cable'?3.5:route.kind==='sled'?-.16:0;
   for(const sign of [-1,1]){const point=v.clone().addScaledVector(side,width*sign);point.y+=yOffset;p.push(...transportWorld(tuple(point),route.transform));}
   if(i<count){const a=i*2;ix.push(a,a+2,a+1,a+1,a+2,a+3);}
   if(route.kind!=='ferry'&&i>0&&i<count&&i%(route.kind==='cable'?Math.max(1,Math.round(count/4)):7)===0){
    const h=groundHeight?.(v.x,v.z)??Math.min(route.terminals[0].vehicle[1],route.terminals[1].vehicle[1])-.3;
    supports.push({a:transportWorld([v.x,h,v.z],route.transform),b:transportWorld([v.x,v.y+yOffset,v.z],route.transform)});
   }
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(p,3));geometry.setIndex(ix);geometry.computeVertexNormals();
  return{geometry,vertices:new Float32Array(p),indices:new Uint32Array(ix),curve,supports};
 },[route,groundHeight]);
 useEffect(()=>()=>pack.geometry.dispose(),[pack]);
 return <>
  {route.kind!=='ferry'&&<mesh geometry={pack.geometry} receiveShadow><meshStandardMaterial color={route.kind==='sled'?'#b08352':'#606b72'} roughness={.78} metalness={route.kind==='cable'?.75:0}/></mesh>}
  {route.kind==='sled'&&<RigidBody type="fixed" colliders={false} userData={{surface:true,solid:true,assetId:route.id+'-trough'}}><TrimeshCollider args={[pack.vertices,pack.indices]} friction={.5}/></RigidBody>}
  {route.kind==='sled'&&[-.77,.77].map(side=><PathRail key={side} route={route} offset={side} elevation={.08}/>)}
  {route.kind==='cable'&&<PathRail route={route} offset={0} elevation={3.5}/>}
  <BeamBatch segments={pack.supports} radius={route.kind==='cable'?.16:.1} color={route.kind==='cable'?'#54666c':'#775231'}/>
  {route.terminals.map((terminal,i)=><BoardingWalkway key={terminal.id+'-walk'} route={route} index={i as 0|1} groundHeight={groundHeight}/>)}
  {route.terminals.map((terminal)=>{
   const root=transportWorld(terminal.vehicle,route.transform),yaw=terminal.yaw+route.transform.yaw;
   return <group key={terminal.id} position={root} rotation={[0,yaw,0]}>

    {route.kind==='cable'&&<>
     <mesh position={[0,3.85,0]} castShadow><boxGeometry args={[5,.25,5]}/><meshStandardMaterial color="#536267" roughness={.55} metalness={.25}/></mesh>
     {[-2.1,2.1].flatMap(x=>[-2.1,2.1].map(z=><mesh key={x+','+z} position={[x,1.85,z]} castShadow><cylinderGeometry args={[.13,.17,3.7,12]}/><meshStandardMaterial color="#86603c" roughness={.85}/></mesh>))}
    </>}
   </group>;
  })}
 </>;
}
function BoardingWalkway({route,index,groundHeight}:{route:TransportRoute;index:0|1;groundHeight?:AlphaTransportsProps['groundHeight']}){
 const pack=useMemo(()=>{
  const data=transportBoardingGeometry(route,index,groundHeight),g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(data.positions,3));g.setIndex(Array.from(data.indices));g.computeVertexNormals();
  return {geometry:g,vertices:data.positions,indices:data.indices,support:data.support};
 },[route,index,groundHeight]);
 useEffect(()=>{const unregister=registerRideGround(route.id+'-boarding-'+index,pack.support);return()=>{unregister();pack.geometry.dispose();};},[route.id,index,pack]);
 return <><mesh geometry={pack.geometry} receiveShadow><meshStandardMaterial color="#a77f53" roughness={.8} side={2}/></mesh><RigidBody type="fixed" colliders={false} userData={{surface:true,solid:true,assetId:route.id+'-gangway-'+index}}><TrimeshCollider args={[pack.vertices,pack.indices]}/></RigidBody></>;
}

function PathRail({route,offset,elevation}:{route:TransportRoute;offset:number;elevation:number}){
 const geometry=useMemo(()=>{
  const curve=transportCurve(route),p:Vec3[]=[];const count=Math.ceil(curve.getLength()/2);
  for(let i=0;i<=count;i++){const v=curve.getPointAt(i/count),t=curve.getTangentAt(i/count),s=new Vector3(-t.z,0,t.x).normalize();v.addScaledVector(s,offset);v.y+=elevation;p.push(transportWorld(tuple(v),route.transform));}
  return p;
 },[route,offset,elevation]);
 return <BeamBatch segments={geometry.slice(1).map((b,i)=>({a:geometry[i],b}))} radius={route.kind==='sled'?.065:.035} color={route.kind==='sled'?'#815b35':'#59666e'}/>;
}
function BeamBatch({segments,radius,color}:{segments:{a:Vec3;b:Vec3}[];radius:number;color:string}){
 const geometry=useMemo(()=>{
  const parts=segments.map(({a,b})=>{const from=new Vector3(...a),to=new Vector3(...b),d=to.clone().sub(from),q=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.clone().normalize());
   return new CylinderGeometry(radius,radius,d.length(),8).applyMatrix4(new Matrix4().compose(from.add(to).multiplyScalar(.5),q,new Vector3(1,1,1)));});
  const merged=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());return merged;
 },[segments,radius]);
 useEffect(()=>()=>geometry?.dispose(),[geometry]);
 return geometry?<mesh geometry={geometry} castShadow receiveShadow><meshStandardMaterial color={color} roughness={.75}/></mesh>:null;
}

export function AlphaTransportHud(){
 const s=useTransportStatus(),lang=useWorldStore(w=>w.lang),paused=useWorldStore(w=>w.paused);
 useEffect(()=>{
  const key=(e:KeyboardEvent)=>{if(s.id&&!paused&&e.code==='KeyE'&&!e.repeat&&!/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName??'')){e.preventDefault();requestAttractionExit();}};
  window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
 },[s.id,paused]);
 if(!s.id||!s.kind||paused)return null;
 const zh=lang==='zh';return <div style={{position:'absolute',left:'50%',bottom:78,transform:'translateX(-50%)',background:'rgba(21,30,34,.92)',color:'#fff4de',padding:'12px 18px',borderRadius:12,pointerEvents:'auto',maxWidth:'90vw',textAlign:'center'}}>
  <strong>{names[s.kind][lang]}</strong> · {zh?({approach:'走向座位','turn-in':'转身入座',sit:'坐下',riding:s.cancelled?'前往安全站台':'沿途观景',stand:'起身','turn-out':'转向出口','walk-out':'走下站台',complete:'到站'}[s.phase]??s.phase):s.phase}
  <div style={{display:'flex',gap:12,marginTop:8,justifyContent:'center'}}><button onClick={resetAttractionLook}>{zh?'视角归位':'Reset view'}</button><button onClick={requestAttractionExit} disabled={s.cancelled}>{zh?(s.cancelled?'已请求安全退乘':'E 安全退乘'):'E · Leave safely'}</button></div>
  <small>{zh?'拖动观察 · 滚轮缩放 · Esc 暂停':'Drag to look · Scroll to zoom · Esc pause'}</small>
 </div>;
}
