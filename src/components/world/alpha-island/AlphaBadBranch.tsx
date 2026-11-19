import {useEffect,useMemo,useRef,type RefObject} from 'react';
import {useFrame} from '@react-three/fiber';
import {ConvexHullCollider,type RapierCollider,RigidBody,useRapier,type RapierRigidBody} from '@react-three/rapier';
import {twigContactGroups,type createAlphaGrammarTree} from './alpha-grammar-tree';
import {alphaMaterial} from './alpha-materials';
import {alphaMotion} from './alpha-state';
import {AlphaBadBranchController,alphaBadBranchProbe} from './alpha-bad-branch';
import {alphaContainsWorld} from './alpha-layout';
import {useWorldStore} from '../store';
const bodyData={obstacle:true,assetId:'alpha-grammar-bad-branch'};
export default function AlphaBadBranch({source,attachment}:{source:ReturnType<typeof createAlphaGrammarTree>['breakaway'];attachment:RefObject<RapierCollider|null>}){
 const {world,rapier}=useRapier(),body=useRef<RapierRigidBody>(null),controller=useRef<AlphaBadBranchController|null>(null);
 const materials=useMemo(()=>source.parts.map(p=>{const m=alphaMaterial(p.finish==='bark'?'grammarBark':p.finish);if(p.finish==='leafplate')m.color.set('#776e4f');return m;}),[source]);
 useFrame(()=>{const b=body.current;if(!b)return;controller.current??=new AlphaBadBranchController(b,world,rapier,source,()=>attachment.current?.handle);const s=useWorldStore.getState();controller.current.tick(alphaMotion.time,alphaMotion.treeAt,s.paused||document.hidden,alphaContainsWorld(s.position,12));});
 useEffect(()=>()=>{materials.forEach(m=>m.dispose());controller.current=null;alphaBadBranchProbe.phase='attached';},[materials]);
 return <RigidBody ref={body} type="kinematicPosition" colliders={false} position={source.anchor} ccd canSleep linearDamping={.45} angularDamping={.7} friction={.72} restitution={.08} userData={bodyData} onCollisionEnter={e=>{if(e.other.colliderObject?.name==='player-capsule')alphaBadBranchProbe.playerContacts++;}}>
  {source.parts.map((p,i)=><mesh key={p.finish} name={'alpha-detachable-twig-'+p.finish} geometry={p.geometry} material={materials[i]} userData={p.policy} castShadow receiveShadow/>)}
  {source.contacts.map(c=><ConvexHullCollider key={c.id} name={c.id} args={[c.vertices]} mass={c.mass} collisionGroups={twigContactGroups}/>)}
 </RigidBody>;
}
