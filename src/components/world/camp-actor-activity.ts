import { actorActivities, type ActorActivities, type ActorActivity } from './actor-activities';
import { campPropActor, campPropHand, cancelCampPropInteraction, currentCampPropInteraction } from './camp-prop-interactions';
import { useWorldStore } from './store';

export function createCampActivity(): ActorActivity {
  const release = () => {
    cancelCampPropInteraction('actor-unavailable');
    campPropHand.target=null;campPropHand.facing=null;campPropHand.palm=null;campPropHand.mode='reach';
  };
  return {
    id:'camp-props',
    read() {
      const active=currentCampPropInteraction();
      const pulling=campPropHand.mode==='grip' && active?.id==='camp-prop-suitcase';
      const handle=pulling?campPropHand.target:null;
      // Preserve the rolling body's slack instead of dragging it through obstacles.
      const pace=handle?Math.max(0,Math.min(1,(.62-Math.hypot(handle[0]-campPropActor.position[0],handle[2]-campPropActor.position[2]))/.12)):1;
      return {busy:false,carrying:false,occupied:!!active,
        idleFacing:campPropActor.available?campPropHand.facing??undefined:undefined,
        ...(pulling?{speedLimit:2*pace,sprintAllowed:false}:{})};
    },
    sync(pose,{occupiedElsewhere}) {
      if(pose.position)campPropActor.position.splice(0,3,...pose.position);
      if(pose.yaw!==undefined)campPropActor.yaw=pose.yaw;
      if(pose.grounded!==undefined)campPropActor.grounded=pose.grounded;
      const state=useWorldStore.getState();
      if(pose.available!==undefined)campPropActor.available=pose.available&&!occupiedElsewhere
        &&!state.paused&&!state.poolInspect&&!state.shot;
      if(!campPropActor.available)release();
    },
    input(){},advance(){},command(){return false;},
    dismiss:{priority:30,run:()=>cancelCampPropInteraction()},
    clearInput(reason){if(reason==='owner-change')release();},
    interrupt:release,
    dispose(){campPropActor.available=false;release();},
  };
}

export const registerCampActivity = (registry: ActorActivities=actorActivities) => registry.register(createCampActivity());
