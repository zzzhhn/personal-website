import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {ConvexHullCollider,TrimeshCollider,RigidBody,type RapierCollider} from '@react-three/rapier';
import {MeshStandardMaterial} from 'three';
import AlphaBadBranch from './AlphaBadBranch';
import {createAlphaGrammarTree,treePullParts} from './alpha-grammar-tree';
import {alphaMaterial} from './alpha-materials';
import {alphaMotion} from './alpha-state';
import {ALPHA_STATIONS} from './alpha-layout';
import {useOwnedWorldVisual} from '../useOwnedWorldVisual';


function PullRope() {
 const model=useMemo(()=>{
   const parts=treePullParts().map(p=>({...p,material:alphaMaterial(p.finish)}));
   return {parts,dispose(){for(const p of parts){p.geometry.dispose();p.material.dispose();}}};
 },[]);
 useOwnedWorldVisual(model);
 return <RigidBody type="fixed" name="alpha-grammar-tree-pull-rope" colliders={false} userData={{solid:true}}>
   {model.parts.map(p=><group key={p.id}>
     <mesh name={p.id} geometry={p.geometry} material={p.material} castShadow receiveShadow dispose={null}
       userData={p.finish==='darkwood'?{worldCollision:'solid',surfaceId:p.id}:{worldCollision:'none',collisionReason:'Hanging cord gives when the player brushes past'}}/>
     {p.finish==='darkwood'&&<ConvexHullCollider name={p.id} args={[p.geometry.getAttribute('position').array as Float32Array]}/>}
   </group>)}
 </RigidBody>;
}

export default function AlphaGrammarTree(){
 const barkBody=useRef<RapierCollider>(null);
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
 useEffect(()=>()=>{built.parts.forEach(p=>p.geometry.dispose());built.pulse.dispose();built.breakaway.parts.forEach(p=>p.geometry.dispose());materials.forEach(m=>m.dispose());pulse.dispose();},[built,materials,pulse]);
 return <group name="alpha-connected-grammar-tree" position={ALPHA_STATIONS.tree}>
  {built.parts.map((part,i)=><mesh key={part.finish} name={'alpha-grammar-'+part.finish} geometry={part.geometry} material={materials[i]} castShadow receiveShadow
    userData={part.finish==='bark'?{worldCollisionSources:built.barkRanges}:{worldCollision:'none',collisionReason:'Attached foliage yields beside the rigid branches'}}/>)}
  <mesh name="alpha-grammar-surface-propagation" geometry={built.pulse} material={pulse} receiveShadow
    userData={{worldCollision:'none',collisionReason:'Illuminated sap follows the bark surface'}}/>
  <RigidBody type="fixed" colliders={false} userData={{solid:true,assetId:'alpha-station-tree'}}>
    {built.barkContacts.map(c=><TrimeshCollider key={c.id} ref={c.id==='alpha-twig-parent-bough'?barkBody:undefined} name={c.id} collisionGroups={c.groups} args={[c.vertices,c.indices]}/>)}
  </RigidBody>
  <PullRope/>
  <AlphaBadBranch source={built.breakaway} attachment={barkBody}/>
 </group>;
}
