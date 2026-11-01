import type { Vec3 } from './types';

type Emit=[number,number,number];
interface InteriorSink {
  box(p:Vec3,size:Vec3,color:string,kind?:'solid'|'visual',yaw?:number,emit?:Emit):void;
  chamfer(p:Vec3,size:Vec3,color:string,kind?:'solid'|'visual',yaw?:number,bevel?:number,emit?:Emit):void;
}

/** Fitted architectural layers keep the open hall, ramps and gallery footprint.
 * Low wall mouldings have their actual visible collision; elevated joinery is
 * contained in the gallery fascia or wall and never becomes a hidden barrier. */
export function buildExchangeInteriorCraft({box,chamfer}:InteriorSink) {
  // Recessed walnut fields give the bell wall a human-scale lower register.
  box([0,.57,-39.67],[35.3,.24,.25],'#68503a');
  box([0,2.55,-39.68],[35.3,.16,.23],'#9a7952');
  for(const x of [-14.6,-10.7,-6.8,-2.9,2.9,6.8,10.7,14.6]) {
    box([x,1.52,-39.74],[3.54,1.68,.08],'#5a4634');
    for(const dx of [-1.7,1.7])box([x+dx,1.52,-39.67],[.08,1.76,.13],'#90714c');
    for(const y of [.78,2.26])box([x,y,-39.66],[3.42,.07,.14],'#9a7952');
    box([x,1.52,-39.687],[3.18,1.28,.025],'#715337','visual');
  }
  // Piers and cornices anchor the rear wall without competing with board/clock.
  for(const x of [-17.1,-6.15,6.15,17.1]) {
    box([x,6.3,-39.6],[.48,7.35,.38],'#d5c6aa','visual');
    for(const y of [2.7,9.96])box([x,y,-39.52],[.74,.22,.52],'#dfd2ba','visual');
  }
  for(const x of [-6.15,6.15]) {
    chamfer([x,3.55,-39.28],[.4,.82,.36],'#68503a','visual',0,.04);
    box([x,3.55,-39.084],[.27,.58,.04],'#efd8a8','visual',0,[.04,.9,1]);
    for(const y of [3.19,3.91])box([x,y,-39.23],[.51,.08,.47],'#b8975a','visual');
  }
  box([0,12.3,-39.59],[35.35,.28,.42],'#dfd2ba','visual');
  box([0,12.06,-39.68],[35.35,.12,.25],'#bba88b','visual');
  for(const y of [3.55,4.55,9.1,11.85])box([0,y,-39.788],[35.2,.025,.024],'#c3b396','visual');
  // Deep gallery fascia: walnut recessed fields bounded by limestone ledges.
  box([0,4.86,-35.79],[34.5,.52,.18],'#5a4230','visual');
  for(const y of [4.58,5.12])box([0,y,-35.72],[34.7,.1,.3],'#c4ad86','visual');
  for(let x=-15.2;x<=15.2;x+=3.8) {
    box([x,4.86,-35.682],[3.38,.3,.035],'#90714c','visual');
    box([x,4.86,-35.655],[3.18,.19,.025],'#68503a','visual');
  }
  for(const side of [-1,1]) {
    for(const y of [4.57,5.12])box([side*9.99,y,-26.4],[.25,.1,18.8],'#c4ad86','visual');
    box([side*10,4.85,-26.4],[.16,.48,18.8],'#5a4230','visual');
    for(const z of [-18.9,-22.6,-26.3,-30,-33.7]) {
      box([side*9.908,4.85,z],[.035,.3,3.35],'#90714c','visual');
      box([side*9.886,4.85,z],[.025,.19,3.13],'#68503a','visual');
    }
    for(const z of [-18,-26,-34]) {
      chamfer([side*10.35,.68,z],[.72,.46,.79],'#bba88b','solid',0,.035);
      box([side*10.35,3.98,z],[.6,.16,.7],'#c4ad86','visual');
    }
  }
  // A quiet stone border connects the two side wings and rear bell walk.
  // Inlays are at floor level and never become trip edges.
  for(const side of [-1,1]) {
    box([side*12.8,.457,-32.5],[.035,.012,7.8],'#9a8665','visual');
    for(const z of [-28.8,-31.2,-33.6,-36,-38.4])
      box([side*11.7,.456,z],[5.2,.01,.025],'#ae9d80','visual');
  }
  for(const x of [-8,-4,0,4,8])box([x,.456,-33.6],[.025,.01,10.9],'#ae9d80','visual');
}
