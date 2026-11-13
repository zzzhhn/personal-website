import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import type { Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { withWorldAssetDecoder } from './WorldAssetDecoder';
import { night } from './WorldNight';
import { useDjcFurnitureEnvironment } from './WorldDjcFurnitureEnvironment';
import { DJC_DAYBED_ASSET, createDjcDaybedVisual } from './djc-daybed-visual';

function DaybedAsset(){
  const gltf=useLoader(GLTFLoader,DJC_DAYBED_ASSET,withWorldAssetDecoder);
  const environment=useDjcFurnitureEnvironment();
  const renderer=useThree(s=>s.gl);
  const maxAnisotropy=useMemo(()=>renderer.capabilities.getMaxAnisotropy(),[renderer]);
  const visual=useMemo(()=>createDjcDaybedVisual(gltf.scene,environment,maxAnisotropy),[gltf,environment,maxAnisotropy]);
  useEffect(()=>()=>visual.dispose(),[visual]);
  useFrame(()=>visual.setNight(night.value));
  return <primitive object={visual.root} dispose={null}/>;
}
class DaybedBoundary extends Component<{fallback:ReactNode;children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error:unknown){console.warn('[djc-daybeds] keeping original furniture after asset error',error);}
  render(){return this.state.failed?this.props.fallback:this.props.children;}
}
export default function WorldDjcClubDaybeds({fallback}:{fallback:ReactNode}){
  const camera=useThree(s=>s.camera),group=useRef<Group>(null);
  const distance=()=>Math.hypot(camera.position.x-70,camera.position.z-56);
  const [active,setActive]=useState(()=>distance()<=90),activated=useRef(active);
  useFrame(()=>{
    const d=distance();
    if(!activated.current&&d<=90){activated.current=true;setActive(true);}
    if(group.current)group.current.visible=d<180;
  });
  return <group ref={group} name="djc-daybed-visuals" dispose={null}>
    {active?<DaybedBoundary fallback={fallback}><Suspense fallback={fallback}><DaybedAsset/></Suspense></DaybedBoundary>:fallback}
  </group>;
}
