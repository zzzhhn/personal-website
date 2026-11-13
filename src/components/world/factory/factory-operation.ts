import type { FactoryAction, FactoryModule, FactoryGame } from './factory-game.ts';
import type { FactoryPoint } from './factory-layout.ts';

/** Physical control state lives outside React. Only committed production events enter the save. */
export interface FactoryInput { x:number; z:number; held:boolean; confirm:boolean }
export type FactoryPhase='aim'|'pickup'|'carry'|'drop'|'ready'|'cycle'|'outfeed'|'seat'|'fetch'|'lift'|'retract'|'home'|'done';
export interface FactoryOperation {
  action:FactoryAction; phase:FactoryPhase; tool:FactoryPoint; target:FactoryPoint;
  elapsed:number; stroke:number; guard:number; progress:number; attached:boolean; seated:number;
  assemblyModules:FactoryModule[]; assemblyModule:FactoryModule|null;
}
export const FACTORY_RAW_PICK:Record<FactoryModule,FactoryPoint>={
  frame:[-42,1.42,-16],wheels:[-38.8,1.42,-16],shell:[-35.6,1.42,-16],
};
export const FACTORY_RAW_DROP:FactoryPoint=[-37,1.1,-22];
export const FACTORY_RAW_HALF_HEIGHT:Record<FactoryModule,number>={frame:.1,wheels:.15,shell:.06};
export const FACTORY_RAW_TRANSFER_TOP=.98;
export const FACTORY_RAW_IDLE:FactoryPoint=[-37,3.4,-19];
export const factoryRawDrop=(module:FactoryModule):FactoryPoint=>
  [FACTORY_RAW_DROP[0],FACTORY_RAW_TRANSFER_TOP+FACTORY_RAW_HALF_HEIGHT[module],FACTORY_RAW_DROP[2]];
export const FACTORY_MAGNET_HALF_HEIGHT=.11;
export const FACTORY_ASSEMBLY_CONTACT:FactoryPoint=[24,1.14,-4];
export const FACTORY_LINE_Z:Record<FactoryModule,number>={frame:-11,wheels:2,shell:15};
export const FACTORY_CONVEYOR_TOP=1.215;
export const FACTORY_ASSEMBLY_PICK_HEIGHT=FACTORY_CONVEYOR_TOP+.06;
/** Part-anchor positions shared by the outfeed renderer and pickup controller. */
export const FACTORY_ASSEMBLY_PICK:Record<FactoryModule,FactoryPoint>={
  frame:[20,FACTORY_ASSEMBLY_PICK_HEIGHT,FACTORY_LINE_Z.frame],
  wheels:[20,FACTORY_ASSEMBLY_PICK_HEIGHT,FACTORY_LINE_Z.wheels],
  shell:[20,FACTORY_ASSEMBLY_PICK_HEIGHT,FACTORY_LINE_Z.shell],
};
export const FACTORY_ASSEMBLY_IDLE:FactoryPoint=[28,3.4,-4];
export const FACTORY_ASSEMBLY_BOUNDS={x:[17,39],z:[-25,27]} as const;
const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ease=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};
// Assembly assists the last half metre by physically centering before lowering.
// Contact remains exact without making the player hunt for an invisible pixel.
export const factoryToolAligned=(op:FactoryOperation)=>Math.hypot(op.tool[0]-op.target[0],op.tool[2]-op.target[2])<=(op.action.type==='extract'?.72:.55);
/** Retained modules keep their place; only newly manufactured parts return to the hoist. */
export function factoryAssemblyModules(game:FactoryGame):FactoryModule[]{
  const previous=game.configurations.at(-1);
  return (['frame','wheels'] as const).filter(module=>!previous||previous.parts[module]!==game.parts[module]?.id);
}
export function createFactoryOperation(action:FactoryAction,modules:FactoryModule[]=['frame','wheels']):FactoryOperation {
  const extract=action.type==='extract',assemble=action.type==='trial-assemble'||action.type==='final-assemble';
  const assemblyModules=action.type==='final-assemble'?['shell' as const]:action.type==='trial-assemble'?[...modules]:[];
  const assemblyModule=assemblyModules[0]??null;
  return {action,phase:assemble?(assemblyModule?'fetch':'done'):extract?'aim':'ready',
    tool:extract?[...FACTORY_RAW_IDLE]:assemble?[...FACTORY_ASSEMBLY_IDLE]:[0,0,0],
    target:extract?[...FACTORY_RAW_PICK[action.module]]:assemblyModule?[...FACTORY_ASSEMBLY_PICK[assemblyModule]]:[0,0,0],
    elapsed:0,stroke:0,guard:0,progress:0,attached:false,seated:0,assemblyModules,assemblyModule};
}

function moveAssemblyHorizontal(op:FactoryOperation,dt:number){
  const x=op.target[0]-op.tool[0],z=op.target[2]-op.tool[2],distance=Math.hypot(x,z),step=3.2*dt;
  if(distance<=step){op.tool[0]=op.target[0];op.tool[2]=op.target[2];return true;}
  op.tool[0]+=x/distance*step;op.tool[2]+=z/distance*step;return false;
}
function moveAssemblyHeight(op:FactoryOperation,height:number,dt:number){
  const distance=height-op.tool[1],step=1.8*dt;
  if(Math.abs(distance)<=step){op.tool[1]=height;return true;}
  op.tool[1]+=Math.sign(distance)*step;return false;
}
function stepAssembly(op:FactoryOperation,input:FactoryInput,dt:number){
  if(op.phase==='fetch'||op.phase==='home'){
    if(moveAssemblyHorizontal(op,dt)){
      op.phase=op.phase==='fetch'?'aim':'done';
      if(op.phase==='done')op.progress=1;
    }
  }else if(op.phase==='aim'||op.phase==='carry'){
    const n=Math.max(1,Math.hypot(input.x,input.z));
    op.tool[0]=clamp(op.tool[0]+input.x/n*3.2*dt,...FACTORY_ASSEMBLY_BOUNDS.x);
    op.tool[2]=clamp(op.tool[2]+input.z/n*3.2*dt,...FACTORY_ASSEMBLY_BOUNDS.z);
    if(input.confirm&&factoryToolAligned(op)){op.phase=op.attached?'seat':'pickup';op.elapsed=0;}
  }else if(op.phase==='pickup'||op.phase==='seat'){
    // E requests contact; the final small horizontal correction also travels physically.
    if(!moveAssemblyHorizontal(op,dt))return;
    if(!moveAssemblyHeight(op,op.target[1],dt))return;
    if(op.phase==='pickup'){op.attached=true;op.phase='lift';}
    else{op.attached=false;op.seated++;op.progress=op.seated/op.assemblyModules.length;op.phase='retract';}
  }else if(op.phase==='lift'){
    if(moveAssemblyHeight(op,FACTORY_ASSEMBLY_IDLE[1],dt)){
      op.target=[...FACTORY_ASSEMBLY_CONTACT];op.phase='carry';
    }
  }else if(op.phase==='retract'){
    if(moveAssemblyHeight(op,FACTORY_ASSEMBLY_IDLE[1],dt)){
      const next=op.assemblyModules[op.seated];
      if(next){op.assemblyModule=next;op.target=[...FACTORY_ASSEMBLY_PICK[next]];op.phase='fetch';}
      else{op.target=[...FACTORY_ASSEMBLY_IDLE];op.phase='home';}
    }
  }
}

/** One bounded step; a paused/hidden page never advances machine motion or consumes confirm. */
export function stepFactoryOperation(op:FactoryOperation,input:FactoryInput,delta:number,paused=false) {
  if(paused||op.phase==='done'||!Number.isFinite(delta)||delta<=0)return;
  const dt=Math.min(delta,.05),type=op.action.type;
  if(type==='test'||type==='inspect')return; // Physics and explicit inspection own their own evidence.
  if(type==='trial-assemble'||type==='final-assemble'){stepAssembly(op,input,dt);return;}
  if(type==='extract'){
    if(op.phase==='aim'||op.phase==='carry'){
      const n=Math.max(1,Math.hypot(input.x,input.z));
      op.tool[0]=clamp(op.tool[0]+input.x/n*3.2*dt,-43,-32);
      op.tool[2]=clamp(op.tool[2]+input.z/n*3.2*dt,-23,-14);
      if(input.confirm&&factoryToolAligned(op)){
        op.elapsed=0;
        op.phase=op.attached?'drop':'pickup';
      }
    }else{
      // Correct alignment by travelling the final distance, never snapping the magnet.
      if((op.phase==='pickup'||op.phase==='drop')&&!moveAssemblyHorizontal(op,dt))return;
      op.elapsed+=dt;
      if(op.phase==='pickup'){
        const t=op.elapsed/1.4;
        const contact=op.target[1]+FACTORY_RAW_HALF_HEIGHT[(op.action as Extract<FactoryAction,{type:'extract'}>).module]+FACTORY_MAGNET_HALF_HEIGHT;
        op.tool[1]=3.4-(3.4-contact)*ease(t<.5?t*2:(1-t)*2);
        if(t>=.5)op.attached=true;
        if(t>=1){op.tool[1]=3.4;op.phase='carry';op.target=factoryRawDrop((op.action as Extract<FactoryAction,{type:'extract'}>).module);op.elapsed=0;}
      }else if(op.phase==='drop'){
        const contact=op.target[1]+(op.action.type==='extract'?FACTORY_RAW_HALF_HEIGHT[op.action.module]+FACTORY_MAGNET_HALF_HEIGHT:0);
        op.tool[1]=3.4-(3.4-contact)*ease(op.elapsed/1.1);
        if(op.elapsed>=1.1){
          op.attached=false;op.seated++;
          op.phase='outfeed';op.progress=0;op.elapsed=0;op.target=[...FACTORY_RAW_IDLE];
        }
      }else if(op.phase==='outfeed'){
        op.progress=clamp(op.elapsed/5);
        const raised=moveAssemblyHeight(op,FACTORY_RAW_IDLE[1],dt);
        const parked=raised&&moveAssemblyHorizontal(op,dt);
        if(parked&&op.progress===1)op.phase='done';
      }
    }
    return;
  }
  if(type==='process'){
    if(op.phase==='outfeed'){
      op.elapsed+=dt;op.progress=clamp(op.elapsed/6);
      op.guard=Math.max(0,op.guard-dt*2);
      if(op.elapsed>=6){op.phase='done';op.progress=1;}return;
    }
    // Hold the interlocked lever. Letting go retracts the ram before the guard opens.
    if(!input.held){op.elapsed=0;op.stroke=Math.max(0,op.stroke-dt*1.8);if(op.stroke===0)op.guard=Math.max(0,op.guard-dt*2);op.phase='ready';return;}
    op.phase='cycle';op.guard=Math.min(1,op.guard+dt*2);
    if(op.guard<1)return;
    op.elapsed+=dt;op.stroke=op.elapsed<1?ease(op.elapsed):op.elapsed<1.4?1:1-ease((op.elapsed-1.4)/.8);
    op.progress=clamp(op.elapsed/2.2);
    if(op.elapsed>=2.2){op.stroke=0;op.phase='outfeed';op.progress=0;op.elapsed=0;}
    return;
  }
  if(op.phase==='ready'&&input.confirm){op.phase='cycle';op.elapsed=0;}
  if(op.phase==='cycle'){
    op.elapsed+=dt;
    const duration=type==='route'?8:type==='rework'?3.5:type==='release'?7:1.2;
    op.progress=ease(op.elapsed/duration);
    if(op.elapsed>=duration){op.phase='done';op.progress=1;}
  }
}
