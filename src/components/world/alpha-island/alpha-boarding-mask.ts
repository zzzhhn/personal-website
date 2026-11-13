import { Vector2,Vector4 } from 'three';
import { alphaTransportBoardingFootprints } from './transports/alpha-routes';
import type { Vec3 } from '../types';
export interface AlphaBoardSegment {a:Vec3;b:Vec3;halfWidth:number}
const MAX=32;
export const alphaBoardUniforms={uAlphaBoardCount:{value:0},uAlphaBoardLines:{value:Array.from({length:MAX},()=>new Vector4())},uAlphaBoardHeights:{value:Array.from({length:MAX},()=>new Vector2())},uAlphaBoardWidths:{value:new Float32Array(MAX)}};
let segments:AlphaBoardSegment[]=[];
export function setAlphaBoardingMask(next:AlphaBoardSegment[]){if(next.length>MAX)throw new Error('Alpha boarding footprint capacity exceeded');segments=next;alphaBoardUniforms.uAlphaBoardCount.value=next.length;next.forEach((s,i)=>{alphaBoardUniforms.uAlphaBoardLines.value[i].set(s.a[0],s.a[2],s.b[0],s.b[2]);alphaBoardUniforms.uAlphaBoardHeights.value[i].set(s.a[1],s.b[1]);alphaBoardUniforms.uAlphaBoardWidths.value[i]=s.halfWidth;});}
setAlphaBoardingMask(alphaTransportBoardingFootprints(true));
export function alphaBoardingIntersectsPlant(x:number,y:number,z:number,height:number,radius=.2){for(const s of segments){const dx=s.b[0]-s.a[0],dz=s.b[2]-s.a[2],len2=dx*dx+dz*dz;if(len2<1e-7)continue;const t=Math.max(0,Math.min(1,((x-s.a[0])*dx+(z-s.a[2])*dz)/len2)),d=Math.hypot(x-s.a[0]-dx*t,z-s.a[2]-dz*t),deck=s.a[1]+(s.b[1]-s.a[1])*t;if(d<s.halfWidth+radius&&y<=deck+.04&&y+height>=deck-.04)return true;}return false;}
export const alphaBoardMaskHead=`uniform int uAlphaBoardCount;uniform vec4 uAlphaBoardLines[32];uniform vec2 uAlphaBoardHeights[32];uniform float uAlphaBoardWidths[32];`;
/** Strict rectangular strip and ±4cm coplanar band. Elevated walkway never punches a hole below. */
export const alphaBoardMaskFragment=`for(int abi=0;abi<32;abi++){if(abi>=uAlphaBoardCount)break;vec4 l=uAlphaBoardLines[abi];vec2 v=l.zw-l.xy;float len2=dot(v,v);if(len2<.000001)continue;float bt=dot(vAlphaW.xz-l.xy,v)/len2;if(bt<0.||bt>1.)continue;float bd=length(vAlphaW.xz-l.xy-v*bt);float by=mix(uAlphaBoardHeights[abi].x,uAlphaBoardHeights[abi].y,bt);if(bd<uAlphaBoardWidths[abi]&&abs(vAlphaW.y-by)<.04)discard;}`;
