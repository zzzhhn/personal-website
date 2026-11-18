import { actorActivities, type ActorActivities, type ActivityInterruption } from './actor-activities';
import { ALPHA_EXCHANGE_FOOTPRINT } from './alpha-exchange-layout';
import { advanceExchangeBodyAction, cancelExchangeBodyAction, EXCHANGE_APPROACH_STOP, exchangeActor, exchangeBody,
  exchangeVisualSockets } from './alpha-exchange-motion';
import { cancelExchangePlay } from './alpha-exchange-play';

/** Scene-owned action/receipt lifecycle. The core only receives stance and occupation data. */
export function registerExchangeActivity(registry: ActorActivities = actorActivities) {
  const interrupt=(reason:ActivityInterruption)=>{
    cancelExchangeBodyAction();
    if(reason==='recovery')cancelExchangePlay('recovery');
  };
  return registry.register({
    id:'alpha-exchange',
    read(){
      const action=exchangeBody.action;
      return {busy:!!action,carrying:!!exchangeBody.carried,
        approach:action?{stand:action.anchor.stand,yaw:action.anchor.yaw,moving:action.phase==='approach',stopDistance:EXCHANGE_APPROACH_STOP}:undefined,
        notice:()=>({zh:'请先完成或退出当前交易，再上车。',en:'Finish or leave the current exchange session before entering.'})};
    },
    sync(pose,context){
      Object.assign(exchangeActor,pose);
      if(pose.available!==undefined)exchangeActor.available=pose.available&&!context.occupiedElsewhere;
      if(!exchangeActor.available)cancelExchangeBodyAction();
      if(pose.position && exchangeBody.carried){
        const [x,,z]=pose.position,bounds=ALPHA_EXCHANGE_FOOTPRINT;
        if(x<bounds.minX-8||x>bounds.maxX+8||z<bounds.minZ-8||z>bounds.maxZ+8)cancelExchangePlay('left-hall');
      }
    },
    input(){},advance:advanceExchangeBodyAction,command:()=>false,interrupt,
    dispose(){
      interrupt('recovery');exchangeActor.available=false;exchangeActor.groundRoute=undefined;
      Object.assign(exchangeVisualSockets,{valid:false,sampledId:null,sampledElapsed:0,contactError:Infinity});
    },
  });
}
