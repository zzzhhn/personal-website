import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {CapsuleCollider,CuboidCollider,RigidBody,useRapier,type RapierRigidBody} from '@react-three/rapier';
import {Quaternion,Vector3} from 'three';
import type {createAlphaGrammarTree} from './alpha-grammar-tree';
import {alphaMaterial} from './alpha-materials';
import {alphaMotion} from './alpha-state';
import {AlphaBadBranchController,alphaBadBranchProbe} from './alpha-bad-branch';
import {alphaContainsWorld} from './alpha-layout';
import {useWorldStore} from '../store';
import type {Vec3} from '../types';
const bodyData={obstacle:true,assetId:'alpha-grammar-bad-branch'};
export default function AlphaBadBranch({source}:{source:ReturnType<typeof createAlphaGrammarTree>['breakaway']}){
 const {world,rapier}=useRapier(),body=useRef<RapierRigidBody>(null),controller=useRef<AlphaBadBranchController|null>(null);
 const materials=useMemo(()=>source.parts.map(p=>{const m=alphaMaterial(p.finish==='bark'?'grammarBark':p.finish);if(p.finish==='leafplate')m.color.set('#776e4f');return m;}),[source]);
 useFrame(()=>{const b=body.current;if(!b)return;controller.current??=new AlphaBadBranchController(b,world,rapier,source);const s=useWorldStore.getState();controller.current.tick(alphaMotion.time,alphaMotion.treeAt,s.paused||document.hidden,alphaContainsWorld(s.position,12));});
 useEffect(()=>()=>{materials.forEach(m=>m.dispose());controller.current=null;alphaBadBranchProbe.phase='attached';},[materials]);
 return <RigidBody ref={body} type="kinematicPosition" colliders={false} position={source.anchor} ccd canSleep linearDamping={.45} angularDamping={.7} friction={.72} restitution={.08} userData={bodyData} onCollisionEnter={e=>{if(e.other.colliderObject?.name==='player-capsule')alphaBadBranchProbe.playerContacts++;}}>
  {source.parts.map((p,i)=><mesh key={p.finish} name={'alpha-detachable-twig-'+p.finish} geometry={p.geometry} material={materials[i]} castShadow receiveShadow/>)}
  {source.colliders.map((s,i)=>{const a=new Vector3(...s.a),b=new Vector3(...s.b),d=b.clone().sub(a),q=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.clone().normalize());return <CapsuleCollider key={i} position={a.add(b).multiplyScalar(.5).toArray() as Vec3} quaternion={q.toArray()} args={[d.length()/2,s.radius]} mass={.03}/>;})}
  <CuboidCollider position={source.leafCollider.position} args={source.leafCollider.halfExtents} mass={.18}/>
 </RigidBody>;
}
