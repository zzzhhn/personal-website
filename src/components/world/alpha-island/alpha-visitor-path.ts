import {ALPHA_MAIN_PATH,ALPHA_SOCKETS,ALPHA_STATIONS,alphaWorld} from './alpha-layout';
export type VisitorPoint=readonly [number,number];
const xz=(p:readonly number[]):VisitorPoint=>[p[0],p[2]];
/** WORLD X/Z navigation only. Never feed this into terrain, rails, sockets or rides.
 * These connectors avoid the sled bodies and the peak's sharp terrain corner.
 * The common middle retains the six-stop batch1 trail, without exposing other stations. */
export const ALPHA_VISITOR_LOWER:readonly VisitorPoint[]=[
 xz(alphaWorld(ALPHA_SOCKETS.dock.safeExit[0])),[161,146],[164.5,146],[164.5,167],
 [174,167],[174,156],[177,155.5],[177,146],[176,146],[181,150],
];
export const ALPHA_VISITOR_UPPER:readonly VisitorPoint[]=[
 [264,232],[264,230.5],[254,230.5],[254,236],[243,247],[241,247],
 xz(alphaWorld(ALPHA_MAIN_PATH[31])),xz(alphaWorld(ALPHA_STATIONS.summit)),
];
export const ALPHA_VISITOR_SPURS=[
 {id:'lodge',label:{zh:'小屋',en:'Lodge'},path:[[174,156],[171,155.3],[171,154.2],[171,151.6]] as readonly VisitorPoint[]},
 {id:'sled',label:{zh:'雪橇',en:'Sled'},path:[[254,230.5],[256,232]] as readonly VisitorPoint[]},
] as const;
function join(...paths:readonly (readonly VisitorPoint[])[]){const result:VisitorPoint[]=[];for(const path of paths)for(const p of path){const q=result.at(-1);if(!q||Math.hypot(q[0]-p[0],q[1]-p[1])>1e-6)result.push(p);}return result;}
export const ALPHA_VISITOR_PATH:readonly VisitorPoint[]=join(ALPHA_VISITOR_LOWER,ALPHA_MAIN_PATH.slice(4,28).map(p=>xz(alphaWorld(p))),ALPHA_VISITOR_UPPER,[xz(alphaWorld(ALPHA_STATIONS.lantern))]);
export type VisitorDirection={p:VisitorPoint;forward:VisitorPoint;kind:'main'|'spur'};
/** Only the corrected outdoor connections receive small paint chevrons. Indoor
 * lodge/ramp and vehicle boarding surfaces retain their existing physical treatment. */
export function alphaVisitorDirections(){const out:VisitorDirection[]=[];
 const add=(path:readonly VisitorPoint[],kind:VisitorDirection['kind'])=>{for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],dx=b[0]-a[0],dz=b[1]-a[1],n=Math.hypot(dx,dz);if(n<.6)continue;const first=Math.min(.85,n*.4);for(let d=first;d<n-.25;d+=6){const p:VisitorPoint=[a[0]+dx*d/n,a[1]+dz*d/n];if(!out.some(q=>q.kind===kind&&Math.hypot(q.p[0]-p[0],q.p[1]-p[1])<.85))out.push({p,forward:[dx/n,dz/n],kind});}}};
 add(ALPHA_VISITOR_LOWER,'main');add(ALPHA_VISITOR_UPPER,'main');add(ALPHA_VISITOR_SPURS[0].path.slice(0,2),'spur');add(ALPHA_VISITOR_SPURS[1].path,'spur');return out;
}
