import { Component,Suspense,useEffect,useMemo,useRef,useState,type ReactNode } from 'react';
import { useFrame,useLoader } from '@react-three/fiber';
import { RigidBody, TrimeshCollider, useRapier } from '@react-three/rapier';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { IBD_YARD } from './attraction-layout';
import { withWorldAssetDecoder } from '../WorldAssetDecoder';
import { useDjcFurnitureEnvironment } from '../WorldDjcFurnitureEnvironment';
import { createIbdStaticCraft,IBD_STATIC_CRAFT_ASSET,ibdStaticCraftLegacy,updateIbdCraftEnvironment } from './ibd-static-craft-visual';
import type { IbdContactSurface } from './ibd-static-contact';
import { IBD_WORKSTATION_FIXTURES_ROOT } from './ibd-workstation-fixtures';

export function IbdWorkstationColliders({ contacts }: { contacts: readonly Pick<IbdContactSurface,'id'|'vertices'|'indices'>[] }) {
  const { rapier } = useRapier();
  return <RigidBody type="fixed" colliders={false} userData={{ solid: true, assetId: IBD_WORKSTATION_FIXTURES_ROOT }}>
    {contacts.map(({ id,vertices,indices }) => <TrimeshCollider key={id} name={id}
      args={[vertices,indices,rapier.TriMeshFlags.FIX_INTERNAL_EDGES] as unknown as [Float32Array,Uint32Array]} friction={.85} />)}
  </RigidBody>;
}

function StaticAsset({uniform}:{uniform:{value:number}}){
  const gltf=useLoader(GLTFLoader,IBD_STATIC_CRAFT_ASSET,withWorldAssetDecoder);
  const data=useMemo(()=>createIbdStaticCraft(gltf.scene,uniform),[gltf,uniform]);
  const environment=useDjcFurnitureEnvironment();
  const previousNight=useRef(NaN);
  useEffect(()=>updateIbdCraftEnvironment(data.materials,environment,uniform.value),[data,environment,uniform]);
  useFrame(()=>{if(previousNight.current===uniform.value)return;previousNight.current=uniform.value;updateIbdCraftEnvironment(data.materials,environment,uniform.value);});
  useEffect(()=>{
    data.users++;
    return ()=>{data.users--;queueMicrotask(()=>{if(data.users===0)data.dispose();});};
  },[data]);
  return <><primitive object={data.group} dispose={null}/><IbdWorkstationColliders contacts={data.contacts}/></>;
}
class StaticBoundary extends Component<{fallback:ReactNode;children:ReactNode},{failed:boolean}>{
  state={failed:false};static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error:unknown){console.warn('[ibd-static-craft] retaining original equipment after asset error',error);}
  render(){return this.state.failed?this.props.fallback:this.props.children;}
}
export default function WorldIbdStaticCraft({uniform,fallback}:{uniform:{value:number};fallback:ReactNode}){
  const [near,setNear]=useState(false),legacy=useMemo(()=>typeof window!=='undefined'&&ibdStaticCraftLegacy(window.location.search),[]);
  let elapsed=0;
  useFrame(({camera},delta)=>{elapsed+=delta;if(elapsed<.6)return;elapsed=0;
    const dx=camera.position.x-IBD_YARD.center[0],dz=camera.position.z-IBD_YARD.center[2];
    // Visual residency follows the viewer, including fixed inspection cameras.
    // Gameplay activation still belongs to WorldIbdYard and the player position.
    const next=dx*dx+dz*dz<(near?115:100)**2;if(next!==near)setNear(next);
  });
  return <group name={IBD_WORKSTATION_FIXTURES_ROOT}>
    {legacy||!near?fallback:<StaticBoundary fallback={fallback}><Suspense fallback={fallback}><StaticAsset uniform={uniform}/></Suspense></StaticBoundary>}
  </group>;
}
