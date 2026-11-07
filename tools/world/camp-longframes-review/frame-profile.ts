import { useFrame, type RootState } from '@react-three/fiber';
import { useBeforePhysicsStep } from '@react-three/rapier';

type Bucket = { count:number; ms:number; max:number };
const buckets = new Map<string,Bucket>();
const slow: {name:string;ms:number;frame:number}[] = [];
let active=false, frame=0;
export function profileStart() { buckets.clear();slow.length=0;active=true;frame=0; }
export function profileStop() { active=false;return {buckets:[...buckets].map(([name,b])=>({name,...b})).sort((a,b)=>b.ms-a.ms).slice(0,30),slow:[...slow]}; }
export function profileFrame() { frame++; }
export function profileBegin() { return active?performance.now():-1; }
export function profileEnd(name:string,start:number) {
  if(start<0||!active)return;
  const ms=performance.now()-start,b=buckets.get(name)??{count:0,ms:0,max:0};
  b.count++;b.ms+=ms;b.max=Math.max(b.max,ms);buckets.set(name,b);
  if(ms>8){slow.push({name,ms,frame});slow.sort((a,b)=>b.ms-a.ms);if(slow.length>24)slow.length=24;}
}
export function useProfileFrame(name:string,callback:(state:RootState,dt:number,...args:any[])=>any,priority?:number) {
  useFrame((...args)=>{const t=profileBegin();try{return callback(...args);}finally{profileEnd(name,t);}},priority);
}
export function useProfileBeforePhysicsStep(name:string,callback:Parameters<typeof useBeforePhysicsStep>[0]) {
  useBeforePhysicsStep((...args)=>{const t=profileBegin();try{return callback(...args);}finally{profileEnd(name,t);}});
}
