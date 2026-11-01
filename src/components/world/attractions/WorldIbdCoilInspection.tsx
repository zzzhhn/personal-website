import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, CylinderGeometry, DoubleSide, Group, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Vector3, type MeshStandardMaterial } from 'three';
import { buildIbdTorch } from './ibd-yard-geometry';
import { ibdInspectionHands } from './ibd-inspection-hands';
import { ibdInspectionBody } from './ibd-inspection-motion';
import { ibdCoilBeamFocus } from './ibd-coil-inspection';

/** One hand-parented tool and a faint shaft. No dynamic light, shadow map or reflection pass. */
export default function WorldIbdCoilInspection({material}:{material:MeshStandardMaterial}) {
  const prop=useMemo(()=>{
    const geometry=buildIbdTorch(),torch=new Mesh(geometry,material);torch.scale.setScalar(.6);
    const shaft=new CylinderGeometry(.025,.33,1,12,1,true);
    shaft.rotateX(Math.PI/2);shaft.translate(0,0,-.5);
    const glow=new MeshBasicMaterial({color:0xffe6b1,transparent:true,opacity:.045,depthWrite:false,
      blending:AdditiveBlending,side:DoubleSide,toneMapped:false});
    const beam=new Mesh(shaft,glow);beam.position.z=-.123;
    const grip=new Group();grip.name='ibd-held-inspection-torch';grip.add(torch,beam);grip.visible=false;
    return {grip,beam,geometry,shaft,glow,position:new Vector3(),target:new Vector3(),up:new Vector3(0,1,0),matrix:new Matrix4(),q:new Quaternion(),parentQ:new Quaternion()};
  },[material]);
  useEffect(()=>()=>{prop.grip.removeFromParent();prop.geometry.dispose();prop.shaft.dispose();prop.glow.dispose();},[prop]);
  useFrame(()=>{
    const action=ibdInspectionBody.action,hand=ibdInspectionHands.right;
    if(action?.kind!=='coil-check'||!action.anchor.focus||!hand?.parent){
      if(prop.grip.visible){prop.grip.visible=false;prop.grip.removeFromParent();}return;
    }
    if(prop.grip.parent!==hand)hand.add(prop.grip);
    prop.grip.visible=true;
    hand.getWorldPosition(prop.position);
    prop.target.set(...ibdCoilBeamFocus(action.anchor.focus,action.elapsed));
    prop.matrix.lookAt(prop.position,prop.target,prop.up);prop.q.setFromRotationMatrix(prop.matrix);
    hand.getWorldQuaternion(prop.parentQ);prop.grip.quaternion.copy(prop.parentQ.invert().multiply(prop.q));
    prop.beam.scale.z=Math.max(.1,prop.position.distanceTo(prop.target)-.123);
    prop.beam.visible=action.phase==='perform'&&action.elapsed>=.6&&action.elapsed<=action.contactAt;
  });
  return null;
}
