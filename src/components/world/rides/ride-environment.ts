export type WeatherPreference='clear'|'rain'|'snow';
export interface TemporaryWeather { rain:number; snow:number }
/** Never writes world preference. An explicit preference edit invalidates this lease permanently. */
export class RideEnvironment {
 private owner:string|null=null; private preference=''; private yielded=false;
 private value:TemporaryWeather={rain:0,snow:0};
 acquire(owner:string,preference:string){this.owner=owner;this.preference=preference;this.yielded=false;return()=>{if(this.owner===owner)this.owner=null;};}
 publish(owner:string,value:TemporaryWeather){if(this.owner===owner)this.value=value;}
 sample(preference:string,suspended:boolean):TemporaryWeather|null {
  if(preference!==this.preference)this.yielded=true;
  return this.owner&&!this.yielded&&!suspended?this.value:null;
 }
 get active(){return this.owner!==null;}
}
export const rideEnvironment=new RideEnvironment();
