import { Component, Suspense, useMemo, useRef, useState, type ReactNode } from 'react';
import { useOwnedWorldVisual } from './useOwnedWorldVisual';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import type { BufferGeometry, Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { withWorldAssetDecoder } from './WorldAssetDecoder';
import { useDjcFurnitureEnvironment } from './WorldDjcFurnitureEnvironment';
import { night } from './WorldNight';
import { createDjcFurnitureVisual, DJC_FURNITURE_ASSET, DJC_FURNITURE_PLACEMENTS } from './djc-furniture-visual';
import { clubFallbackContact, clubFixedAssetContact, declareClubFixedInstances } from './club-fixed-contact';
import lounger from './club-furniture-lounger-contact.generated.json';
import consoleContact from './club-furniture-console-contact.generated.json';
import speaker from './club-furniture-speaker-contact.generated.json';

const contactName='djc-furniture-contact', fallbackName=`${contactName}-fallback`;
const families=[
  { name:'lounger', source:lounger, placements:DJC_FURNITURE_PLACEMENTS.lounger },
  { name:'console', source:consoleContact, placements:DJC_FURNITURE_PLACEMENTS.console },
  { name:'speaker', source:speaker, placements:DJC_FURNITURE_PLACEMENTS.speaker },
].map(family=>({...family,shape:clubFixedAssetContact(family.source)}));

function FurnitureAsset(){
  const gltf=useLoader(GLTFLoader,DJC_FURNITURE_ASSET,withWorldAssetDecoder),environment=useDjcFurnitureEnvironment();
  const renderer=useThree(s=>s.gl),anisotropy=useMemo(()=>renderer.capabilities.getMaxAnisotropy(),[renderer]);
  const visual=useMemo(()=>{
    const display=createDjcFurnitureVisual(gltf.scene,environment,anisotropy);
    try{
      for(const {name,source,placements} of families){
        declareClubFixedInstances(display.instances.filter(mesh=>mesh.name.startsWith(`djc-${name}-`)),
          source,`${contactName}-${name}`,placements.length);
      }
    }catch(error){display.dispose();throw error;}
    return display;
  },[gltf,environment,anisotropy]);
  useOwnedWorldVisual(visual);
  useFrame(()=>visual.setNight(night.value));
  return <>
    <primitive object={visual.root} dispose={null}/>
    <RigidBody type="fixed" colliders={false} userData={{solid:true,assetId:'djc-furniture'}}>
      {families.flatMap(({name,placements,shape})=>placements.map((position,i)=>{
        const id=`${contactName}-${name}-${i}`;
        return <TrimeshCollider key={id} name={id} position={[...position]} args={[shape.vertices,shape.indices]} friction={.65}/>;
      }))}
    </RigidBody>
  </>;
}
class FurnitureBoundary extends Component<{fallback:ReactNode;children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error:unknown){console.warn('[djc-furniture] keeping original furniture after asset error',error);}
  render(){return this.state.failed?this.props.fallback:this.props.children;}
}
export default function WorldDjcClubFurniture({fallback,geometry,legacy}:{fallback:ReactNode;geometry:readonly BufferGeometry[];legacy:boolean}){
  const camera=useThree(s=>s.camera),group=useRef<Group>(null),distance=()=>Math.hypot(camera.position.x-52,camera.position.z-55);
  const [active,setActive]=useState(()=>distance()<=90),activated=useRef(active);
  useFrame(()=>{const d=distance();if(!activated.current&&d<=90){activated.current=true;setActive(true);}if(group.current)group.current.visible=d<180;});
  const low=useMemo(()=>clubFallbackContact(geometry),[geometry]);
  const fallbackAssembly=<>
    <group userData={{worldCollision:'solid',surfaceId:fallbackName,worldCollisionSharedSurface:true}}>{fallback}</group>
    <RigidBody type="fixed" colliders={false} userData={{solid:true,assetId:'djc-furniture'}}>
      <TrimeshCollider name={fallbackName} args={[low.vertices,low.indices]} friction={.65}/>
    </RigidBody>
  </>;
  return <group ref={group} name={contactName} dispose={null}>
    {active&&!legacy?<FurnitureBoundary fallback={fallbackAssembly}><Suspense fallback={fallbackAssembly}><FurnitureAsset/></Suspense></FurnitureBoundary>:fallbackAssembly}
  </group>;
}
