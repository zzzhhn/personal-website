import {useEffect,useMemo} from 'react';
import {useFrame} from '@react-three/fiber';
import {CapsuleCollider,RigidBody} from '@react-three/rapier';
import {MeshStandardMaterial,Quaternion,Vector3} from 'three';
import {createAlphaGrammarTree} from './alpha-grammar-tree';
import {alphaMaterial} from './alpha-materials';
import {alphaMotion} from './alpha-state';
import {ALPHA_STATIONS} from './alpha-layout';
import type {Vec3} from '../types';

/** One authored skeleton supplies visible wood, attached leaf plaques, sap traces and
 * low hard-wood proxies. No independent spiral coordinates or floating pulse nodes. */
export default function AlphaGrammarTree(){
 const built=useMemo(createAlphaGrammarTree,[]),age=useMemo(()=>({value:-100}),[]);
 const materials=useMemo(()=>built.parts.map(part=>{
  const m=alphaMaterial(part.finish==='bark'?'grammarBark':part.finish);
  if(part.finish==='leafplate'){
   const previous=m.onBeforeCompile.bind(m);
   m.onBeforeCompile=(shader,renderer)=>{previous(shader,renderer);shader.uniforms.uAlphaTreeAge=age;
    shader.vertexShader='attribute float alphaTravel;varying float vAlphaTravel;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvAlphaTravel=alphaTravel;');
    shader.fragmentShader='uniform float uAlphaTreeAge;varying float vAlphaTravel;\n'+shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
     float reached=uAlphaTreeAge-vAlphaTravel/3.4;
     float lit=smoothstep(0.,.16,reached)*(1.-smoothstep(2.,3.2,reached))*step(0.,uAlphaTreeAge);
     totalEmissiveRadiance+=vec3(.8,.43,.1)*lit;`);
   };m.customProgramCacheKey=()=> 'alpha-tree-attached-leaf-flow-v1';
  }return m;
 }),[built,age]);
 const pulse=useMemo(()=>{const m=new MeshStandardMaterial({color:'#646c46',roughness:.98,vertexColors:true});m.onBeforeCompile=s=>{
  s.uniforms.uAlphaTreeAge=age;
  s.vertexShader='attribute float alphaTravel;varying float vAlphaTravel;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvAlphaTravel=alphaTravel;');
  s.fragmentShader='uniform float uAlphaTreeAge;varying float vAlphaTravel;\n'+s.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
   float along=uAlphaTreeAge*3.4-vAlphaTravel;
   float lit=smoothstep(-.08,.12,along)*(1.-smoothstep(.65,1.7,along))*step(0.,uAlphaTreeAge);
   totalEmissiveRadiance+=vec3(1.,.53,.12)*lit;`);
 };m.customProgramCacheKey=()=> 'alpha-tree-surface-flow-v1';return m;},[age]);
 useFrame(()=>{age.value=alphaMotion.time-alphaMotion.treeAt;});
 useEffect(()=>()=>{built.parts.forEach(p=>p.geometry.dispose());built.pulse.dispose();materials.forEach(m=>m.dispose());pulse.dispose();},[built,materials,pulse]);
 return <group name="alpha-connected-grammar-tree" position={ALPHA_STATIONS.tree}>
  {built.parts.map((part,i)=><mesh key={part.finish} name={'alpha-grammar-'+part.finish} geometry={part.geometry} material={materials[i]} castShadow receiveShadow/>)}
  <mesh name="alpha-grammar-surface-propagation" geometry={built.pulse} material={pulse} receiveShadow/>
  <RigidBody type="fixed" colliders={false} userData={{solid:true}}>{built.colliders.map((segment,i)=>{
   const a=new Vector3(...segment.a),b=new Vector3(...segment.b),d=b.clone().sub(a),q=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.clone().normalize()),p=a.add(b).multiplyScalar(.5).toArray() as Vec3;
   return <CapsuleCollider key={i} position={p} quaternion={q.toArray()} args={[d.length()/2,segment.radius]}/>;
  })}</RigidBody>
 </group>;
}
