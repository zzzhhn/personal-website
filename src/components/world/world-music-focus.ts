/** Actual audible Club playback, separate from a loaded track or a deck's play intention.
 * No context, timers or React updates. Owners clear their entry on disposal. */
const audibleClubs = new Set<object>();
const listeners = new Set<() => void>();
export const isClubAudible = () => audibleClubs.size > 0;
export function setClubAudible(owner: object, audible: boolean) {
  const before = isClubAudible();
  if (audible) audibleClubs.add(owner); else audibleClubs.delete(owner);
  if (before !== isClubAudible()) listeners.forEach(fn => fn());
}
export function subscribeClubAudible(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
