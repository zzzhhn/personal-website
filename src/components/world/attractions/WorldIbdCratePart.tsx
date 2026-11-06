import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { withWorldAssetDecoder } from '../WorldAssetDecoder';
import { useDjcFurnitureEnvironment } from '../WorldDjcFurnitureEnvironment';
import { night } from '../WorldNight';
import { createIbdCrateVisual, IBD_CRATE_ASSET, type IbdCratePart } from './ibd-crate-visual';
import { updateIbdCraftEnvironment } from './ibd-static-craft-visual';

function CrateAsset({part}:{part:IbdCratePart}){
  const gltf=useLoader(GLTFLoader,IBD_CRATE_ASSET,withWorldAssetDecoder);
  const data=useMemo(()=>createIbdCrateVisual(gltf.scene,part,night),[gltf,part]);
  const environment=useDjcFurnitureEnvironment();
  const previousNight=useRef(NaN);
  useEffect(()=>updateIbdCraftEnvironment(data.materials,environment,night.value),[data,environment]);
  useFrame(()=>{if(previousNight.current===night.value)return;previousNight.current=night.value;updateIbdCraftEnvironment(data.materials,environment,night.value);});
  useEffect(()=>{
    data.users++;
    return ()=>{data.users--;queueMicrotask(()=>{if(data.users===0)data.dispose();});};
  },[data]);
  return <primitive object={data.root} dispose={null}/>;
}
class CrateBoundary extends Component<{fallback:ReactNode;children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error:unknown){console.warn('[ibd-crates] keeping original crate part after asset error',error);}
  render(){return this.state.failed?this.props.fallback:this.props.children;}
}
export default function WorldIbdCratePart({part,fallback,active,legacy}:{part:IbdCratePart;fallback:ReactNode;active:boolean;legacy:boolean}){
  const [activated,setActivated]=useState(active);
  useEffect(()=>{if(active)setActivated(true);},[active]);
  if(legacy||!activated&&!active)return fallback;
  return <CrateBoundary fallback={fallback}><Suspense fallback={fallback}><CrateAsset part={part}/></Suspense></CrateBoundary>;
}
