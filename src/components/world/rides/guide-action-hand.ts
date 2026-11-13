import type { Vec3 } from '../types';
/** Scene-owned interaction may publish a world handle; the guide owns measured palm output.
 * No camp/zone dependency. Call release on hide, pause, departure and scene unmount. */
export const guideActionHand:{owner:string|null;target:Vec3|null;facing:Vec3|null;mode:'reach'|'grip';palm:Vec3|null;cancel:(()=>void)|null}={owner:null,target:null,facing:null,mode:'reach',palm:null,cancel:null};
export function releaseGuideActionHand(){const cancel=guideActionHand.cancel;Object.assign(guideActionHand,{owner:null,target:null,facing:null,palm:null,cancel:null,mode:'reach'});cancel?.();}
