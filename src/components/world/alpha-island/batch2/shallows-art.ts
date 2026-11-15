import { BufferGeometry,Float32BufferAttribute,Shape,ExtrudeGeometry,SphereGeometry } from 'three';
import { AlphaBuilder } from '../alpha-art';
import { ALPHA_SHALLOWS } from '../alpha-batch2-layout';
import { SHALLOWS_BYPASS,SHALLOWS_STONE_SIZE,SHALLOWS_DECK_Y,shallowsStonePosition } from './shallows-state';
import type { Vec3 } from '../../types';

/** Thick quarried octagons: broad top, eased shoulder and visible battered sides.
 * Bottom and top are physical datums, rather than a scaled flat box. */
export function shallowsSlab(width:number,depth:number,height:number,variant=0) {
  const shape=new Shape(),w=width/2-.045,d=depth/2-.045,c=.16;
  const points=[[-w+c,-d],[w-c,-d],[w,-d+c],[w,d-c],[w-c,d],[-w+c,d],[-w,d-c],[-w,-d+c]];
  points.forEach(([x,z],i)=>{const chip=1+Math.sin(i*3.1+variant)*.014;if(i)shape.lineTo(x*chip,z*chip);else shape.moveTo(x*chip,z*chip);});shape.closePath();
  const g=new ExtrudeGeometry(shape,{depth:height-.09,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.045,bevelThickness:.045,curveSegments:1});
  g.rotateX(-Math.PI/2);g.translate(0,-height/2+.045,0);return g;
}
export function createShallowsRuneStone(index:number) {
  const b=new AlphaBuilder(),[w,h,d]=SHALLOWS_STONE_SIZE;
  b.add(shallowsSlab(w,d,h,index),'stone');
  // A continuous inlaid seam makes the eight settled slabs read as one crossing.
  b.box('metal',[0,h/2+.009,0],[w-.08,.018,.045],.008);
  // Carved upright backs carry eight distinct reliefs above the water. They sit
  // outside a continuous 1.2 m walking strip, and are attached to the thick base.
  const side=index%2?1:-1,z=side*.72,y=h/2+.27;
  b.box('stone',[0,y,z],[1.1,.56,.14],.045);
  const line=(ax:number,ay:number,bx:number,by:number)=>{for(const face of [-1,1])b.beam('metal',[ax,y+ay,z+face*.073],[bx,y+by,z+face*.073],.025);};
  if(index===0||index===6){const turns=index===6?1.65:1;for(let j=0;j<24;j++){const a=j/24*Math.PI*2*turns,c=(j+1)/24*Math.PI*2*turns,r=index===6?.03+j/24*.14:.15,s=index===6?.03+(j+1)/24*.14:.15;line(Math.cos(a)*r,Math.sin(a)*r,Math.cos(c)*s,Math.sin(c)*s);}}
  if(index===1||index===7){const pts=index===1?[[-.14,-.14],[.14,-.14],[.14,.14],[-.14,.14]]:[[0,-.18],[.16,0],[0,.18],[-.16,0]];pts.forEach((p,i)=>{const q=pts[(i+1)%4];line(p[0],p[1],q[0],q[1]);});}
  if(index===2){line(-.17,-.14,0,.17);line(0,.17,.17,-.14);line(.17,-.14,-.17,-.14);}
  if(index===3)for(const row of [-.08,.08])for(let j=0;j<8;j++)line(-.18+j*.045,row+Math.sin(j*Math.PI/2)*.035,-.18+(j+1)*.045,row+Math.sin((j+1)*Math.PI/2)*.035);
  if(index===4){line(-.17,0,.17,0);line(0,-.17,0,.17);}
  if(index===5){line(-.14,-.14,.14,.14);line(-.14,.14,.14,-.14);}
  // Split shoulders catch grazing light and show real relief above the waterline.
  for(const side of [-1,1])b.box('stone',[0,h/2+.035,side*.745],[w-.22,.07,.1],.035);
  return b.finish();
}
export function createShallowsLever() {
  const b=new AlphaBuilder();b.cyl('metal',[0,.2,0],.06,.48);const grip=new SphereGeometry(.13,10,7);b.add(grip,'wood',[0,.44,0]);return b.finish();
}
export function createShallowsSite() {
  const b=new AlphaBuilder(),[cx,,cz]=ALPHA_SHALLOWS.center,bed=ALPHA_SHALLOWS.bedY;
  // Grooves are paired dressed-stone runners with a dark recessed bed between.
  for(let i=0;i<8;i++){
    const p=shallowsStonePosition(i),end=shallowsStonePosition(i,1),z=(p[2]+end[2])/2;
    b.box('darkwood',[p[0],bed+.014,z],[1.3,.028,3.35],.02);
    for(const side of [-1,1])b.box('stone',[p[0]+side*.69,bed+.045,z],[.13,.09,3.4],.035);
    for(const stop of [Math.min(p[2],end[2])-.84,Math.max(p[2],end[2])+.84])
      b.box('stone',[p[0],bed+.09,stop],[1.45,.18,.15],.035);
    // Bronze socket corners stay visible while the groove is empty.
    for(const side of [-1,1])b.box('metal',[p[0]+side*.58,bed+.07,end[2]],[.06,.04,.8],.012);
  }
  SHALLOWS_BYPASS.forEach((p,i)=>{
    b.add(shallowsSlab(1.38,1.9,.48,i+15),'stone',p);
    b.box('metal',[p[0],SHALLOWS_DECK_Y+.009,p[2]+.58],[.28,.018,.035],.007);
  });
  // Broad bank stones join the puzzle route without a raised threshold.
  for(const side of [-1,1])b.add(shallowsSlab(2.55,2.25,.5,side),'stone',[cx+side*7.2,SHALLOWS_DECK_Y-.25,cz-1]);
  // Reset lever is planted on the south-west bank, outside both crossing lanes.
  b.add(shallowsSlab(.85,.85,.28,3),'stone',[cx-7.6,12.14,cz+1.55]);
  b.box('darkwood',[cx-7.6,12.58,cz+1.55],[.18,.78,.18],.035);
  b.box('metal',[cx-7.6,12.96,cz+1.55],[.42,.12,.18],.035);
  // Small, purposeful planting pockets kept beyond the deck and push corridors.
  for(let i=0;i<12;i++){
    const x=cx-7.9+(i%6)*3.15,z=cz+(i<6?-5.65:5.65);
    const rock=new SphereGeometry(1,9,6);rock.scale(.32+(i%3)*.08,.18,.3);b.add(rock,'stone',[x,12.04,z]);
    for(let j=0;j<5;j++){
      const a=j*2.4+i,foot:Vec3=[x+Math.cos(a)*.18,11.98,z+Math.sin(a)*.18],tip:Vec3=[foot[0]+Math.cos(a)*.17,12.47+(j%3)*.11,foot[2]+Math.sin(a)*.17];
      b.beam('leafplate',foot,tip,.035,.075);
      if(j%2===0)b.beam('wood',[tip[0],tip[1]-.13,tip[2]],[tip[0],tip[1]+.06,tip[2]],.055);
    }
  }
  return b.finish();
}
/** Local water mesh with enough vertices for a millimetre-scale ripple. */
export function createShallowsWater() {
  const g=new BufferGeometry(),p:number[]=[],uv:number[]=[],ix:number[]=[],nx=30,nz=17;
  const [cx,,cz]=ALPHA_SHALLOWS.center;
  for(let z=0;z<=nz;z++)for(let x=0;x<=nx;x++){p.push(cx-8.55+x/nx*17.1,ALPHA_SHALLOWS.waterY,cz-5.55+z/nz*11.1);uv.push(x/nx,z/nz);}
  for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){const a=z*(nx+1)+x;ix.push(a,a+nx+1,a+1,a+1,a+nx+1,a+nx+2);}
  g.setAttribute('position',new Float32BufferAttribute(p,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();return g;
}
