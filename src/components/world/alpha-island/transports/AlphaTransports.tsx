import {TransportWoodFinish,useTransportWood,WoodBoarding,WoodTrough} from './TransportWoodCraft';
import dimensions from './transport-dimensions.json' with {type:'json'};
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { CuboidCollider, CylinderCollider, RigidBody, TrimeshCollider, type RapierRigidBody } from '@react-three/rapier';
import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, FrontSide, Group, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { useDjcFurnitureEnvironment } from '../../WorldDjcFurnitureEnvironment';
import {FACILITY_WOOD_TILE} from '../../WorldFacilitySurface';
import { night } from '../../WorldNight';
import { useInteractable } from '../../WorldInteract';
import { useWorldStore } from '../../store';
import { attractionRide, beginDrivenAttractionRide, endAttractionRide, requestAttractionExit, updateAttractionRide } from '../../attractions/attraction-ride';
import { alphaFerryRoute,alphaFerryGroundHeight } from './alpha-routes';
import { transportInfrastructure } from './transport-infrastructure';
import { transportBoardingGeometry } from '../../rides/transport-boarding';
import { resetAttractionLook } from '../../attractions/attraction-camera';
import { TransportDriver } from '../../rides/transport-driver';
import { rideEnvironment, type WeatherLease } from '../../rides/ride-environment';
import { sampleTransport, transportCurve, transportWorld, tuple } from '../../rides/transport-route';
import { registerRideGround, type TransportRoute } from '../../rides/ride-contract';
import type { Vec3 } from '../../types';
export const transportQaHold={value:false};
import { useTransportStatus,transportActions,transportNames as names } from './transport-status';
export interface AlphaTransportsProps { routes:TransportRoute[]; /** local terrain elevation; supports share scene ground */ groundHeight?:(x:number,z:number)=>number|null }
export default function AlphaTransports({routes,groundHeight}:AlphaTransportsProps){const effective=useMemo(()=>import.meta.env.DEV&&new URLSearchParams(window.location.search).get('ferryFixture')==='1'&&!routes.some(route=>route.kind==='ferry')?[...routes,alphaFerryRoute()]:routes,[routes]);useEffect(()=>{transportActions.requestExit=requestAttractionExit;transportActions.resetView=resetAttractionLook;return()=>{if(transportActions.requestExit===requestAttractionExit){transportActions.requestExit=()=>{};transportActions.resetView=()=>{};}};},[]);return <TransportWoodFinish>{effective.map(route=><Transport key={route.id} route={route} groundHeight={route.kind==='ferry'?alphaFerryGroundHeight:groundHeight}/>)}</TransportWoodFinish>;}
function Transport({route,groundHeight}: {route:TransportRoute;groundHeight?:AlphaTransportsProps['groundHeight']}){
 const cablePitch=useRef(0);
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
  if(beginDrivenAttractionRide(d,sample.pose,transportWorld(route.terminals[source].safeExit,route.transform))){driver.current=d;useTransportStatus.setState({id:route.id,kind:route.kind,phase:d.phase,progress:0,cancelled:false,blocked:false});}
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
   sample=d.step(dt,frozen||(import.meta.env.DEV&&(new URLSearchParams(window.location.search).get('qa')==='1'||new URLSearchParams(window.location.search).get('transportCapture')==='1')&&transportQaHold.value));updateAttractionRide(sample.pose);
   attractionRide.exit=transportWorld(route.terminals[d.phase==='stand'||d.phase==='turn-out'||d.phase==='walk-out'||d.phase==='complete'?d.destination:d.source].safeExit,route.transform);
   if(route.kind==='cable'){
    const u=d.u;environmentLease.current?.publish({rain:Math.max(0,1-Math.abs(u-.36)/.22),snow:Math.max(0,Math.min(1,(u-.55)/.28))});
   }
   lastPublish.current+=dt;if(lastPublish.current>.1){lastPublish.current=0;useTransportStatus.setState({phase:d.phase,progress:d.u,cancelled:d.exitRequested,blocked:d.blockedMotion||d.exitBlocked});}
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
  cablePitch.current=sample.cablePitch??0;
  if(floorBody.current){floorBody.current.setTranslation({x:sample.vehicle[0],y:sample.vehicle[1],z:sample.vehicle[2]},true);floorBody.current.setRotation(new Quaternion(...sample.orientation),true);}
  if(vehicle.current){vehicle.current.position.set(...sample.vehicle);vehicle.current.quaternion.set(...sample.orientation);}
 },-60);
 return <group name={route.id} userData={{noOcclusionFade:true}}>
  <TransportInfrastructure route={route} groundHeight={route.kind==='ferry'?alphaFerryGroundHeight:groundHeight}/>
  <RigidBody ref={floorBody} type="kinematicPosition" colliders={false} position={initial.vehicle} quaternion={initial.orientation} userData={{surface:true,solid:true,assetId:route.id+'-vehicle-floor'}}>{route.kind==='sled'?<>{dimensions.sledFootDecks.map((deck,i)=><CuboidCollider key={i} position={deck.center as Vec3} args={deck.size.map(v=>v/2) as Vec3}/>)}</>:<CuboidCollider position={[0,-.1,0]} args={[route.kind==='ferry'?3.5:1.6,.1,route.kind==='ferry'?1.45:1.2]}/>}{route.kind==='ferry'&&dimensions.ferryBoardingSteps.map((step,i)=><CuboidCollider key={'step-'+i} position={step.center as Vec3} args={step.size.map(v=>v/2) as Vec3}/>)}{route.kind==='cable'&&<><CuboidCollider position={[1.5,1.1,0]} args={[.06,1.1,1.1]}/><CuboidCollider position={[-1.5,1.1,0]} args={[.06,1.1,1.1]}/><CuboidCollider position={[0,1.1,-1.12]} args={[1.5,1.1,.05]}/></>}{route.kind!=='sled'&&<CuboidCollider position={[0,2.25,0]} args={[route.kind==='ferry'?2.9:1.725,.1,route.kind==='ferry'?1.625:1.325]}/>}</RigidBody>
  <group ref={vehicle} position={initial.vehicle} quaternion={initial.orientation} userData={{shadowDynamic:true}}>
   <Suspense fallback={null}><TransportModel kind={route.kind} cablePitch={cablePitch}/></Suspense>
  </group>
 </group>;
}
function TransportModel({kind,cablePitch}:{kind:TransportRoute['kind'];cablePitch:{current:number}}){
 const gltf=useGLTF(`/assets/world/alpha-island/transports/${kind}.glb`),env=useDjcFurnitureEnvironment();
 const pack=useMemo(()=>{
  const root=new Group(),grip=new Group(),materials=new Map<MeshStandardMaterial,MeshStandardMaterial>(),parts=new Map<string,{material:MeshStandardMaterial;grip:boolean;geometries:BufferGeometry[]}>(),owned:BufferGeometry[]=[];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o=>{if(!(o instanceof Mesh))return;const source=o.material as MeshStandardMaterial;let material=materials.get(source);if(!material){material=source.clone();if(material.transparent){material.depthWrite=false;material.side=FrontSide;material.forceSinglePass=true;}materials.set(source,material);}const articulated=kind==='cable'&&o.name.startsWith('grip'),key=material.uuid+':'+articulated;let part=parts.get(key);if(!part){part={material,grip:articulated,geometries:[]};parts.set(key,part);}const g=o.geometry.clone().applyMatrix4(o.matrixWorld);if(articulated)g.translate(0,-dimensions.cable.cableHeight,0);part.geometries.push(g);});
  for(const {material,grip:articulated,geometries} of parts.values()){const geometry=mergeGeometries(geometries,false)!;geometries.forEach(g=>g.dispose());owned.push(geometry);const mesh=new Mesh(geometry,material);mesh.castShadow=!material.transparent;mesh.receiveShadow=true;(articulated?grip:root).add(mesh);}
  grip.position.y=dimensions.cable.cableHeight;root.add(grip);return{root,grip,materials,owned};
 },[gltf]);
 useEffect(()=>{for(const m of pack.materials.values()){m.envMap=env;m.needsUpdate=true;}},[pack,env]);
 useEffect(()=>()=>{for(const m of pack.materials.values())m.dispose();pack.owned.forEach(g=>g.dispose());},[pack]);
 useFrame(()=>{pack.grip.rotation.z=cablePitch.current;for(const m of pack.materials.values())m.envMapIntensity=.85*(1-night.value)+.5*night.value;});
 return <primitive object={pack.root} dispose={null}/>;
}
/** Shared curve samples generate the visible trough and its exact walkable/support triangles. */
function TransportInfrastructure({route,groundHeight}:{route:TransportRoute;groundHeight?:AlphaTransportsProps['groundHeight']}){
 const wood=useTransportWood();
 const pack=useMemo(()=>{
  const data=transportInfrastructure(route,groundHeight),geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(data.renderVertices,3));geometry.setAttribute('color',new Float32BufferAttribute(data.renderColors,3));geometry.setIndex(Array.from(data.renderIndices));geometry.computeVertexNormals();
  return{...data,geometry};
 },[route,groundHeight]);
 useEffect(()=>()=>pack.geometry.dispose(),[pack]);
 return <>
  {route.kind==='sled'&&(wood?<WoodTrough source={pack.geometry} vertices={pack.vertices} indices={pack.indices} length={pack.curve.getLength()} snowCut={(route.snowLine??64)-dimensions.sledRunnerBelowFloor+route.transform.origin[1]} material={wood}/>:<mesh geometry={pack.geometry} receiveShadow><meshStandardMaterial vertexColors color="#ffffff" roughness={.78} metalness={0}/></mesh>)}
  {route.kind==='sled'&&<RigidBody type="fixed" colliders={false} userData={{surface:true,solid:true,assetId:route.id+'-trough'}}><TrimeshCollider args={[pack.vertices,pack.indices]} friction={.5}/></RigidBody>}
  {route.kind==='sled'&&[-.77,.77].map(side=><PathRail key={side} route={route} offset={side} elevation={.08}/>)}
  {route.kind==='cable'&&<PathRail route={route} offset={0} elevation={dimensions.cable.cableHeight}/>}
  <BeamBatch segments={pack.supports} radius={route.kind==='cable'?.09:.12} color={route.kind==='cable'?'#54666c':'#775231'} wood={route.kind==='sled'}/>
  <RigidBody type="fixed" colliders={false} userData={{solid:true,assetId:route.id+'-supports'}}>
   {pack.supports.map((s,i)=>{const a=new Vector3(...s.a),b=new Vector3(...s.b),d=b.clone().sub(a),q=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.clone().normalize());return <CylinderCollider key={i} position={tuple(a.add(b).multiplyScalar(.5))} quaternion={q} args={[d.length()/2,route.kind==='cable'?.09:.12]}/>;})}
   {pack.rollers.map((r,i)=><CylinderCollider key={'roller-'+i} position={r.center} quaternion={new Quaternion().setFromUnitVectors(new Vector3(0,1,0),new Vector3(...r.axis))} args={[r.halfWidth,r.radius]}/>)}
  </RigidBody>
  {pack.rollers.map((r,i)=><mesh key={'roller-'+i} position={r.center} quaternion={new Quaternion().setFromUnitVectors(new Vector3(0,1,0),new Vector3(...r.axis))} castShadow><cylinderGeometry args={[r.radius,r.radius,r.halfWidth*2,20]}/><meshStandardMaterial color="#434d51" metalness={.65} roughness={.45}/></mesh>)}
  {route.terminals.map((terminal,i)=><BoardingWalkway key={terminal.id+'-walk'} route={route} index={i as 0|1} groundHeight={groundHeight}/>)}
  {route.terminals.map((terminal)=>{
   const root=transportWorld(terminal.vehicle,route.transform),yaw=terminal.yaw+route.transform.yaw;
   return <group key={terminal.id} position={root} rotation={[0,yaw,0]}>

    {route.kind==='cable'&&<>
     <RigidBody type="fixed" colliders={false} userData={{solid:true,assetId:terminal.id+'-canopy'}}><CuboidCollider position={[0,dimensions.cable.canopyHeight,0]} args={[2.5,.125,2.5]}/>{[-2.1,2.1].flatMap(x=>[-2.1,2.1].map(z=><CylinderCollider key={x+','+z} position={[x,(dimensions.cable.canopyHeight-.125)/2,z]} args={[(dimensions.cable.canopyHeight-.125)/2,.17]}/>))}</RigidBody>
     <mesh position={[0,dimensions.cable.canopyHeight,0]} castShadow><boxGeometry args={[5,.25,5]}/><meshStandardMaterial color="#536267" roughness={.55} metalness={.25}/></mesh>
     {[-2.1,2.1].flatMap(x=>[-2.1,2.1].map(z=><mesh key={x+','+z} position={[x,(dimensions.cable.canopyHeight-.125)/2,z]} castShadow><cylinderGeometry args={[.13,.17,dimensions.cable.canopyHeight-.125,12]}/><meshStandardMaterial color="#86603c" roughness={.85}/></mesh>))}
    </>}
   </group>;
  })}
 </>;
}
function BoardingWalkway({route,index,groundHeight}:{route:TransportRoute;index:0|1;groundHeight?:AlphaTransportsProps['groundHeight']}){
 const wood=useTransportWood();
 const pack=useMemo(()=>{
  const data=transportBoardingGeometry(route,index,groundHeight),g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(data.positions,3));g.setIndex(Array.from(data.indices));g.computeVertexNormals();
  return {geometry:g,vertices:data.positions,indices:data.indices,support:data.support,segments:data.segments};
 },[route,index,groundHeight]);
 useEffect(()=>{const unregister=registerRideGround(route.id+'-boarding-'+index,pack.support);return()=>{unregister();pack.geometry.dispose();};},[route.id,index,pack]);
 return <>{wood?<WoodBoarding source={pack.geometry} segments={pack.segments} material={wood}/>:<mesh geometry={pack.geometry} receiveShadow><meshStandardMaterial color="#a77f53" roughness={.8} side={2}/></mesh>}<RigidBody type="fixed" colliders={false} userData={{surface:true,solid:true,assetId:route.id+'-gangway-'+index}}><TrimeshCollider args={[pack.vertices,pack.indices]}/></RigidBody></>;
}

function PathRail({route,offset,elevation}:{route:TransportRoute;offset:number;elevation:number}){
 const geometry=useMemo(()=>{
  const curve=transportCurve(route),p:Vec3[]=[];const count=Math.ceil(curve.getLength()/2);
  for(let i=0;i<=count;i++){const v=curve.getPointAt(i/count),t=curve.getTangentAt(i/count),s=new Vector3(-t.z,0,t.x).normalize();v.addScaledVector(s,offset);v.y+=elevation;p.push(transportWorld(tuple(v),route.transform));}
  return p;
 },[route,offset,elevation]);
 return <BeamBatch segments={geometry.slice(1).map((b,i)=>({a:geometry[i],b}))} radius={route.kind==='sled'?.065:.035} color={route.kind==='sled'?'#815b35':'#59666e'} wood={route.kind==='sled'}/>;
}
function BeamBatch({segments,radius,color,wood=false}:{segments:{a:Vec3;b:Vec3}[];radius:number;color:string;wood?:boolean}){
 const woodMaterial=useTransportWood();
 const geometry=useMemo(()=>{
  // Ferry infrastructure has no fixed beams. Three's merger requires a first geometry.
  if(segments.length===0)return null;
  const parts=segments.map(({a,b})=>{const from=new Vector3(...a),to=new Vector3(...b),d=to.clone().sub(from),q=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.clone().normalize());
   const cylinder=new CylinderGeometry(radius,radius,d.length(),8);if(wood){const uv=cylinder.getAttribute('uv'),colors=new Float32Array(cylinder.getAttribute('position').count*3).fill(.82);for(let i=0;i<uv.count;i++){const u=uv.getX(i),v=uv.getY(i);uv.setXY(i,v*d.length()/FACILITY_WOOD_TILE[0],u*2*Math.PI*radius/FACILITY_WOOD_TILE[1]);}cylinder.setAttribute('color',new Float32BufferAttribute(colors,3));}return cylinder.applyMatrix4(new Matrix4().compose(from.add(to).multiplyScalar(.5),q,new Vector3(1,1,1)));});
  const merged=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());return merged;
 },[segments,radius,wood]);
 useEffect(()=>()=>geometry?.dispose(),[geometry]);
 return geometry?<mesh geometry={geometry} material={wood&&woodMaterial?woodMaterial:undefined} castShadow receiveShadow>{(!wood||!woodMaterial)&&<meshStandardMaterial color={color} roughness={.75}/>}</mesh>:null;
}

export { default as AlphaTransportHud } from './AlphaTransportHud';
