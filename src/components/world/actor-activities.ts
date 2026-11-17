import type { Vec3 } from './types';

export type ActorActivityPose = { position: Vec3; yaw: number; grounded: boolean; available: boolean };
export type ActivityNotice = { zh: string; en: string };
export interface ActorActivityState {
  busy: boolean;
  carrying: boolean;
  facing?: Vec3;
  allowsInteraction?: (id: string) => boolean;
  notice?: (reason: 'vehicle' | 'interaction') => ActivityNotice;
}
/** Regions register behavior; the actor controller knows no region stores or action types. */
export interface ActorActivity {
  id: string;
  read: () => ActorActivityState;
  sync: (pose: Partial<ActorActivityPose>) => void;
  input: (moving: boolean) => void;
  advance: (dt: number) => void;
  command: (name: 'put-down') => boolean;
  interrupt: () => void;
  dispose: () => void;
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
      visit(entry => entry.sync({ ...pose, ...(pose.position ? { position: [...pose.position] as Vec3 } : {}) }));
    },
    input(moving: boolean) { visit(entry => entry.input(moving)); },
    advance(dt: number) {
      if (Number.isFinite(dt) && dt > 0) visit(entry => entry.advance(dt));
    },
    interrupt() { visit(entry => entry.interrupt()); },
    busy: () => current().some(({ entry }) => entry.read().busy),
    carrying: () => current().some(({ entry }) => entry.read().carrying),
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
