import { parkAudio,type ParkAudio,type PcmCueHandle } from './WorldParkAudio';
import { useWorldStore } from './store';
import { useWorldAudioSettings,worldAudioLevel } from './world-audio-settings';
import { useExchangePlay,exchangePlayAnchor,type ExchangePlayState,type ExchangePlayStationId } from './alpha-exchange-play';
import { EXCHANGE_CONTACT_SOUND,EXCHANGE_SOUND_RATE,renderExchangeSound,type ExchangeSound } from './alpha-exchange-sound';
import type { ExchangeActionKind } from './alpha-exchange-motion';
import type { Vec3 } from './types';

const STATION:Record<ExchangeActionKind,ExchangePlayStationId>={pickup:'archive',insert:'desk',adjust:'desk',seal:'desk',ring:'bell',collect:'clearing',review:'review'};
export function committedExchangeContact(before:ExchangePlayState,after:ExchangePlayState) {
  return after.contacts===before.contacts+1&&after.lastContact!==null?after.lastContact:null;
}
export function exchangeSoundDistance(listener:readonly number[],source:readonly number[]){
  const d=Math.hypot(...source.map((n,i)=>n-listener[i]));
  return Number.isFinite(d)&&d<18?(1-Math.max(0,d-2)/16)**2:0;
}
type Voice={handle:PcmCueHandle;at:Vec3;level:number;distance:number};

/** Commit-driven owner on the shared ParkAudio graph. Mount, load, gestures and replay do not emit by themselves. */
export class ExchangeActionAudio {
  private mounted=false;
  private voices=new Set<Voice>();
  private variants=new Map<ExchangeSound,number>();
  private subscriptions:(()=>void)[]=[];
  private release:(()=>void)|null=null;
  private emitted=0;
  private updates=0;
  private last:ExchangeSound|null=null;
  constructor(private audio:Pick<ParkAudio,'retain'|'pcmCue'>=parkAudio){}
  private available(){
    const w=useWorldStore.getState();
    return this.mounted&&!document.hidden&&!w.paused&&!w.poolInspect&&!w.shot&&!w.card
      &&!w.activeVehicle&&!w.seat&&!w.clubMode&&worldAudioLevel('sfx')>0;
  }
  mount(){
    if(this.mounted)return this.dispose;
    this.mounted=true;this.release=this.audio.retain();
    this.subscriptions.push(useExchangePlay.subscribe((s,p)=>{
      const action=committedExchangeContact(p,s);if(!action)return;
      this.sync();if(!this.available())return;
      const at=exchangePlayAnchor(STATION[action],action==='adjust'?s.round?.targetUnits:undefined).target;
      const distance=exchangeSoundDistance(useWorldStore.getState().position,at);if(!distance)return;
      const {kind,level}=EXCHANGE_CONTACT_SOUND[action],variant=this.variants.get(kind)??0;
      // One performer can only make one contact at a time. This additionally bounds tails after rapid QA/input cycles.
      if(this.voices.size>=3){const oldest=this.voices.values().next().value!;oldest.handle.cancel();this.voices.delete(oldest);}
      const handle=this.audio.pcmCue(`exchange:${kind}:${variant}`,()=>renderExchangeSound(kind,variant),EXCHANGE_SOUND_RATE,level*distance);
      if(handle.active){this.voices.add({handle,at,level,distance});this.variants.set(kind,(variant+1)%3);this.emitted++;this.last=kind;}
    }),useWorldStore.subscribe((s,p)=>{
      if(s.paused!==p.paused||s.poolInspect!==p.poolInspect||s.shot!==p.shot||s.card!==p.card
        ||s.activeVehicle!==p.activeVehicle||s.seat!==p.seat||s.clubMode!==p.clubMode
        ||s.position!==p.position&&this.voices.size>0)this.sync();
    }),useWorldAudioSettings.subscribe((s,p)=>{if(s!==p)this.sync();}));
    document.addEventListener('visibilitychange',this.sync);window.addEventListener('pagehide',this.clear);
    return this.dispose;
  }
  private clear=()=>{for(const voice of this.voices)voice.handle.cancel();this.voices.clear();};
  private sync=()=>{
    this.updates++;
    const enabled=this.available();
    for(const voice of this.voices){
      if(!voice.handle.active){this.voices.delete(voice);continue;}
      const distance=enabled?exchangeSoundDistance(useWorldStore.getState().position,voice.at):0;
      if(!distance){voice.handle.cancel();this.voices.delete(voice);}
      else if(Math.abs(distance-voice.distance)>.005){voice.distance=distance;voice.handle.setVolume(voice.level*distance);}
    }
  };
  inspect(){return {mounted:this.mounted,emitted:this.emitted,last:this.last,activeHandles:[...this.voices].filter(v=>v.handle.active).length,updates:this.updates,timers:0};}
  dispose=()=>{
    this.mounted=false;this.clear();this.subscriptions.forEach(stop=>stop());this.subscriptions=[];
    document.removeEventListener('visibilitychange',this.sync);window.removeEventListener('pagehide',this.clear);
    this.variants.clear();this.release?.();this.release=null;
  };
}
export const exchangeActionAudio=new ExchangeActionAudio();
