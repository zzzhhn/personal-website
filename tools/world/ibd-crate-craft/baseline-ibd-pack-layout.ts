import type { Vec3 as V3 } from '../types';

export type IbdPackSlotIndex = 0|1|2|3;
export const IBD_PACK_SLOTS = [
  {index:0,at:[-.65,.43,-.55] as V3},{index:1,at:[.65,.43,-.55] as V3},
  {index:2,at:[-.65,.43,.55] as V3},{index:3,at:[.65,.43,.55] as V3},
] as const;
/** Exaggerated model metres, never real M6/M8 millimetre measurements. */
export const IBD_PACK_SAMPLE_DIMENSIONS = {
  M6:{radius:.14,diameter:.28,height:.35,headRadius:.21,headHeight:.13},
  M8:{radius:.23,diameter:.46,height:.56,headRadius:.345,headHeight:.13},
} as const;
export const IBD_PACK_INSPECTION = {
  stand:[0,-1,2.48] as V3,yaw:Math.PI/2,fixedFaceX:-.23,presentY:-.06,presentZ:1.92,
  liftY:1.12,gapMin:.18,gapMax:.54,shaftY:.17,thumbY:.18,thumbZ:2.21,
  mastBase:[1.18,.32,-.95] as V3,stowedToolAt:[.85,.3,-.45] as V3,stowedToolYaw:Math.PI/2,
  stowedMastTop:[1.18,.96,-.95] as V3,stowedBoomTo:[1.18,.96,-.45] as V3,
};
export const ibdPackSampleDimensions=(spec:string)=>IBD_PACK_SAMPLE_DIMENSIONS[spec==='M6'?'M6':'M8'];
const clamp=(v:number,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number.isFinite(v)?v:lo));
const mix=(a:V3,b:V3,t:number):V3=>a.map((v,i)=>v+(b[i]-v)*t) as V3;
export const ibdPackSampleGrip=(spec:string):V3=>[0,.065,ibdPackSampleDimensions(spec).headRadius*Math.sin(Math.PI/3)];
export function ibdPackInspectAnchors(spec:string,gap:number){
  const d=ibdPackSampleDimensions(spec),g=clamp(gap,IBD_PACK_INSPECTION.gapMin,IBD_PACK_INSPECTION.gapMax);
  const sampleAt:V3=[IBD_PACK_INSPECTION.fixedFaceX+d.radius,IBD_PACK_INSPECTION.presentY,IBD_PACK_INSPECTION.presentZ];
  const grip=ibdPackSampleGrip(spec),movingX=IBD_PACK_INSPECTION.fixedFaceX+g;
  return {
    stand:[...IBD_PACK_INSPECTION.stand] as V3,yaw:IBD_PACK_INSPECTION.yaw,diameter:d.diameter,gap:g,sampleAt,
    leftGrip:grip,leftTarget:sampleAt.map((v,i)=>v+grip[i]) as V3,
    rightTarget:[movingX,IBD_PACK_INSPECTION.thumbY,IBD_PACK_INSPECTION.thumbZ] as V3,
    fixedContact:[IBD_PACK_INSPECTION.fixedFaceX,IBD_PACK_INSPECTION.shaftY,IBD_PACK_INSPECTION.presentZ] as V3,
    movingContact:[movingX,IBD_PACK_INSPECTION.shaftY,IBD_PACK_INSPECTION.presentZ] as V3,
    caliperFixedAt:[IBD_PACK_INSPECTION.fixedFaceX,0,IBD_PACK_INSPECTION.presentZ] as V3,
    caliperJawAt:[movingX,0,IBD_PACK_INSPECTION.presentZ] as V3,
  };
}
/** A single carrier follows lift -> traverse -> lower. Replaying p backward returns
 * the same physical item; hide its home mesh only while this carrier owns that item.
 * The hoist is deployed with the open lid, before a pickup action starts. */
export function ibdPackTransferPose(index:IbdPackSlotIndex,spec:string,progress:number){
  const p=clamp(progress),home=IBD_PACK_SLOTS[index].at,present=ibdPackInspectAnchors(spec,.54).sampleAt;
  const raised:V3=[home[0],IBD_PACK_INSPECTION.liftY,home[2]],over:V3=[present[0],raised[1],present[2]];
  const stage=p<.28?'lift':p<.7?'traverse':'lower';
  const at=stage==='lift'?mix(home,raised,p/.28):stage==='traverse'?mix(raised,over,(p-.28)/.42):mix(over,present,(p-.7)/.3);
  const mastTop:V3=[1.18,1.62,-.95],boomTo:V3=[at[0],1.62,at[2]-.36];
  return {at,rotation:[0,0,0] as V3,stage,sampleOrigin:[...home] as V3,leftGrip:ibdPackSampleGrip(spec),
    mastTop,boomFrom:mastTop,boomTo,tetherFrom:boomTo,tetherTo:[at[0],at[1]+.1,at[2]-.36] as V3};
}
