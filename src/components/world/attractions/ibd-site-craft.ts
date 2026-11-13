import { bar, cbox, type Builder, type Surf, type V3 } from '../WorldStreetGeometry.ts';
import { IBD_MATERIALS as P } from './ibd-yard-palette.ts';

/** Branches and folded leaves, all inside the existing planted beds. */
export function addIbdPlant(b: Builder, at: V3, seed: number, scale = 1) {
  const shades: Surf[] = ['#687e43','#82964e','#4e693c'].map(color=>({color,rough:.89,metal:0}));
  b.tr(at,[0,seed*.8,0],()=>{
    for (let stem=0;stem<7;stem++) {
      const angle=stem*2.399+seed, radius=(stem===0?.06:.48)*scale;
      const top: V3=[Math.cos(angle)*radius,(.75+.12*(stem%3))*scale,Math.sin(angle)*radius];
      bar(b,[0,0,0],top,.013*scale,{color:'#596140',rough:.95,metal:0},5);
      for (let level=0;level<4;level++) for (const side of [-1,1]) {
        const t=.4+level*.19;
        const pos=top.map(v=>v*t) as V3;
        b.tr(pos,[-.7+level*.25,angle+level*1.8+(side<0?Math.PI:0),side*.22],()=>{
          const l=(.48+.07*(stem%3))*scale, w=l*.4;
          const a:V3=[0,0,0],c:V3=[0,.06*scale,l*.55],tip:V3=[0,0,l];
          const left:V3=[-w,.025*scale,l*.45],right:V3=[w,.025*scale,l*.45];
          for(const points of [[a,left,c],[left,tip,c],[a,c,right],[c,tip,right]]) {
            b.face(points,shades[(stem+level)%3]);
            b.face([...points].reverse(),shades[(stem+level+1)%3]);
          }
        });
      }
    }
  });
}

/** Guardrail panel braces sit between existing posts, never in entry openings. */
export function addIbdFencePanel(b: Builder, a: V3, end: V3) {
  bar(b,[a[0],.85,a[2]],[end[0],1.6,end[2]],.018,P.steel,4);
  bar(b,[a[0],1.6,a[2]],[end[0],.85,end[2]],.018,P.steel,4);
}

export function addIbdLanternFrame(b: Builder, x:number,y:number,z:number) {
  for(const dx of [-.18,.18])for(const dz of [-.18,.18])
    cbox(b,[x+dx,y,z+dz],[.048,.66,.048],P.dark,.006);
  cbox(b,[x,y-.34,z],[.44,.08,.44],P.dark,.012);
  cbox(b,[x,y+.46,z],[.32,.04,.32],P.cutSteel,.008);
  for(const dx of [-.21,.21])for(const dz of [-.21,.21])
    cbox(b,[x+dx,.525,z+dz],[.065,.045,.065],P.cutSteel,.006);
}
