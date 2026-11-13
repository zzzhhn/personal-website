import { useEffect,useMemo } from 'react';
import { CuboidCollider,RigidBody } from '@react-three/rapier';
import { AlphaBuilder } from './alpha-art';
import { alphaMaterial } from './alpha-materials';
import { meshHeight } from '../WorldLandform';
import type { Vec3 } from '../types';
import { AlphaSign } from './AlphaScenery';
export const alphaPierDecks=[{p:[-10,1.04,88.25] as Vec3,size:[2.8,.2,36.5] as Vec3},{p:[-10,1.04,112] as Vec3,size:[7,.2,11] as Vec3}];
export default function AlphaMainlandPier(){const built=useMemo(()=>{const b=new AlphaBuilder(),posts:{p:Vec3;size:Vec3}[]=[],rails:{p:Vec3;size:Vec3}[]=[];
 for(const deck of alphaPierDecks){const [x,y,z]=deck.p,[w,,len]=deck.size;for(let dz=-len/2+.2;dz<len/2;dz+=.39)b.box('wood',[x,y,z+dz],[w,.2,.365],.025);
 for(let dz=-len/2+.3;dz<=len/2;dz+=3.8)for(const side of [-1,1]){const px=x+side*(w/2-.2),pz=z+dz,ground=Math.min(.85,meshHeight(px,pz)??-4),bottom=ground-.18,top=2.15;
 b.beam('darkwood',[px,bottom,pz],[px,top,pz],.16);posts.push({p:[px,(bottom+top)/2,pz],size:[.16,top-bottom,.16]});b.box('metal',[px,1.05,pz],[.2,.08,.2],.01);}
 // Platform west boarding opening z111.3..114.0 faces the starboard ferry door.
 const ranges=(side:number)=>w>3&&side<0?[[-len/2,-.7],[2,len/2]]:[[-len/2,len/2]];
 for(const side of [-1,1])for(const [a,c] of ranges(side)){const px=x+side*(w/2-.12),mid=z+(a+c)/2;b.beam('wood',[px,2.07,z+a],[px,2.07,z+c],.085);b.beam('rope',[px,1.59,z+a],[px,1.59,z+c],.035);rails.push({p:[px,1.63,mid],size:[.12,1.0,c-a]});}
 }
 return{parts:b.finish(),posts,rails};},[]),materials=useMemo(()=>new Map(built.parts.map(p=>[p.finish,alphaMaterial(p.finish)])),[built]);useEffect(()=>()=>{built.parts.forEach(p=>p.geometry.dispose());materials.forEach(m=>m.dispose());},[built,materials]);
 return <group name="alpha-mainland-pier-r4-candidate">{built.parts.map(p=><mesh key={p.finish} geometry={p.geometry} material={materials.get(p.finish)} castShadow receiveShadow/>)}<RigidBody type="fixed" colliders={false} userData={{surface:true}}>{alphaPierDecks.map((d,i)=><CuboidCollider key={i} position={d.p} args={[d.size[0]/2,d.size[1]/2,d.size[2]/2]}/>)}</RigidBody><RigidBody type="fixed" colliders={false} userData={{solid:true}}>{[...built.posts,...built.rails].map((r,i)=><CuboidCollider key={i} position={r.p} args={[r.size[0]/2,r.size[1]/2,r.size[2]/2]}/>)}</RigidBody><AlphaSign position={[-7,1,69]} text="山岛渡口 · Mountain ferry"/></group>;}
