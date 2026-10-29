import { BoxGeometry, BufferGeometry, CylinderGeometry, Euler, Float32BufferAttribute, Matrix4, Quaternion, TorusGeometry, Vector2,Vector3,ShapeUtils } from 'three';
import { TriMeshFlags } from '@dimforge/rapier3d-compat';
import { mergeBatch, toBatch, type Emit } from './WorldParkKit';
import { EXCHANGE_HALL,EXCHANGE_COLUMNS,exchangeBoxes,exchangePlatformSlabs } from './alpha-exchange-layout';
import { EXCHANGE_PLAY_PROPS,EXCHANGE_PLAY_STATIONS,EXCHANGE_SECOND_DESK,EXCHANGE_ARCHIVE_DRAWERS } from './alpha-exchange-play-layout';
import { exchangeChamferBox,exchangeSurface,bakeExchangeWorklights,EXCHANGE_BANK_LAMPS } from './alpha-exchange-craft';
import type { Vec3 } from './types';

export interface ExchangeCollision {vertices:Float32Array;indices:Uint32Array;flags?:TriMeshFlags}
/** Local to the unchanged entrance origin. Visible and collider faces share source vertices.
 * Caller owns/disposes the two merged geometries, as with the original model. */
export function buildAlphaExchangeGeometry() {
  const parts:BufferGeometry[]=[],glass:BufferGeometry[]=[],support:number[]=[],solid:number[]=[];
  const add=(g:BufferGeometry,color:string,p:Vec3=[0,0,0],rotation:Vec3=[0,0,0],kind:'solid'|'surface'|'visual'='solid',emit:Emit=[0,0,0],window=false)=>{
    const m=new Matrix4().compose(new Vector3(...p),new Quaternion().setFromEuler(new Euler(...rotation)),new Vector3(1,1,1));
    const baked=toBatch(g,m,color,emit),v=baked.getAttribute('position'),n=baked.getAttribute('normal');g.dispose();
    const response=exchangeSurface(color),surface=new Float32Array(v.count*2);
    for(let i=0;i<v.count;i++){surface[i*2]=response[0];surface[i*2+1]=response[1];}
    baked.setAttribute('aExchangeSurface',new Float32BufferAttribute(surface,2));
    if(kind!=='visual')for(let i=0;i<v.count;i+=3){const list=kind==='surface'&&n.getY(i)>.7?support:solid;for(let k=0;k<3;k++)list.push(v.getX(i+k),v.getY(i+k),v.getZ(i+k));}
    (window?glass:parts).push(baked);
  };
  const box=(p:Vec3,s:Vec3,c:string,kind:'solid'|'surface'|'visual'='solid',yaw=0,emit:Emit=[0,0,0])=>add(new BoxGeometry(...s),c,p,[0,yaw,0],kind,emit);
  const chamfer=(p:Vec3,s:Vec3,c:string,kind:'solid'|'visual'='solid',yaw=0,bevel=.025,emit:Emit=[0,0,0])=>add(exchangeChamferBox(s,bevel),c,p,[0,yaw,0],kind,emit);
  const rod=(a:Vec3,b:Vec3,r:number,c:string,kind:'solid'|'visual'='solid')=>{
    const av=new Vector3(...a),bv=new Vector3(...b),d=bv.clone().sub(av),g=new CylinderGeometry(r,r,d.length(),6);
    g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.normalize()));add(g,c,av.add(bv).multiplyScalar(.5).toArray() as Vec3,[0,0,0],kind);
  };
  const raw=(p:number[],c:string,kind:'surface'|'solid'|'visual'='solid',emit:Emit=[0,0,0])=>{
    if(!p.length)return;const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.computeVertexNormals();add(g,c,[0,0,0],[0,0,0],kind,emit);
  };
  const ring=(cx:number,cz:number,inner:number,outer:number,y:number,depth:number,c:string,n=48,kind:'solid'|'visual'='solid',emit:Emit=[0,0,0])=>{
    const p:number[]=[];
    for(let i=0;i<n;i++) {
      const a=i*Math.PI*2/n,b=(i+1)*Math.PI*2/n,v=(t:number,r:number,h:number):Vec3=>[cx+r*Math.cos(t),h,cz+r*Math.sin(t)];
      const a0=v(a,inner,y),a1=v(a,outer,y),b1=v(b,outer,y),b0=v(b,inner,y),a2=v(a,outer,y-depth),b2=v(b,outer,y-depth),a3=v(a,inner,y-depth),b3=v(b,inner,y-depth);
      p.push(...a0,...b1,...a1,...a0,...b0,...b1,...a1,...b1,...b2,...a1,...b2,...a2,...a0,...a3,...b3,...a0,...b3,...b0);
    }raw(p,c,kind,emit);
  };
  const rail=(a:Vec3,b:Vec3,height=1.1)=>{
    const d=Math.hypot(...b.map((v,i)=>v-a[i])),n=Math.ceil(d/1.4);
    rod([a[0],a[1]+height,a[2]],[b[0],b[1]+height,b[2]],.06,'#b8975a');
    rod([a[0],a[1]+height*.48,a[2]],[b[0],b[1]+height*.48,b[2]],.035,'#927446');
    for(let i=0;i<=n;i++){const t=i/n,p=a.map((v,k)=>v+(b[k]-v)*t) as Vec3;rod(p,[p[0],p[1]+height,p[2]],.04,'#aa8950');}
  };
  const slope=(x0:number,x1:number,z0:number,z1:number,y0:number,y1:number,c='#947451')=>{
    const a:Vec3=[x0,y0,z0],b:Vec3=[x1,y0,z0],d:Vec3=[x0,y1,z1],e:Vec3=[x1,y1,z1];
    raw(z1<z0?[...a,...b,...e,...a,...e,...d]:[...a,...e,...b,...a,...d,...e],c,'surface',[0,.09,1]);
    for(const [u,v]of[[a,d],[b,e]])raw([...u,...v,u[0],u[1]-.22,u[2],...v,v[0],v[1]-.22,v[2],u[0],u[1]-.22,u[2]],'#765a3d');
  };
  const rampWedge=(x0:number,x1:number,z0:number,z1:number,y0:number,y1:number,c:string)=>{
    const a:Vec3=[x0,y0,z0],b:Vec3=[x1,y0,z0],d:Vec3=[x0,y1,z1],e:Vec3=[x1,y1,z1];
    const low=Math.min(y0,y1),lowZ=y0<y1?z1:z0;
    raw([...a,...b,...e,...a,...e,...d],c,'surface',[0,.09,1]);
    raw([...a,...d,x0,low,lowZ,...b,x1,low,lowZ,...e],c);
  };
  // Butt-jointed slab ownership preserves the existing bridge/park seam exactly.
  for(const slab of exchangePlatformSlabs()) {
    const top:number[]=[],bottom:number[]=[],walls:number[]=[];
    for(const ids of ShapeUtils.triangulateShape(slab.outline.map(p=>new Vector2(...p)),[])) {
      const p=ids.map(i=>[slab.outline[i][0],slab.y,slab.outline[i][1]] as Vec3),ny=(p[1][2]-p[0][2])*(p[2][0]-p[0][0])-(p[1][0]-p[0][0])*(p[2][2]-p[0][2]);
      const v=ny>0?p:[p[0],p[2],p[1]];top.push(...v[0],...v[1],...v[2]);
      for(const i of [0,2,1])bottom.push(v[i][0],slab.y-slab.depth,v[i][2]);
    }
    slab.outline.forEach((a,i)=>{if(!slab.walls[i])return;const b=slab.outline[(i+1)%slab.outline.length],p:Vec3=[a[0],slab.y,a[1]],q:Vec3=[b[0],slab.y,b[1]],r:Vec3=[b[0],slab.y-slab.depth,b[1]],s:Vec3=[a[0],slab.y-slab.depth,a[1]];walls.push(...p,...q,...r,...p,...r,...s);});
    raw(top,slab.color,'surface',[0,.09,1]);raw(bottom,slab.color);raw(walls,slab.color);
  }
  for(const b of exchangeBoxes())add(new BoxGeometry(...b.size),b.color,b.center,b.rotation??[0,0,0],b.surface?'surface':'solid');
  // Broad visible steps are complemented by continuous entrance and pit side routes.
  // Their central stair cores are cut out in the slab layout: these visible stone
  // wedges own both the walk surface and collider, with no hidden stair risers.
  rampWedge(-3,3,-5,-7,0,.45,'#d4c4a5');
  rampWedge(-2,2,-11,-12.8,.45,0,'#c9b99a');
  slope(-14.2,-10.5,-5,-7,0,.45);slope(10.5,14.2,-5,-7,0,.45);
  slope(-8.8,-6.4,-11,-17,.45,0);
  // Full-height stone retaining faces hide the earth below the raised walk. The old
  // omitted slab edges exposed a 0.45 m opening around the otherwise paved pit.
  const pitRiser=(a:Vec3,b:Vec3)=>raw([...a,...b,b[0],.45,b[2],...a,b[0],.45,b[2],a[0],.45,a[2]],'#b9a583');
  pitRiser([-8.8,0,-11],[-8.8,0,-28]);pitRiser([8.8,0,-28],[8.8,0,-11]);
  pitRiser([-8.8,0,-28],[-3,0,-28]);pitRiser([3,0,-28],[8.8,0,-28]);
  // A 6 m wide, 2.4 m long rear ramp connects directly to the bell walk. Side
  // cheeks close the wedge to the pit floor; no vertical face crosses its top joint.
  raw([-3,0,-25.6,3,0,-25.6,3,.45,-28,-3,0,-25.6,3,.45,-28,-3,.45,-28],'#c9b99a','surface',[0,.09,1]);
  raw([-3,0,-25.6,-3,.45,-28,-3,0,-28,3,0,-25.6,3,0,-28,3,.45,-28],'#b9a583');
  slope(-17,-14.4,-8,-30,.45,5.2);
  rail([-16.95,.45,-8],[-16.95,5.2,-30]);rail([-14.45,.45,-8],[-14.45,5.2,-30]);
  rail([-8.75,.45,-11],[-8.75,0,-17],.9);
  // East gallery stair has broad treads and an open top landing; west ramp is the smooth route.
  for(let i=0;i<22;i++){
    const y=.45+(i+1)*4.75/22,z=-10.8-(i+.5)*19.2/22;
    box([15.7,y-.12,z],[2.6,.24,19.2/22],'#bba88b','surface');
    box([15.7,y+.012,z+19.2/44-.04],[2.48,.024,.055],'#d7c5a4','visual');
  }
  rail([14.45,.45,-10.8],[14.45,5.2,-30]);rail([16.95,.45,-10.8],[16.95,5.2,-30]);
  // Raised exit landing returns to the original local ground level outside the building.
  const exitTop=[20.8,.45,-35,23.5,0,-35,23.5,0,-30,20.8,.45,-30];
  raw([...exitTop.slice(0,3),...exitTop.slice(6,9),...exitTop.slice(3,6),...exitTop.slice(0,3),...exitTop.slice(9,12),...exitTop.slice(6,9)],'#bba98a','surface');
  // Deep limestone bays, faceted column drums and walnut window reveals.
  for(const side of [-1,1])for(const z of EXCHANGE_COLUMNS.bays) {
    if(side===1&&z===-32)continue;
    add(new CylinderGeometry(EXCHANGE_COLUMNS.shaftTopRadius,EXCHANGE_COLUMNS.shaftBottomRadius,10.7,12),'#dfd2ba',[side*EXCHANGE_COLUMNS.x,6.7,z]);
    for(const y of [1.24,1.48,11.9,12.15]){const r=y<2?EXCHANGE_COLUMNS.lowerDrumRadius:EXCHANGE_COLUMNS.upperDrumRadius;add(new CylinderGeometry(r,r,.16,12),'#c3b396',[side*EXCHANGE_COLUMNS.x,y,z]);}
    for(let i=0;i<8;i++){const a=i*Math.PI/4;rod([side*EXCHANGE_COLUMNS.x+.6*Math.cos(a),1.7,z+.6*Math.sin(a)],[side*EXCHANGE_COLUMNS.x+.52*Math.cos(a),11.65,z+.52*Math.sin(a)],.035,'#c4b69d','visual');}
  }
  const windowBay=(side:number,z:number,width:number,low=2.3)=>{
    const x=side*17.55,high=12.2;
    add(new BoxGeometry(.12,high-low,width),'#c8b890',[x,(high+low)/2,z],[0,0,0],'solid',[.025,.12,1],true);
    for(const zz of [z-width/2,z,z+width/2])box([x,(high+low)/2,zz],[.38,high-low,.16],'#725c43');
    for(const y of [low,5.65,9.2,high])if(y>=low)box([x,y,z],[.5,.18,width+.3],'#9c8057');
    // Deep stone jambs and a flattened arch retain readable thickness from the entrance.
    for(const zz of [z-width/2-.12,z+width/2+.12])box([x,7.2,zz],[.95,10.1,.36],'#d5c6aa');
    for(let i=0;i<10;i++){const a=i*Math.PI/10,b=(i+1)*Math.PI/10;rod([x,10.15+2.05*Math.sin(a),z+width/2*Math.cos(a)],[x,10.15+2.05*Math.sin(b),z+width/2*Math.cos(b)],.19,'#dfd0b4');}
  };
  for(const side of [-1,1]){
    for(const z of [-4,-12,-20])windowBay(side,z,6.5);
    windowBay(side,-27,4.5);windowBay(side,-37.5,4.1);
    windowBay(side,-32.5,4.7,side===1?4.4:2.3);
  }
  // Open upper structure: thick coffers, no opaque ceiling or hidden camera collider.
  for(const x of [-10.5,-3.5,3.5,10.5])for(const z of [-5.5,-12.5,-19.5,-26.5,-33.5]){
    box([x,13.1,z-3.12],[6.58,.16,.18],'#ae8c5d');
    for(const side of [-1,1])box([x+side*3.12,13.1,z],[.18,.16,6.24],'#ae8c5d');
  }
  // Gallery guardrails leave only the two genuine access openings unrailed.
  for(const side of [-1,1]) {
    const inner=side*10,outer=side*13.4;
    rail([inner,5.2,-17],[inner,5.2,-35.8]);
    rail([inner,5.2,-17],[outer,5.2,-17]);
    rail([outer,5.2,-17],[outer,5.2,-30]);
    rail([outer,5.2,-31.6],[outer,5.2,-35.8]);
    rail([side*17,5.2,-31.6],[outer,5.2,-31.6]);
    rail([side*14.4,5.2,-30],[outer,5.2,-30]);
    for(const z of [-18,-26,-34]){
      box([side*10.35,2.65,z],[.48,4.75,.55],'#a68d69');
      box([side*10.35,4.78,z],[.85,.3,1.05],'#c4ad86');
    }
    box([side*11.7,4.94,-26.4],[3.4,.18,18.8],'#68503a');
  }
  rail([-10,5.2,-35.8],[10,5.2,-35.8]);
  rail([-17.35,5.2,-35.8],[-17.35,5.2,-39.7]);
  rail([17.35,5.2,-35.8],[17.35,5.2,-39.7]);
  // Low pit parapets clarify the level change while preserving stairs and ramp openings.
  for(const side of [-1,1]){
    box([side*8.75,.68,-22.5],[.18,.46,10.6],'#b9a583');
    rod([side*8.75,.96,-17.2],[side*8.75,.96,-27.8],.055,'#b8975a');
    box([side<0?-5.15:6.4,.68,-11],[side<0?2.1:4.6,.46,.18],'#b9a583');
  }
  // Stone and wood joints are medium-scale inlays, not hundreds of tiny parquet meshes.
  for(const x of [-6,-3,0,3,6])for(const z of [-4,-1])box([x,.006,z],[.025,.012,2.85],'#8f7b5c','visual');
  for(const side of [-1,1])for(const z of [-13,-17,-21,-25])box([side*11.5,.458,z],[5,.016,.035],'#70583e','visual');
  ring(0,-20,5.65,5.75,.012,.012,'#c8b48b',64,'visual');
  // Bounded warm fixture surfaces remain in the existing batch/night uniform.
  for(const [x,z] of [[-7,-18],[7,-31]]) {
    rod([x,13.3,z],[x,6.6,z],.035,'#8f7548','visual');
    box([x,6.5,z],[1.1,.12,1.1],'#81633e','visual');
    box([x,6.2,z],[.7,.48,.7],'#efd8a8','visual',0,[.08,1.1,1]);
    box([x,5.93,z],[.95,.08,.95],'#9f8050','visual');
  }
  for(const side of [-1,1])for(const z of [-4,-12,-20,-28,-37]) {
    rod([side*16.75,3.3,z],[side*16.2,3.3,z],.07,'#8f7548');
    box([side*16.15,3.65,z],[.32,.85,.36],'#efd8a8','visual',0,[.15,1.25,1]);
    for(const dx of [-.2,.2])for(const dz of [-.22,.22])rod([side*16.15+dx,3.2,z+dz],[side*16.15+dx,4.1,z+dz],.028,'#8a7045','visual');
    if(z<-17)box([side*11.65,5.27,z],[2.25,.08,.3],'#d8bb82','visual',0,[.03,.28,1]);
  }
  // Entrance pediment, substantial mouldings and two fabric Alpha banners.
  raw([-5.2,7,1.3,5.2,7,1.3,0,9.1,1.3,-5.2,7,.15,0,9.1,.15,5.2,7,.15],'#ccbca0');
  rod([-5.2,7.03,1.35],[0,9.13,1.35],.18,'#e0d0b5');rod([0,9.13,1.35],[5.2,7.03,1.35],.18,'#e0d0b5');
  box([0,7.05,.7],[10.8,.34,1.4],'#dfd0b5');
  for(const side of [-1,1]) {
    box([side*5.25,4,.95],[1.25,7.6,1.25],'#dfd2ba');
    box([side*5.25,.35,.95],[1.7,.7,1.65],'#b8ab92');
    box([side*5.25,7.75,.95],[2.05,.4,1.7],'#e3d5bc');
    box([side*9.4,4.4,1.115],[2,4.6,.07],'#304652','visual');
    for(let i=0;i<3;i++)box([side*9.4-.45+i*.45,3.1+i*.35,1.17],[.28,.65+i*.7,.035],'#be9b57','visual');
  }
  // One circular walnut trading island, two working positions and a central paper ticker.
  const desk=EXCHANGE_PLAY_PROPS.desk;
  ring(0,-20,desk.innerRadius,desk.outerRadius-.1,.96,.91,'#5a4230',48,'solid',[0,.045,0]);
  ring(0,-20,desk.innerRadius-.1,desk.outerRadius,desk.top,.12,'#987348',48,'solid',[0,.1,1]);
  ring(0,-20,desk.outerRadius-.12,desk.outerRadius-.07,.22,.07,'#b2945a',48,'visual');
  ring(0,-20,desk.outerRadius-.015,desk.outerRadius+.005,1.025,.025,'#b8975a',64,'visual');
  // Joinery has a raised frame, a recessed field and a narrow shadow line. Its
  // chord stays inside the counter lip; the existing body still owns the collision.
  for(let i=0;i<24;i++) {
    const a=i*Math.PI/12,yaw=Math.PI/2-a,r=desk.outerRadius-.095;
    const at=(u:number,y:number,depth=0):Vec3=>[r*Math.cos(a)+u*Math.cos(yaw)+depth*Math.sin(yaw),y,-20+r*Math.sin(a)-u*Math.sin(yaw)+depth*Math.cos(yaw)];
    chamfer(at(0,.57),[1.12,.61,.065],i%3===0?'#715337':'#886440','visual',yaw,.018,[0,.075,1]);
    box(at(0,.57,.037),[.91,.41,.018],'#5a4230','visual',yaw, [0,.06,1]);
    for(const u of [-.5,.5])box(at(u,.57,.045),[.045,.51,.025],'#9a7952','visual',yaw);
    for(const y of [.32,.82])box(at(0,y,.045),[1.04,.035,.025],'#9a7952','visual',yaw);
  }
  add(new CylinderGeometry(1.15,1.35,.32,12),'#b8a17b',[0,.16,-20]);
  box([0,.82,-20],[1.2,1.3,.9],'#3b4d47');
  box([0,1.56,-20],[1.48,.22,1.12],'#b8975a');
  for(const x of [-.48,.48])rod([x,1.7,-19.95],[x,2.7,-19.95],.065,'#6e765f');
  rod([-.57,2.72,-19.95],[.57,2.72,-19.95],.09,'#b8975a');
  box([0,2.23,-19.87],[.58,.9,.025],'#e2d7be','visual');
  for(let i=0;i<6;i++)box([0,2.56-i*.12,-19.85],[.36,.02,.01],'#8f9278','visual');
  // Only two CRTs, one per actual working position. No decorative terminal rows.
  for(const s of [EXCHANGE_PLAY_STATIONS.desk,EXCHANGE_SECOND_DESK]) {
    const x=s.stand[0];
    chamfer([x,1.4,-16.12],[.78,.62,.62],'#c1b69c','solid',0,.045);
    chamfer([x,1.09,-16.12],[.48,.1,.45],'#847d68','solid',0,.018);
    box([x,1.43,-15.794],[.64,.43,.035],'#203d34','visual',0,[.025,.1,0]);
    chamfer([x,1.09,-15.66],[.76,.055,.24],'#c8bea7','solid',0,.012);
    for(let row=0;row<3;row++)for(let col=0;col<9;col++)box([x-.28+col*.07,1.124,-15.73+row*.065],[.052,.018,.039],'#807968','visual');
    for(let i=0;i<5;i++)box([x+.391,1.36+i*.045,-16.21],[.008,.016,.24],'#665e4c','visual');
    add(new CylinderGeometry(.028,.028,.013,8),'#b8975a',[x+.27,1.19,-15.799],[Math.PI/2,0,0],'visual');
  }
  // Two banker lamps sit on the inner worktop, clear of both hand trajectories.
  // Their finite luminous liners use the existing night channel, not new lights.
  for(const [x,,z] of EXCHANGE_BANK_LAMPS) {
    add(new CylinderGeometry(.22,.27,.06,16),'#b8975a',[x,1.08,z],[0,0,0],'solid');
    rod([x,1.11,z],[x,1.69,z],.032,'#b8975a');
    rod([x-.34,1.68,z],[x+.34,1.68,z],.025,'#b8975a');
    chamfer([x,1.72,z+.01],[.88,.22,.34],'#486c54','solid',0,.085,[0,.06,0]);
    chamfer([x,1.616,z+.01],[.72,.025,.25],'#efd8a8','visual',0,.01,[.025,.85,1]);
    rod([x+.24,1.61,z+.07],[x+.24,1.39,z+.07],.009,'#b8975a','visual');
  }
  const slot=desk.ticketSlot;
  box([slot[0],slot[1]+.015,slot[2]],[.52,.035,.21],'#b8975a','visual');
  box([slot[0],slot[1]+.035,slot[2]+.025],desk.slotSize,'#253c35','visual');
  const a=EXCHANGE_PLAY_STATIONS.desk.slideStart,b=EXCHANGE_PLAY_STATIONS.desk.slideEnd;
  rod([a[0]-.12,a[1],a[2]],[b[0]+.12,b[1],b[2]],.028,'#c4a369','visual');
  for(const x of [a[0]-.12,b[0]+.12])box([x,1.075,a[2]],[.08,.07,.13],'#6b5b3e','visual');
  // Open archive wing: service counter, real ticket throat, index drawers and reading ledgers.
  const archive=EXCHANGE_PLAY_PROPS.archive;
  box([-11.7,.84,-19.31],[3.15,.78,1.15],'#5a4634');
  chamfer([-11.7,.9,-18.69],[2.65,.49,.08],'#5a4634','solid',0,.015);
  chamfer(archive.counter,archive.counterSize,'#9a7952','solid',0,.035);
  chamfer([-11.7,1.4,-19],[1.1,.3,.62],'#536359','solid',0,.045);
  box(archive.ticketSlot,archive.slotSize,'#233b33','visual');
  for(const x of [-12.08,-11.32])box([x,1.48,-18.7],[.08,.2,.16],'#b8975a','visual');
  box([-11.7,1.56,-18.72],[.84,.07,.18],'#b8975a','visual');
  box([-11.7,1.43,-18.63],[.79,.055,.28],'#b8975a','visual');
  // A shallow limestone surround makes the cabinets a room-sized destination.
  // Its outer x edges are -14.23/-9.87: both side routes retain their clear width.
  box([-12.05,2.26,-24.12],[4.3,3.62,.12],'#725c43');
  for(const x of [-14.16,-9.94])box([x,2.34,-23.7],[.14,3.78,.98],'#d5c6aa');
  box([-12.05,4.23,-23.7],[4.36,.18,1.02],'#dfd0b4');
  // Drawer reveals, proud frames and mounted pulls keep thickness at hand distance.
  for(const cx of [-13.1,-11]) {
    box([cx,1.93,-23.65],[1.95,2.96,.82],'#684e38');
    box([cx,.55,-23.59],[1.99,.2,.94],'#5a4634');
    for(const x of [cx-.93,cx,cx+.93])box([x,1.96,-23.175],[.065,2.82,.12],'#72583c');
    for(let row=0;row<=5;row++)box([cx,.49+row*.54,-23.175],[1.88,.045,.12],'#72583c');
    for(let row=0;row<5;row++)for(const side of [-1,1]) {
      const x=cx+side*.46,y=.76+row*.54;
      box([x,y,-23.19],[.85,.46,.12],row%2?'#90714c':'#9d8058');
      box([x,y+.08,-23.102],[.33,.145,.042],'#927446');
      box([x,y+.08,-23.075],[.29,.105,.015],'#d3c8aa');
      for(const dx of [-.13,.13])box([x+dx,y-.08,-23.092],[.055,.06,.1],'#927446');
      // Both open ends terminate inside the solid mounting feet; hidden caps
      // would add 240 redundant visible/collision triangles across the cabinet.
      add(new CylinderGeometry(.024,.024,.26,6,1,true),'#b8975a',[x,y-.08,-23.045],[0,0,Math.PI/2]);
    }
    box([cx,3.48,-23.65],[2.08,.14,1],'#a98b5b');
    // Upper files stay below the gallery and above reachable player space.
    box([cx,3.79,-24.015],[1.94,.48,.09],'#5a4634','visual');
    for(const x of [cx-.91,cx+.91])box([x,3.8,-23.65],[.075,.5,.7],'#72583c','visual');
    for(let i=0;i<10;i++) {
      const x=cx-.76+i*.165,h=.32+(i%3)*.065;
      box([x,3.55+h/2,-23.65],[.12,h,.57],['#61735b','#72583c','#9a7952','#536359'][i%4],'visual');
      box([x,3.55+h-.065,-23.355],[.075,.018,.025],'#c4a369','visual');
    }
    // Hood and warm underside use the shared night emission, without a real light.
    chamfer([cx,3.48,-23.08],[1.7,.1,.42],'#536359','solid',0,.018);
    box([cx,3.424,-23.04],[1.42,.012,.28],'#efd8a8','visual',0,[0,.72,1]);
  }
  // Four physical trays share the interaction anchors. Their foremost face is
  // z=-22.76, leaving the stand capsule and z>-22.65 aisle unobstructed.
  // Dynamic paper belongs to the interaction component, not this static batch.
  for(const {contact:[x,y,z]} of EXCHANGE_ARCHIVE_DRAWERS) {
    box([x,y-.035,z-.195],[.68,.04,.59],'#b8975a');
    box([x,y-.024,z+.085],[.68,.028,.03],'#927446');
    for(const dx of [-.325,.325])box([x+dx,y+.005,z-.195],[.03,.065,.59],'#927446');
    box([x,y+.055,-23.115],[.64,.105,.035],'#233b33');
  }
  for(let i=0;i<3;i++)box([-12.65,1.33+i*.08,-19.42],[.65,.075,.84],['#61735b','#7a5a43','#a98d58'][i],'visual',-.12+i*.07);
  // Clearing wing: a physical press with platen, guide columns, flywheel and output tray.
  const clearing=EXCHANGE_PLAY_PROPS.clearing;
  box([11.7,.84,-26.45],[3.15,.78,1.15],'#5a4634');chamfer(clearing.counter,clearing.counterSize,'#9a7952','solid',0,.035);
  chamfer(clearing.machineBase,clearing.machineSize,'#4e6158','solid',0,.035);
  for(const x of [11.23,12.17])rod([x,1.47,-26.45],[x,2.4,-26.45],.075,'#a78b56');
  box([11.7,2.43,-26.45],[1.17,.2,.5],'#4e6158');
  box([11.7,1.52,-26.38],[.56,.075,.48],'#b8975a');
  add(new TorusGeometry(.29,.055,6,16),'#b8975a',[10.9,1.95,-26.45]);
  for(let i=0;i<4;i++){const a=i*Math.PI/2;rod([10.9,1.95,-26.45],[10.9+.27*Math.cos(a),1.95+.27*Math.sin(a),-26.45],.035,'#92784b','visual');}
  box(clearing.receiptTray,[.8,.06,.42],'#b8975a','visual');
  for(const x of [11.28,12.12])box([x,1.52,-25.9],[.045,.12,.43],'#b8975a','visual');
  box([12.82,1.44,-26.52],[.38,.24,.43],'#293f37');
  box([12.82,1.57,-26.52],[.42,.04,.48],'#b8975a');
  // A shallow gallery console leaves the through-route clear. Its selector uses the same contact anchor.
  const review=EXCHANGE_PLAY_PROPS.review;
  box([-3,5.65,-39.04],[1.24,.9,.48],'#5a4634');
  chamfer(review.counter,review.counterSize,'#9a7952','solid',0,.025);
  box([-3,6.235,-39.04],[1.32,.025,.53],'#b8975a','visual');
  for(let i=0;i<4;i++)box([-3.42+i*.28,6.255,-39.15],[.055,.018,.13],'#354d43','visual');
  // Clock, board and floor bell form the rear focal axis. Dynamic bell/striker use the exported pivots.
  add(new CylinderGeometry(1.65,1.65,.3,48),'#b19254',EXCHANGE_HALL.clock,[-Math.PI/2,0,0]);
  add(new TorusGeometry(1.57,.12,8,48),'#c7a86b',[0,EXCHANGE_HALL.clock[1],EXCHANGE_HALL.clock[2]+.26]);
  box([0,5.45,-39.55],[11,.25,.65],'#856540');
  const bell=EXCHANGE_PLAY_PROPS.bell;
  for(const x of [-.56,.56])rod([x,1.5,-37.16],[x,bell.frameTop[1],-37.16],.075,'#b8975a');
  rod([-.65,bell.frameTop[1],-37.16],[.65,bell.frameTop[1],-37.16],.09,'#b8975a');
  rod([0,2.22,-37.16],[0,1.61,-36.66],.022,'#ab9057','visual');
  box([0,1.52,-36.66],[.25,.045,.17],'#72583c','visual');
  const collision=(p:number[],flags?:TriMeshFlags):ExchangeCollision=>({vertices:new Float32Array(p),indices:Uint32Array.from({length:p.length/3},(_,i)=>i),flags});
  // Coplanar floor diagonals are mesh seams, not physical ridges. Apply Rapier's
  // local adjacent-face normal correction without changing vertices or player tolerances.
  const body=mergeBatch(parts);bakeExchangeWorklights(body);
  return {body,glass:mergeBatch(glass),colliders:{surface:collision(support,TriMeshFlags.FIX_INTERNAL_EDGES),solid:collision(solid)}};
}
