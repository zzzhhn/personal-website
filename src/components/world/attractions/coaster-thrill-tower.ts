import { Euler, Quaternion, Vector3 } from 'three';
import type { CoasterBatch, CoasterCollider } from './coaster-geometry.ts';
import type { Vec3 } from '../types';

const world=([x,y,z]:Vec3):Vec3=>[x+50,y+1,z-195];
/** Open braced lift tower, matching the approved tall steel silhouette. The staff
 * platforms are deliberately closed to guests; the existing station stays unchanged. */
export function addThrillTower(steel:CoasterBatch,glow:CoasterBatch,colliders:CoasterCollider[],detailed:boolean) {
  const color={steel:'#496777',dark:'#253c4c',edge:'#aebdc1',concrete:'#b3b4a8',copper:'#bd925e'};
  const beam=(a:Vec3,b:Vec3,radius:number,tint=color.steel,solid=true)=>{
    const from=new Vector3(...world(a)),to=new Vector3(...world(b)),d=to.clone().sub(from);
    steel.beam(from.toArray() as Vec3,to.toArray() as Vec3,radius,tint,8);
    if(solid){const q=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.clone().normalize());
      const e=new Euler().setFromQuaternion(q);colliders.push({position:from.add(to).multiplyScalar(.5).toArray() as Vec3,half:[radius,d.length()/2,radius],rotation:[e.x,e.y,e.z]});}
  };
  const box=(p:Vec3,size:Vec3,tint:string,solid=true)=>{
    steel.box(world(p),size,tint);if(solid)colliders.push({position:world(p),half:size.map(v=>v/2) as Vec3});
  };
  const leg=(side:number,end:number,y:number):Vec3=>[-44+side*(8-5*y/84),y,-150+end*(6-2*y/84)];
  for(const side of [-1,1])for(const end of [-1,1]){
    const foot=leg(side,end,0),top=leg(side,end,84);
    beam(foot,top,.62,color.steel);box([foot[0],.65,foot[2]],[3.7,1.3,3.7],color.concrete);
    box([foot[0],1.4,foot[2]],[1.65,.25,1.65],color.dark,false);
    if(detailed)for(const dx of [-.58,.58])for(const dz of [-.58,.58])box([foot[0]+dx,1.58,foot[2]+dz],[.15,.18,.15],color.copper,false);
  }
  for(let y=8;y<=80;y+=12){
    const next=Math.min(84,y+12);
    for(const end of [-1,1]){
      beam(leg(-1,end,y),leg(1,end,y),.26);
      beam(leg(-1,end,y),leg(1,end,next),.19,color.edge);
      beam(leg(1,end,y),leg(-1,end,next),.19,color.edge);
    }
    for(const side of [-1,1]){
      beam(leg(side,-1,y),leg(side,1,y),.26);
      beam(leg(side,-1,y),leg(side,1,next),.19,color.edge);
    }
  }
  // Narrow mechanical spine keeps daylight between the legs instead of a solid wall.
  box([-44,41,-151],[1.7,82,1.7],color.dark);
  for(const x of [-45.2,-42.8])beam([x,1,-149.8],[x,83,-149.8],.12,color.copper);
  for(let y=2;y<84;y+=detailed?1:2)beam([-45.2,y,-149.8],[-42.8,y,-149.8],.07,color.edge,false);
  for(const y of [12,36,60,83]){
    box([-45,y,-150],[8.4,.48,10.4],color.steel);
    for(const end of [-1,1]){
      beam([-49,y+1.2,-150+end*5],[-41,y+1.2,-150+end*5],.08,color.copper);
      for(const x of [-49,-47,-45,-43,-41])beam([x,y,-150+end*5],[x,y+1.2,-150+end*5],.07,color.copper);
    }
    for(const x of [-49,-41])beam([x,y+1.2,-155],[x,y+1.2,-145],.08,color.copper);
    box([-44,y+1.3,-151],[2.6,2.2,2.4],color.concrete);
    glow.box(world([-44,y+2,-149.77]),[1.9,.18,.08],'#ffd08b');
  }
  box([-44,85.2,-151],[4.2,1.4,3.8],color.steel);
  for(const x of [-47,-41]){
    beam([x,84,-151],[x,87,-151],.08,color.edge,false);
    glow.box(world([x,87,-151]),[.22,.35,.22],'#ffce8b');
  }
  // Ground maintenance cabinets and closed grilles communicate scale and access.
  for(const x of [-48,-43]){
    steel.housing(world([x,2.1,-141]),[3.7,4.2,2.3],color.concrete);
    colliders.push({position:world([x,2.1,-141]),half:[1.85,2.1,1.15]});
    box([x,2,-139.8],[2.8,2.9,.16],color.dark,false);
    for(let i=0;i<6;i++)box([x,1+i*.35,-139.69],[2.4,.12,.12],color.steel,false);
  }
}
