import { Builder, bar, cbox, lathe, type V3 } from '../WorldStreetGeometry.ts';
import { IBD_MATERIALS as P } from './ibd-yard-palette.ts';
import { IBD_PACK_SLOTS, ibdPackSampleDimensions as dimensions } from './ibd-pack-layout.ts';
export * from './ibd-pack-layout.ts';
const clamp=(v:number,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number.isFinite(v)?v:lo));

/** Original rolling crate/dolly envelope. Foam rests have a real fork channel;
 * the presenter tines can enter below a sample without moving or hiding the rests. */
function addPackShell(b:Builder){
  for(const x of [-1.2,0,1.2])cbox(b,[x,-.06,0],[.35,.18,2.7],P.timber,0);
  cbox(b,[0,-.3,0],[2.8,.15,2.3],P.dark,.03);
  for(const x of [-1.2,1.2])for(const z of [-.9,.9]){
    cbox(b,[x,-.55,z],[.12,.4,.12],P.steel);
    b.tr([x,-.75,z],[0,0,Math.PI/2],()=>lathe(b,[[0,-.09],[.26,-.09],[.26,.09],[0,.09]],P.rubber,{sides:10}));
  }
  for(const z of [-1,-.5,0,.5,1])cbox(b,[0,.06,z],[3,.12,.4],P.endgrain,0);
  cbox(b,[0,.23,0],[2.7,.2,2.4],P.dark,.025);
  for(const x of [-1.35,1.35])cbox(b,[x,.62,0],[.12,.85,2.5],P.timber,.03);
  for(const z of [-1.22,1.22])cbox(b,[0,.62,z],[2.7,.85,.12],P.endgrain,.03);
  for(const s of IBD_PACK_SLOTS)for(const side of [-1,1])
    cbox(b,[s.at[0]+side*.28,.37,s.at[2]+.05],[.24,.1,.5],P.rubber,0);
  cbox(b,[0,.64,1.3],[.95,.44,.04],P.pale,.02);
  const ink=(a:[number,number],c:[number,number])=>bar(b,[a[0],a[1],1.33],[c[0],c[1],1.33],.013,P.dark,4);
  for(const[a,c]of[[[-.36,.53],[-.36,.75]],[[-.36,.75],[-.25,.63]],[[-.25,.63],[-.14,.75]],[[-.14,.75],[-.14,.53]],
    [[-.03,.53],[-.03,.75]],[[.1,.53],[.1,.75]],[[-.03,.53],[.1,.53]],[[-.03,.64],[.1,.64]],[[-.03,.75],[.1,.75]],
    [[.3,.75],[.23,.62]],[[.23,.62],[.39,.62]],[[.35,.75],[.35,.53]]] as [[number,number],[number,number]][])ink(a,c);
  // Compact telescopic hoist base stows below the unchanged rim/closed lid.
  cbox(b,[1.18,.33,-.95],[.18,.12,.18],P.blue,0);
  bar(b,[1.18,.35,-.95],[1.18,.96,-.95],.055,P.steel,8);
  for(const y of [.4,.9])cbox(b,[1.18,y,-.95],[.15,.08,.15],P.dark,0);
}
function addSample(b:Builder,spec:string){
  const d=dimensions(spec),r=d.radius,h=d.height;
  lathe(b,[[0,0],[d.headRadius,0],[d.headRadius,.13],[r,.13],[r,h],[0,h]],P.steel,{sides:6,faceted:true});
  for(let y=.18;y+.025<=h;y+=.08)lathe(b,[[r,y],[r+.02,y],[r+.02,y+.025],[r,y+.025]],P.dark,{sides:8});
}
export function buildIbdPack(quantity:number,spec:string){
  const b=new Builder();addPackShell(b);
  for(const s of IBD_PACK_SLOTS)if(s.index<clamp(Math.floor(quantity),0,4))b.tr(s.at,[0,0,0],()=>addSample(b,spec));
  return b.build();
}
function addPresenterTray(b:Builder){
  for(const x of [-.08,.08])cbox(b,[x,-.015,-.035],[.07,.03,.49],P.cutSteel,0);
  cbox(b,[0,-.03,-.3],[.62,.04,.12],P.blue,0);
  bar(b,[0,-.01,-.33],[0,.1,-.36],.025,P.cutSteel,8);
  cbox(b,[0,.1,-.36],[.12,.07,.08],P.dark,.01);
}
/** Fixed face is local X=0. Pads contact the bare shaft at Y=.17, between thread
 * bands; the outboard jaw arms leave the larger thread crests clear. */
function addCaliperFixed(b:Builder){
  cbox(b,[.3,.6,0],[.8,.04,.075],P.cutSteel,.006);
  cbox(b,[-.075,.35,0],[.05,.5,.075],P.cutSteel,.006);
  cbox(b,[-.025,.17,0],[.05,.025,.075],P.cutSteel,0);
  for(let i=0;i<13;i++){
    const x=.02+i*.05,z=i%5===0?.0275:.015;
    b.face([[x-.003,.622,-z],[x+.003,.622,-z],[x+.003,.622,z],[x-.003,.622,z]],P.dark,[0,1,0]);
  }
  cbox(b,[-.075,.105,0],[.12,.035,.1],P.blue,.006);
}
/** Moving inner face is also X=0. Translate this geometry by the actual jaw gap
 * relative to the fixed face; the thumb tab's front plane is local [0,.18,.29]. */
function addCaliperJaw(b:Builder){
  cbox(b,[.075,.335,0],[.05,.47,.075],P.cutSteel,.006);
  cbox(b,[.025,.17,0],[.05,.025,.075],P.cutSteel,0);
  for(const z of [-.0675,.0675])cbox(b,[.055,.6,z],[.18,.12,.025],P.blue,0);
  for(const y of [.54,.66])cbox(b,[.055,y,0],[.18,.025,.16],P.blue,0);
  cbox(b,[.055,.681,0],[.11,.016,.07],P.dark,0);
  bar(b,[.075,.55,.08],[.03,.18,.23],.025,P.cutSteel,8);
  cbox(b,[.03,.18,.23],[.16,.09,.12],P.rubber,.008);
}
const geometry=(add:(b:Builder)=>void)=>{const b=new Builder();add(b);return b.build();};
export const buildIbdPackShell=()=>geometry(addPackShell);
/** Unit rods run local Y=0..1. Scale Y to endpoint distance and rotate +Y onto
 * the endpoints supplied by ibdPackTransferPose; no new rigid bodies are needed. */
const rigRod=(radius:number)=>geometry(b=>bar(b,[0,0,0],[0,1,0],radius,P.cutSteel,8));
export function buildIbdPackParts(quantity:number,spec:string){
  const shell=buildIbdPackShell(),sample=geometry(b=>addSample(b,spec)),tray=geometry(addPresenterTray);
  const caliperFixed=geometry(addCaliperFixed),caliperJaw=geometry(addCaliperJaw);
  const rigMast=rigRod(.035),rigBoom=rigRod(.045),rigTether=rigRod(.016);
  const owned=[shell,sample,tray,caliperFixed,caliperJaw,rigMast,rigBoom,rigTether];
  return {shell,sample,tray,caliperFixed,caliperJaw,rigMast,rigBoom,rigTether,
    slots:IBD_PACK_SLOTS.map(s=>({index:s.index,at:[...s.at] as V3,occupied:s.index<clamp(Math.floor(quantity),0,4)})),
    dispose:()=>owned.forEach(g=>g.dispose())};
}
