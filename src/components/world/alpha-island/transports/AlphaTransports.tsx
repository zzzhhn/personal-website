import {TransportWoodFinish,useTransportWood,WoodBoarding,WoodTrough} from './TransportWoodCraft';
import dimensions from './transport-dimensions.json' with {type:'json'};
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { ConvexHullCollider, CuboidCollider, RigidBody, TrimeshCollider, type RapierRigidBody } from '@react-three/rapier';
import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, FrontSide, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { useDjcFurnitureEnvironment } from '../../WorldDjcFurnitureEnvironment';
import { night } from '../../WorldNight';
import { useInteractable } from '../../WorldInteract';
import { useWorldStore } from '../../store';
import { attractionRide, beginDrivenAttractionRide, endAttractionRide, requestAttractionExit, updateAttractionRide } from '../../attractions/attraction-ride';
import { alphaFerryRoute,alphaFerryGroundHeight } from './alpha-routes';
import { SLED_RAIL_RADIUS,cableWireSegments,transportBeamBatch,transportInfrastructure,type GuideRoller } from './transport-infrastructure';
import { boardingPassageContains, transportBoardingGeometry } from '../../rides/transport-boarding';
import { registerWorldActorPassage } from '../../world-actor-sites';
import { FIXED_TRIMESH } from '../../collider-readiness';
import { resetAttractionLook } from '../../attractions/attraction-camera';
import { TransportDriver } from '../../rides/transport-driver';
import { rideEnvironment, type WeatherLease } from '../../rides/ride-environment';
import { sampleTransport, transportCurve, transportWorld, tuple } from '../../rides/transport-route';
import { registerRideGround, type TransportRoute, type TransportSample } from '../../rides/ride-contract';
import type { Vec3 } from '../../types';
export const transportQaHold={value:false};
import { useTransportStatus,transportActions } from './transport-status';
import { transportStation } from './transport-station';
import RegionSceneBoundary from '../../RegionSceneBoundary';
import { cableCanopyPostGeometry, cableCanopyPostHeight, transportContactReady, transportGripHeight, transportGripPose, transportVehicleCollider, transportVehicleParts } from './transport-vehicle-geometry';
export interface AlphaTransportsProps { routes:TransportRoute[]; /** local terrain elevation; supports share scene ground */ groundHeight?:(x:number,z:number)=>number|null }
export default function AlphaTransports({routes,groundHeight}:AlphaTransportsProps){const effective=useMemo(()=>import.meta.env.DEV&&new URLSearchParams(window.location.search).get('ferryFixture')==='1'&&!routes.some(route=>route.kind==='ferry')?[...routes,alphaFerryRoute()]:routes,[routes]);useEffect(()=>{transportActions.requestExit=requestAttractionExit;transportActions.skipTravel=()=>{
 const w=useWorldStore.getState(),d=attractionRide.driver;
 if(attractionRide.active&&!w.paused&&!w.poolInspect&&!w.shot&&!document.hidden&&d instanceof TransportDriver&&d.requestSkip())resetAttractionLook();
};const skipTravel=transportActions.skipTravel;transportActions.resetView=resetAttractionLook;return()=>{if(transportActions.skipTravel===skipTravel){transportActions.requestExit=()=>{};transportActions.skipTravel=()=>{};transportActions.resetView=()=>{};}};},[]);return <TransportWoodFinish>{effective.map(route=><Transport key={route.id} route={route} groundHeight={route.kind==='ferry'?alphaFerryGroundHeight:groundHeight}/>)}</TransportWoodFinish>;}
function Transport({route,groundHeight}: {route:TransportRoute;groundHeight?:AlphaTransportsProps['groundHeight']}){
 const cablePitch=useRef(0);
 const floorBody=useRef<RapierRigidBody>(null),gripBody=useRef<RapierRigidBody>(null),environmentLease=useRef<WeatherLease|null>(null);
 const vehicle=useRef<Group>(null),driver=useRef<TransportDriver|null>(null),parked=useRef<0|1>(0),empty=useRef<number|null>(null),emptyTarget=useRef<0|1>(0),lastPublish=useRef(0);
 const samples=useMemo(()=>{const curve=transportCurve(route);return {curve,parked:[sampleTransport(route,0,curve),sampleTransport(route,1,curve)]};},[route]);
 const initial=samples.parked[0];
 const begin=(source:0|1)=>{
  const w=useWorldStore.getState();
  let release=()=>{};
  if(route.kind==='cable'){const lease=rideEnvironment.acquire(route.id,w.weather);environmentLease.current=lease;release=lease.release;}
  const d=new TransportDriver(route,source,release),sample=d.sample();
  if(beginDrivenAttractionRide(d,sample.pose,transportWorld(route.terminals[source].safeExit,route.transform))){driver.current=d;useTransportStatus.setState({id:route.id,kind:route.kind,phase:d.phase,progress:0,cancelled:false,blocked:false});}
  else d.dispose('recovery');
 };
 const contactReady=()=>transportContactReady(floorBody.current)&&(route.kind!=='cable'||transportContactReady(gripBody.current));
 const stationAvailable=()=>{
  const w=useWorldStore.getState();
  return contactReady()&&!driver.current&&!attractionRide.active&&empty.current===null&&!w.paused&&!w.activeVehicle&&!w.seat&&!w.card&&!w.poolInspect&&!w.shot&&!document.hidden;
 };
 const station=(source:0|1)=>transportStation(route,source,transportWorld(route.terminals[source].boarding[0],route.transform),
  ()=>parked.current,stationAvailable,()=>begin(source),()=>{
   empty.current=parked.current;
   emptyTarget.current=source;
   useWorldStore.setState({toast:{zh:'交通正在沿线路驶来，请在站台等候。',en:'The transport is approaching along its route. Please wait on the platform.',at:performance.now()}});
  });
 useInteractable(station(0));
 useInteractable(station(1));
 useEffect(()=>()=>{if(driver.current&&attractionRide.driver===driver.current)endAttractionRide();driver.current?.dispose('recovery');if(useTransportStatus.getState().id===route.id)useTransportStatus.setState({id:null,kind:null});},[route]);
 useFrame((_,dt)=>{
  const w=useWorldStore.getState(),frozen=w.paused||w.poolInspect||!!w.shot||document.hidden;
  const d=driver.current, waiting=!contactReady();
  let sample=samples.parked[parked.current];
  if(d&&attractionRide.active&&attractionRide.driver===d){
   sample=d.step(dt,frozen||waiting||(import.meta.env.DEV&&(new URLSearchParams(window.location.search).get('qa')==='1'||new URLSearchParams(window.location.search).get('transportCapture')==='1')&&transportQaHold.value));updateAttractionRide(sample.pose);
   attractionRide.exit=transportWorld(route.terminals[d.phase==='stand'||d.phase==='turn-out'||d.phase==='walk-out'||d.phase==='complete'?d.destination:d.source].safeExit,route.transform);
   if(route.kind==='cable'){
    const u=d.u;environmentLease.current?.publish({rain:Math.max(0,1-Math.abs(u-.36)/.22),snow:Math.max(0,Math.min(1,(u-.55)/.28))});
   }
   lastPublish.current+=dt;if(lastPublish.current>.1){lastPublish.current=0;useTransportStatus.setState({phase:d.phase,progress:d.u,cancelled:d.exitRequested,blocked:waiting||d.blockedMotion||d.exitBlocked});}
  }else if(d){
   parked.current=d.u<.5?0:1;
   // An empty tow returns the sled visibly up its actual runner route. No rider teleports.
   if(route.kind==='sled'||d.u!==parked.current){empty.current=d.u;emptyTarget.current=0;}
   driver.current=null;if(useTransportStatus.getState().id===route.id)useTransportStatus.setState({id:null,kind:null});
  }
  if(empty.current!==null){
   if(!frozen&&!waiting&&dt>0&&dt<=.25){const direction=emptyTarget.current===0?-1:1;empty.current=Math.max(0,Math.min(1,empty.current+direction*dt/route.duration));}
   sample=sampleTransport(route,empty.current,samples.curve);
   if(empty.current===emptyTarget.current){parked.current=emptyTarget.current;empty.current=null;}
  }
  cablePitch.current=sample.cablePitch??0;
  if(floorBody.current){floorBody.current.setTranslation({x:sample.vehicle[0],y:sample.vehicle[1],z:sample.vehicle[2]},true);floorBody.current.setRotation(new Quaternion(...sample.orientation),true);}
  if(gripBody.current){const grip=transportGripPose(sample);gripBody.current.setTranslation(grip.position,true);gripBody.current.setRotation(grip.orientation,true);}
  if(vehicle.current){vehicle.current.position.set(...sample.vehicle);vehicle.current.quaternion.set(...sample.orientation);}
 },-60);
 return <group name={route.id} userData={{noOcclusionFade:true}}>
  <TransportInfrastructure route={route} groundHeight={route.kind==='ferry'?alphaFerryGroundHeight:groundHeight}/>
  <RegionSceneBoundary id={route.id}>
   <TransportModel route={route} initial={initial} vehicle={vehicle} floorBody={floorBody} gripBody={gripBody} cablePitch={cablePitch}/>
  </RegionSceneBoundary>
 </group>;
}

function TransportModel({ route, initial, vehicle, floorBody, gripBody, cablePitch }: {
 route:TransportRoute; initial:TransportSample; vehicle:RefObject<Group|null>;
 floorBody:RefObject<RapierRigidBody|null>; gripBody:RefObject<RapierRigidBody|null>; cablePitch:{current:number};
}) {
 const gltf=useGLTF(`/assets/world/alpha-island/transports/${route.kind}.glb`),env=useDjcFurnitureEnvironment();
 const pack=useMemo(()=>{
  const root=new Group(),grip=new Group(),materials=new Map<MeshStandardMaterial,MeshStandardMaterial>();
  const sources=transportVehicleParts(gltf.scene,route.kind),owned:BufferGeometry[]=[];
  const body=transportVehicleCollider(sources.filter(part=>part.group==='body'));
  const gripShape=transportVehicleCollider(sources.filter(part=>part.group==='grip'));
  if(!body||(route.kind==='cable'&&!gripShape))throw new Error(`${route.id} is missing its vehicle contact meshes`);
  const batches=new Map<string,typeof sources>();
  for(const part of sources){
   const key=part.material.uuid+':'+part.group;
   const parts=batches.get(key)??[];parts.push(part);batches.set(key,parts);
  }
  for(const parts of batches.values()){
   const first=parts[0],source=first.material;
   let material=materials.get(source);
   if(!material){material=source.clone();if(material.transparent){material.depthWrite=false;material.side=FrontSide;material.forceSinglePass=true;}materials.set(source,material);}
   const geometry=mergeGeometries(parts.map(part=>part.geometry),false)!;
   owned.push(geometry);
   const mesh=new Mesh(geometry,material);
   mesh.name=`${route.id}-${first.group}-${source.name}`;mesh.castShadow=!material.transparent;mesh.receiveShadow=true;
   let offset=0;
   mesh.userData.worldCollisionSources=parts.map(part=>{
    const start=offset,count=part.geometry.index?.count??part.geometry.attributes.position.count;offset+=count;
    return {id:`${route.id}/${part.name}`,surfaceId:`${route.id}-contact-${part.group}`,collision:'solid',
     ...(geometry.index?{firstIndex:start,indexCount:count}:{firstVertex:start,vertexCount:count})};
   });
   (first.group==='grip'?grip:root).add(mesh);
  }
  sources.forEach(part=>part.geometry.dispose());
  grip.position.y=transportGripHeight;root.add(grip);
  return {root,grip,materials,owned,body,gripShape};
 },[gltf,route]);
 useEffect(()=>{for(const m of pack.materials.values()){m.envMap=env;m.needsUpdate=true;}},[pack,env]);
 useEffect(()=>()=>{for(const m of pack.materials.values())m.dispose();pack.owned.forEach(g=>g.dispose());},[pack]);
 useFrame(()=>{pack.grip.rotation.z=cablePitch.current;for(const m of pack.materials.values())m.envMapIntensity=.85*(1-night.value)+.5*night.value;});
 const gripInitial=transportGripPose(initial);
 return <group name={`${route.id}-vehicle-model`}>
  <RigidBody ref={floorBody} type="kinematicPosition" colliders={false} position={initial.vehicle} quaternion={initial.orientation}
   userData={{surface:true,solid:true,assetId:route.id+'-vehicle-floor'}}>
   <TrimeshCollider name={`${route.id}-contact-body`} args={[pack.body.vertices,pack.body.indices]}/>
  </RigidBody>
  {pack.gripShape&&<RigidBody ref={gripBody} type="kinematicPosition" colliders={false} position={gripInitial.position} quaternion={gripInitial.orientation} userData={{solid:true,assetId:route.id+'-grip'}}>
   <TrimeshCollider name={`${route.id}-contact-grip`} args={[pack.gripShape.vertices,pack.gripShape.indices]}/>
  </RigidBody>}
  <group ref={vehicle} position={initial.vehicle} quaternion={initial.orientation} userData={{shadowDynamic:true}}>
   <primitive object={pack.root} dispose={null}/>
  </group>
 </group>;
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
  {route.kind!=='ferry'&&<group name={route.id+'-fixed-infrastructure'}>
   {route.kind==='sled'&&<RigidBody type="fixed" colliders={false} userData={{surface:true,solid:true,assetId:route.id+'-trough'}}>
     {wood?<WoodTrough source={pack.geometry} vertices={pack.vertices} indices={pack.indices} length={pack.curve.getLength()}
       snowCut={(route.snowLine??64)-dimensions.sledRunnerBelowFloor+route.transform.origin[1]} material={wood} surfaceId={route.id+'-trough-shell'}/>
       :<mesh geometry={pack.geometry} receiveShadow userData={{worldCollision:'solid',surfaceId:route.id+'-trough-shell'}}><meshStandardMaterial vertexColors color="#ffffff" roughness={.78} metalness={0}/></mesh>}
     <TrimeshCollider name={route.id+'-trough-shell'} args={[pack.renderVertices,pack.renderIndices]} friction={.5}/>
   </RigidBody>}
   {route.kind==='sled'&&<BeamBatch id={route.id+'-guides'} segments={pack.sledRails} radius={SLED_RAIL_RADIUS} color="#815b35" wood surface/>}
   {route.kind==='cable'&&<CableWire route={route}/>}
   <BeamBatch id={route.id+'-supports'} segments={pack.supports} radius={route.kind==='cable'?.09:.12} color={route.kind==='cable'?'#54666c':'#775231'} wood={route.kind==='sled'}/>
   {pack.rollers.map((roller,i)=><CableRoller key={i} id={route.id+'-roller-'+i} roller={roller}/>)}
  </group>}
  {route.terminals.map((terminal,i)=><BoardingWalkway key={terminal.id+'-walk'} route={route} index={i as 0|1} groundHeight={groundHeight}/>)}
  {route.terminals.map((terminal)=>{
   const root=transportWorld(terminal.vehicle,route.transform),yaw=terminal.yaw+route.transform.yaw;
   return <group key={terminal.id} position={root} rotation={[0,yaw,0]}>

    {route.kind==='cable'&&<CableCanopy id={terminal.id}/>}

   </group>;
  })}
 </>;
}
/** The fixed roof shares its dimensions with the rendered box, and each post
 * collides with the twelve-sided closed frustum from its visible geometry. */
function CableCanopy({id}:{id:string}) {
 const height=cableCanopyPostHeight;
 const post=useMemo(cableCanopyPostGeometry,[]);
 const points=post.attributes.position.array as Float32Array;
 const locations=useMemo(()=>[-2.1,2.1].flatMap(x=>[-2.1,2.1].map(z=>[x,height/2,z] as Vec3)),[height]);
 const roofId=`${id}-roof-contact`;
 useEffect(()=>()=>post.dispose(),[post]);
 return <group name={`${id}-canopy-structure`}>
  <RigidBody type="fixed" colliders={false} userData={{solid:true,assetId:id+'-canopy'}}>
   <CuboidCollider name={roofId} position={[0,dimensions.cable.canopyHeight,0]} args={[2.5,.125,2.5]}/>
   {locations.map((position,i)=><ConvexHullCollider key={i} name={`${id}-post-${i}-contact`} position={position} args={[points]}/>)}
  </RigidBody>
  <mesh name={`${id}-roof`} position={[0,dimensions.cable.canopyHeight,0]} castShadow userData={{worldCollision:'solid',surfaceId:roofId}}>
   <boxGeometry args={[5,.25,5]}/><meshStandardMaterial color="#536267" roughness={.55} metalness={.25}/>
  </mesh>
  {locations.map((position,i)=><mesh key={i} name={`${id}-post-${i}`} position={position} geometry={post} castShadow
   userData={{worldCollision:'solid',surfaceId:`${id}-post-${i}-contact`}}>
   <meshStandardMaterial color="#86603c" roughness={.85}/>
  </mesh>)}
 </group>;
}
function BoardingWalkway({route,index,groundHeight}:{route:TransportRoute;index:0|1;groundHeight?:AlphaTransportsProps['groundHeight']}){
 const pack=useMemo(()=>{
  const data=transportBoardingGeometry(route,index,groundHeight),g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(data.positions,3));g.setIndex(Array.from(data.indices));g.computeVertexNormals();
  return {geometry:g,vertices:data.positions,indices:data.indices,support:data.support,segments:data.segments};
 },[route,index,groundHeight]);
 const name=`${route.id}-gangway-${index}`,surfaceId=`${name}-contact`;
 useLayoutEffect(()=>registerWorldActorPassage({
  id:name,loadSource:name,contains:boardingPassageContains(pack.segments),requirements:[{name:surfaceId,shape:FIXED_TRIMESH}],
 }),[name,surfaceId,pack]);
 useEffect(()=>()=>pack.geometry.dispose(),[pack]);
 return <RegionSceneBoundary id={name}>
  <BoardingWalkwayContact name={name} surfaceId={surfaceId} groundId={route.id+'-boarding-'+index} pack={pack}/>
 </RegionSceneBoundary>;
}

function BoardingWalkwayContact({name,surfaceId,groundId,pack}:{name:string;surfaceId:string;groundId:string;
 pack:{geometry:BufferGeometry;vertices:Float32Array;indices:Uint32Array;support:ReturnType<typeof transportBoardingGeometry>['support'];segments:{a:Vec3;b:Vec3}[]}}){
 const wood=useTransportWood();
 useLayoutEffect(()=>registerRideGround(groundId,pack.support),[groundId,pack]);
 return <group name={name}>
  {wood?<WoodBoarding source={pack.geometry} segments={pack.segments} material={wood} surfaceId={surfaceId}/>:<mesh name={`${name}-floor`} geometry={pack.geometry} receiveShadow userData={{worldCollision:'solid',surfaceId}}><meshStandardMaterial color="#a77f53" roughness={.8} side={2}/></mesh>}
  <RigidBody type="fixed" colliders={false} userData={{surface:true,solid:true,assetId:name}}>
   <TrimeshCollider name={surfaceId} args={[pack.vertices,pack.indices]}/>
  </RigidBody>
 </group>;
}

function CableRoller({id,roller:r}:{id:string;roller:GuideRoller}){
 const geometry=useMemo(()=>new CylinderGeometry(r.radius,r.radius,r.halfWidth*2,20),[r]);
 const rotation=useMemo(()=>new Quaternion().setFromUnitVectors(new Vector3(0,1,0),new Vector3(...r.axis)),[r]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <RigidBody type="fixed" colliders={false} position={r.center} quaternion={rotation} userData={{solid:true,assetId:id}}>
   <mesh name={id+'-visual'} geometry={geometry} castShadow userData={{worldCollision:'solid',surfaceId:id}}>
     <meshStandardMaterial color="#434d51" metalness={.65} roughness={.45}/>
   </mesh>
   <ConvexHullCollider name={id} args={[geometry.attributes.position.array as Float32Array]}/>
 </RigidBody>;
}
function CableWire({route}:{route:TransportRoute}){
 const segments=useMemo(()=>cableWireSegments(route),[route]);
 return <BeamBatch id={route.id+'-wire'} segments={segments} radius={.035} color="#59666e"/>;
}
function BeamBatch({id,segments,radius,color,wood=false,surface=false}:{id:string;segments:{a:Vec3;b:Vec3}[];radius:number;color:string;wood?:boolean;surface?:boolean}){
 const woodMaterial=useTransportWood();
 const model=useMemo(()=>transportBeamBatch(segments,radius,wood),[segments,radius,wood]);
 useEffect(()=>()=>model?.geometry.dispose(),[model]);
 if(!model)return null;
 return <RigidBody type="fixed" colliders={false} userData={{surface,solid:true,assetId:id}}>
   <mesh name={id+'-visual'} geometry={model.geometry} material={wood&&woodMaterial?woodMaterial:undefined} castShadow receiveShadow userData={{worldCollision:'solid',surfaceId:id}}>
     {(!wood||!woodMaterial)&&<meshStandardMaterial color={color} roughness={.75}/>}
   </mesh>
   <TrimeshCollider name={id} args={[model.vertices,model.indices]}/>
 </RigidBody>;
}

export { default as AlphaTransportHud } from './AlphaTransportHud';
