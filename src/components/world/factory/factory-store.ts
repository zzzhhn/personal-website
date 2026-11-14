import { create } from 'zustand';
import { useWorldStore } from '../store';
import { createFactoryGame, restoreFactoryGame, saveFactoryGame, factoryActions, requestFactoryAction,
  finishFactoryAction, cancelFactoryAction, appendFactoryTrialSample, addFactoryObservation,
  canStartNextFactoryBatch as batchReady, startNextFactoryBatch as nextBatch,
  type FactoryGame, type FactoryAction, type FactoryActionResult, type FactoryTicket, type FactoryTrialSample } from './factory-game.ts';
import { factoryStation, factoryWorld, type FactoryStationId } from './factory-layout.ts';
import { createFactoryOperation, stepFactoryOperation, factoryAssemblyModules, factoryToolAligned, type FactoryOperation, type FactoryInput } from './factory-operation.ts';
import { createFactoryInspection, advanceFactoryInspection, type FactoryInspectionSession, type FactoryInspectionProbe } from './factory-inspection.ts';
import { factoryWalkingRoute } from './factory-navigation.ts';
import type { FactoryPoint } from './factory-layout.ts';

const SAVE_KEY='bobby.factory.v1';
interface FactoryStore {game:FactoryGame;active:boolean;save:'saved'|'memory'|'invalid';notice:string|null;phase:string;aligned:boolean;route:FactoryPoint[]|null;printSequence:number;dispatchView:'dock'|'printer'}
export const useFactoryStore=create<FactoryStore>(()=>({game:createFactoryGame(),active:false,save:'memory',notice:null,phase:'',aligned:false,route:null,printSequence:0,dispatchView:'dock'}));
export const factoryActor={available:false,position:[0,0,0],grounded:false};
export const factoryControl:{operation:FactoryOperation|null;inspection:FactoryInspectionSession|null;input:FactoryInput}={operation:null,inspection:null,input:{x:0,z:0,held:false,confirm:false}};
let loaded=false;
export function loadFactorySave(){
  if(loaded||typeof window==='undefined')return;loaded=true;
  try{
    const saved=localStorage.getItem(SAVE_KEY),game=saved?restoreFactoryGame(saved):null;
    useFactoryStore.setState({game:game??createFactoryGame(crypto.randomUUID()),save:saved&&!game?'invalid':saved?'saved':'memory'});
  }catch{useFactoryStore.setState({game:createFactoryGame(crypto.randomUUID()),save:'memory'});}
}
function persistFactory(){
  if(typeof window==='undefined')return;
  try{localStorage.setItem(SAVE_KEY,saveFactoryGame(useFactoryStore.getState().game));useFactoryStore.setState({save:'saved'});}
  catch{useFactoryStore.setState({save:'memory'});}
}
export function clearFactoryInput(){Object.assign(factoryControl.input,{x:0,z:0,held:false,confirm:false});}
export function printFactoryReport(){
  const state=useFactoryStore.getState(),world=useWorldStore.getState();
  if(!state.active||!state.game.report||state.game.pending||world.factoryStation!=='release'||world.paused||world.poolInspect)return false;
  useFactoryStore.setState({printSequence:state.printSequence+1,dispatchView:'printer'});return true;
}
/** Starting another production run is an explicit action at the dispatch console. */
export function canStartNextFactoryBatchHere(){
  const state=useFactoryStore.getState(),world=useWorldStore.getState(),actor=factoryActor;
  if(!state.active||world.factoryStation!=='release'||world.paused||world.poolInspect||world.activeVehicle
    ||world.seat||world.card||world.clubMode||(typeof document!=='undefined'&&document.hidden)
    ||!actor.available||!actor.grounded||!batchReady(state.game))return false;
  const stand=factoryWorld(factoryStation('release').at);
  return Math.hypot(actor.position[0]-stand[0],actor.position[2]-stand[2])<=.25&&Math.abs(actor.position[1]-stand[1])<=2;
}
export function startNextFactoryBatch(){
  if(!canStartNextFactoryBatchHere())return false;
  const game=nextBatch(useFactoryStore.getState().game);
  clearFactoryInput();factoryControl.operation=null;factoryControl.inspection=null;
  useFactoryStore.setState({game,notice:null,phase:'',aligned:false,route:null,printSequence:0,dispatchView:'dock'});
  useWorldStore.setState({waypoint:null});persistFactory();return true;
}
export function closeFactoryStation(){
  clearFactoryInput();factoryControl.operation=null;factoryControl.inspection=null;
  const state=useFactoryStore.getState();
  if(state.game.pending){useFactoryStore.setState({game:cancelFactoryAction(state.game,state.game.pending)});persistFactory();}
  useWorldStore.setState({factoryStation:null});
}
export function guideFactoryStation(from:FactoryStationId,to:FactoryStationId){
  const route=factoryWalkingRoute(from,to);closeFactoryStation();
  useFactoryStore.setState({route:route.length>1?route:null});
  const target=factoryWorld(route[1]??factoryStation(to).at);
  useWorldStore.setState({waypoint:[target[0],target[2]]});
}
export function openFactoryStation(id:FactoryStationId){
  const w=useWorldStore.getState(),station=factoryStation(id),p=factoryWorld(station.at),a=factoryActor;
  if(!a.available||!a.grounded||w.paused||w.activeVehicle||w.seat||w.card||w.poolInspect||w.clubMode||w.factoryStation)return false;
  if(Math.hypot(a.position[0]-p[0],a.position[2]-p[2])>station.radius||Math.abs(a.position[1]-p[1])>2)return false;
  clearFactoryInput();useFactoryStore.setState({notice:null,route:null,dispatchView:'dock'});useWorldStore.setState({factoryStation:id,nearbyInteract:null,nearbyVehicle:null});return true;
}
export function factoryStationActions(game:FactoryGame,id:FactoryStationId){
  return factoryActions(game).filter(a=>{
    switch(id){
      case 'raw':return a.type==='extract';
      case 'batch':return a.type==='group';
      case 'routing':return a.type==='route';
      case 'frame':case 'wheels':case 'shell':return a.type==='process'&&a.module===id;
      case 'assembly':return a.type==='trial-assemble';
      case 'test':return a.type==='test'&&a.mode==='single';
      case 'compare':return a.type==='test'&&a.mode==='comparison';
      case 'rework':return a.type==='rework';
      case 'finish':return a.type==='final-assemble'||a.type==='inspect';
      case 'release':return a.type==='release';
    }
  });
}
export function startFactoryOperation(action:FactoryAction){
  const w=useWorldStore.getState(),s=useFactoryStore.getState();
  if(!w.factoryStation||w.paused||w.poolInspect||!s.active||s.game.pending)return false;
  const stand=factoryWorld(factoryStation(w.factoryStation).at);
  if(Math.hypot(factoryActor.position[0]-stand[0],factoryActor.position[2]-stand[2])>.25)return false;
  const legal=factoryStationActions(s.game,w.factoryStation).some(a=>JSON.stringify(a)===JSON.stringify(action));
  if(!legal)return false;
  const game=requestFactoryAction(s.game,action);if(game===s.game)return false;
  factoryControl.operation=createFactoryOperation(action,factoryAssemblyModules(game));
  factoryControl.inspection=action.type==='inspect'?createFactoryInspection(game.configuration!):null;
  clearFactoryInput();useFactoryStore.setState({game,notice:null,dispatchView:'dock',phase:action.type==='inspect'?'inspect-0':factoryControl.operation.phase});return true;
}
export function finishFactoryOperation(ticket:FactoryTicket,result:FactoryActionResult={}){
  const state=useFactoryStore.getState(),game=finishFactoryAction(state.game,ticket,result);
  if(game===state.game)return false;
  useFactoryStore.setState({game,notice:result.ok===false||result.outcome==='incomplete'?'incomplete':'completed'});
  factoryControl.operation=null;factoryControl.inspection=null;clearFactoryInput();persistFactory();return true;
}
export function sampleFactoryTrial(ticket:FactoryTicket,sample:FactoryTrialSample){
  const s=useFactoryStore.getState(),game=appendFactoryTrialSample(s.game,ticket,sample);
  if(game!==s.game)useFactoryStore.setState({game});
}
export function observeFactoryTrial(trialId:string,observation:'smooth'|'shaky'|'review'){
  const s=useFactoryStore.getState(),game=addFactoryObservation(s.game,trialId,observation);
  if(game!==s.game){useFactoryStore.setState({game});persistFactory();}
}
/** Called by the one scene loop, not a UI poller. Discrete events alone update React. */
export function tickFactoryOperation(dt:number){
  const op=factoryControl.operation,s=useFactoryStore.getState(),w=useWorldStore.getState();
  if(!op||!s.game.pending)return;
  if(!s.active||!w.factoryStation||w.activeVehicle){closeFactoryStation();return;}
  const paused=w.paused||w.poolInspect||(typeof document!=='undefined'&&document.hidden);
  if(paused){clearFactoryInput();return;}
  if(op.action.type==='inspect')return;
  stepFactoryOperation(op,factoryControl.input,dt);factoryControl.input.confirm=false;
  const aligned=factoryToolAligned(op);
  if(s.phase!==op.phase||s.aligned!==aligned)useFactoryStore.setState({phase:op.phase,aligned});
  if(op.phase==='done')finishFactoryOperation(s.game.pending);
}
export function tickFactoryInspection(probe:FactoryInspectionProbe,dt:number){
  const inspection=factoryControl.inspection,s=useFactoryStore.getState(),w=useWorldStore.getState();
  if(!inspection||s.game.pending?.action.type!=='inspect'||w.paused||w.poolInspect||!w.factoryStation||document.hidden)return;
  advanceFactoryInspection(inspection,probe,factoryControl.input.confirm,dt);factoryControl.input.confirm=false;
  const phase=`inspect-${inspection.step}${inspection.motor?'-motor':''}`;
  if(s.phase!==phase)useFactoryStore.setState({phase});
  if(inspection.step===6)finishFactoryOperation(s.game.pending,{inspection:inspection.evidence});
}
/** One subscription per mounted scene, also used by lifecycle regression tests. */
export function connectFactoryWorld(){return useWorldStore.subscribe((s,p)=>{
  if(!s.factoryStation&&p.factoryStation)closeFactoryStation();
  if(s.paused!==p.paused||s.poolInspect!==p.poolInspect)clearFactoryInput();
  if(s.campReturnRequest!==p.campReturnRequest)useFactoryStore.setState({route:null});
});}
