import { LoopOnce, type AnimationAction } from 'three';

/** Fresh G24 measurement: tools/world/guide/out/sit_measure.json. The held SitIdle end pose
 * measures 0.23952 m in the actual GLTFLoader skin, within 0.2 mm of this existing contact datum. */
export const GUIDE_SEAT_CONTACT_Y = .2394;

/** A seated surface is the buttock contact datum. The standing approach may start on a bench,
 * but must never become a lower bound on the final seated root. Use the current safe body root
 * as standingY on StandUp, rather than the surface cached before sitting. */
export function guideSeatRootY(standingY: number, seatY: number, weight: number) {
  const w = Math.min(1, Math.max(0, weight));
  return standingY * (1 - w) + (seatY - GUIDE_SEAT_CONTACT_Y) * w;
}

/** SitIdle is a measured 0.533 s settling take (asset loop:false), not a periodic gesture.
 * Keep its original settle once, then hold its relaxed last pose until StandUp replaces it. */
export function holdGuideSeatIdle(action: AnimationAction) {
  action.setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  return action;
}
