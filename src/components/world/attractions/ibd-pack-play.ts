import { create } from 'zustand';
import { useIbdYardStore, ibdActor } from './ibd-yard-store';
import { inspectIbdYardPack, yardPackItem, cancelIbdYardAction } from './ibd-yard-game';
import { createIbdPackInspection, type IbdPackSlotIndex, type IbdPackInspectionEvent } from './ibd-pack-inspection';
import { ibdPackHome, ibdLocal, ibdWorld, type IbdPackStation } from './ibd-yard-layout';
import { IBD_PACK_INSPECTION, ibdPackInspectAnchors } from './ibd-pack-layout';
import { advanceIbdInspectionAction, beginIbdInspectionAction, cancelIbdInspectionAction,
  ibdInspectionActor, ibdInspectionBody, ibdInspectionBodyBusy, IBD_CALIPER_REACH_SECONDS,
  type IbdInspectionActionKind } from './ibd-inspection-motion';
import type { Vec3 } from '../types';

export const useIbdPackPlay = create(() => ({ pack: null as IbdPackStation|null, selected: 0 as IbdPackSlotIndex,
  gap: .54, busy: false, feedback: '', round:0, itemId:'' }));
/** Animation data is sampled on the existing physics clock, never pushed through React each frame. */
export const ibdPackVisual = { pack: null as IbdPackStation|null, index: 0 as IbdPackSlotIndex, progress: 0, jaw: .54, retracting: false };
export const ibdPackWorkBusy=()=>ibdInspectionBodyBusy()||ibdPackVisual.retracting||(!ibdInspectionBody.carried&&ibdPackVisual.progress>0);
let cancelRequested = false;
let jawStart = IBD_PACK_INSPECTION.gapMax;
const ease=(value:number)=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
const actor = () => ({ ...ibdActor(), local: ibdLocal(ibdInspectionActor.position) });
export function currentIbdPack() {
  const view = useIbdPackPlay.getState(), game = useIbdYardStore.getState().game;
  if (!view.pack) return null;
  const item = yardPackItem(game,view.pack);
  if (!item || item.kind!=='hardware-pack') return null;
  return { view,game,item,inspection:game.packInspections[item.id]??createIbdPackInspection(item) };
}
export function openIbdPack(pack: IbdPackStation) {
  const g=useIbdYardStore.getState().game, item=yardPackItem(g,pack), a=actor();
  if(!item)return;
  const id=item.id;
  if (!a.active || a.paused || a.hidden || a.driving || g.pending
    || !g.equipped || !g.core.opened.includes(id) || g.core.loaded.includes(id) || ibdInspectionBodyBusy()) return;
  if (ibdInspectionBody.carried && useIbdPackPlay.getState().pack!==pack) return;
  const view=useIbdPackPlay.getState(), slots=g.packInspections[id]?.slots;
  const resume=view.itemId===id&&view.round===g.round&&!slots?.[view.selected].complete;
  const selected=resume?view.selected:slots?.find(p=>!p.complete)?.index??0;
  useIbdPackPlay.setState({pack,selected,feedback:'',round:g.round,itemId:id});
}
export function selectIbdPackPocket(index: IbdPackSlotIndex) {
  if (ibdInspectionBodyBusy() || ibdInspectionBody.carried || ibdPackVisual.progress>0 || index<0 || index>3) return;
  useIbdPackPlay.setState({selected:index,feedback:''});
}
function commit(event: IbdPackInspectionEvent, round: number, revision: number) {
  const before=useIbdYardStore.getState().game;
  const after=inspectIbdYardPack(before,{...event,round,revision},actor());
  if (after!==before) useIbdYardStore.setState({game:after});
  return after;
}
export function requestIbdPackContact(kind?: IbdInspectionActionKind) {
  const c=currentIbdPack();
  const state=actor();
  if (!c || !state.active || state.paused || state.hidden || state.driving
    || ibdInspectionBodyBusy() || ibdPackVisual.retracting || c.game.pending) return false;
  const {view,game,item,inspection}=c, index=inspection.held??view.selected, pocket=inspection.slots[index];
  const action=kind??(inspection.held!==null ? inspection.measurement ? 'return':'measure' : pocket.present?'pickup':'empty');
  if ((action==='pickup'||action==='empty') && pocket.complete) return false;
  const fresh=action==='pickup'||action==='empty';
  const gap=fresh?IBD_PACK_INSPECTION.gapMax:ibdPackVisual.jaw;
  const spec=item.specId==='M6'?'M6':'M8', local=ibdPackInspectAnchors(spec,gap), home=ibdPackHome(view.pack!);
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
    else event={type:'measure',itemId:item.id,slot:index,contact:true,aligned:Math.abs(ibdPackVisual.jaw-local.diameter)<=.001};
    const after=commit(event,round,revision), next=after.packInspections[item.id];
    if (!next) return false;
    ibdInspectionBody.carried=next.held===null?null:{spec};
    useIbdPackPlay.setState({feedback:next.notice,gap:ibdPackVisual.jaw});
    // Keep the contact gate even though the tool now stops itself at the actual shaft surface.
    return after!==game || (action==='measure'&&next.notice==='clamp-misaligned');
  },()=>{ useIbdPackPlay.setState({busy:false,feedback:'interrupted',gap:ibdPackVisual.jaw});
    if(!ibdInspectionBody.carried)ibdPackVisual.retracting=true; });
  if(started){
    ibdPackVisual.pack=view.pack;ibdPackVisual.index=index;
    ibdPackVisual.jaw=gap;jawStart=gap;
    useIbdPackPlay.setState({gap,busy:true,feedback:action==='measure'?'closing':action==='return'?'returning':'presenting'});
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
    Object.assign(ibdPackVisual,{pack:null,progress:0,retracting:false,jaw:IBD_PACK_INSPECTION.gapMax});
    useIbdPackPlay.setState({pack:null,busy:false,feedback:'',gap:IBD_PACK_INSPECTION.gapMax});cancelRequested=false;return;
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
  if(actor().paused||actor().hidden||!Number.isFinite(dt)||dt<=0)return;
  if(!ibdInspectionActor.available || !actor().active || c.view.round!==c.game.round || c.view.itemId!==c.item.id || c.game.core.loaded.includes(c.item.id)
    || Math.hypot(actor().local[0]-ibdPackHome(c.view.pack!)[0],actor().local[2]-ibdPackHome(c.view.pack!)[2])>4){cancelIbdPack(true);return;}
  const a=ibdInspectionBody.action;
  advanceIbdInspectionAction(dt);
  if(a?.phase==='perform'){
    if(a.kind==='pickup'||a.kind==='empty')ibdPackVisual.progress=Math.min(1,a.elapsed/1.5);
    if(a.kind==='return'&&a.committed)ibdPackVisual.progress=1-Math.min(1,Math.max(0,a.elapsed-.9)/1.5);
    if(a.kind==='empty'&&a.committed)ibdPackVisual.progress=1-Math.min(1,Math.max(0,a.elapsed-2.45)/1.5);
    if(a.kind==='measure'||a.kind==='return'){
      const local=ibdPackInspectAnchors(c.item.specId,ibdPackVisual.jaw),home=ibdPackHome(c.view.pack!);
      if(a.kind==='measure'){
        const t=ease((a.elapsed-IBD_CALIPER_REACH_SECONDS)/(a.contactAt-IBD_CALIPER_REACH_SECONDS-.1));
        ibdPackVisual.jaw=Math.max(local.diameter,jawStart+(local.diameter-jawStart)*t);
      }else{
        const t=ease((a.elapsed-a.contactAt)/a.recoverDuration);
        ibdPackVisual.jaw=jawStart+(IBD_PACK_INSPECTION.gapMax-jawStart)*t;
      }
      // Thumb, visible jaw and the next rendered contact sample share one moving target.
      const target=ibdPackInspectAnchors(c.item.specId,ibdPackVisual.jaw).rightTarget;
      a.anchor.rightTarget=ibdWorld(target.map((n,i)=>n+home[i]) as Vec3);
    }
  }
  if(ibdPackVisual.retracting){ibdPackVisual.progress=Math.max(0,ibdPackVisual.progress-dt/1.5);if(ibdPackVisual.progress===0)ibdPackVisual.retracting=false;}
  if(!ibdInspectionBodyBusy()){
    const busy=ibdPackWorkBusy();
    if(useIbdPackPlay.getState().busy!==busy)useIbdPackPlay.setState({busy});
    const latest=currentIbdPack();
    // Keep the original pocket selected until both the hand and tray have cleared.
    // A completed pocket must never leave an enabled primary action that does nothing.
    if(!cancelRequested&&ibdPackVisual.progress===0&&latest){
      const next=latest.inspection.slots.find(p=>!p.complete);
      if(!next)useIbdPackPlay.setState({pack:null});
      else if(latest.inspection.slots[latest.view.selected].complete)
        useIbdPackPlay.setState({selected:next.index,feedback:''});
    }
    if(cancelRequested){
      if(ibdInspectionBody.carried)requestIbdPackContact('return');
      else if(ibdPackVisual.progress===0){cancelRequested=false;useIbdPackPlay.setState({pack:null});}
    }
  }
}
