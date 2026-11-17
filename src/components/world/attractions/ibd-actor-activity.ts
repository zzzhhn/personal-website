import { actorActivities, type ActorActivities, type ActivityCamera } from '../actor-activities';
import { ibdInspectionActor, ibdInspectionBody, ibdInspectionVisualSockets,
  IBD_INSPECTION_STAND_TOLERANCE } from './ibd-inspection-motion';
import { cancelIbdPack, tickIbdPackInspection, useIbdPackPlay } from './ibd-pack-play';
import { cancelIbdAction, tickIbdCoilInspection, useIbdYardStore } from './ibd-yard-store';
import { ibdPackHome, ibdWorld } from './ibd-yard-layout';
import { craneControl } from './ibd-crane-control';

const mechanismOwnsAction=()=>['coil-check','crane-control'].includes(ibdInspectionBody.action?.kind??'');

/** Registers yard behavior without importing it into input, locomotion or camera controllers. */
export function registerIbdActivity(registry: ActorActivities = actorActivities) {
  const interrupt=()=>{
    const mechanism=mechanismOwnsAction()||craneControl.token!==null;
    cancelIbdPack(true);
    if(mechanism)cancelIbdAction();
  };
  return registry.register({
    id:'ibd-yard',
    read(){
      const action=ibdInspectionBody.action,carrying=!!ibdInspectionBody.carried;
      return {busy:!!action,carrying,movementLocked:carrying,
        approach:action?{stand:action.anchor.stand,yaw:action.anchor.yaw,moving:action.phase==='approach',
          stopDistance:IBD_INSPECTION_STAND_TOLERANCE*.5}:undefined,
        notice:()=>({zh:'请先将检验样品归位，再上车。',en:'Return the inspection sample before entering.'})};
    },
    sync(pose,context){
      Object.assign(ibdInspectionActor,pose);
      if(pose.available!==undefined){
        ibdInspectionActor.available=pose.available&&!context.occupiedElsewhere&&useIbdYardStore.getState().active;
        if(!ibdInspectionActor.available)interrupt();
      }
    },
    input(){},
    advance(dt){
      // An open carton must not tick or cancel a later coil/crane action as its own work.
      if(!mechanismOwnsAction())tickIbdPackInspection(dt);
      tickIbdCoilInspection(dt);
    },
    command:()=>false,interrupt,
    camera():ActivityCamera|null{
      const pack=useIbdPackPlay.getState().pack;
      if(!pack||!useIbdYardStore.getState().active||mechanismOwnsAction())return null;
      const home=ibdWorld(ibdPackHome(pack));
      return {target:[home[0],home[1]+.45,home[2]+1.65],eye:[home[0]-2.7,home[1]+2.8,home[2]+4],
        fov:42,smoothing:7,priority:20};
    },
    dispose(){
      interrupt();cancelIbdAction();ibdInspectionActor.available=false;
      Object.assign(ibdInspectionVisualSockets,{valid:false,reachable:false,sampledId:null,sampledElapsed:0,
        leftContactError:Infinity,rightContactError:Infinity,contactError:Infinity});
    },
  });
}
