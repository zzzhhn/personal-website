import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import type { Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { withWorldAssetDecoder } from './WorldAssetDecoder';
import { useDjcFurnitureEnvironment } from './WorldDjcFurnitureEnvironment';
import { night } from './WorldNight';
import { CLUB } from './djc-club-layout';
import { DJC_POOL_LANTERN_ASSET, createDjcPoolLanternVisual } from './djc-pool-lantern-visual';

function PoolLanternAsset(){
  const gltf=useLoader(GLTFLoader,DJC_POOL_LANTERN_ASSET,withWorldAssetDecoder);
  const environment=useDjcFurnitureEnvironment(),renderer=useThree(s=>s.gl);
  const maxAnisotropy=useMemo(()=>renderer.capabilities.getMaxAnisotropy(),[renderer]);
  const visual=useMemo(()=>createDjcPoolLanternVisual(gltf.scene,environment,maxAnisotropy),[gltf,environment,maxAnisotropy]);
  useEffect(()=>()=>visual.dispose(),[visual]);
  useFrame(()=>visual.setNight(night.value));
  return <primitive object={visual.root} dispose={null}/>;
}
class PoolLanternBoundary extends Component<{fallback:ReactNode;children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error:unknown){console.warn('[djc-pool-lanterns] retaining original furniture after asset error',error);}
  render(){return this.state.failed?this.props.fallback:this.props.children;}
}
/** Distant cameras do not request the GLB or PMREM; the original geometry remains a loading fallback. */
export default function WorldDjcClubLanterns({fallback}:{fallback:ReactNode}){
  const camera=useThree(s=>s.camera),group=useRef<Group>(null);
  const distance=()=>Math.hypot(camera.position.x-CLUB.pool[0],camera.position.z-CLUB.pool[2]);
  const [active,setActive]=useState(()=>distance()<=90),activated=useRef(active);
  useFrame(()=>{
    const d=distance();
    if(!activated.current&&d<=90){activated.current=true;setActive(true);}
    if(group.current)group.current.visible=d<180;
  });
  return <group ref={group} name="djc-pool-lantern-visuals" userData={{assetId:'djc-pool-lanterns'}} dispose={null}>
    {active?<PoolLanternBoundary fallback={fallback}><Suspense fallback={fallback}><PoolLanternAsset/></Suspense></PoolLanternBoundary>:fallback}
  </group>;
}
