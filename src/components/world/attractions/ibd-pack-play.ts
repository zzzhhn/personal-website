import { create } from 'zustand';
import { useIbdYardStore, ibdActor } from './ibd-yard-store';
import { inspectIbdYardPack, yardCase, yardItemId, cancelIbdYardAction } from './ibd-yard-game';
import { createIbdPackInspection, type IbdPackSlotIndex, type IbdPackInspectionEvent } from './ibd-pack-inspection';
import { IBD_CARGO_HOME, ibdLocal, ibdWorld, type IbdSlot } from './ibd-yard-layout';
import { ibdPackInspectAnchors } from './ibd-pack-layout';
import { advanceIbdInspectionAction, beginIbdInspectionAction, cancelIbdInspectionAction,
  ibdInspectionActor, ibdInspectionBody, ibdInspectionBodyBusy, type IbdInspectionActionKind } from './ibd-inspection-motion';
import type { Vec3 } from '../types';

export const useIbdPackPlay = create(() => ({ pack: null as IbdSlot|null, selected: 0 as IbdPackSlotIndex,
  gap: .54, busy: false, feedback: '', round:0, itemId:'' }));
/** Animation data is sampled on the existing physics clock, never pushed through React each frame. */
export const ibdPackVisual = { pack: null as IbdSlot|null, index: 0 as IbdPackSlotIndex, progress: 0, jaw: .54, retracting: false };
export const ibdPackWorkBusy=()=>ibdInspectionBodyBusy()||ibdPackVisual.retracting||(!ibdInspectionBody.carried&&ibdPackVisual.progress>0);
let cancelRequested = false;
const actor = () => ({ ...ibdActor(), local: ibdLocal(ibdInspectionActor.position) });
export function currentIbdPack() {
  const view = useIbdPackPlay.getState(), game = useIbdYardStore.getState().game;
  if (!view.pack) return null;
  const itemId = yardItemId(game,view.pack), item = yardCase(game).items.find(i=>i.id===itemId);
  if (!item || item.kind!=='hardware-pack') return null;
  return { view,game,item,inspection:game.packInspections[itemId]??createIbdPackInspection(item) };
}
export function openIbdPack(pack: IbdSlot) {
  const g=useIbdYardStore.getState().game, id=yardItemId(g,pack), a=actor();
  if (!pack.startsWith('parts') || !a.active || a.paused || a.hidden || a.driving || g.pending
    || !g.equipped || !g.core.opened.includes(id) || g.core.loaded.includes(id) || ibdInspectionBodyBusy()) return;
  if (ibdInspectionBody.carried && useIbdPackPlay.getState().pack!==pack) return;
  useIbdPackPlay.setState({pack,feedback:'',round:g.round,itemId:id});
}
export function selectIbdPackPocket(index: IbdPackSlotIndex) {
  if (ibdInspectionBodyBusy() || ibdInspectionBody.carried || ibdPackVisual.progress>0 || index<0 || index>3) return;
  useIbdPackPlay.setState({selected:index,feedback:''});
}
export function adjustIbdPackGap(value: number) {
  if (ibdInspectionBodyBusy() || !Number.isFinite(value)) return;
  useIbdPackPlay.setState({gap:Math.round(Math.max(.18,Math.min(.54,value))*100)/100,feedback:''});
  ibdPackVisual.jaw=useIbdPackPlay.getState().gap;
}
function commit(event: IbdPackInspectionEvent, round: number, revision: number) {
  const before=useIbdYardStore.getState().game;
  const after=inspectIbdYardPack(before,{...event,round,revision},actor());
  if (after!==before) useIbdYardStore.setState({game:after});
  return after;
}
export function requestIbdPackContact(kind?: IbdInspectionActionKind) {
  const c=currentIbdPack();
  if (!c || ibdInspectionBodyBusy() || ibdPackVisual.retracting || c.game.pending) return false;
  const {view,game,item,inspection}=c, index=inspection.held??view.selected, pocket=inspection.slots[index];
  const action=kind??(inspection.held!==null ? inspection.measurement ? 'return':'measure' : pocket.present?'pickup':'empty');
  if ((action==='pickup'||action==='empty') && pocket.complete) return false;
  const spec=item.specId==='M6'?'M6':'M8', local=ibdPackInspectAnchors(spec,view.gap), home=IBD_CARGO_HOME[view.pack!];
  const world=(p:Vec3)=>ibdWorld(p.map((n,i)=>n+home[i]) as Vec3);
  const anchor={stand:world(local.stand),yaw:local.yaw,leftTarget:world(local.leftTarget),rightTarget:world(local.rightTarget)};
  const round=game.round, revision=game.revision;
  const started=beginIbdInspectionAction(action,anchor,()=>{
    const live=currentIbdPack();
    if (!live || live.item.id!==item.id || live.game.round!==round || live.game.revision!==revision) return false;
    let event:IbdPackInspectionEvent;
    if (action==='pickup') event={type:'take',itemId:item.id,slot:index,contact:true};
    else if(action==='empty') event={type:'view-empty',itemId:item.id,slot:index,visible:true};
    else if(action==='return') event=cancelRequested || !live.inspection.measurement
      ? {type:'cancel',itemId:item.id} : {type:'return',itemId:item.id,slot:index,contact:true};
    else event={type:'measure',itemId:item.id,slot:index,contact:true,aligned:Math.abs(view.gap-local.diameter)<=.012};
    const after=commit(event,round,revision), next=after.packInspections[item.id];
    if (!next) return false;
    ibdInspectionBody.carried=next.held===null?null:{spec};
    useIbdPackPlay.setState({feedback:next.notice});
    // Misaligned jaws complete the authored attempt but grant no reading. The player can adjust and retry.
    return after!==game || (action==='measure'&&next.notice==='clamp-misaligned');
  },()=>{ useIbdPackPlay.setState({busy:false,feedback:'interrupted'});
    if(!ibdInspectionBody.carried)ibdPackVisual.retracting=true; });
  if(started){
    ibdPackVisual.pack=view.pack;ibdPackVisual.index=index;
    useIbdPackPlay.setState({busy:true,feedback:''});
  }else useIbdPackPlay.setState({feedback:'move-closer'});
  return started;
}
/** Soft cancellation returns the held piece with the same hand contact; recovery may clear it off-screen. */
export function cancelIbdPack(hard=false) {
  if(!useIbdPackPlay.getState().pack&&!ibdInspectionBody.action&&!ibdInspectionBody.carried)return;
  cancelRequested=true;
  if(hard){
    cancelIbdInspectionAction();ibdInspectionBody.carried=null;
    const g=useIbdYardStore.getState().game;useIbdYardStore.setState({game:cancelIbdYardAction(g)});
    Object.assign(ibdPackVisual,{pack:null,progress:0,retracting:false});
    useIbdPackPlay.setState({pack:null,busy:false,feedback:''});cancelRequested=false;return;
  }
  const a=ibdInspectionBody.action;
  if(a&&!a.committed)cancelIbdInspectionAction();
  if(!ibdInspectionBodyBusy()){
    if(ibdInspectionBody.carried)requestIbdPackContact('return');
    else ibdPackVisual.retracting=true;
  }
}
export function tickIbdPackInspection(dt: number) {
  const c=currentIbdPack(); if(!c)return;
  if(!ibdInspectionActor.available || !actor().active || c.view.round!==c.game.round || c.view.itemId!==c.item.id || c.game.core.loaded.includes(c.item.id)
    || Math.hypot(actor().local[0]-IBD_CARGO_HOME[c.view.pack!][0],actor().local[2]-IBD_CARGO_HOME[c.view.pack!][2])>4){cancelIbdPack(true);return;}
  const a=ibdInspectionBody.action;
  advanceIbdInspectionAction(dt);
  if(a?.phase==='perform'){
    if(a.kind==='pickup'||a.kind==='empty')ibdPackVisual.progress=Math.min(1,a.elapsed/1.5);
    if(a.kind==='return'&&a.committed)ibdPackVisual.progress=1-Math.min(1,Math.max(0,a.elapsed-.9)/1.5);
    if(a.kind==='empty'&&a.committed)ibdPackVisual.progress=1-Math.min(1,Math.max(0,a.elapsed-2.45)/1.5);
    ibdPackVisual.jaw=c.view.gap;
  }
  if(ibdPackVisual.retracting){ibdPackVisual.progress=Math.max(0,ibdPackVisual.progress-dt/1.5);if(ibdPackVisual.progress===0)ibdPackVisual.retracting=false;}
  if(!ibdInspectionBodyBusy()){
    const busy=ibdPackWorkBusy();
    if(useIbdPackPlay.getState().busy!==busy)useIbdPackPlay.setState({busy});
    const latest=currentIbdPack();
    if(!cancelRequested&&ibdPackVisual.progress===0&&latest?.inspection.slots.every(p=>p.complete))useIbdPackPlay.setState({pack:null});
    if(cancelRequested){
      if(ibdInspectionBody.carried)requestIbdPackContact('return');
      else if(ibdPackVisual.progress===0){cancelRequested=false;useIbdPackPlay.setState({pack:null});}
    }
  }
}
