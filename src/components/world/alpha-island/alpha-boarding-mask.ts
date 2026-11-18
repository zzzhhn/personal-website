import { Vector2,Vector4 } from 'three';
import { alphaTransportBoardingFootprints } from './transports/alpha-routes';

const segments = alphaTransportBoardingFootprints(true);
const segmentCount = segments.length;

export const alphaBoardUniforms = {
  uAlphaBoardLines: { value: segments.map(({ a, b }) => new Vector4(a[0], a[2], b[0], b[2])) },
  uAlphaBoardHeights: { value: segments.map(({ a, b }) => new Vector2(a[1], b[1])) },
  uAlphaBoardWidths: { value: Float32Array.from(segments, segment => segment.halfWidth) },
};

export function alphaBoardingIntersectsPlant(x:number,y:number,z:number,height:number,radius=.2){for(const s of segments){const dx=s.b[0]-s.a[0],dz=s.b[2]-s.a[2],len2=dx*dx+dz*dz;if(len2<1e-7)continue;const t=Math.max(0,Math.min(1,((x-s.a[0])*dx+(z-s.a[2])*dz)/len2)),d=Math.hypot(x-s.a[0]-dx*t,z-s.a[2]-dz*t),deck=s.a[1]+(s.b[1]-s.a[1])*t;if(d<s.halfWidth+radius&&y<=deck+.04&&y+height>=deck-.04)return true;}return false;}
export const alphaBoardMaskHead=`uniform vec4 uAlphaBoardLines[${segmentCount}];uniform vec2 uAlphaBoardHeights[${segmentCount}];uniform float uAlphaBoardWidths[${segmentCount}];`;
/** Strict rectangular strip and ±4cm coplanar band. Elevated walkway never punches a hole below. */
export const alphaBoardMaskFragment=`for(int abi=0;abi<${segmentCount};abi++){vec4 l=uAlphaBoardLines[abi];vec2 v=l.zw-l.xy;float len2=dot(v,v);if(len2<.000001)continue;float bt=dot(vAlphaW.xz-l.xy,v)/len2;if(bt<0.||bt>1.)continue;float bd=length(vAlphaW.xz-l.xy-v*bt);float by=mix(uAlphaBoardHeights[abi].x,uAlphaBoardHeights[abi].y,bt);if(bd<uAlphaBoardWidths[abi]&&abs(vAlphaW.y-by)<.04)discard;}`;
