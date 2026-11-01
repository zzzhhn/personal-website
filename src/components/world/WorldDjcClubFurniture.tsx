import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import type { Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { withWorldAssetDecoder } from './WorldAssetDecoder';
import { useDjcFurnitureEnvironment } from './WorldDjcFurnitureEnvironment';
import { night } from './WorldNight';
import { createDjcFurnitureVisual, DJC_FURNITURE_ASSET } from './djc-furniture-visual';

function FurnitureAsset(){
  const gltf=useLoader(GLTFLoader,DJC_FURNITURE_ASSET,withWorldAssetDecoder),environment=useDjcFurnitureEnvironment();
  const renderer=useThree(s=>s.gl),anisotropy=useMemo(()=>renderer.capabilities.getMaxAnisotropy(),[renderer]);
  const visual=useMemo(()=>createDjcFurnitureVisual(gltf.scene,environment,anisotropy),[gltf,environment,anisotropy]);
  const lifetime=useMemo(()=>({users:0}),[visual]);
  useEffect(()=>{lifetime.users++;return ()=>{
    lifetime.users--;queueMicrotask(()=>{if(lifetime.users===0)visual.dispose();});
  };},[visual,lifetime]);
  useFrame(()=>visual.setNight(night.value));
  return <primitive object={visual.root} dispose={null}/>;
}
class FurnitureBoundary extends Component<{fallback:ReactNode;children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error:unknown){console.warn('[djc-furniture] keeping original furniture after asset error',error);}
  render(){return this.state.failed?this.props.fallback:this.props.children;}
}
export default function WorldDjcClubFurniture({fallback}:{fallback:ReactNode}){
  const camera=useThree(s=>s.camera),group=useRef<Group>(null),distance=()=>Math.hypot(camera.position.x-52,camera.position.z-55);
  const [active,setActive]=useState(()=>distance()<=90),activated=useRef(active);
  useFrame(()=>{const d=distance();if(!activated.current&&d<=90){activated.current=true;setActive(true);}if(group.current)group.current.visible=d<180;});
  return <group ref={group} name="djc-furniture-visuals" dispose={null}>
    {active?<FurnitureBoundary fallback={fallback}><Suspense fallback={fallback}><FurnitureAsset/></Suspense></FurnitureBoundary>:fallback}
  </group>;
}
