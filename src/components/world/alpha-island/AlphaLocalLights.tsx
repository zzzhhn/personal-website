import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { PointLight } from 'three';
import { useWorldStore } from '../store';
import { night } from '../WorldNight';
import { alphaContainsWorld,ALPHA_ORIGIN } from './alpha-layout';
import { alphaCaveLight,caveNear } from './batch2/cave-state';
/** Two fixed, non-shadow light slots for the entire mounted runtime. Light count never
 * depends on arrival/departure or the paper-lantern pool. No global exposure change. */
export default function AlphaLocalLights(){
 const fill=useRef<PointLight>(null),rack=useRef<PointLight>(null);
 useFrame(()=>{
  const p=useWorldStore.getState().position,on=alphaContainsWorld(p,8);
  const inCave=on&&caveNear([p[0]-ALPHA_ORIGIN[0],p[1],p[2]-ALPHA_ORIGIN[2]]);
  if(fill.current){
   fill.current.position.set(on?p[0]+2:ALPHA_ORIGIN[0],on?p[1]+(inCave?3.4:4.5):90,on?p[2]+2:ALPHA_ORIGIN[2]);
   fill.current.color.set(inCave?'#dfc39a':'#b4c8df');
   fill.current.intensity=inCave?7+night.value*6:night.value*13;
  }
  if(rack.current){
   const held=on&&alphaCaveLight.active;
   if(held)rack.current.position.fromArray(alphaCaveLight.position);
   else rack.current.position.set(227,85.15,232);
   rack.current.color.set(held?alphaCaveLight.color:'#ffca7a');
   rack.current.distance=held?alphaCaveLight.distance:10;
   rack.current.intensity=held?alphaCaveLight.intensity:night.value*18;
  }
 });
 return <>
  <pointLight ref={fill} name="alpha-fixed-night-fill-slot" color="#b4c8df" intensity={0} distance={15} decay={2} castShadow={false}/>
  <pointLight ref={rack} name="alpha-fixed-rack-light-slot" position={[227,85.15,232]} color="#ffca7a" intensity={0} distance={10} decay={2} castShadow={false}/>
 </>;
}
