import type { BufferGeometry } from 'three';
import type { Vec3 } from './types';

export type ExchangeGalleryKind = 'solid' | 'visual';
export type ExchangeGalleryEmit = [number, number, number];
/** The existing architecture sink owns batching, material response and disposal. */
export interface ExchangeGalleryCraftAPI {
  box(p:Vec3,size:Vec3,color:string,kind:ExchangeGalleryKind,yaw?:number,emit?:ExchangeGalleryEmit):void;
  chamfer(p:Vec3,size:Vec3,color:string,kind:ExchangeGalleryKind,yaw?:number,bevel?:number,emit?:ExchangeGalleryEmit):void;
  rod(a:Vec3,b:Vec3,r:number,color:string,kind?:ExchangeGalleryKind):void;
  add(g:BufferGeometry,color:string,p?:Vec3,rotation?:Vec3,kind?:ExchangeGalleryKind,emit?:ExchangeGalleryEmit):void;
  raw(p:number[],color:string,kind?:ExchangeGalleryKind,emit?:ExchangeGalleryEmit):void;
}
export interface ExchangeGalleryFootprint {
  id:string;
  kind:'bookcase'|'planter';
  center:Vec3;
  size:Vec3;
}
/** Complete visible envelopes, including the lamp hoods and plant foliage.
 * Bookcase backs stop 7 cm in front of the rear wall. No part enters z > -38.3. */
export const EXCHANGE_GALLERY_FOOTPRINTS:readonly ExchangeGalleryFootprint[] = [
  {id:'west-bookcase',kind:'bookcase',center:[-11.8,6.86,-39.35],size:[4.5,3.32,.76]},
  {id:'east-bookcase',kind:'bookcase',center:[11.8,6.86,-39.35],size:[4.5,3.32,.76]},
  {id:'west-planter',kind:'planter',center:[-7.5,6.1,-39.1],size:[1.04,1.8,1.04]},
  {id:'east-planter',kind:'planter',center:[7.5,6.1,-39.1],size:[1.04,1.8,1.04]},
];
const C={walnut:'#5a4230',panel:'#68503a',edge:'#947451',brass:'#b8975a',
  recess:'#352c24',pages:'#d8c9a9',stone:'#c3b396',soil:'#4b4030',leaf:'#526449',leafShade:'#3e523d'};

/** Closed, folded almond: eight faces give a raised midrib and real thickness. */
function foldedLeaf(api:ExchangeGalleryCraftAPI,base:Vec3,tip:Vec3,width:number,shade:boolean) {
  const dx=tip[0]-base[0],dz=tip[2]-base[2],length=Math.hypot(dx,dz);
  const side:Vec3=[-dz/length*width,0,dx/length*width];
  const middle=base.map((v,i)=>(v+tip[i])/2) as Vec3;
  const left=middle.map((v,i)=>v+side[i]) as Vec3,right=middle.map((v,i)=>v-side[i]) as Vec3;
  const top:Vec3=[middle[0],middle[1]+.035,middle[2]],bottom:Vec3=[middle[0],middle[1]-.02,middle[2]];
  const front:number[]=[],back:number[]=[],outline=[base,left,tip,right];
  for(let i=0;i<4;i++) {
    const a=outline[i],b=outline[(i+1)%4];
    front.push(...a,...b,...top);back.push(...b,...a,...bottom);
  }
  api.raw(front,shade?C.leafShade:C.leaf,'visual');api.raw(back,C.leafShade,'visual');
}

function plantedVessel(api:ExchangeGalleryCraftAPI,x:number) {
  const z=-39.1,n=8,outerLow=.32,outerHigh=.455,inner=.375,p:number[]=[];
  const vertex=(i:number,r:number,y:number):Vec3=>[x+Math.cos(i*Math.PI*2/n)*r,y,z+Math.sin(i*Math.PI*2/n)*r];
  const quad=(a:Vec3,b:Vec3,c:Vec3,d:Vec3)=>p.push(...a,...b,...c,...a,...c,...d);
  for(let i=0;i<n;i++) {
    const j=i+1,a=vertex(i,outerLow,5.2),b=vertex(j,outerLow,5.2);
    const c=vertex(j,outerHigh,5.91),d=vertex(i,outerHigh,5.91);
    const e=vertex(i,inner,5.91),f=vertex(j,inner,5.91),g=vertex(j,.28,5.3),h=vertex(i,.28,5.3);
    quad(a,d,c,b);quad(d,e,f,c);quad(e,h,g,f);
    p.push(x,5.2,z,...a,...b,x,5.3,z,...g,...h);
  }
  api.raw(p,C.stone,'solid');
  // Soil sits inside the genuine hollow vessel rather than sealing it with a proxy.
  const soil:number[]=[];
  for(let i=0;i<n;i++)soil.push(x,5.82,z,...vertex(i,.34,5.82),...vertex(i+1,.34,5.82));
  api.raw(soil,C.soil,'visual');
  const sign=x<0?1:-1,stem:Vec3=[x+.025*sign,6.52,z+.015];
  api.rod([x,5.79,z],stem,.018,C.panel,'visual');
  const branches:[Vec3,Vec3][]=[
    [[x,6.07,z],[x-.19*sign,6.36,z+.09]],
    [[x+.012*sign,6.23,z],[x+.21*sign,6.6,z-.12]],
    [[x+.02*sign,6.4,z],[x-.12*sign,6.77,z-.08]],
  ];
  for(const [a,b]of branches)api.rod(a,b,.012,C.panel,'visual');
  const leaves:[Vec3,Vec3,number][]=[
    [branches[0][1],[x-.43*sign,6.49,z+.2],.09],
    [[x-.11*sign,6.23,z+.05],[x+.03*sign,6.54,z+.34],.1],
    [branches[1][1],[x+.43*sign,6.75,z-.2],.09],
    [[x+.14*sign,6.47,z-.08],[x+.35*sign,6.69,z+.19],.105],
    [branches[2][1],[x-.3*sign,6.96,z-.24],.09],
    [[x-.07*sign,6.65,z-.04],[x+.06*sign,6.95,z+.23],.095],
    [stem,[x+.19*sign,6.85,z+.03],.095],
    [[x,6.37,z+.01],[x-.31*sign,6.68,z+.15],.1],
  ];
  leaves.forEach(([a,b,w],i)=>foldedLeaf(api,a,b,w,i%3===0));
}

/** Two covers, exposed page block and separate spine; no text planes or textures. */
function ledger(api:ExchangeGalleryCraftAPI,p:Vec3,size:Vec3,color:string,horizontal=false) {
  const [x,y,z]=p,[w,h,d]=size,cover=.016;
  const sides=horizontal?[-1,1].map(s=>[x,y+s*(h-cover)/2,z] as Vec3)
    :[-1,1].map(s=>[x+s*(w-cover)/2,y,z] as Vec3);
  for(const q of sides)api.box(q,horizontal?[w,cover,d]:[cover,h,d],color,'visual');
  api.box([x,y,z-.012],[w-.032,h-.032,d-.026],C.pages,'visual');
  api.box([x,y,z+d/2-.012],[w,h,.024],color,'visual');
  // Small gilt rules on the spine are geometry and deliberately carry no UI text.
  const rules:number[]=[],front=z+d/2+.0005;
  for(const sign of [-1,1]) {
    const yy=y+sign*h*.3,half=w*.33;
    rules.push(x-half,yy-.004,front,x+half,yy-.004,front,x+half,yy+.004,front,
      x-half,yy-.004,front,x+half,yy+.004,front,x-half,yy+.004,front);
  }
  api.raw(rules,C.brass,'visual');
}

function fittedBookcase(api:ExchangeGalleryCraftAPI,x:number,side:number) {
  const z=-39.35;
  api.chamfer([x,5.31,z],[4.5,.22,.76],C.walnut,'solid',0,.022);
  api.box([x,6.9,-39.685],[4.22,2.98,.09],C.recess,'solid');
  for(const s of [-1,1])api.box([x+s*2.15,6.9,z],[.16,3,.68],C.walnut,'solid');
  api.chamfer([x,8.445,z],[4.5,.15,.76],C.walnut,'solid',0,.025);
  api.chamfer([x,6.2,z],[4.3,.11,.72],C.edge,'solid',0,.018);
  for(const y of [6.945,7.645])api.box([x,y,z],[4.14,.11,.66],C.walnut,'solid');
  api.box([x,7.3,z],[.1,2.1,.64],C.walnut,'solid');
  // Four fitted lower doors are actual boards, with shallow inset field mouldings.
  for(let i=0;i<4;i++) {
    const xx=x-1.545+i*1.03;
    api.box([xx,5.785,-39.055],[1.005,.65,.08],C.walnut,'solid');
    api.chamfer([xx,5.785,-39.011],[.825,.46,.018],C.panel,'visual',0,.008);
    api.box([xx+(i%2?-.35:.35),5.84,-38.99],[.028,.105,.025],C.brass,'visual');
  }
  // The narrow hood is tucked under the cornice; only its downward lip glows.
  api.chamfer([x,8.337,-39.06],[3.45,.075,.13],C.brass,'visual',0,.014);
  api.box([x,8.294,-39.045],[3.15,.012,.085],'#d8c9a9','visual',0,[0,.55,1]);
  api.box([x,5.43,-38.99],[4.2,.018,.018],C.brass,'visual');
  const colors=['#354d43','#72583c','#765a3d','#715337','#52604d','#886440'];
  for(let row=0;row<3;row++)for(const bay of [-1,1]) {
    const shelf=[6.255,7,7.7][row],cx=x+bay*1.07;
    for(let i=0;i<4;i++) {
      const w=[.19,.23,.205,.25][i],h=[.49,.57,.435,.53][(i+row+(side>0?1:0))%4];
      const d=.365+((i+row)%3)*.035,front=-39.055-((i+row)%3)*.023;
      ledger(api,[cx-.74+i*.275,shelf+h/2,front-d/2],[w,h,d],colors[(i+row*2+(bay>0?2:0))%colors.length]);
    }
    if(row===(side<0?1:0)&&bay===side)for(let i=0;i<2;i++) {
      ledger(api,[cx+.61,shelf+.046+i*.092,-39.3],[.61,.088,.39],colors[(i+3)%colors.length],true);
    }
  }
}

/** Static rear-gallery furniture only. Accessible boards and vessel shells use
 * the same solid triangles as their visible geometry; no hidden proxy volumes. */
export function buildExchangeGalleryCraft(api:ExchangeGalleryCraftAPI):void {
  for(const side of [-1,1])fittedBookcase(api,side*11.8,side);
  for(const x of [-7.5,7.5])plantedVessel(api,x);
}
