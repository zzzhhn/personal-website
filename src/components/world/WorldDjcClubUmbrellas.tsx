import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import type { Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { withWorldAssetDecoder } from './WorldAssetDecoder';
import { useDjcFurnitureEnvironment } from './WorldDjcFurnitureEnvironment';
import { night } from './WorldNight';
import { createDjcUmbrellaVisual, DJC_UMBRELLA_ASSET } from './djc-umbrella-visual';

function UmbrellaAsset(){
  const gltf=useLoader(GLTFLoader,DJC_UMBRELLA_ASSET,withWorldAssetDecoder),environment=useDjcFurnitureEnvironment();
  const renderer=useThree(s=>s.gl),anisotropy=useMemo(()=>renderer.capabilities.getMaxAnisotropy(),[renderer]);
  const visual=useMemo(()=>createDjcUmbrellaVisual(gltf.scene,environment,anisotropy),[gltf,environment,anisotropy]);
  const lifetime=useMemo(()=>({users:0}),[visual]);
  useEffect(()=>{lifetime.users++;return ()=>{
    lifetime.users--;queueMicrotask(()=>{if(lifetime.users===0)visual.dispose();});
  };},[visual,lifetime]);
  useFrame(()=>visual.setNight(night.value));
  return <primitive object={visual.root} dispose={null}/>;
}
class UmbrellaBoundary extends Component<{fallback:ReactNode;children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error:unknown){console.warn('[djc-umbrellas] keeping original parasols after asset error',error);}
  render(){return this.state.failed?this.props.fallback:this.props.children;}
}
export default function WorldDjcClubUmbrellas({fallback}:{fallback:ReactNode}){
  const camera=useThree(s=>s.camera),group=useRef<Group>(null),distance=()=>Math.hypot(camera.position.x-74,camera.position.z-55);
  const [active,setActive]=useState(()=>distance()<=90),activated=useRef(active);
  useFrame(()=>{const d=distance();if(!activated.current&&d<=90){activated.current=true;setActive(true);}if(group.current)group.current.visible=d<180;});
  return <group ref={group} name="djc-umbrella-visuals" dispose={null}>
    {active?<UmbrellaBoundary fallback={fallback}><Suspense fallback={fallback}><UmbrellaAsset/></Suspense></UmbrellaBoundary>:fallback}
  </group>;
}
