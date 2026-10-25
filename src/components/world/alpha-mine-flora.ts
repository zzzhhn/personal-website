import { mineEdgeDistance } from './alpha-mine-layout.ts';

/** Three silhouettes share one 15-triangle instance and the same wind/trample. */
export function quarryFloraKind(x:number,z:number):0|1|2 {
  if(mineEdgeDistance(x,z)>1.5)return 0;
  const patch=.5+.5*Math.sin(x*.41+z*.19)*Math.cos(z*.33-x*.07);
  const seed=Math.abs(Math.sin(x*12.989+z*78.233)*43758.54)%1;
  return patch<.26?1:patch>.72&&seed>.38?2:0;
}

export function quarryFloraBanks() {
  const leaf:number[]=[],bloom:number[]=[],colour:number[]=[];
  const push=(out:number[],points:number[][])=>points.forEach(p=>out.push(...p));
  for(let k=0;k<5;k++){
    const a=k*Math.PI*2/5,dir=[Math.cos(a),Math.sin(a)],side=[-dir[1],dir[0]];
    const p=(r:number,w:number,y:number)=>[dir[0]*r+side[0]*w,y,dir[1]*r+side[1]*w];
    // Broad leaves attach at the crown, with a raised midrib and folded margins.
    const a0=p(.01,-.008,.006),a1=p(.01,.008,.006),l=p(.16,-.075,.10),r=p(.16,.075,.10),tip=p(.32,0,.15);
    push(leaf,[a0,a1,r,a0,r,l,l,r,tip]);
    if(k===0){
      push(bloom,[[-.009,0,0],[.009,0,0],[.009,.36,0],[-.009,0,0],[.009,.36,0],[-.009,.36,0],
        [0,.12,0],[.12,.20,.02],[0,.23,0]]);
      for(let i=0;i<9;i++)colour.push(.24,.38,.15);
    }else{
      const angle=(k-1)*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
      const q=(r:number,w:number,y:number)=>[c*r-s*w,y,s*r+c*w];
      const a0=q(0,-.013,.36),a1=q(0,.013,.36),left=q(.052,-.043,.38),right=q(.052,.043,.38),tip=q(.105,0,.37);
      push(bloom,[a0,a1,right,a0,right,left,left,right,tip]);
      for(let i=0;i<9;i++)colour.push(...(i===0||i===3?[.67,.43,.12]:[.88,.81,.53]));
    }
  }
  return {leaf,bloom,colour};
}
