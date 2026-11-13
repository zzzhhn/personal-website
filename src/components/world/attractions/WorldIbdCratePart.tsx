import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { withWorldAssetDecoder } from '../WorldAssetDecoder';
import { createIbdCratePart, IBD_CRATE_ASSET, type IbdCratePart } from './ibd-crate-visual';

function CrateAsset({part}:{part:IbdCratePart}){
  const gltf=useLoader(GLTFLoader,IBD_CRATE_ASSET,withWorldAssetDecoder);
  const root=useMemo(()=>createIbdCratePart(gltf.scene,part),[gltf,part]);
  return <primitive object={root} dispose={null}/>;
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
