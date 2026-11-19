import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { TrimeshCollider,type RapierCollider } from '@react-three/rapier';
import type { BufferGeometry } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { withWorldAssetDecoder } from '../WorldAssetDecoder';
import { useDjcFurnitureEnvironment } from '../WorldDjcFurnitureEnvironment';
import { night } from '../WorldNight';
import { createIbdCrateVisual, ibdCrateAssetContact, IBD_CRATE_ASSET, type IbdCratePart } from './ibd-crate-visual';
import { updateIbdCraftEnvironment } from './ibd-static-craft-visual';
import { ibdGeometryContact } from './ibd-static-contact';

type Contact={id:string;geometry:BufferGeometry;colliderRef?:(collider:RapierCollider|null)=>void};
const policy=(id:string)=>({worldCollision:'solid',surfaceId:id,worldCollisionSharedSurface:true});

function CrateAsset({part,contact}:{part:IbdCratePart;contact?:Contact}){
  const gltf=useLoader(GLTFLoader,IBD_CRATE_ASSET,withWorldAssetDecoder);
  const data=useMemo(()=>createIbdCrateVisual(gltf.scene,part,night),[gltf,part]);
  const fit=useMemo(()=>contact?ibdCrateAssetContact(gltf.scene,part):null,[gltf,part,!!contact]);
  const environment=useDjcFurnitureEnvironment();
  const previousNight=useRef(NaN);
  useEffect(()=>updateIbdCraftEnvironment(data.materials,environment,night.value),[data,environment]);
  useFrame(()=>{if(previousNight.current===night.value)return;previousNight.current=night.value;updateIbdCraftEnvironment(data.materials,environment,night.value);});
  useEffect(()=>{
    data.users++;
    return ()=>{data.users--;queueMicrotask(()=>{if(data.users===0)data.dispose();});};
  },[data]);
  const visual=<primitive object={data.root} dispose={null}/>;
  return contact&&fit?<group userData={policy(contact.id)}>{visual}
    <TrimeshCollider name={contact.id} ref={contact.colliderRef} args={[fit.vertices,fit.indices]} friction={.8}/>
  </group>:visual;
}

function CrateFallback({contact,children}:{contact:Contact;children:ReactNode}) {
  const {geometry,id}=contact;
  const fit=useMemo(()=>ibdGeometryContact(geometry,id,0,geometry.index!.count),[geometry,id]);
  return <group userData={policy(id)}>{children}
    <TrimeshCollider name={id} ref={contact.colliderRef} args={[fit.vertices,fit.indices]} friction={.8}/>
  </group>;
}
class CrateBoundary extends Component<{fallback:ReactNode;children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error:unknown){console.warn('[ibd-crates] keeping original crate part after asset error',error);}
  render(){return this.state.failed?this.props.fallback:this.props.children;}
}
export default function WorldIbdCratePart({part,fallback,active,legacy,contact}:{part:IbdCratePart;fallback:ReactNode;active:boolean;legacy:boolean;contact?:Contact}){
  const [activated,setActivated]=useState(active);
  useEffect(()=>{if(active)setActivated(true);},[active]);
  const pending=contact?<CrateFallback contact={contact}>{fallback}</CrateFallback>:fallback;
  if(legacy||!activated&&!active)return pending;
  return <CrateBoundary fallback={pending}><Suspense fallback={pending}><CrateAsset part={part} contact={contact}/></Suspense></CrateBoundary>;
}
