/** Local rail visuals. New Builders bind the complete, unchanged collision source. */
import {Builder,S,bar,box,cyl,lathe,type Surf} from './WorldStreetGeometry';
import {bindStreetFacilityCollision} from './WorldStreetFacilityCraft';
import {FACILITY_WOOD_TILE,facilityCraftEnabled} from './WorldFacilitySurface';
export const railCraftEnabled=()=>facilityCraftEnabled()&&(typeof window==='undefined'||
 (new URLSearchParams(window.location.search).get('railCraft')!=='baseline'&&new URLSearchParams(window.location.search).get('facilityCraft')!=='legacy'));
const part=(B:Builder,name:string,draw:()=>void)=>{B.part(name,false);draw();};
const cap=(B:Builder,half:number,top:number)=>{
 box(B,[-half,top-.012,-half],[half,top,half],S.creamPaint,.004);
 for(const sign of[-1,1]){
  box(B,[-half,top-.032,sign*(half-.003)-.003],[half,top-.008,sign*(half-.003)+.003],S.creamPaint,.002);
  box(B,[sign*(half-.003)-.003,top-.032,-half+.006],[sign*(half-.003)+.003,top-.008,half-.006],S.creamPaint,.002);
 }
};
const clone=(source:Builder)=>{const B=new Builder();for(const key of['pos','nrm','col','mat','suv','idx']as const)B[key]=[...source[key]];
 B.parts=source.parts.map(p=>({...p}));B.cell=[...source.cell];return B;};

/** Corner UVs keep the cylinder's seam on the back/underside without triangles
 * interpolating across a whole wrapped image. Named parts survive the split. */
function surfaces(source:Builder,woodAxis:'x'|'y'|null){
 const B=new Builder();B.cell=[...source.cell];
 for(const p of source.parts){const end=p.end<0?source.pos.length/3:p.end;B.part(p.name,false);
  for(let at=0;at<source.idx.length;at+=3){const ids=source.idx.slice(at,at+3);if(ids[0]<p.start||ids[0]>=end)continue;
   const corners=ids.map(i=>{const v=source.pos.slice(i*3,i*3+3),n=source.nrm.slice(i*3,i*3+3),m=source.mat.slice(i*4,i*4+4);
    const wood=!!woodAxis&&m[1]===0&&m[0]>=.73&&!p.name.includes('endgrain')&&Math.abs(n[woodAxis==='x'?0:1])<(woodAxis==='y'?.75:.85);
    const bare=Math.abs(m[0]-.58)<.001&&Math.abs(m[1]-.3)<.001||Math.abs(m[0]-.64)<.001&&Math.abs(m[1]-.32)<.001;
    m[3]=wood?-1:bare?-3:m[1]>.1?-2:0;
    const radius=woodAxis==='x'?.085:.1,period=2*Math.PI*radius/FACILITY_WOOD_TILE[1];
    let angle=woodAxis==='x'?Math.atan2(v[2],v[1]-.085)+Math.PI:Math.atan2(v[2],v[0])+Math.PI/2;
    angle=(angle%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
    return{i,v,n,m,period,uv:wood?[v[woodAxis==='x'?0:1]/FACILITY_WOOD_TILE[0],angle*radius/FACILITY_WOOD_TILE[1]]:source.suv.slice(i*2,i*2+2)};
   });
   if(corners.every(c=>c.m[3]===-1)){
    const values=corners.map(c=>c.uv[1]),period=corners[0].period;
    if(Math.max(...values)-Math.min(...values)>period/2)for(const c of corners)if(c.uv[1]<period/2)c.uv[1]+=period;
   }
   for(const c of corners){B.idx.push(B.pos.length/3);B.pos.push(...c.v);B.nrm.push(...c.n);B.col.push(...source.col.slice(c.i*3,c.i*3+3));B.mat.push(...c.m);B.suv.push(...c.uv);}
  }
 }
 return B;
}
function seawall(B:Builder,span:number,lod:0|1){
 part(B,'post',()=>{box(B,[-.045,-.5,-.045],[.045,lod===0?.943:.968,.045],S.creamPaint,lod===0?.009:0);
  // The cap supports the underside of the tube coupling; it no longer cuts
  // halfway through the handrail as a solid plastic-looking block.
  if(lod===0){cap(B,.06,.965);box(B,[-.095,.005,-.095],[.095,.03,.095],S.galv,.007);box(B,[-.063,.03,-.063],[.063,.105,.063],S.creamPaint,.006);}});
 part(B,'handrail',()=>{
  bar(B,[0,1,0],[span,1,0],.034,S.creamPaint,lod===0?12:5);
  bar(B,[0,.55,0],[span,.55,0],.022,S.creamPaint,lod===0?8:4);
  if(lod===0){bar(B,[0,.14,0],[span,.14,0],.023,S.creamPaint,8);
   for(const y of[.14,.55,1])bar(B,[-.055,y,0],[.055,y,0],y===1?.041:.029,S.galv,10);}
 });
 if(lod===0)part(B,'balusters',()=>{for(let i=1;i<=3;i++)bar(B,[span*i/4,.14,0],[span*i/4,.98,0],.014,S.creamPaint,8);});
}
/** span comes from actual adjacent placement matrices, never another run config. */
export function craftSeawallBay(original:Builder,span:number,lod:0|1){
 if(!railCraftEnabled())return original;if(!Number.isFinite(span)||span<=0)throw new Error('Invalid actual seawall span');
 const B=new Builder();seawall(B,span,lod);return bindStreetFacilityCollision(surfaces(B,null),original);
}
export function craftSeawallEnd(original:Builder,lod:0|1){
 if(!railCraftEnabled())return original;const B=lod===0?new Builder():clone(original);
 if(lod===0){part(B,'terminal.post',()=>{box(B,[-.06,-.5,-.06],[.06,1.04,.06],S.creamPaint,.01);cap(B,.075,1.06);
  box(B,[-.075,.005,-.075],[.075,.03,.075],S.galv,.007);});
  part(B,'terminal.sockets',()=>{for(const y of[.14,.55,1])bar(B,[-.055,y,0],[0,y,0],y===1?.041:.029,S.galv,10);});}
 return bindStreetFacilityCollision(surfaces(B,null),original);
}
export function craftTimberPost(original:Builder,lod:0|1){
 if(!railCraftEnabled())return original;const B=lod===0?new Builder():clone(original);
 if(lod===0){part(B,'post',()=>lathe(B,[[.1,-.45],[.105,-.02],[.1,.43],[.096,.50],[.07,.55],[0,.57]],S.woodMid,{sides:12,smooth:40}));
  part(B,'post.saddle-seat',()=>box(B,[-.115,.535,-.075],[.115,.57,.075],S.iron,.005));
  part(B,'post.saddle-cheeks',()=>{for(const z of[-1,1])box(B,[-.105,.50,z*.09-.012],[.105,.685,z*.09+.012],S.iron,.005);});
  // Transverse anchor crosses both cheeks and the timber post below the seat.
  // It is not an unsupported pin in the air above the shortened rail end.
  part(B,'post.anchor-pin',()=>bar(B,[0,.535,-.105],[0,.535,.105],.017,S.iron,8));
 }
 return bindStreetFacilityCollision(surfaces(B,'y'),original);
}
const endLight:Surf={color:'#B59670',rough:.84,metal:0},endDark:Surf={color:'#9C7B54',rough:.86,metal:0};
function endgrain(B:Builder,x:number,direction:number){
 B.tr([x, .085,0],[0,0,direction*Math.PI/2],()=>{
  lathe(B,[[0,0],[.025,0],[.029,0],[.047,0],[.051,0],[.074,0],[.074,.002],[0,.002]],endLight,
   {sides:12,caps:false,smooth:0,surfs:[endLight,endDark,endLight,endDark,endLight,endLight,endLight]});
 });
}
export function craftTimberBeam(original:Builder,len:number,lod:0|1){
 if(!railCraftEnabled())return original;const B=lod===0?new Builder():clone(original);
 if(lod===0){part(B,'beam.long-grain',()=>B.tr([-len/2,.085,0],[0,0,-Math.PI/2],()=>
   lathe(B,[[.074,0],[.085,.018],[.085,len-.018],[.074,len]],S.woodMid,{sides:12,smooth:40,caps:false})));
  part(B,'beam.endgrain-left',()=>endgrain(B,-len/2,-1));part(B,'beam.endgrain-right',()=>endgrain(B,len/2,1));
 }
 return bindStreetFacilityCollision(surfaces(B,'x'),original);
}
