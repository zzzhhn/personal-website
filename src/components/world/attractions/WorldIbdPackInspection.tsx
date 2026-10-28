import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Mesh, Vector3, type MeshStandardMaterial } from 'three';
import { buildIbdPackParts } from './ibd-pack-geometry';
import { IBD_PACK_INSPECTION, ibdPackInspectAnchors, ibdPackTransferPose } from './ibd-pack-layout';
import { ibdPackVisual } from './ibd-pack-play';
import { ibdInspectionHands } from './ibd-inspection-hands';
import { ibdInspectionBody } from './ibd-inspection-motion';
import { useIbdYardStore } from './ibd-yard-store';
import { yardItemId } from './ibd-yard-game';
import type { IbdItem } from './ibd-model';
import type { IbdSlot } from './ibd-yard-layout';
import type { Vec3 } from '../types';

/** Scene-local props follow the existing cargo body, except a grasped sample parented to the real palm. */
export default function WorldIbdPackInspection({slot,item,material}:{slot:IbdSlot;item:IbdItem;material:MeshStandardMaterial}) {
  const parts=useMemo(()=>buildIbdPackParts(item.quantity,item.specId),[item.id,item.quantity,item.specId]);
  const root=useRef<Group>(null), mechanism=useRef<Group>(null), carrier=useRef<Group>(null), carried=useRef<Mesh>(null);
  const pockets=useRef<(Mesh|null)[]>([]), fixed=useRef<Mesh>(null), jaw=useRef<Mesh>(null);
  const mast=useRef<Mesh>(null),boom=useRef<Mesh>(null),tether=useRef<Mesh>(null);
  const scratch=useMemo(()=>({a:new Vector3(),b:new Vector3(),up:new Vector3(0,1,0)}),[]);
  const previous=useRef({p:NaN,index:-1,jaw:NaN,open:false,owning:false,held:false});
  useEffect(()=>()=>{carried.current?.removeFromParent();parts.dispose();},[parts]);
  const rod=(mesh:Mesh|null,a:Vec3,b:Vec3)=>{
    if(!mesh)return;scratch.a.set(...a);scratch.b.set(...b).sub(scratch.a);
    mesh.position.copy(scratch.a);mesh.scale.y=scratch.b.length();mesh.quaternion.setFromUnitVectors(scratch.up,scratch.b.normalize());
  };
  useFrame(()=>{
    if(!root.current||!mechanism.current||!carrier.current||!carried.current)return;
    const game=useIbdYardStore.getState().game,id=yardItemId(game,slot),check=game.packInspections[id];
    const open=game.core.opened.includes(id)&&!game.core.loaded.includes(id)&&!game.pending;
    const owning=ibdPackVisual.pack===slot, index=ibdPackVisual.index, p=owning?ibdPackVisual.progress:0;
    const held=owning&&check?.held===index&&!!ibdInspectionBody.carried,last=previous.current;
    // Idle crates and a sample already attached to its palm need no pose allocations or writes.
    const expectedParent=held&&ibdInspectionHands.left?ibdInspectionHands.left:carrier.current;
    if(last.p===p&&last.index===index&&last.jaw===ibdPackVisual.jaw&&last.open===open&&last.owning===owning&&last.held===held
      &&carried.current.parent===expectedParent)return;
    Object.assign(last,{p,index,jaw:ibdPackVisual.jaw,open,owning,held});
    mechanism.current.visible=open&&owning&&(p>0||held);
    const pose=ibdPackTransferPose(index,item.specId,p);
    carrier.current.position.set(...pose.at);
    rod(mast.current,IBD_PACK_INSPECTION.mastBase,pose.mastTop);
    rod(boom.current,pose.boomFrom,pose.boomTo);rod(tether.current,pose.tetherFrom,pose.tetherTo);
    const anchors=ibdPackInspectAnchors(item.specId,ibdPackVisual.jaw);
    fixed.current?.position.set(...anchors.caliperFixedAt);jaw.current?.position.set(...anchors.caliperJawAt);
    if(fixed.current)fixed.current.visible=p>.995;
    if(jaw.current)jaw.current.visible=p>.995;
    for(const entry of parts.slots){const mesh=pockets.current[entry.index];if(mesh)mesh.visible=entry.occupied&&!(owning&&entry.index===index&&(p>0||held));}
    const sample=carried.current;
    if(held&&ibdInspectionHands.left){
      if(sample.parent!==ibdInspectionHands.left){
        // Contact is sampled at the presented pose; preserve that world transform on handover.
        carrier.current.updateWorldMatrix(true,true);sample.position.set(0,0,0);sample.quaternion.identity();sample.scale.set(1,1,1);
        carrier.current.add(sample);carrier.current.updateWorldMatrix(true,true);ibdInspectionHands.left.attach(sample);
      }
    }else{
      if(sample.parent!==carrier.current)carrier.current.attach(sample);
      sample.position.set(0,0,0);sample.quaternion.identity();sample.scale.set(1,1,1);
    }
    sample.visible=owning&&parts.slots[index].occupied&&(p>0||held);
  });
  return <group ref={root} name={`ibd-inspection-${slot}`}>
    {parts.slots.map(s=><mesh key={s.index} ref={m=>{pockets.current[s.index]=m;}} geometry={parts.sample}
      material={material} position={s.at} visible={s.occupied} castShadow receiveShadow/>) }
    <group ref={mechanism} visible={false}>
      <mesh ref={mast} geometry={parts.rigMast} material={material}/><mesh ref={boom} geometry={parts.rigBoom} material={material}/>
      <mesh ref={tether} geometry={parts.rigTether} material={material}/>
      <group ref={carrier}><mesh geometry={parts.tray} material={material} castShadow/>
        <mesh ref={carried} geometry={parts.sample} material={material} visible={false} castShadow/>
      </group>
      <mesh ref={fixed} geometry={parts.caliperFixed} material={material} castShadow/>
      <mesh ref={jaw} geometry={parts.caliperJaw} material={material} castShadow/>
    </group>
  </group>;
}
