import { Builder, cbox, bar, type Surf, type V3 } from '../WorldStreetGeometry.ts';
import type { FactorySolid } from './factory-geometry.ts';
import { FACTORY_CONVEYOR_TOP, FACTORY_LINE_Z, FACTORY_RAW_TRANSFER_TOP } from './factory-operation.ts';
import { FACTORY_TRANSFER_X, FACTORY_BATCH_Z } from './factory-routing.ts';

/** Ball-transfer deck at batching plus a transverse roller table. No extra render pass. */
export function buildFactoryRoutingGeometry(P:Record<'teal'|'steel'|'silver'|'dark'|'amber',Surf>){
  const b=new Builder(),solids:FactorySolid[]=[];
  const box=(at:V3,size:V3,s:Surf,solid=false)=>{cbox(b,at,size,s,.015);if(solid)solids.push({at,size});};
  const top=FACTORY_CONVEYOR_TOP,x=FACTORY_TRANSFER_X;
  // A shallow supported belt climbs from the sorting outlet, then fans into
  // three separate staging pockets. The walking aisle stays south of Z=-24.
  const slope=Math.atan2(top-FACTORY_RAW_TRANSFER_TOP,7.7),length=Math.hypot(7.7,top-FACTORY_RAW_TRANSFER_TOP);
  const at:V3=[-29.85,(top+FACTORY_RAW_TRANSFER_TOP)/2-.06,-22];
  b.tr(at,[0,0,slope],()=>cbox(b,[0,0,0],[length,.12,1.25],P.dark,.01));
  solids.push({at,size:[length,.12,1.25],rotation:[0,0,slope]});
  for(const z of [-22.7,-21.3])bar(b,[-33.7,FACTORY_RAW_TRANSFER_TOP-.12,z],[-26,top-.12,z],.075,P.teal,8);
  for(const px of [-32.5,-29,-26.5])for(const z of [-22.55,-21.45])box([px,.5,z],[.12,.76,.12],P.steel,true);
  box([-25,top-.065,-22],[2,.13,3.2],P.dark,true);
  // Flush continuous support is important for small blanks between the rollers.
  box([-22.75,top-.065,-22],[4.5,.13,3.2],P.dark,true);
  box([x,top-.065,-3.5],[1.8,.13,38.2],P.dark,true);
  // Short inlet belts support small blanks that would otherwise dip between
  // the wide-spaced outfeed rollers intended for the larger carrier trays.
  for(const z of Object.values(FACTORY_LINE_Z))box([-22.425,top-.025,z],[4.85,.05,1.8],P.dark,true);
  for(const side of [-1,1]){
    box([-22.75,top-.2,-22+side*1.65],[4.7,.28,.12],P.teal,true);
    for(let z=-22.8;z<=15;z+=4.2)box([x+side*.83,(top+.12)/2-.12,z],[.12,top-.12,.14],P.steel,true);
  }
  // Low rails have open junctions where the part transfers onto an X conveyor.
  for(let z=-23;z<15.5;z+=.5){
    const junction=z<-20.3||Object.values(FACTORY_LINE_Z).some(line=>Math.abs(z-line)<1.25);
    if(!junction)for(const side of [-1,1])box([x+side*.95,top+.08,z],[.09,.14,.42],P.teal,true);
    // A continuous dark belt supports the raw underside; transverse stripes
    // indicate the transfer direction without cylinders protruding through it.
    box([x,top-.003,z],[1.65,.004,.035],P.silver);
  }
  for(const z of Object.values(FACTORY_BATCH_Z)){
    for(const dz of [-.385,.385])box([-24,top+.025,z+dz],[.95,.05,.025],P.amber);
  }
  // Legs also support the wide batching table, outside the console approach.
  for(const px of [-24.8,-20.7])for(const z of [-23.45,-20.55]){
    box([px,(top+.12)/2-.12,z],[.13,top-.12,.13],P.steel,true);
    bar(b,[px,.4,z],[px,top-.15,z],.035,P.silver,6);
  }
  const geometry=b.build();return {geometry,solids,triangles:b.triangles};
}
