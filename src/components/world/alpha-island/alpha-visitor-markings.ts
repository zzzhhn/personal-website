import {BufferGeometry,Color,Float32BufferAttribute,ShapeUtils,Vector2} from 'three';
import {ALPHA_ORIGIN} from './alpha-layout';
import {alphaHeight} from './alpha-terrain';
import {alphaVisitorDirections} from './alpha-visitor-path';
type P={x:number;z:number};type Node=P&{y:number};
const cross=(a:P,b:P,p:P)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
function clip(poly:P[],a:P,b:P){const out:P[]=[];for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],u=cross(a,b,p),v=cross(a,b,q),inside=u>=-1e-9,next=v>=-1e-9;if(inside)out.push(p);if(inside!==next){const t=u/(u-v);out.push({x:p.x+(q.x-p.x)*t,z:p.z+(q.z-p.z)*t});}}return out;}
/** Paint is clipped to the exact1.5m terrain triangles, then raised6mm. This is
 * an overlay only: no terrain/collider edits, ray targets, textures or light slots. */
export function createAlphaVisitorMarkings(){const positions:number[]=[],colors:number[]=[],nx=Math.ceil(196/1.5),nz=Math.ceil(228/1.5),sx=196/nx,sz=228/nz,cache=new Map<string,Node>();
 const node=(i:number,j:number)=>{const key=i+','+j;let n=cache.get(key);if(!n){const x=-98+i*sx,z=-114+j*sz;n={x:Math.fround(x)+ALPHA_ORIGIN[0],y:Math.fround(alphaHeight(x,z)),z:Math.fround(z)+ALPHA_ORIGIN[2]};cache.set(key,n);}return n;};
 const outline=[new Vector2(0,.58),new Vector2(-.31,.06),new Vector2(-.095,.06),new Vector2(-.095,-.48),new Vector2(.095,-.48),new Vector2(.095,.06),new Vector2(.31,.06)],faces=ShapeUtils.triangulateShape(outline,[]),markers=alphaVisitorDirections();
 for(const mark of markers){const [fx,fz]=mark.forward,polygon=outline.map(p=>({x:mark.p[0]+fz*p.x+fx*p.y,z:mark.p[1]-fx*p.x+fz*p.y})),color=new Color(mark.kind==='main'?'#f0dfb4':'#cbb894');
  for(const face of faces){const tri=face.map(i=>polygon[i]),loX=Math.min(...tri.map(p=>p.x)),hiX=Math.max(...tri.map(p=>p.x)),loZ=Math.min(...tri.map(p=>p.z)),hiZ=Math.max(...tri.map(p=>p.z));
   const i0=Math.max(0,Math.floor((loX-ALPHA_ORIGIN[0]+98)/sx)),i1=Math.min(nx-1,Math.floor((hiX-ALPHA_ORIGIN[0]+98)/sx)),j0=Math.max(0,Math.floor((loZ-ALPHA_ORIGIN[2]+114)/sz)),j1=Math.min(nz-1,Math.floor((hiZ-ALPHA_ORIGIN[2]+114)/sz));
   for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const a=node(i,j),b=node(i+1,j),c=node(i,j+1),d=node(i+1,j+1);for(const ground of [[a,b,c],[d,c,b]]){let p=tri;for(let k=0;k<3&&p.length>=3;k++)p=clip(p,ground[k],ground[(k+1)%3]);if(p.length<3)continue;const [u,v,w]=ground,den=cross(u,v,w),height=(q:P)=>{const bv=cross(u,q,w)/den,cw=cross(u,v,q)/den;return u.y+(v.y-u.y)*bv+(w.y-u.y)*cw+.006;};for(let k=1;k<p.length-1;k++){const t=[p[0],p[k],p[k+1]];if(Math.abs(cross(t[0],t[1],t[2]))<1e-10)continue;if(cross(t[0],t[1],t[2])>0)[t[1],t[2]]=[t[2],t[1]];for(const q of t){positions.push(q.x-ALPHA_ORIGIN[0],height(q),q.z-ALPHA_ORIGIN[2]);colors.push(color.r,color.g,color.b);}}}
   }
  }
 }
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('color',new Float32BufferAttribute(colors,3));geometry.computeVertexNormals();geometry.computeBoundingSphere();return{geometry,markers};
}
