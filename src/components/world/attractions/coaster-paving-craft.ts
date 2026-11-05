import { ExtrudeGeometry, Matrix4, Quaternion, Shape, Vector3 } from 'three';
import type { CoasterBatch } from './coaster-geometry.ts';
import { coasterWorld } from './coaster-track.ts';
import { INTENT_CRAFT, markIntentCraft } from './intent-craft-surface.ts';
import type { Vec3 } from '../types';

// The perimeter is the existing workshop apron survey. Its usable area,
// height and colliders remain unchanged; the highest bevel is only 16 mm up.
export const COASTER_PAVING_EDGE: readonly [number,number][] = [[-34,55],[-34,67],[-29,77],[-13,80],[-1,78],[2,65],[-3,55]];
export function addCoasterPavingEdges(batch: CoasterBatch) {
  const tag = (role:number) => markIntentCraft(batch.parts[batch.parts.length-1],role);
  const box = (position:Vec3,size:Vec3,color:string,yaw:number,role:number) => {
    batch.box(coasterWorld(position),size,color,new Quaternion().setFromAxisAngle(new Vector3(0,1,0),yaw)); tag(role);
  };
  for(let segment=1;segment<COASTER_PAVING_EDGE.length;segment++) {
    const a=COASTER_PAVING_EDGE[segment-1],b=COASTER_PAVING_EDGE[segment];
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
    const ux=dx/length,uz=dz/length,ix=uz,iz=-ux;
    const yaw=Math.atan2(ux,uz);
    const at=(t:number,inset:number,y:number):Vec3=>[a[0]+ux*t+ix*inset,y,a[1]+uz*t+iz*inset];
    const profile=new Shape();
    // Thick cast edge with a 12 mm chamfer, no overlapping coplanar top.
    [[-.15,-.10],[.15,-.10],[.15,.004],[.138,.016],[-.138,.016],[-.15,.004]].forEach(([x,y],i)=>i?profile.lineTo(x,y):profile.moveTo(x,y));profile.closePath();
    const blocks=Math.ceil(length/1.2),block=length/blocks;
    for(let i=0;i<blocks;i++) {
      const g=new ExtrudeGeometry(profile,{depth:block-.014,bevelEnabled:false});
      const p=coasterWorld(at(i*block+.007,.16,.12));
      batch.add(g,i%5===1?'#95978c':'#9d9f93',new Matrix4().makeTranslation(...p).multiply(new Matrix4().makeRotationY(yaw)));
      tag(INTENT_CRAFT.concreteBase);
    }
    // Short catch channels near the low eastern and southern edge. Dark inset
    // bed, real transverse grating bars and a metal rim share the static batch.
    if(segment===4 || segment===5) {
      const run=Math.min(length-2,6.4),start=(length-run)/2;
      box(at(length/2,.46,.126),[.21,.012,run],'#354342',yaw,INTENT_CRAFT.rubber);
      for(const offset of [-.113,.113])box(at(length/2,.46+offset,.137),[.018,.018,run],'#6a7978',yaw,INTENT_CRAFT.structuralCoat);
      for(let t=start+.05;t<start+run;t+=.14)box(at(t,.46,.139),[.205,.014,.036],'#82918c',yaw,INTENT_CRAFT.galvanized);
    }
  }
}
