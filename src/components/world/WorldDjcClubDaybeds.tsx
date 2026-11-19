import { Component, Suspense, useMemo, useRef, useState, type ReactNode } from 'react';
import { useOwnedWorldVisual } from './useOwnedWorldVisual';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import type { BufferGeometry, Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { withWorldAssetDecoder } from './WorldAssetDecoder';
import { night } from './WorldNight';
import { useDjcFurnitureEnvironment } from './WorldDjcFurnitureEnvironment';
import { DJC_DAYBED_ASSET, DJC_DAYBED_ORIGIN_Y, createDjcDaybedVisual } from './djc-daybed-visual';
import { CLUB_DAYBEDS } from './djc-club-layout';
import { CLUB_DAYBED_SOURCE, clubDaybedContact } from './club-daybed-contact';
import { clubFallbackContact, declareClubFixedInstances } from './club-fixed-contact';

const contactName='djc-daybed-contact', fallbackName=`${contactName}-fallback`;
const shape=clubDaybedContact();

function DaybedAsset(){
  const gltf=useLoader(GLTFLoader,DJC_DAYBED_ASSET,withWorldAssetDecoder);
  const environment=useDjcFurnitureEnvironment();
  const renderer=useThree(s=>s.gl);
  const maxAnisotropy=useMemo(()=>renderer.capabilities.getMaxAnisotropy(),[renderer]);
  const visual=useMemo(()=>{
    const display=createDjcDaybedVisual(gltf.scene,environment,maxAnisotropy);
    try{declareClubFixedInstances(display.instances,CLUB_DAYBED_SOURCE,contactName,CLUB_DAYBEDS.length);}
    catch(error){display.dispose();throw error;}
    return display;
  },[gltf,environment,maxAnisotropy]);
  useOwnedWorldVisual(visual);
  useFrame(()=>visual.setNight(night.value));
  return <>
    <primitive object={visual.root} dispose={null}/>
    <RigidBody type="fixed" colliders={false} userData={{solid:true,assetId:'djc-daybeds'}}>
      {CLUB_DAYBEDS.map(([x,z],i)=><TrimeshCollider key={i} name={`${contactName}-${i}`}
        position={[x,DJC_DAYBED_ORIGIN_Y,z]} args={[shape.vertices,shape.indices]} friction={.9}/>)}
    </RigidBody>
  </>;
}
class DaybedBoundary extends Component<{fallback:ReactNode;children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error:unknown){console.warn('[djc-daybeds] keeping original furniture after asset error',error);}
  render(){return this.state.failed?this.props.fallback:this.props.children;}
}
export default function WorldDjcClubDaybeds({fallback,geometry,legacy}:{fallback:ReactNode;geometry:readonly BufferGeometry[];legacy:boolean}){
  const camera=useThree(s=>s.camera),group=useRef<Group>(null);
  const distance=()=>Math.hypot(camera.position.x-70,camera.position.z-56);
  const [active,setActive]=useState(()=>distance()<=90),activated=useRef(active);
  useFrame(()=>{
    const d=distance();
    if(!activated.current&&d<=90){activated.current=true;setActive(true);}
    if(group.current)group.current.visible=d<180;
  });
  const low=useMemo(()=>clubFallbackContact(geometry),[geometry]);
  const fallbackAssembly=<>
    <group userData={{worldCollision:'solid',surfaceId:fallbackName,worldCollisionSharedSurface:true}}>{fallback}</group>
    <RigidBody type="fixed" colliders={false} userData={{solid:true,assetId:'djc-daybeds'}}>
      <TrimeshCollider name={fallbackName} args={[low.vertices,low.indices]} friction={.9}/>
    </RigidBody>
  </>;
  return <group ref={group} name={contactName} dispose={null}>
    {active&&!legacy?<DaybedBoundary fallback={fallbackAssembly}><Suspense fallback={fallbackAssembly}><DaybedAsset/></Suspense></DaybedBoundary>:fallbackAssembly}
  </group>;
}
