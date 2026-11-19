import { Component, Suspense, useMemo, useRef, useState, type ReactNode } from 'react';
import { useOwnedWorldVisual } from './useOwnedWorldVisual';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import type { BufferGeometry, Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { withWorldAssetDecoder } from './WorldAssetDecoder';
import { useDjcFurnitureEnvironment } from './WorldDjcFurnitureEnvironment';
import { night } from './WorldNight';
import { createDjcUmbrellaVisual, DJC_UMBRELLA_ASSET, DJC_UMBRELLA_PLACEMENTS } from './djc-umbrella-visual';
import { clubFallbackContact, clubFixedAssetContact, declareClubFixedInstances } from './club-fixed-contact';
import umbrellaContact from './club-umbrella-contact.generated.json';

const contactName='djc-umbrella-contact', fallbackName=`${contactName}-fallback`;
const shape=clubFixedAssetContact(umbrellaContact);

function UmbrellaAsset(){
  const gltf=useLoader(GLTFLoader,DJC_UMBRELLA_ASSET,withWorldAssetDecoder),environment=useDjcFurnitureEnvironment();
  const renderer=useThree(s=>s.gl),anisotropy=useMemo(()=>renderer.capabilities.getMaxAnisotropy(),[renderer]);
  const visual=useMemo(()=>{
    const display=createDjcUmbrellaVisual(gltf.scene,environment,anisotropy);
    try{declareClubFixedInstances(display.instances,umbrellaContact,contactName,DJC_UMBRELLA_PLACEMENTS.length);}
    catch(error){display.dispose();throw error;}
    return display;
  },[gltf,environment,anisotropy]);
  useOwnedWorldVisual(visual);
  useFrame(()=>visual.setNight(night.value));
  return <>
    <primitive object={visual.root} dispose={null}/>
    <RigidBody type="fixed" colliders={false} userData={{solid:true,assetId:'djc-umbrellas'}}>
      {DJC_UMBRELLA_PLACEMENTS.map((position,i)=><TrimeshCollider key={i} name={`${contactName}-${i}`}
        position={[...position]} args={[shape.vertices,shape.indices]} friction={.65}/>) }
    </RigidBody>
  </>;
}
class UmbrellaBoundary extends Component<{fallback:ReactNode;children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error:unknown){console.warn('[djc-umbrellas] keeping original parasols after asset error',error);}
  render(){return this.state.failed?this.props.fallback:this.props.children;}
}
export default function WorldDjcClubUmbrellas({fallback,geometry,legacy}:{fallback:ReactNode;geometry:readonly BufferGeometry[];legacy:boolean}){
  const camera=useThree(s=>s.camera),group=useRef<Group>(null),distance=()=>Math.hypot(camera.position.x-74,camera.position.z-55);
  const [active,setActive]=useState(()=>distance()<=90),activated=useRef(active);
  useFrame(()=>{const d=distance();if(!activated.current&&d<=90){activated.current=true;setActive(true);}if(group.current)group.current.visible=d<180;});
  const low=useMemo(()=>clubFallbackContact(geometry),[geometry]);
  const fallbackAssembly=<>
    <group userData={{worldCollision:'solid',surfaceId:fallbackName,worldCollisionSharedSurface:true}}>{fallback}</group>
    <RigidBody type="fixed" colliders={false} userData={{solid:true,assetId:'djc-umbrellas'}}>
      <TrimeshCollider name={fallbackName} args={[low.vertices,low.indices]} friction={.65}/>
    </RigidBody>
  </>;
  return <group ref={group} name={contactName} dispose={null}>
    {active&&!legacy?<UmbrellaBoundary fallback={fallbackAssembly}><Suspense fallback={fallbackAssembly}><UmbrellaAsset/></Suspense></UmbrellaBoundary>:fallbackAssembly}
  </group>;
}
