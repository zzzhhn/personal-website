export type WaterPass = 'refraction' | 'reflection' | 'caustic';
export type WaterHistory = Record<WaterPass, number> & {reflectionTime:number;causticTime:number};
export const waterHistory = ():WaterHistory => ({refraction:-Infinity,reflection:-Infinity,caustic:-Infinity,reflectionTime:-Infinity,causticTime:-Infinity});

/** Render budgets only: no timer, model LOD or main-canvas quality changes. */
export function clubWaterBudget(high:boolean,distance:number,coverage=1) {
  const outside=Math.max(0,distance-23);
  const fadeStart=high?24:8,fadeEnd=high?44:20;
  const t=Math.max(0,Math.min(1,(outside-fadeStart)/(fadeEnd-fadeStart)));
  const area=Math.max(0,Math.min(1,(coverage-.001)/.019));
  const reflectionWeight=(1-t*t*(3-2*t))*area*area*(3-2*area);
  const far=outside>=fadeEnd||coverage<.02;
  return {refractionHz:far?4:high?30:15,reflectionHz:far?0:high?15:6,causticHz:far?4:high?15:8,
    reflectionWeight,width:high?1024:640,mirrorSize:high?512:320};
}

export function planClubWater(input:{now:number;time:number;high:boolean;distance:number;visible:boolean;paused:boolean;
  force:boolean;viewChanged:boolean;nightChanged:boolean;night:number;dynamic:boolean;coverage?:number;lightingSettled?:boolean},last:WaterHistory) {
  const no={refraction:false,reflection:false,caustic:false};
  if(!input.visible&&!(input.paused&&input.viewChanged))return no;
  const b=clubWaterBudget(input.high,input.distance,input.coverage),due=(pass:WaterPass,hz:number)=>hz>0&&input.now-last[pass]>=1/hz-1e-7;
  const endpoint=input.paused&&input.nightChanged&&(input.lightingSettled??(input.night===0||input.night===1));
  const cameraEdit=input.paused&&input.viewChanged;
  const caustic=input.force||endpoint||due('caustic',b.causticHz)&&(input.time!==last.causticTime||input.nightChanged);
  const refraction=input.force||cameraEdit||endpoint||due('refraction',b.refractionHz)
    &&(input.viewChanged||input.nightChanged||input.dynamic&&!input.paused||caustic||last.caustic>last.refraction);
  const reflection=b.reflectionWeight>0&&(input.force||cameraEdit||endpoint||due('reflection',b.reflectionHz||4)
    &&(input.viewChanged||input.nightChanged||input.time!==last.reflectionTime));
  return {refraction,reflection,caustic};
}

/** Same projection footprint as before, with a smaller balanced offscreen buffer. */
export const budgetWaterSize=(aspect:number,high:boolean):[number,number]=>{
  const width=high?1024:640;return[width,Math.max(128,Math.min(1024,Math.round(width/Math.max(.5,aspect))))];
};

/** Explicit DEV sampling window, fed by the existing frame callback, without polling.
 * Whole-window slow ratios survive ring wrap; percentiles cover the last 1800 frames. */
export class WaterFrameWindow {
  private values:Float32Array|null=null;
  private count=0;private cursor=0;private total=0;private slow25=0;private slow33=0;private max=0;
  private active=false;private changed=false;
  start(){this.values??=new Float32Array(1800);this.count=0;this.cursor=0;this.total=0;this.slow25=0;this.slow33=0;this.max=0;this.changed=false;this.active=true;}
  invalidate(){if(this.active)this.changed=true;}
  record(ms:number){
    if(!this.active||!this.values||!Number.isFinite(ms)||ms<=0)return;
    this.values[this.cursor]=ms;this.cursor=(this.cursor+1)%this.values.length;this.count++;
    this.total+=ms;this.max=Math.max(this.max,ms);if(ms>25)this.slow25++;if(ms>1000/30)this.slow33++;
  }
  stop(){
    if(!this.active||!this.values)return null;this.active=false;
    const values=Array.from(this.values.subarray(0,Math.min(this.count,this.values.length))).sort((a,b)=>a-b);
    return {frames:this.count,activeSeconds:this.total/1000,maxMs:this.max,slow25Ratio:this.count?this.slow25/this.count:0,
      slow33Ratio:this.count?this.slow33/this.count:0,percentileSamples:values.length,p50Ms:values[Math.floor(values.length*.5)]??null,
      p95Ms:values[Math.floor(values.length*.95)]??null,changedDuringWindow:this.changed};
  }
}
export const clubWaterFrameWindow=new WaterFrameWindow();
