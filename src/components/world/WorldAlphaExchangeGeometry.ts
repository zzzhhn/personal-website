import { BoxGeometry, BufferGeometry, CylinderGeometry, Euler, Float32BufferAttribute, Matrix4, Quaternion, TorusGeometry, Vector2,Vector3,ShapeUtils } from 'three';
import { mergeBatch, toBatch, type Emit } from './WorldParkKit';
import { EXCHANGE_HALL, EXCHANGE_STATIONS,EXCHANGE_COLUMNS, exchangeBoxes,exchangePlatformSlabs } from './alpha-exchange-layout';
import type { Vec3 } from './types';

export interface ExchangeCollision {vertices:Float32Array;indices:Uint32Array}
/** All shapes are local to the stable entrance origin. Collision reads the same transformed vertices. */
export function buildAlphaExchangeGeometry() {
  const parts:BufferGeometry[]=[],glass:BufferGeometry[]=[],support:number[]=[],solid:number[]=[];
  const add=(g:BufferGeometry,color:string,p:Vec3=[0,0,0],rotation:Vec3=[0,0,0],kind:'solid'|'surface'|'visual'='solid',emit:Emit=[0,0,0],window=false)=>{
    const m=new Matrix4().compose(new Vector3(...p),new Quaternion().setFromEuler(new Euler(...rotation)),new Vector3(1,1,1));
    const baked=toBatch(g,m,color,emit),v=baked.getAttribute('position'),n=baked.getAttribute('normal');g.dispose();
    if(kind!=='visual')for(let i=0;i<v.count;i+=3){const list=kind==='surface'&&n.getY(i)>.7?support:solid;for(let k=0;k<3;k++)list.push(v.getX(i+k),v.getY(i+k),v.getZ(i+k));}
    (window?glass:parts).push(baked);
  };
  const box=(p:Vec3,s:Vec3,c:string,kind:'solid'|'surface'|'visual'='solid',yaw=0,emit:Emit=[0,0,0])=>add(new BoxGeometry(...s),c,p,[0,yaw,0],kind,emit);
  const rod=(a:Vec3,b:Vec3,r:number,c:string,kind:'solid'|'visual'='solid')=>{
    const av=new Vector3(...a),bv=new Vector3(...b),d=bv.clone().sub(av),g=new CylinderGeometry(r,r,d.length(),8);
    g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.normalize()));add(g,c,av.add(bv).multiplyScalar(.5).toArray() as Vec3,[0,0,0],kind);
  };
  const raw=(p:number[],c:string,kind:'surface'|'solid'|'visual'='solid')=>{const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.computeVertexNormals();add(g,c,[0,0,0],[0,0,0],kind);};
  const ring=(cx:number,cz:number,inner:number,outer:number,y:number,depth:number,start:number,end:number,c:string,n=36)=>{
    const p:number[]=[];
    for(let i=0;i<n;i++) {
      const a=start+(end-start)*i/n,b=start+(end-start)*(i+1)/n;
      const v=(t:number,r:number,h:number):Vec3=>[cx+r*Math.cos(t),h,cz+r*Math.sin(t)];
      const a0=v(a,inner,y),a1=v(a,outer,y),b1=v(b,outer,y),b0=v(b,inner,y),a2=v(a,outer,y-depth),b2=v(b,outer,y-depth),a3=v(a,inner,y-depth),b3=v(b,inner,y-depth);
      p.push(...a0,...b1,...a1,...a0,...b0,...b1,...a1,...b1,...b2,...a1,...b2,...a2,...a0,...a3,...b3,...a0,...b3,...b0);
      if(i===0)p.push(...a0,...a1,...a2,...a0,...a2,...a3);
      if(i===n-1)p.push(...b0,...b3,...b2,...b0,...b2,...b1);
    }raw(p,c);
  };
  // Platform ownership is split at its shared boundary. No coplanar top overlap and no
  // hidden vertical walls across the flat walk joints; render and collider read these same faces.
  for(const slab of exchangePlatformSlabs()) {
    const top:number[]=[],bottom:number[]=[],walls:number[]=[];
    for(const ids of ShapeUtils.triangulateShape(slab.outline.map(p=>new Vector2(...p)),[])) {
      const p=ids.map(i=>[slab.outline[i][0],slab.y,slab.outline[i][1]] as Vec3),ny=(p[1][2]-p[0][2])*(p[2][0]-p[0][0])-(p[1][0]-p[0][0])*(p[2][2]-p[0][2]);
      const v=ny>0?p:[p[0],p[2],p[1]];top.push(...v[0],...v[1],...v[2]);
      for(const i of [0,2,1])bottom.push(v[i][0],slab.y-slab.depth,v[i][2]);
    }
    slab.outline.forEach((a,i)=>{if(!slab.walls[i])return;const b=slab.outline[(i+1)%slab.outline.length],p:Vec3=[a[0],slab.y,a[1]],q:Vec3=[b[0],slab.y,b[1]],r:Vec3=[b[0],slab.y-slab.depth,b[1]],s:Vec3=[a[0],slab.y-slab.depth,a[1]];walls.push(...p,...q,...r,...p,...r,...s);});
    raw(top,slab.color,'surface');raw(bottom,slab.color);raw(walls,slab.color);
  }
  for(const b of exchangeBoxes())add(new BoxGeometry(...b.size),b.color,b.center,b.rotation??[0,0,0],b.surface?'surface':'solid');
  // Real parquet above the mineral base, inset borders and an eight-point compass inlay.
  for(let row=0;row<50;row++)for(let col=0;col<10;col++) {
    const x=-12.35+row*.5,z=-28.15+col*3+(row%2)*1.5,end=Math.min(.6,z+2.97);if(end<=z)continue;
    box([x,.006,(z+end)/2],[.486,.012,end-z],['#987b56','#a58b64','#ad9370','#91744f'][(row*7+col)%4],'visual');
  }
  ring(0,-11.5,2.55,2.65,.018,.012,0,Math.PI*2,'#c1ae83',64);
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/4,b=a+Math.PI/8,p0:Vec3=[0,.02,-11.5],p1:Vec3=[Math.cos(a)*2.55,.02,-11.5+Math.sin(a)*2.55],p2:Vec3=[Math.cos(b)*.7,.02,-11.5+Math.sin(b)*.7];
    raw([...p0,...p2,...p1],i%2?'#675641':'#c8b791','visual');
  }
  // Columns have actual shafts, drums, flutes and layered capitals, not a few thin posts.
  for(const side of [-1,1])for(const z of [.2,-8.2,-17,-27.6]) {
    add(new CylinderGeometry(EXCHANGE_COLUMNS.shaftTopRadius,EXCHANGE_COLUMNS.shaftBottomRadius,8.15,16),'#dfd2ba',[side*EXCHANGE_COLUMNS.x,4.82,z]);
    for(const y of [.85,1.1,8.8,9.1]){const r=y<2?EXCHANGE_COLUMNS.lowerDrumRadius:EXCHANGE_COLUMNS.upperDrumRadius;add(new CylinderGeometry(r,r,.15,16),'#c3b396',[side*EXCHANGE_COLUMNS.x,y,z]);}
    for(let i=0;i<10;i++){const a=i*Math.PI*2/10;rod([side*EXCHANGE_COLUMNS.x+.53*Math.cos(a),1.3,z+.53*Math.sin(a)],[side*EXCHANGE_COLUMNS.x+.5*Math.cos(a),8.6,z+.5*Math.sin(a)],.025,'#c4b69d','visual');}
  }
  // Side bays are tall framed windows; their glass blocks camera sweeps but casts no opaque shadow.
  for(const side of [-1,1])for(const z of [-4,-12.6,-22.3]) {
    const x=side*12.6,low=side===1&&z===-22.3?3.4:2.2;
    add(new BoxGeometry(.1,9.6-low,6.9),'#e2c68c',[x,(9.6+low)/2,z],[0,0,0],'solid',[.04,.16,1],true);
    for(const zz of [z-3.45,z,z+3.45])box([x,(9.6+low)/2,zz],[.22,9.6-low,.12],'#806947');
    for(const y of [low,5.5,8.4,9.6])box([x,y,z],[.28,.16,7.1],'#a78b5a');
    // Shallow voussoirs describe the stone arch above each window.
    for(let i=0;i<16;i++){const a=i*Math.PI/16,b=(i+1)*Math.PI/16;rod([x,7.9+1.7*Math.sin(a),z+3.4*Math.cos(a)],[x,7.9+1.7*Math.sin(b),z+3.4*Math.cos(b)],.16,'#d3c4a9');}
  }
  // Coffer frames remain thick. Transparent skylight panels leave the global sun's light paths open.
  for(let x=-9;x<=9;x+=6)for(let z=-4.5;z>=-24.5;z-=5) {
    add(new BoxGeometry(5.68,.12,4.66),'#eed3a0',[x,11.86,z],[0,0,0],'solid',[.08,.18,1],true);
    box([x,11.57,z],[5.82,.12,.1],'#b59a6d');
  }
  for(const x of [-8.2,8.2]) {
    add(new BoxGeometry(6.4,2.8,.12),'#e2c68c',[x,8.4,.65],[0,0,0],'solid',[.04,.16,1],true);
    for(const xx of [x-3.2,x,x+3.2])box([xx,8.4,.65],[.14,2.9,.2],'#9b8054');
    box([x,6.98,.65],[6.65,.2,.4],'#d2c1a0');
  }
  // Mezzanine and a broad continuous ramp occupy the left rear aisle; no decorative fake stairs.
  const ramp=[-11.1,0,-14,-8.9,0,-14,-8.9,4.4,-24.3,-11.1,4.4,-24.3];
  raw([...ramp.slice(0,3),...ramp.slice(3,6),...ramp.slice(6,9),...ramp.slice(0,3),...ramp.slice(6,9),...ramp.slice(9,12)],'#8e7152','surface');
  const rampBack=ramp.map((v,i)=>i%3===1?v-.22:v);
  raw([...rampBack.slice(0,3),...rampBack.slice(6,9),...rampBack.slice(3,6),...rampBack.slice(0,3),...rampBack.slice(9,12),...rampBack.slice(6,9)],'#71583e');
  for(const x of [-11.1,-8.9]) {
    rod([x,.75,-14],[x,5.15,-24.3],.055,'#ab8a4e');
    for(let i=0;i<=5;i++){const y=4.4*i/5,z=-14-10.3*i/5;rod([x,y,z],[x,y+.75,z],.035,'#ab8a4e');}
  }
  for(const x of [-8,8])box([x,2.05,-25.8],[.48,4.1,.48],'#9b805b');
  for(let x=-8.4;x<=10.8;x+=1.2){rod([x,4.4,-24.34],[x,5.4,-24.34],.042,'#ad8d51');}
  rod([-8.5,5.4,-24.34],[11.4,5.4,-24.34],.065,'#bc9b5a');
  // Two front horseshoes and a quieter rear trading post retain a real open inside/rear passage.
  const crt=(x:number,z:number,yaw:number,active=false)=>{
    const at=(dx:number,dy:number,dz:number):Vec3=>[x+dx*Math.cos(yaw)+(dz-.2)*Math.sin(yaw),dy,z-dx*Math.sin(yaw)+(dz-.2)*Math.cos(yaw)];
    box(at(0,1.49,0),[.91,.7,.69],'#b9b29b','solid',yaw);
    box(at(0,1.18,.02),[.55,.12,.48],'#8a8b79','solid',yaw);
    box(at(0,1.49,.355),[.77,.57,.06],'#3b4940','visual',yaw,[.035,.06,0]);
    if(!active)box(at(0,1.49,.39),[.65,.43,.018],'#223e32','visual',yaw,[.015,.04,0]);
    box(at(0,1.115,.67),[.78,.055,.28],'#c2baa4','solid',yaw);
    for(let row=0;row<3;row++)for(let key=0;key<8;key++)box(at(-.31+key*.088,1.15,.59+row*.07),[.062,.012,.045],'#827e69','visual',yaw);
    // A chunky desk telephone, handset and coiled lead are legible at arm's length.
    box(at(.67,1.19,.3),[.31,.16,.42],'#383c35','solid',yaw);
    rod(at(.57,1.32,.16),at(.78,1.32,.43),.065,'#272e28','visual');
    for(let i=0;i<10;i++){const a=i*.63,b=(i+1)*.63;rod(at(.83+.045*Math.cos(a),1.22-i*.035,.35+.045*Math.sin(a)),at(.83+.045*Math.cos(b),1.22-(i+1)*.035,.35+.045*Math.sin(b)),.009,'#252f29','visual');}
    box(at(-.65,1.14,.35),[.24,.06,.39],'#d7cdb5','visual',yaw);
  };
  for(const [cx,cz,r] of [[-6.6,-9,3.6],[6.6,-9,3.6],[0,-20,2.8]]) {
    ring(cx,cz,r-.48,r+.48,1.05,1.05,0,Math.PI,'#5a4230',32);
    ring(cx,cz,r-.6,r+.6,1.14,.12,0,Math.PI,'#8e6b44',32);
    ring(cx,cz,r+.49,r+.53,.25,.15,0,Math.PI,'#b2945a',32);
    for(const side of [-1,1]) {
      box([cx+side*r,.52,cz-1.8],[.96,1.04,3.6],'#5a4230');
      box([cx+side*r,1.09,cz-1.8],[1.2,.12,3.6],'#8e6b44');
    }
    for(let i=0;i<10;i++) {
      const a=(i+.5)*Math.PI/10,x=cx+r*Math.cos(a),z=cz+r*Math.sin(a);
      if(!EXCHANGE_STATIONS.some(s=>Math.hypot(s.at[0]-x,s.at[2]-z)<1.1))crt(x,z,Math.PI/2-a);
      const ax=cx+(r+.5)*Math.cos(a),az=cz+(r+.5)*Math.sin(a);
      rod([ax,.12,az],[ax,.94,az],.035,'#ab8b51','visual');
    }
  }
  // Four actual action monitors reuse the live atlas, positioned to face their published stands.
  for(const s of EXCHANGE_STATIONS)crt(s.at[0],s.at[2],s.yaw,true);
  // A large cast-brass clock has a deep case. The atlas face stays explicitly labelled REPLAY.
  add(new CylinderGeometry(1.65,1.65,.3,48),'#b19254',EXCHANGE_HALL.clock,[-Math.PI/2,0,0]);
  const clock=new TorusGeometry(1.57,.12,8,48);add(clock,'#c7a86b',[EXCHANGE_HALL.clock[0],EXCHANGE_HALL.clock[1],EXCHANGE_HALL.clock[2]+.26]);
  box([0,6.12,-27.12],[5.6,.22,.65],'#856540');
  // Facade pediment and thick mouldings anchor the building's grand scale.
  const pediment=[-5.2,7.0,1.3,5.2,7.0,1.3,0,9.1,1.3,-5.2,7.0,.15,0,9.1,.15,5.2,7.0,.15];
  raw(pediment,'#ccbca0');rod([-5.2,7.03,1.35],[0,9.13,1.35],.18,'#e0d0b5');rod([0,9.13,1.35],[5.2,7.03,1.35],.18,'#e0d0b5');
  for(const [a,b]of[[[-5.2,7],[5.2,7]],[[5.2,7],[0,9.1]],[[0,9.1],[-5.2,7]]])raw([a[0],a[1],1.3,b[0],b[1],1.3,b[0],b[1],.15,a[0],a[1],1.3,b[0],b[1],.15,a[0],a[1],.15],'#c0b194');
  for(const side of [-1,1]) {
    box([side*5.25,4,.95],[1.25,7.6,1.25],'#dfd2ba');
    box([side*5.25,.35,.95],[1.7,.7,1.65],'#b8ab92');
    box([side*5.25,7.75,.95],[2.05,.4,1.7],'#e3d5bc');
    box([side*8.4,4.4,1.115],[1.7,4.6,.07],'#304652','visual');
    // Non-numeric stepped Alpha mark on fabric banners, never an invented market quotation.
    for(let i=0;i<3;i++)box([side*8.4-.45+i*.45,3.1+i*.35,1.17],[.28,.65+i*.7,.035],'#be9b57','visual');
  }
  // Bounded warm fixtures remain in the same static batch, driven by the existing park night uniform.
  for(const side of [-1,1])for(const z of [-2,-10,-18,-26]) {
    rod([side*11.7,3.2,z],[side*11.15,3.2,z],.06,'#8f7548');
    box([side*11.1,3.65,z],[.28,.82,.28],'#f1d79f','visual',0,[.24,1.4,1]);
    for(const dx of [-.17,.17])for(const dz of [-.17,.17])rod([side*11.1+dx,3.18,z+dz],[side*11.1+dx,4.12,z+dz],.022,'#8a7045','visual');
  }
  for(const s of [-1,1]){rod([s*.43,1.2,-1.8],[s*.43,1.87,-1.8],.045,'#b8975a');}rod([-.43,1.87,-1.8],[.43,1.87,-1.8],.055,'#b8975a');
  const collision=(p:number[]):ExchangeCollision=>({vertices:new Float32Array(p),indices:Uint32Array.from({length:p.length/3},(_,i)=>i)});
  return {body:mergeBatch(parts),glass:mergeBatch(glass),colliders:{surface:collision(support),solid:collision(solid)}};
}
