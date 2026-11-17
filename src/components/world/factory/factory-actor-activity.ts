import { actorActivities, type ActorActivities, type ActivityCamera } from '../actor-activities';
import { useWorldStore } from '../store';
import { factoryActor, closeFactoryStation, clearFactoryInput, useFactoryStore } from './factory-store';
import { FACTORY, FACTORY_DISPATCH_VIEWS, FACTORY_WORK_VIEWS, factoryStation, factoryWorld } from './factory-layout';

/** Production remains on the factory scene clock. This adapter owns the operator's access and framing. */
export function registerFactoryActivity(registry: ActorActivities = actorActivities) {
  return registry.register({
    id:'factory',
    read(){
      const id=useWorldStore.getState().factoryStation,station=id?factoryStation(id):null;
      return {busy:!!station,carrying:false,inputOwner:id??undefined,
        approach:station?{stand:factoryWorld(station.at),yaw:station.yaw-Math.PI/2,moving:true,
          stopDistance:.04,maxSpeed:1.4,turnDistance:.24,routeLimit:station.radius}:undefined,
        notice:()=>({zh:'请先退出工作台，再上车。',en:'Leave the workstation before entering.'})};
    },
    sync(pose,context){
      if(pose.position)factoryActor.position=[...pose.position];
      if(pose.grounded!==undefined)factoryActor.grounded=pose.grounded;
      if(pose.available!==undefined){
        factoryActor.available=pose.available&&!context.occupiedElsewhere&&!pose.handsOccupied&&useFactoryStore.getState().active;
        if(!factoryActor.available&&useWorldStore.getState().factoryStation)closeFactoryStation();
      }
    },
    input(){},advance(){},command:()=>false,clearInput:clearFactoryInput,
    interrupt(reason){
      clearFactoryInput();
      if(reason==='recovery'||reason==='blocked')closeFactoryStation();
    },
    camera():ActivityCamera|null{
      const id=useWorldStore.getState().factoryStation;
      if(!id||!useFactoryStore.getState().active)return null;
      const station=factoryStation(id),home=factoryWorld(station.machine);
      let target:[number,number,number]=[home[0],home[1]+1.15,home[2]],eye:[number,number,number]=[home[0],home[1]+5.8,home[2]+9.5];
      const workView=FACTORY_WORK_VIEWS[id];
      if(workView){target=factoryWorld(workView.target);eye=factoryWorld(workView.eye);}
      if(id==='assembly'||id==='finish'){
        target=[home[0]+.6,home[1]+.6,home[2]];eye=[home[0]+4.2,home[1]+3.8,home[2]+6];
      }
      if(id==='release'){
        const view=FACTORY_DISPATCH_VIEWS[useFactoryStore.getState().dispatchView];
        target=factoryWorld(view.target);eye=factoryWorld(view.eye);
      }
      if(id==='test'||id==='compare'){
        const x=FACTORY.origin[0]+(id==='compare'?68.5:59);
        target=[x,FACTORY.origin[1]+1.8,FACTORY.origin[2]+3];
        eye=[x,FACTORY.origin[1]+(id==='compare'?19:11),FACTORY.origin[2]+(id==='compare'?29:20)];
      }
      return {target,eye,fov:50,smoothing:6,priority:30};
    },
    dispose(){closeFactoryStation();factoryActor.available=false;},
  });
}
