import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { type BufferGeometry, Mesh, type MeshStandardMaterial } from 'three';
import { createClubPoolWaterMaterial } from './WorldPoolWater';
import { clubWaterUniforms, createClubOpticalWater } from './WorldClubWaterShader';
import { applyPoolCaustics, ClubWaterCapture, clubWaterDebug } from './WorldClubWaterCapture';
import { useWorldStore } from './store';
import { windUniforms } from './WorldWind';
import { night } from './WorldNight';

export default function WorldClubWater({geometry,basinMaterial}:{geometry:BufferGeometry;basinMaterial:MeshStandardMaterial}){
  const mesh=useRef<Mesh>(null);
  const resources=useMemo(()=>{
    const uniforms=clubWaterUniforms();return{uniforms,material:createClubOpticalWater(uniforms),legacy:createClubPoolWaterMaterial(),capture:new ClubWaterCapture(uniforms)};
  },[]);
  useEffect(()=>{
    const restore=applyPoolCaustics(basinMaterial,resources.uniforms);
    return()=>{restore();resources.material.dispose();resources.legacy.dispose();resources.capture.dispose();};
  },[basinMaterial,resources]);
  useFrame(()=>{
    resources.uniforms.uNight.value=night.value;resources.legacy.uniforms.uNight.value=night.value;
    if(mesh.current)mesh.current.material=clubWaterDebug.enabled?resources.material:resources.legacy;
    if(!clubWaterDebug.enabled)resources.uniforms.uOptics.value=0;
  });
  return <mesh ref={mesh} name="djc-pool-water-no-collider" geometry={geometry} material={resources.material} renderOrder={2}
    onBeforeRender={(renderer,scene,camera)=>{
      if(!document.hidden&&mesh.current)resources.capture.render(renderer,scene,camera,mesh.current,windUniforms.uWindTime.value,useWorldStore.getState().quality==='high');
    }}/>;
}
