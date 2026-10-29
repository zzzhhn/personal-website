import test from 'node:test';
import assert from 'node:assert/strict';
import {ExchangeActionAudio,committedExchangeContact,exchangeSoundDistance} from './alpha-exchange-audio.ts';
import {EXCHANGE_SOUND_RATE,EXCHANGE_SOUND_SECONDS,EXCHANGE_CONTACT_SOUND,renderExchangeSound} from './alpha-exchange-sound.ts';
import {useExchangePlay,exchangePlayAnchor,requestExchangePlay,adjustExchangePlay,releaseExchangePlay} from './alpha-exchange-play.ts';
import {exchangeActor,exchangeBody,exchangeVisualSockets,advanceExchangeBodyAction} from './alpha-exchange-motion.ts';
import {useAlphaExchange} from './alpha-exchange-state.ts';
import {PLAYER_CENTER_HEIGHT} from './actor-physics.ts';
import {useWorldStore} from './store.ts';
import {useWorldAudioSettings} from './world-audio-settings.ts';

class Target extends EventTarget{
  count=0;addEventListener(...args){this.count++;super.addEventListener(...args);}removeEventListener(...args){this.count--;super.removeEventListener(...args);}
}
function fixture(t){
  const originals=new Map(['window','document'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  const w=useWorldStore.getState(),p=useExchangePlay.getState(),a=useWorldAudioSettings.getState(),h=useAlphaExchange.getState();
  const win=new Target(),doc=Object.assign(new Target(),{hidden:false});
  Object.assign(win,{setInterval(){assert.fail('no timer');},setTimeout(){assert.fail('no timer');},requestAnimationFrame(){assert.fail('no frame loop');}});
  Object.defineProperty(globalThis,'window',{configurable:true,value:win});Object.defineProperty(globalThis,'document',{configurable:true,value:doc});
  useWorldStore.setState({...useWorldStore.getInitialState(),paused:false});useExchangePlay.setState(useExchangePlay.getInitialState(),true);
  useWorldAudioSettings.setState({...useWorldAudioSettings.getInitialState(),musicVolume:0},true);
  let owners=0;const voices=[];
  const audio={retain(){owners++;return()=>owners--;},pcmCue(key,render,rate,level){
    const voice={key,pcm:render(),rate,level,active:true,cancel(){this.active=false;},setVolume(v){this.level=v;}};voices.push(voice);return voice;
  }};
  const service=new ExchangeActionAudio(audio);service.mount();
  const position=kind=>{
    const station={pickup:'archive',insert:'desk',adjust:'desk',seal:'desk',ring:'bell',collect:'clearing',review:'review'}[kind];
    const anchor=exchangePlayAnchor(station);
    useWorldStore.setState({position:[anchor.stand[0],anchor.stand[1]+PLAYER_CENTER_HEIGHT,anchor.stand[2]]});
    Object.assign(exchangeActor,{position:useWorldStore.getState().position,yaw:anchor.yaw,available:true,grounded:true});return anchor;
  };
  const commit=kind=>{position(kind);const before=useExchangePlay.getState();useExchangePlay.setState({contacts:before.contacts+1,lastContact:kind});};
  t.after(()=>{releaseExchangePlay();service.dispose();useWorldStore.setState(w,true);useExchangePlay.setState(p,true);useWorldAudioSettings.setState(a,true);useAlphaExchange.setState(h,true);
    for(const [k,d]of originals)if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];
  });
  return {service,voices,win,doc,position,commit,get owners(){return owners;}};
}
test('six finite material sounds have three distinct bounded variants with a silent end and bell decay',()=>{
  let bytes=0;const signatures=new Set();
  for(const kind of Object.keys(EXCHANGE_SOUND_SECONDS))for(let v=0;v<3;v++){
    const pcm=renderExchangeSound(kind,v);bytes+=pcm.byteLength;assert.equal(pcm.length,Math.round(EXCHANGE_SOUND_SECONDS[kind]*EXCHANGE_SOUND_RATE));
    assert.ok(pcm[0]===0&&pcm.at(-1)===0);assert.deepEqual(pcm,renderExchangeSound(kind,v));
    let energy=0,tail=0,rough=0;for(let i=0;i<pcm.length;i++){assert.ok(Number.isFinite(pcm[i])&&Math.abs(pcm[i])<=.581);energy+=pcm[i]**2;if(i>pcm.length/2)tail+=pcm[i]**2;if(i)rough+=(pcm[i]-pcm[i-1])**2;}
    assert.ok(Math.sqrt(energy/pcm.length)>.02,`${kind} is audible PCM`);signatures.add(`${pcm.length}:${rough.toFixed(4)}:${tail.toFixed(4)}`);
    if(kind==='bell')assert.ok(tail>energy*.005&&tail<energy*.08,'an audible but decaying tail');
  }
  assert.equal(signatures.size,18);assert.ok(bytes<1024*1024);assert.throws(()=>renderExchangeSound('missing'));assert.throws(()=>renderExchangeSound('paper',NaN));
});
test('actual production contacts emit materials once, while reservations, cancellation and repeated attempts remain silent',async t=>{
  const f=fixture(t),days=Array.from({length:10},(_,i)=>({date:`2026-01-${String(i+1).padStart(2,'0')}`,value:100+i}));
  useAlphaExchange.setState({phase:'open',history:days,error:null});assert.equal(f.voices.length,0);
  const finish=()=>{for(let i=0;i<120&&exchangeBody.action;i++){const a=exchangeBody.action;Object.assign(exchangeVisualSockets,{valid:true,sampledId:a.id,sampledElapsed:a.elapsed,contactError:0});advanceExchangeBodyAction(1/60);}};
  f.position('pickup');await requestExchangePlay('archive');assert.equal(f.voices.length,0);finish();assert.equal(f.voices.at(-1).key,'exchange:paper:0');
  f.position('insert');requestExchangePlay('desk');finish();assert.equal(f.voices.at(-1).key,'exchange:slot:0');
  f.position('adjust');adjustExchangePlay(10);assert.equal(f.voices.length,2);finish();assert.equal(f.voices.at(-1).key,'exchange:detent:0');
  for(let i=0;i<3;i++){
    f.position('seal');requestExchangePlay('desk');assert.equal(requestExchangePlay('desk'),false);finish();assert.match(f.voices.at(-1).key,/exchange:stamp/);
    f.position('ring');requestExchangePlay('bell');finish();assert.match(f.voices.at(-1).key,/exchange:bell/);
  }
  f.position('collect');requestExchangePlay('clearing');finish();assert.equal(f.voices.at(-1).key,'exchange:receipt:0');
  f.position('review');requestExchangePlay('review');finish();assert.equal(f.voices.at(-1).key,'exchange:detent:1');assert.equal(exchangeBody.carried,'receipt');
  const count=f.voices.length;requestExchangePlay('review');releaseExchangePlay();finish();assert.equal(f.voices.length,count);
  assert.equal(f.voices.length,11);assert.ok(f.service.inspect().activeHandles<=3);
});
test('pause, hidden, mute, cards, vehicles and distance cancel tails; restoration never replays them',t=>{
  const f=fixture(t),gates=[v=>useWorldStore.setState({paused:v}),v=>useWorldStore.setState({poolInspect:v}),
    v=>useWorldStore.setState({shot:v?'camp':null}),v=>useWorldStore.setState({card:v?{kind:'project',id:'alpha'}:null}),
    v=>useWorldStore.setState({activeVehicle:v?'coupe':null}),v=>useWorldStore.setState({seat:v?'camp':null}),
    v=>useWorldStore.setState({clubMode:v?'dance':null}),v=>useWorldAudioSettings.setState({muted:v}),
    v=>useWorldAudioSettings.setState({sfxVolume:v?0:1}),v=>{f.doc.hidden=v;f.doc.dispatchEvent(new Event('visibilitychange'));}];
  for(const gate of gates){f.commit('ring');const voice=f.voices.at(-1),count=f.voices.length;gate(true);assert.equal(voice.active,false);f.commit('ring');gate(false);assert.equal(f.voices.length,count);}
  f.commit('ring');const voice=f.voices.at(-1);useWorldStore.setState({position:[0,0,0]});assert.equal(voice.active,false);
  f.commit('ring');const last=f.voices.at(-1);f.win.dispatchEvent(new Event('pagehide'));assert.equal(last.active,false);
});
test('distance preserves source trim; idle position updates do no work and repeated mount/dispose leaves no listeners',t=>{
  const f=fixture(t);assert.equal(f.owners,1);f.service.mount();assert.equal(f.owners,1);const updates=f.service.inspect().updates;
  for(let i=0;i<100;i++)useWorldStore.setState({position:[i,0,0]});assert.equal(f.service.inspect().updates,updates);assert.equal(f.voices.length,0);
  f.commit('review');const v=f.voices.at(-1),at=exchangePlayAnchor('review').target;
  useWorldStore.setState({position:[at[0]+10,at[1],at[2]]});assert.equal(v.level,.65*.25);
  v.active=false;useWorldStore.setState({position:[0,0,0]});const after=f.service.inspect().updates;
  for(let i=0;i<100;i++)useWorldStore.setState({position:[i,0,0]});assert.equal(f.service.inspect().updates,after);
  f.service.dispose();assert.equal(f.owners,0);assert.equal(f.win.count+f.doc.count,0);f.service.dispose();assert.equal(f.owners,0);
  f.service.mount();assert.equal(f.owners,1);assert.equal(f.voices.length,1,'mount does not replay a past contact');
});
test('contact sequence gate drops stale and unrelated publications and source falloff has a finite boundary',()=>{
  const before={contacts:3,lastContact:'ring'};
  for(const after of [{...before,notice:'cancelled'},{...before,contacts:2},{...before,contacts:5},{contacts:4,lastContact:null}])assert.equal(committedExchangeContact(before,after),null);
  assert.equal(committedExchangeContact(before,{contacts:4,lastContact:'review'}),'review');
  assert.equal(exchangeSoundDistance([0,0,0],[2,0,0]),1);assert.equal(exchangeSoundDistance([0,0,0],[10,0,0]),.25);
  assert.equal(exchangeSoundDistance([0,0,0],[18,0,0]),0);assert.equal(exchangeSoundDistance([NaN,0,0],[0,0,0]),0);
  assert.equal(EXCHANGE_CONTACT_SOUND.review.kind,EXCHANGE_CONTACT_SOUND.adjust.kind);
});
