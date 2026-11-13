import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider, TrimeshCollider } from '@react-three/rapier';
import { Mesh, type PointLight } from 'three';
import { acceleratedRaycast } from 'three-mesh-bvh';
import { indexFactoryStructure } from './factory-structure-raycast';
import { useWorldStore } from '../store';
import { useInteractable } from '../WorldInteract';
import { night } from '../WorldNight';
import { FACTORY, FACTORY_STATIONS, factoryStation, factoryWorld, inFactory, type FactoryStationId } from './factory-layout';
import { buildFactoryGeometry, FACTORY_PALETTE, type FactoryLamp } from './factory-geometry';
import { bakeFactoryLight, createFactoryMaterial } from './factory-lighting';
import { FACTORY_STATION_NAMES } from './factory-copy';
import { useFactoryStore, openFactoryStation, closeFactoryStation, loadFactorySave, tickFactoryOperation, clearFactoryInput, connectFactoryWorld, factoryControl } from './factory-store';
import { createFactoryConveyors } from './factory-conveyor';
import { buildFactoryWorklife } from './factory-worklife';
import WorldFactoryMechanisms from './WorldFactoryMechanisms';
import WorldFactoryTrial from './WorldFactoryTrial';
import WorldFactoryGuide from './WorldFactoryGuide';
import WorldFactoryPrinter from './WorldFactoryPrinter';
import WorldFactoryArchive from './WorldFactoryArchive';

function Station({id,active}:{id:FactoryStationId;active:boolean}){
  const s=factoryStation(id),label=FACTORY_STATION_NAMES[id];
  useInteractable(active?{id:`factory-${id}`,kind:'exhibit',position:factoryWorld(s.at),radius:s.radius,
    label:{zh:label[0],en:label[1]},enabled:()=>!useWorldStore.getState().factoryStation,
    onInteract:()=>{openFactoryStation(id);}}:null);
  return null;
}
/** Two local, unshadowed sources at authored fixtures illuminate moving parts
 * and the operator. Static fill alone cannot light a newly printed card or robot.
 * Mounted only inside the active facility, without timers or React frame updates. */
function WorkLights({lamps}:{lamps:FactoryLamp[]}){
  const lights=useRef<Array<PointLight|null>>([]);
  useFrame(()=>{
    const state=useWorldStore.getState();
    if(state.paused||state.poolInspect||document.hidden)return;
    const station=state.factoryStation?factoryStation(state.factoryStation):null;
    const x=station?station.machine[0]:state.position[0]-FACTORY.origin[0];
    const y=station?station.machine[1]:state.position[1]-FACTORY.origin[1];
    const z=station?station.machine[2]:state.position[2]-FACTORY.origin[2];
    let first=-1,second=-1,near=Infinity,next=Infinity;
    for(let i=0;i<lamps.length;i++){
      const p=lamps[i].at,d=(p[0]-x)**2+(p[1]-y)**2+(p[2]-z)**2;
      if(d<near){second=first;next=near;first=i;near=d;}
      else if(d<next){second=i;next=d;}
    }
    for(let i=0;i<2;i++){
      const light=lights.current[i],lamp=lamps[i===0?first:second];if(!light)continue;
      light.intensity=lamp?(8+night.value*8)*lamp.strength:0;
      if(lamp){light.position.set(...lamp.at);light.distance=Math.min(12,lamp.reach+3);}
    }
  });
  return <>{[0,1].map(i=><pointLight key={i} ref={light=>{lights.current[i]=light;}}
    name={`factory-work-light-${i}`} color="#FFE3AE" intensity={0} distance={10} decay={2} castShadow={false}/>)}</>;
}
export default memo(function WorldFactory({active}:{active:boolean}){
  const roof=useRef<Mesh>(null);
  const data=useMemo(()=>{
    const built=buildFactoryGeometry();
    for(const g of [built.geometry,built.surface,built.roofs])bakeFactoryLight(g,built.lamps);
    const material=createFactoryMaterial(true,night),roofMaterial=createFactoryMaterial(true,night);
    const conveyors=createFactoryConveyors(FACTORY_PALETTE,night);
    const worklife=buildFactoryWorklife(FACTORY_PALETTE,{lamps:built.lamps,nightUniform:night});
    return {...built,solids:[...built.solids,...worklife.solids],material,roofMaterial,conveyors,worklife,vertices:built.surface.getAttribute('position').array as Float32Array,indices:built.surface.index!.array as Uint32Array};
  },[]);
  useEffect(()=>{
    loadFactorySave();useFactoryStore.setState({active});
    if(!active){closeFactoryStation();useFactoryStore.setState({route:null});}
    return ()=>{useFactoryStore.setState({active:false});closeFactoryStation();};
  },[active]);
  useEffect(()=>{
    indexFactoryStructure(data.geometry);
    const unsubscribe=connectFactoryWorld();
    const clear=()=>clearFactoryInput();window.addEventListener('blur',clear);document.addEventListener('visibilitychange',clear);
    return ()=>{unsubscribe();window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',clear);
      delete data.geometry.boundsTree;
      data.conveyors.dispose();data.worklife.dispose();data.geometry.dispose();data.surface.dispose();data.roofs.dispose();data.material.dispose();data.roofMaterial.dispose();};
  },[data]);
  useFrame(({clock},dt)=>{
    if(active)tickFactoryOperation(dt);
    const w=useWorldStore.getState();
    const op=factoryControl.operation;
    const routingLine=op?.action.type==='route'
      ?useFactoryStore.getState().game.materials[op.action.module].line??undefined:undefined;
    data.conveyors.update(op,!active||w.paused||w.poolInspect||document.hidden,routingLine);
    data.worklife.update(clock.elapsedTime,active,w.paused||w.poolInspect||document.hidden);
  });
  return <group name="world-factory" position={FACTORY.origin} dispose={null}>
    <mesh name="factory-structure" geometry={data.geometry} material={data.material} raycast={acceleratedRaycast} castShadow receiveShadow userData={{solid:true,assetId:'factory-architecture'}}/>
    <mesh name="factory-walks" geometry={data.surface} material={data.material} receiveShadow/>
    <mesh ref={roof} name="factory-roofs" geometry={data.roofs} material={data.roofMaterial} castShadow receiveShadow userData={{solid:true,assetId:'factory-roof'}}/>
    <primitive object={data.conveyors.group}/>
    <primitive object={data.worklife.root}/>
    <RigidBody type="fixed" colliders={false} name="factory-collision" userData={{solid:true,assetId:'factory-architecture'}}>
      <TrimeshCollider args={[data.vertices,data.indices]} friction={.85}/>
      {data.solids.map((s,i)=><CuboidCollider key={i} args={[s.size[0]/2,s.size[1]/2,s.size[2]/2]} position={s.at} rotation={s.rotation} friction={.85}/>)}
    </RigidBody>
    {active&&<><WorkLights lamps={data.lamps}/><WorldFactoryMechanisms/><WorldFactoryTrial/><WorldFactoryGuide/><WorldFactoryPrinter/><WorldFactoryArchive/></>}
    {FACTORY_STATIONS.map(s=><Station key={s.id} id={s.id} active={active}/>) }
  </group>;
});
