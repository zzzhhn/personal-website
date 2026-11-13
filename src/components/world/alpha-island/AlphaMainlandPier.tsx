import { useEffect,useMemo } from 'react';
import { CuboidCollider,RigidBody } from '@react-three/rapier';
import { alphaMaterial } from './alpha-materials';
import { AlphaSign } from './AlphaScenery';
import {alphaPierDecks,alphaMainlandPierStructure} from './alpha-mainland-pier';
export {alphaPierDecks,alphaMainlandPierStructure} from './alpha-mainland-pier';
export default function AlphaMainlandPier(){const built=useMemo(alphaMainlandPierStructure,[]),materials=useMemo(()=>new Map(built.parts.map(p=>[p.finish,alphaMaterial(p.finish,undefined,true)])),[built]);useEffect(()=>()=>{built.parts.forEach(p=>p.geometry.dispose());materials.forEach(m=>m.dispose());},[built,materials]);
 return <group name="alpha-mainland-pier-r4-candidate">{built.parts.map(p=><mesh key={p.finish} geometry={p.geometry} material={materials.get(p.finish)} castShadow receiveShadow/>)}<RigidBody type="fixed" colliders={false} userData={{surface:true}}>{alphaPierDecks.map((d,i)=><CuboidCollider key={i} position={d.p} args={[d.size[0]/2,d.size[1]/2,d.size[2]/2]}/>)}</RigidBody><RigidBody type="fixed" colliders={false} userData={{solid:true}}>{[...built.posts,...built.rails].map((r,i)=><CuboidCollider key={i} position={r.p} args={[r.size[0]/2,r.size[1]/2,r.size[2]/2]}/>)}</RigidBody><AlphaSign position={[-7,1,69]} text="山岛渡口 · Mountain ferry"/></group>;}
