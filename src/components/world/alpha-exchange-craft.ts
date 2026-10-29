import { BufferGeometry, Float32BufferAttribute, MeshStandardMaterial, Vector3 } from 'three';
import { parkMaterial } from './WorldParkKit';
import type { Vec3 } from './types';

/** A single flat chamfer, rather than a subdivided rubbery rounded box.
 * All faces remain within the original support envelope; 44 triangles. */
export function exchangeChamferBox(size:Vec3,bevel=.025) {
  if(size.some(v=>!Number.isFinite(v)||v<=0)||!Number.isFinite(bevel)||bevel<=0)throw new RangeError('Invalid chamfer');
  const h=size.map(v=>v/2),b=Math.min(bevel,...h.map(v=>v*.45)),p:number[]=[];
  const face=(points:number[][])=>{
    const a=new Vector3(...points[0]),normal=new Vector3(...points[1]).sub(a).cross(new Vector3(...points[2]).sub(a));
    const center=points.reduce((v,q)=>v.add(new Vector3(...q)),new Vector3());
    if(normal.dot(center)<0)points.reverse();
    for(let i=1;i<points.length-1;i++)p.push(...points[0],...points[i],...points[i+1]);
  };
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1]) {
    const j=(axis+1)%3,k=(axis+2)%3;
    face([[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>{
      const q=[0,0,0];q[axis]=h[axis]*sign;q[j]=(h[j]-b)*u;q[k]=(h[k]-b)*v;return q;
    }));
  }
  for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)for(const a of [-1,1])for(const c of [-1,1]) {
    const k=3-i-j;
    face([[0,-1],[1,-1],[1,1],[0,1]].map(([edge,sign])=>{
      const q=[0,0,0];q[i]=(h[i]-(edge?b:0))*a;q[j]=(h[j]-(edge?0:b))*c;q[k]=(h[k]-b)*sign;return q;
    }));
  }
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]) {
    const signs=[x,y,z];face([0,1,2].map(axis=>h.map((v,k)=>(v-(axis===k?0:b))*signs[k])));
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.computeVertexNormals();return g;
}

// Explicit material swatches from the approved scene palette, not brightness heuristics.
const BRASS=new Set(['#b8975a','#b2945a','#ad8a51','#c4a369','#a78b56','#92784b','#b19254','#c7a86b','#927446','#aa8950','#8f7548','#9f8050','#8a7045','#ab9057']);
const WOOD=new Set(['#5a4230','#987348','#5a4634','#9a7952','#684e38','#90714c','#9d8058','#a98b5b','#765a3d','#947451','#68503a','#856540','#72583c','#725c43','#70583e','#715337','#886440']);
export const exchangeSurface=(color:string):[number,number]=>BRASS.has(color)?[.46,.55]:WOOD.has(color)?[.68,0]:[.86,0];
export const EXCHANGE_BANK_LAMPS=[[-2.4,1.6,-16.5],[2.4,1.6,-16.5]] as const;
export const EXCHANGE_ARCHIVE_LAMPS=[[-13.1,3.424,-22.96],[-11,3.424,-22.96]] as const;

/** Bounded static worklight pools. Desk lamps reach only their horizontal top;
 * archive hoods softly wash upward/front-facing drawer and tray surfaces below
 * them. Floors, cabinet backs, both side routes and lamps remain outside the bake.
 * The shared night uniform fades all pools, with no new light or frame work. */
export function bakeExchangeWorklights(g:BufferGeometry) {
  const p=g.getAttribute('position'),n=g.getAttribute('normal'),e=g.getAttribute('aEmit');
  for(let i=0;i<p.count;i++) {
    let pool=0;
    const px=p.getX(i),py=p.getY(i),pz=p.getZ(i);
    if(py>=1.02&&py<=1.15&&n.getY(i)>=.75)for(const [x,,z]of EXCHANGE_BANK_LAMPS) {
      const distance=Math.hypot(px-x,pz-z);
      if(distance<1.55)pool+=.65*(1-distance/1.55)**2;
    }
    if(py>=.6&&py<=3.35&&pz>=-24.04&&pz<=-22.74) {
      const facing=Math.min(1,Math.max(0,n.getY(i))*.85+Math.max(0,n.getZ(i))*.5);
      if(facing>0)for(const [x,,z]of EXCHANGE_ARCHIVE_LAMPS) {
        const width=Math.max(0,1-Math.abs(px-x)/1.1),depth=Math.max(0,1-Math.abs(pz-z)/1.15);
        pool+=.95*width**.8*depth*(.4+.6*(py-.6)/2.75)*facing;
      }
    }
    if(pool>0){e.setY(i,e.getY(i)+pool);e.setZ(i,1);}
  }
}

/** Per-vertex surface response retains one architecture draw and the shared night emission. */
export function exchangeCraftMaterial() {
  const base=parkMaterial(),m=new MeshStandardMaterial({vertexColors:true,roughness:.86,metalness:0});
  m.name='exchange-stone-walnut-brass';
  m.onBeforeCompile=(shader,renderer)=>{
    base.onBeforeCompile(shader,renderer);
    shader.vertexShader='attribute vec2 aExchangeSurface;\nvarying vec2 vExchangeSurface;\n'+shader.vertexShader
      .replace('#include <begin_vertex>','#include <begin_vertex>\n vExchangeSurface=aExchangeSurface;');
    shader.fragmentShader='varying vec2 vExchangeSurface;\n'+shader.fragmentShader
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n roughnessFactor=vExchangeSurface.x;')
      .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\n metalnessFactor=vExchangeSurface.y;');
  };
  m.customProgramCacheKey=()=>`${base.customProgramCacheKey()}-exchange-surfaces-v1`;
  return m;
}
