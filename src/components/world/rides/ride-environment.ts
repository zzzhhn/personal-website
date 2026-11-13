export type WeatherPreference='clear'|'rain'|'snow';
export interface TemporaryWeather { rain:number; snow:number }
export interface WeatherLease { publish(value:TemporaryWeather):void; release():void }
/** A trip owns its generation. Stale publishes/releases cannot affect a newer trip with same id. */
export class RideEnvironment {
 private generation=0; private owner:string|null=null; private preference=''; private yielded=false;
 private value:TemporaryWeather={rain:0,snow:0};
 acquire(owner:string,preference:string):WeatherLease {
  const generation=++this.generation;this.owner=owner;this.preference=preference;this.yielded=false;
  this.value={rain:preference==='rain'?1:0,snow:preference==='snow'?1:0};
  return {publish:value=>{if(this.generation===generation&&this.owner)this.value={...value};},release:()=>{if(this.generation===generation)this.owner=null;}};
 }
 sample(preference:string,suspended:boolean):TemporaryWeather|null {
  if(preference!==this.preference)this.yielded=true;
  return this.owner&&!this.yielded&&!suspended?this.value:null;
 }
 get active(){return this.owner!==null;}
}
export const rideEnvironment=new RideEnvironment();
