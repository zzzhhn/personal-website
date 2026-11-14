import { ShapeUtils, Vector2, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Builder, cbox, bar, type Surf, type V3 } from '../WorldStreetGeometry.ts';
import { FACTORY, FACTORY_FOOTPRINT, FACTORY_STATIONS, FACTORY_COURSE_LOCAL, FACTORY_LANE_OFFSET } from './factory-layout.ts';
import { FACTORY_GANTRY } from './factory-gantry.ts';
import { buildFactoryFacade } from './factory-facade.ts';
import { buildFactoryFixture } from './factory-fixture.ts';
import { FACTORY_ASSEMBLY_RAIL } from './factory-assembly-hoist.ts';
import { FACTORY_CONVEYOR_TOP, FACTORY_LINE_Z, FACTORY_RAW_TRANSFER_TOP } from './factory-operation.ts';
import { FACTORY_MODULES } from './factory-game.ts';
import { buildFactoryMachineCasing } from './factory-machine-casing.ts';
import { buildFactoryRoutingGeometry } from './factory-routing-geometry.ts';
import { buildFactoryProductionDetail } from './factory-production-detail.ts';
export const FACTORY_PALETTE = {
  cream:{color:'#DDD4BF',rough:.66,metal:.12}, teal:{color:'#416B6A',rough:.54,metal:.3},
  steel:{color:'#3E494B',rough:.59,metal:.38}, floor:{color:'#A49F8C',rough:.94,metal:0},
  amber:{color:'#C99536',rough:.6,metal:.15}, dark:{color:'#282F31',rough:.85,metal:.06},
  silver:{color:'#9CABA7',rough:.46,metal:.4}, glass:{color:'#729A9D',rough:.37,metal:.08},
  lamp:{color:'#FFE3AE',rough:.35,metal:0,glow:1},
} satisfies Record<string,Surf>;
const P=FACTORY_PALETTE;
export interface FactorySolid { at:V3; size:V3; rotation?:V3 }
export interface FactoryLamp { at:V3; reach:number; strength:number }
export interface FactoryGeometry { geometry:BufferGeometry; roofs:BufferGeometry; surface:BufferGeometry; solids:FactorySolid[]; lamps:FactoryLamp[]; triangles:number }
/** Static structure is three merged draws. Collider dimensions share the source geometry. */
export function buildFactoryGeometry():FactoryGeometry {
  const b=new Builder(),roof=new Builder(),walk=new Builder(),solids:FactorySolid[]=[],lamps:FactoryLamp[]=[];
  const cube=(at:V3,size:V3,s:Surf=P.steel,solid=false,bevel=.04)=>{
    cbox(b,at,size,s,bevel);if(solid)solids.push({at,size});
  };
  const beam=(a:V3,end:V3,width=.09,s:Surf=P.steel)=>bar(b,a,end,width,s,6);
  const slab=(points:V3[],thickness=.2)=>{
    const contour=points.map(p=>new Vector2(p[0],p[2]));
    for(const tri of ShapeUtils.triangulateShape(contour,[])){
      const face=tri.map(i=>points[i]);walk.face(face,P.floor,[0,1,0]);
      walk.face(face.map(p=>[p[0],p[1]-thickness,p[2]] as V3),P.floor,[0,-1,0]);
    }
    points.forEach((a,i)=>{const c=points[(i+1)%points.length];walk.face([a,c,[c[0],c[1]-thickness,c[2]],[a[0],a[1]-thickness,a[2]]],P.floor,[c[2]-a[2],0,a[0]-c[0]]);});
  };
  const rectangle=(x0:number,x1:number,z0:number,z1:number,y:number)=>slab([[x0,y,z0],[x1,y,z0],[x1,y,z1],[x0,y,z1]]);
  const railing=(a:V3,end:V3)=>{
    const length=Math.hypot(end[0]-a[0],end[1]-a[1],end[2]-a[2]),n=Math.max(1,Math.ceil(length/2.6));
    for(let i=0;i<=n;i++){const t=i/n,p:V3=[a[0]+(end[0]-a[0])*t,a[1]+(end[1]-a[1])*t,a[2]+(end[2]-a[2])*t];
      cube([p[0],p[1]+.57,p[2]],[.13,1.14,.13],P.steel,true,.015);}
    for(const h of [.55,1.13])beam([a[0],a[1]+h,a[2]],[end[0],end[1]+h,end[2]],.055,P.amber);
    // A continuous thin guard shares the visible rails' sweep; no gaps that swallow the player.
    const dx=end[0]-a[0],dz=end[2]-a[2],dy=end[1]-a[1];
    solids.push({at:[(a[0]+end[0])/2,(a[1]+end[1])/2+.58,(a[2]+end[2])/2],size:[.12,1.16,length],rotation:[-Math.atan2(dy,Math.hypot(dx,dz)),Math.atan2(dx,dz),0]});
  };
  const lamp=(at:V3,reach=8,strength=1,mount?:V3)=>{
    cube(at,[.64,.16,.3],P.steel);cube([at[0],at[1]-.1,at[2]],[.5,.05,.2],P.lamp);
    if(mount){
      beam(mount,[mount[0],at[1]+.2,mount[2]],.06,P.teal);
      beam([mount[0],at[1]+.2,mount[2]],[at[0],at[1]+.2,at[2]],.06,P.teal);
      beam([at[0],at[1]+.2,at[2]],at,.045,P.steel);
    }else if(at[0]<=46){
      const ceiling=at[2]>=25&&at[1]<4?4.12:at[0]<-1?9:15+3*(1-Math.abs(at[0]-22.5)/23.5);
      beam([at[0],ceiling,at[2]],[at[0],at[1]+.08,at[2]],.025,P.steel);
    }else{
      const x=at[0]+.95;
      cube([x,at[1]/2,at[2]],[.14,at[1]-.12,.14],P.teal,true,.015);
      cube([x,.2,at[2]],[.42,.16,.42],P.floor,true);
      beam([x,at[1]-.08,at[2]],at,.07,P.teal);
    }
    lamps.push({at:[at[0],at[1]-.15,at[2]],reach,strength});
  };
  slab(FACTORY_FOOTPRINT.map(([x,z])=>[x-FACTORY.origin[0],.12,z-FACTORY.origin[2]]));
  // Building ribs and waist walls leave the east access, test bay and south pedestrian doors open.
  for(const x of [-46,-31,-16,-1,14,30,46])for(const z of [-31,31]){
    const height=x<0?9:15;
    cube([x,height/2+.12,z],[.38,height,.38],P.steel,true);
    cube([x,.32,z],[.8,.4,.8],P.floor,true);
    if(x<46)beam([x,height,z],[Math.min(46,x+15),height,z],.17);
  }
  // Sawtooth machining wing. Solid roof pieces and teal frames remain separately fadeable.
  for(const z0 of [-31,-10,11]){
    const z1=z0+21;
    const pts:V3[]=[[-46,9,z0],[-1,9,z0],[-1,11.5,z1],[-46,11.5,z1]];
    roof.face(pts,P.cream,[0,1,-.12]);roof.face([...pts].reverse(),P.cream,[0,-1,.12]);
    roof.face([[-46,9,z0],[-1,9,z0],[-1,11.5,z0],[-46,11.5,z0]],P.glass,[0,0,-1]);
    for(const x of [-46,-31,-16,-1]){beam([x,9,z0],[x,11.5,z1],.12);beam([x,9,z0],[x,11.5,z0],.09);}
    for(let x=-46;x<=-1;x+=5)beam([x,9,z0],[x,11.5,z1],.045,P.silver);
  }
  // Tall assembly atrium: true roof span, cross bracing and glazing strips.
  for(const z of [-31,0,31]){
    beam([-1,15,z],[22.5,18,z],.18);beam([22.5,18,z],[46,15,z],.18);
    beam([-1,15,z],[46,15,z],.13);
    for(let x=1;x<45;x+=9)beam([x,15,z],[22.5,18,z],.07);
  }
  for(const z of [-31,31])lamp([22,14.4,z*.65],17,1.25);
  for(const [a,c] of [[-1,22.5],[22.5,46]]){
    const y0=a<0?15:18,y1=c>23?15:18;
    roof.face([[a,y0,-31],[c,y1,-31],[c,y1,31],[a,y0,31]],P.cream,[0,1,0]);
    roof.face([[a,y0,31],[c,y1,31],[c,y1,-31],[a,y0,-31]],P.cream,[0,-1,0]);
  }
  // Continuous generous ramp surfaces avoid step lips. A second route is reserved for the freight lift.
  slab([[41,.12,-21],[45,.12,-21],[45,4.32,1],[41,4.32,1]]);
  rectangle(39,46,1,36,4.32);rectangle(-44,39,25,30,4.32);
  railing([41,.12,-21],[41,4.32,1]);railing([45,.12,-21],[45,4.32,1]);
  railing([39,4.32,1],[39,4.32,24]);railing([46,4.32,1],[46,4.32,36]);
  railing([-44,4.32,25],[38,4.32,25]);railing([-44,4.32,30],[39,4.32,30]);
  slab([[39,4.32,32],[39,4.32,36],[16,8.52,36],[16,8.52,32]]);
  rectangle(2,16,25,36,8.52);
  railing([39,4.32,32],[16,8.52,32]);railing([39,4.32,36],[16,8.52,36]);
  railing([2,8.52,25],[16,8.52,25]);railing([2,8.52,25],[2,8.52,36]);railing([2,8.52,36],[16,8.52,36]);
  for(const x of [-42,-16,10,43]){lamp([x,3.4,28],8,.9);lamp([x,3.4,-28],8,.9);}
  lamp([9,10.7,28],9,1.15);
  // Three production lines have actual rollers, guards, cable trays and different machine silhouettes.
  const conveyor=(x0:number,x1:number,z:number,y=FACTORY_CONVEYOR_TOP-.115)=>{
    for(const side of [-1,1]){
      const spans=x0< -21&&x1> -21?[[x0,-22],[-20,x1]]:[[x0,x1]];
      for(const [a,c] of spans)cube([(a+c)/2,y-.15,z+side*1.04],[c-a,.28,.16],P.teal,true);
      // Square-section legs need four planar sides, not 32 extra triangles
      // of narrow edge bands on every repeated extrusion.
      for(let x=x0;x<=x1;x+=4.5)cube([x,y/2,z+side*.95],[.14,y,.14],P.steel,true,0);
    }
    // The roller bodies are instanced in WorldFactory, driven by
    // the actual outfeed. Bearing blocks and guards stay in this static batch.
    for(let x=x0<0?-19.7:x0+.35;x<x1-.1;x+=.8)for(const side of [-1,1]){
      cube([x,y-.03,z+side*1.025],[.18,.18,.12],P.dark,false,0);
    }
    const motorX=x1-1.2;
    cube([motorX,y-.13,z+1.32],[.72,.42,.42],P.teal,false,.04);
    for(let dx=-.24;dx<=.24;dx+=.12)cube([motorX+dx,y+.1,z+1.32],[.025,.06,.35],P.steel,false,0);
    bar(b,[motorX,y,z+.93],[motorX,y,z+1.18],.045,P.silver,8);
  };
  const casings=FACTORY_MODULES.map(module=>{
    const casing=buildFactoryMachineCasing(module,P),z=FACTORY_LINE_Z[module];
    casing.geometry.translate(-27,0,z);
    solids.push(...casing.solids.map(s=>({...s,at:[s.at[0]-27,s.at[1],s.at[2]+z] as V3})));
    return casing;
  });
  for(const z of Object.values(FACTORY_LINE_Z)){
    conveyor(-24.85,29,z);
    cube([-27,FACTORY_CONVEYOR_TOP-.175,z],[4.3,.35,3.6],P.steel,true);
    lamp([-27,3.9,z-1.9],7,1.3,[-27,4.15,z-1.9]);
    for(const zz of [z-2.8,z+2.8])cube([2,.14,zz],[51,.025,.12],P.amber,false,0);
  }
  // Four-post raw gantry: full-length runway rails support the Z bridge travel,
  // then its twin cross-beams support the X trolley. Columns stay outside all
  // three raw bins, the hopper, and the player's south approach.
  const gantry=FACTORY_GANTRY;
  const railLength=gantry.endsZ[1]-gantry.endsZ[0],railCentreZ=(gantry.endsZ[0]+gantry.endsZ[1])/2;
  const railSpan=gantry.columnsX[1]-gantry.columnsX[0],railCentreX=(gantry.columnsX[0]+gantry.columnsX[1])/2;
  for(const x of gantry.columnsX){
    for(const z of gantry.endsZ){
      cube([x,.3,z],[1.05,.36,.95],P.floor,true,.045);
      cube([x,2.91,z],[.4,5.58,.4],P.teal,true,.035);
      cube([x,.74,z],[.48,.7,.48],P.cream,true,.035);
      for(const dx of [-.34,.34])for(const dz of [-.29,.29])
        cube([x+dx,.502,z+dz],[.09,.045,.09],P.steel,false,.01);
      const inward=z===gantry.endsZ[0]?1:-1;
      beam([x,4.55,z],[x,5.4,z+inward*.85],.11,P.teal);
      // Rubber end stops are beyond the legal bogie centres, not in their path.
      cube([x,gantry.railTop+.18,z],[.45,.36,.15],P.dark,false,.025);
    }
    cube([x,5.45,railCentreZ],[.16,.5,railLength],P.teal);
    for(const y of [5.15,gantry.railTop-.05])cube([x,y,railCentreZ],[.52,.1,railLength],P.teal,false,.02);
    cube([x,gantry.railTop-.025,railCentreZ],[.2,.05,railLength-.2],P.silver,false,.01);
  }
  for(const z of gantry.endsZ){
    cube([railCentreX,5.35,z],[railSpan,.3,.26],P.teal,false,.03);
    for(const x of gantry.columnsX){
      const inward=x===gantry.columnsX[0]?1:-1;
      beam([x,4.55,z],[x+inward*.85,5.35,z],.11,P.teal);
    }
  }
  for(let i=0;i<3;i++){
    cube([-42+i*3.2,.5,-16],[2.7,.8,2.8],P.dark,true);
    for(const z of [-17.4,-14.6])cube([-42+i*3.2,.95,z],[2.9,.8,.14],P.cream,true);
  }
  // Intake mouth has 2.3 m clear width: .72 m alignment tolerance plus the
  // largest raw half-width (.36 m) fits without passing through the rim.
  // The target remains the raw centre at y=1.1; the mouth lies below it.
  const hopperX=-37,hopperZ=-22,mouth=1.15,throat=.43;
  for(const side of [-1,1]){
    cube([hopperX+side*(mouth+.07),.84,hopperZ],[.14,.28,2.58],P.cream,true,.025);
    cube([hopperX,.84,hopperZ+side*(mouth+.07)],[2.3,.28,.14],P.cream,true,.025);
    cube([hopperX+side*.94,.34,hopperZ+.94],[.12,.44,.12],P.teal,true,.015);
    cube([hopperX+side*.94,.34,hopperZ-.94],[.12,.44,.12],P.teal,true,.015);
    b.face([[hopperX+side*mouth,.96,hopperZ-mouth],[hopperX+side*mouth,.96,hopperZ+mouth],
      [hopperX+side*throat,.49,hopperZ+throat],[hopperX+side*throat,.49,hopperZ-throat]],P.teal,[-side,.8,0]);
    b.face([[hopperX-mouth,.96,hopperZ+side*mouth],[hopperX+mouth,.96,hopperZ+side*mouth],
      [hopperX+throat,.49,hopperZ+side*throat],[hopperX-throat,.49,hopperZ+side*throat]],P.teal,[0,.8,-side]);
  }
  cube([hopperX,.46,hopperZ],[.86,.12,.86],P.dark);
  // Sorting tray meets the released blank and feeds directly onto the incline.
  cube([hopperX,FACTORY_RAW_TRANSFER_TOP-.06,hopperZ],[2.3,.12,2.3],P.dark,true,.015);
  cube([-35.3,FACTORY_RAW_TRANSFER_TOP-.06,hopperZ],[3.2,.12,1.25],P.dark,true,.015);
  for(const z of [hopperZ-.7,hopperZ+.7])cube([-35.3,.87,z],[3.2,.2,.12],P.teal,true,.02);
  for(const x of [-35.8,-33.9])for(const z of [hopperZ-.55,hopperZ+.55])cube([x,.51,z],[.12,.78,.12],P.steel,true,.015);
  // Main assembly fixture and overhead crane rails.
  for(const x of FACTORY_ASSEMBLY_RAIL.x){
    cube([x,9.95,1],[.18,.5,52],P.teal);
    for(const y of [9.68,10.15])cube([x,y,1],[.6,.1,52],P.teal);
    for(const z of FACTORY_ASSEMBLY_RAIL.z){
      cube([x,4.96,z],[.38,9.68,.38],P.teal,true);
      cube([x,.32,z],[.9,.4,.9],P.floor,true);
      cube([x,10.38,z],[.6,.36,.2],P.dark);
    }
  }
  // Physical controls: waist-height consoles, feet clear, one primary lever per station.
  for(const s of FACTORY_STATIONS){
    if(s.id==='release'){
      // The printer already has physical controls. A second generic console
      // previously occupied its output tray and ran a lamp pole through the card.
      cube([44.15,.18,22.4],[.38,.12,.38],P.teal,true,.025);
      lamp([43,2.8,22.4],5,.85,[44.15,.24,22.4]);
      continue;
    }
    const [x,y,z]=s.at,dx=Math.sin(s.yaw),dz=Math.cos(s.yaw),cx=x+dx*.9,cz=z+dz*.9;
    cube([cx,y+.48,cz],[.75,.82,.55],P.teal,true);
    cube([cx,y+.94,cz],[.86,.13,.64],P.steel);
    bar(b,[cx,y+.98,cz],[cx+dx*.12,y+1.24,cz+dz*.12],.04,P.silver,8);
    cube([cx+dx*.12,y+1.27,cz+dz*.12],[.16,.13,.16],P.amber);
    lamp([cx,y+2.6,cz+1.1],5,.65,[cx-.3,y+.94,cz]);
  }
  // A broad connecting apron leads to two translated copies of one physical course.
  for(const offset of [0,FACTORY_LANE_OFFSET]){
    const course=FACTORY_COURSE_LOCAL.map(p=>[p[0]+offset,p[1],p[2]] as V3),left:V3[]=[],right:V3[]=[];
    course.forEach((p,i)=>{
      const a=course[Math.max(0,i-1)],c=course[Math.min(course.length-1,i+1)],dx=c[0]-a[0],dz=c[2]-a[2],l=Math.hypot(dx,dz);
      left.push([p[0]-dz/l*1.5,p[1],p[2]+dx/l*1.5]);right.push([p[0]+dz/l*1.5,p[1],p[2]-dx/l*1.5]);
    });
    for(let i=1;i<course.length;i++){
      const points=[left[i-1],right[i-1],right[i],left[i]];
      // Flat course sections are already inside the continuous courtyard slab.
      // A second top at y=.12 produces visible z-fighting and duplicate contacts.
      // Only the raised/ramped sections need their own mesh and collider.
      if(points.every(p=>Math.abs(p[1]-.12)<1e-6))continue;
      slab(points,.25);
    }
    // Low bumps are actual geometry/collision and are shared identically by both lanes.
    for(let z=3;z<=7;z+=.65){
      const a:V3=[61+offset,.12,z],c:V3=[63+offset,.12,z];
      walk.face([a,c,[63+offset,.22,z+.22],[61+offset,.22,z+.22]],P.dark,[0,1,-.4]);
      walk.face([[61+offset,.22,z+.22],[63+offset,.22,z+.22],[63+offset,.12,z+.44],[61+offset,.12,z+.44]],P.dark,[0,1,.4]);
    }
    railing([53+offset,.12,-7],[53+offset,.12,12]);
    lamp([54+offset,2.8,-6],8,1);lamp([63+offset,2.8,10],8,1);
    cube([56+offset,3,-7],[6,.25,.25],P.teal);
    for(const x of [53,59])cube([x+offset,1.55,-7],[.15,3,.15],P.teal,true);
  }
  // Return line is physically separated from the visitor cross-aisle.
  conveyor(32,89,20,.85);
  for(const x of [35,48,68,90])lamp([x,2.7,23],7,.9);
  // The live printer stands beside the return conveyor, never through its rollers.
  cube([37,.4,24],[5.2,.55,2.6],P.teal,true);
  // The completed companion drives from the dock onto a flush display lane.
  slab([[36.2,.675,25.3],[37.8,.675,25.3],[37.8,.12,27.5],[36.2,.12,27.5]],.1);
  for(const x of [36.12,37.88])beam([x,.72,25.3],[x,.165,27.5],.035,P.amber);
  for(const z of [26.9,30.6])cube([39,.138,z],[14,.025,.08],P.amber,false,0);
  const detail=buildFactoryProductionDetail(P);
  const structure=b.build(),facade=buildFactoryFacade(P),fixture=buildFactoryFixture(P),routing=buildFactoryRoutingGeometry(P);
  const geometry=mergeGeometries([structure,facade.geometry,fixture.geometry,routing.geometry,detail.geometry,...casings.map(c=>c.geometry)],false);
  structure.dispose();facade.geometry.dispose();fixture.geometry.dispose();
  routing.geometry.dispose();detail.geometry.dispose();
  casings.forEach(c=>c.geometry.dispose());
  if(!geometry)throw new Error('Factory detail attributes must match the structure');
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  solids.push(...facade.solids,...fixture.solids,...routing.solids,...detail.solids);
  lamps.push(...detail.lamps);
  const roofs=roof.build(),surface=walk.build();
  return {geometry,roofs,surface,solids,lamps,triangles:b.triangles+facade.triangles+fixture.triangles+routing.triangles+detail.triangles+roof.triangles+walk.triangles+casings.reduce((n,c)=>n+c.triangles,0)};
}
