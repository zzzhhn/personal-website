import type { Vec3 } from './types';

export type ActorActivityPose = { position: Vec3; yaw: number; grounded: boolean; available: boolean; mode?: 'guide' | 'vehicle'; handsOccupied?: boolean };
export type ActivityNotice = { zh: string; en: string };
export type ActivityInterruption = 'motion' | 'recovery' | 'blocked';
export interface ActivityApproach {
  stand: Vec3; yaw: number; moving: boolean; stopDistance: number;
  maxSpeed?: number; turnDistance?: number; routeLimit?: number;
}
export interface ActivityCamera { target: Vec3; eye: Vec3; fov: number; smoothing: number; priority: number }
export interface ActorActivityState {
  busy: boolean;
  carrying: boolean;
  /** Reserves the actor from other activities without blocking this activity's commands or walking. */
  occupied?: boolean;
  idleFacing?: Vec3;
  speedLimit?: number;
  sprintAllowed?: boolean;
  movementLocked?: boolean;
  inputOwner?: string;
  facing?: Vec3;
  approach?: ActivityApproach;
  allowsInteraction?: (id: string) => boolean;
  notice?: (reason: 'vehicle' | 'interaction') => ActivityNotice;
}
/** Regions register behavior; the actor controller knows no region stores or action types. */
export interface ActorActivity {
  id: string;
  read: () => ActorActivityState;
  sync: (pose: Partial<ActorActivityPose>, context: { occupiedElsewhere: boolean }) => void;
  input: (moving: boolean) => void;
  advance: (dt: number) => void;
  command: (name: 'put-down') => boolean;
  interrupt: (reason: ActivityInterruption) => void;
  dispose: () => void;
  camera?: () => ActivityCamera | null;
  clearInput?: (reason: 'reset' | 'owner-change') => void;
}

export function createActorActivities() {
  const entries = new Map<string, { entry: ActorActivity }>();
  const current = () => [...entries.values()];
  const visit = (run: (entry: ActorActivity) => void) => {
    for (const slot of current()) if (entries.get(slot.entry.id) === slot) run(slot.entry);
  };
  return {
    register(entry: ActorActivity) {
      if (!entry.id) throw new Error('An actor activity needs an id');
      const old = entries.get(entry.id);
      if (old) { entries.delete(entry.id); old.entry.dispose(); }
      const slot = { entry };
      entries.set(entry.id, slot);
      return () => {
        if (entries.get(entry.id) !== slot) return;
        entries.delete(entry.id); entry.dispose();
      };
    },
    sync(pose: Partial<ActorActivityPose>) {
      if (pose.position && (pose.position.length !== 3 || !pose.position.every(Number.isFinite))
        || pose.yaw !== undefined && !Number.isFinite(pose.yaw)) return;
      // Snapshot ownership before any adapter can cancel itself during synchronization.
      const owners = current().filter(({entry}) => { const state=entry.read(); return state.busy || state.carrying || state.occupied; });
      visit(entry => entry.sync({ ...pose, ...(pose.position ? { position: [...pose.position] as Vec3 } : {}) },
        { occupiedElsewhere: owners.some(slot => slot.entry !== entry) }));
    },
    input(moving: boolean) { visit(entry => entry.input(moving)); },
    clearInput(reason: 'reset' | 'owner-change' = 'reset') { visit(entry => entry.clearInput?.(reason)); },
    locomotion() {
      let speedLimit=Infinity,sprintAllowed=true;
      for(const {entry} of current()) {
        const state=entry.read();
        if(state.speedLimit!==undefined && Number.isFinite(state.speedLimit) && state.speedLimit>=0)
          speedLimit=Math.min(speedLimit,state.speedLimit);
        if(state.sprintAllowed===false)sprintAllowed=false;
      }
      return {speedLimit,sprintAllowed};
    },
    idleFacing() {
      for(const {entry} of current()) {
        const facing=entry.read().idleFacing;
        if(facing?.length===3 && facing.every(Number.isFinite))return facing;
      }
      return null;
    },
    inputOwner() {
      for(const {entry} of current()){
        const owner=entry.read().inputOwner;
        if(owner)return `${entry.id}:${owner}`;
      }
      return null;
    },
    advance(dt: number) {
      if (Number.isFinite(dt) && dt > 0) visit(entry => entry.advance(dt));
    },
    interrupt(reason: ActivityInterruption = 'motion') { visit(entry => entry.interrupt(reason)); },
    approach() {
      for (const {entry} of current()) {
        const state=entry.read();
        if(state.busy && state.approach) return state.approach;
      }
      return null;
    },
    busy: () => current().some(({ entry }) => entry.read().busy),
    movementLocked: () => current().some(({entry}) => { const state=entry.read(); return state.busy || state.movementLocked; }),
    carrying: () => current().some(({ entry }) => entry.read().carrying),
    camera() {
      let selected: ActivityCamera | null=null;
      for(const slot of current()){
        if(entries.get(slot.entry.id)!==slot)continue;
        const view=slot.entry.camera?.();
        if(!view || view.target.length!==3 || view.eye.length!==3 || !view.target.every(Number.isFinite)
          || !view.eye.every(Number.isFinite) || !Number.isFinite(view.fov) || view.fov<=0 || view.fov>=180
          || !Number.isFinite(view.smoothing) || view.smoothing<=0 || !Number.isFinite(view.priority))continue;
        if(!selected || view.priority>selected.priority)selected=view;
      }
      return selected;
    },
    facing() {
      for (const { entry } of current()) {
        const state = entry.read();
        if (state.busy && state.facing?.every(Number.isFinite)) return state.facing;
      }
      return null;
    },
    allowsInteraction: (id: string) => current().every(({ entry }) => entry.read().allowsInteraction?.(id) ?? true),
    notice(reason: 'vehicle' | 'interaction') {
      for (const { entry } of current()) {
        const state = entry.read();
        if (state.busy || state.carrying) { const notice = state.notice?.(reason); if (notice) return notice; }
      }
      return null;
    },
    command(name: 'put-down') {
      for (const slot of current()) if (entries.get(slot.entry.id) === slot && slot.entry.command(name)) return true;
      return false;
    },
  };
}
export type ActorActivities = ReturnType<typeof createActorActivities>;
export const actorActivities = createActorActivities();

/** All scene-owned stance actions use this motion rule; the physics caller validates the route. */
export function activityApproachMotion(position: Vec3, approach: ActivityApproach) {
  const maxSpeed=approach.maxSpeed??1.5,turnDistance=approach.turnDistance??.22;
  if(position.length!==3 || approach.stand.length!==3 || !position.every(Number.isFinite)
    || !approach.stand.every(Number.isFinite) || !Number.isFinite(approach.yaw)
    || !Number.isFinite(approach.stopDistance) || approach.stopDistance<0
    || !Number.isFinite(maxSpeed) || maxSpeed<=0 || maxSpeed>3
    || !Number.isFinite(turnDistance) || turnDistance<0) return null;
  const dx=approach.stand[0]-position[0],dz=approach.stand[2]-position[2],distance=Math.hypot(dx,dz);
  const moving=approach.moving && distance>Math.max(.001,approach.stopDistance);
  const pace=moving?Math.min(maxSpeed,distance*4):0;
  return {vx:moving?dx/distance*pace:0,vz:moving?dz/distance*pace:0,moving,
    yaw:moving&&distance>turnDistance?Math.atan2(-dz,dx):approach.yaw};
}
