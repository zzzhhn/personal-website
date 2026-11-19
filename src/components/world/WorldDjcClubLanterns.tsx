import { Component, Suspense, useMemo, useRef, useState, type ReactNode } from 'react';
import { useOwnedWorldVisual } from './useOwnedWorldVisual';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import type { Group, BufferGeometry } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { withWorldAssetDecoder } from './WorldAssetDecoder';
import { useDjcFurnitureEnvironment } from './WorldDjcFurnitureEnvironment';
import { night } from './WorldNight';
import { CLUB } from './djc-club-layout';
import { DJC_POOL_LANTERN_ASSET, DJC_POOL_LANTERN_POSITIONS, createDjcPoolLanternVisual } from './djc-pool-lantern-visual';
import { clubFallbackContact, clubFixedAssetContact, declareClubFixedInstances } from './club-fixed-contact';
import lanternContact from './club-pool-lantern-contact.generated.json';

const contactName='djc-pool-lantern-contact', fallbackName=`${contactName}-fallback`;
const shape=clubFixedAssetContact(lanternContact);

function PoolLanternAsset(){
  const gltf=useLoader(GLTFLoader,DJC_POOL_LANTERN_ASSET,withWorldAssetDecoder);
  const environment=useDjcFurnitureEnvironment(),renderer=useThree(s=>s.gl);
  const maxAnisotropy=useMemo(()=>renderer.capabilities.getMaxAnisotropy(),[renderer]);
  const visual=useMemo(()=>{
    const display=createDjcPoolLanternVisual(gltf.scene,environment,maxAnisotropy);
    try{declareClubFixedInstances(display.instances,lanternContact,contactName,DJC_POOL_LANTERN_POSITIONS.length);}
    catch(error){display.dispose();throw error;}
    return display;
  },[gltf,environment,maxAnisotropy]);
  useOwnedWorldVisual(visual);
  useFrame(()=>visual.setNight(night.value));
  return <>
    <primitive object={visual.root} dispose={null}/>
    <RigidBody type="fixed" colliders={false} userData={{solid:true,assetId:'djc-pool-lanterns'}}>
      {DJC_POOL_LANTERN_POSITIONS.map((position,i)=><TrimeshCollider key={i} name={`${contactName}-${i}`}
        position={position} args={[shape.vertices,shape.indices]} friction={.65} />)}
    </RigidBody>
  </>;
}
class PoolLanternBoundary extends Component<{fallback:ReactNode;children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error:unknown){console.warn('[djc-pool-lanterns] retaining original furniture after asset error',error);}
  render(){return this.state.failed?this.props.fallback:this.props.children;}
}
/** Distant cameras do not request the GLB or PMREM; the original geometry remains a loading fallback. */
export default function WorldDjcClubLanterns({fallback,geometry,legacy}:{fallback:ReactNode;geometry:readonly BufferGeometry[];legacy:boolean}){
  const camera=useThree(s=>s.camera),group=useRef<Group>(null);
  const distance=()=>Math.hypot(camera.position.x-CLUB.pool[0],camera.position.z-CLUB.pool[2]);
  const [active,setActive]=useState(()=>distance()<=90),activated=useRef(active);
  useFrame(()=>{
    const d=distance();
    if(!activated.current&&d<=90){activated.current=true;setActive(true);}
    if(group.current)group.current.visible=d<180;
  });
  const low=useMemo(()=>clubFallbackContact(geometry),[geometry]);
  const fallbackAssembly=<>
    <group userData={{worldCollision:'solid',surfaceId:fallbackName,worldCollisionSharedSurface:true}}>{fallback}</group>
    <RigidBody type="fixed" colliders={false} userData={{solid:true,assetId:'djc-pool-lanterns'}}>
      <TrimeshCollider name={fallbackName} args={[low.vertices,low.indices]} friction={.65}/>
    </RigidBody>
  </>;
  return <group ref={group} name={contactName} userData={{assetId:'djc-pool-lanterns'}} dispose={null}>
    {active&&!legacy?<PoolLanternBoundary fallback={fallbackAssembly}><Suspense fallback={fallbackAssembly}><PoolLanternAsset/></Suspense></PoolLanternBoundary>:fallbackAssembly}
  </group>;
}
