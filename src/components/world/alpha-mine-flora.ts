import { mineEdgeDistance } from './alpha-mine-layout.ts';

/** Runtime 3 selects the quarry tuft; 0 keeps the island's original grass geometry. */
export function quarryFloraStyle(x:number,z:number):0|1|2|3 {
  if(mineEdgeDistance(x,z)>1.5)return 0;
  const patch=.5+.5*Math.sin(x*.41+z*.19)*Math.cos(z*.33-x*.07);
  const seed=Math.abs(Math.sin(x*12.989+z*78.233)*43758.54)%1;
  return patch<.26?1:patch>.72&&seed>.38?2:3;
}

/** Keep the authoring/preview contract: grass, rosette, flower. No scatter/layout changes. */
export function quarryFloraKind(x:number,z:number):0|1|2 {
  const style=quarryFloraStyle(x,z);
  return style===3?0:style;
}

/** Equal-sized banks: 45 vertices, 15 triangles each, one material and one instanced draw.
 * Detail packs three two-bit cross-width codes and a three-bit tuft phase into an exact
 * Float32 integer (0..490). Reuses aBlade's now-redundant height channel, no extra slot. */
export function quarryFloraBanks() {
  const tuft:number[]=[],leaf:number[]=[],bloom:number[]=[],colour:number[]=[],detail:number[]=[];
  const leafWidth:number[]=[],bloomWidth:number[]=[],tuftWidth:number[]=[],tuftPhase:number[]=[];
  const push=(out:number[],points:number[][])=>points.forEach(p=>out.push(...p));

  const radial=(angle:number,r:number,w:number,y:number)=>[
    Math.cos(angle)*r-Math.sin(angle)*w,y,Math.sin(angle)*r+Math.cos(angle)*w,
  ];
  // Eight crown blades: short outer leaves surround a taller, leaning heart.
  for(let k=0;k<8;k++) {
    const angle=k*2.39996, height=k<5?.20+(k%3)*.045:.34+(k%3)*.04;
    const root=k<5?.045:.015, reach=k<5?.24+(k%2)*.045:.14, width=k<5?.035:.024;
    const p=(r:number,w:number,y:number)=>radial(angle,r,w,y);
    const a=p(root,-width,0),b=p(root,width,0),tip=p(reach,0,height);
    if(k===7) { push(tuft,[a,b,tip]);tuftWidth.push(0,1,.5); }
    else {
      const shoulder=p(root+(reach-root)*.55,width*.65,height*.48);
      push(tuft,[a,b,shoulder,a,shoulder,tip]);tuftWidth.push(0,1,1,0,1,.5);
    }
    for(let i=0;i<(k===7?3:6);i++)tuftPhase.push(k/8);
  }

  // Seven broad folded leaves alternate low mature leaves and a raised inner crown.
  for(let k=0;k<7;k++) {
    const angle=k*2.39996, outer=k<4, reach=outer?.32+(k%2)*.035:.22;
    const height=outer?.13+(k%2)*.02:.23, width=outer?.088:.067;
    const p=(r:number,w:number,y:number)=>radial(angle,r,w,y);
    const root=p(.012,0,.008),left=p(reach*.55,-width,height*.25);
    const right=p(reach*.55,width,height*.25),tip=p(reach,0,height);
    push(leaf,[root,right,tip,root,tip,left]);leafWidth.push(.5,1,.5,.5,.5,0);
  }
  // One unfurled heart leaf closes the crown instead of another isolated spike.
  push(leaf,[[0,.008,0],[.035,.16,.018],[-.025,.075,.045]]);leafWidth.push(.5,.5,0);

  // Two staggered heads on rooted stems, each with three broad cupped petals.
  const heads=[[-.065,.34,.025],[.075,.43,-.035]];
  for(const [head,h] of heads.entries()) {
    push(bloom,[[-.008,0,0],[.008,0,0],h]);bloomWidth.push(0,1,.5);
    for(let i=0;i<3;i++)colour.push(.24,.38,.15);
    for(let petal=0;petal<3;petal++) {
      const angle=petal*Math.PI*2/3+head*.7;
      const p=(r:number,w:number,y:number)=>{
        const v=radial(angle,r,w,y);return [v[0]+h[0],v[1]+h[1],v[2]+h[2]];
      };
      const a=p(0,-.006,0),b=p(0,.006,0),left=p(.055,-.034,.012),right=p(.055,.034,.012);
      push(bloom,[a,b,right,a,right,left]);bloomWidth.push(.5,.5,1,.5,1,0);
      for(let i=0;i<6;i++)colour.push(...(i===0||i===3?[.72,.55,.19]:[.91,.89,.73]));
    }
  }
  push(bloom,[[0,.09,0],[-.12,.15,.045],[0,.19,0]]);bloomWidth.push(.5,0,.5);
  for(let i=0;i<3;i++)colour.push(.3,.44,.19);
  for(let i=0;i<45;i++)detail.push(Math.round(leafWidth[i]*2)+Math.round(bloomWidth[i]*2)*4
    +Math.round(tuftWidth[i]*2)*16+Math.round(tuftPhase[i]*8)*64);
  return {tuft,leaf,bloom,colour,detail};
}
