type BeforeFrame = (callback: () => void) => () => void;

/** Rebase once at R3F's before-frame boundary, before it samples getDelta for
 * every useFrame subscriber (including Rapier). Layout effects are too early:
 * the main thread may still spend hundreds of ms preparing the first frame.
 * No delta cap, new RAF, accumulator reset, or steady-state clock reads. */
export function createResumeTimeBoundary(
  clock: { getDelta(): number },
  canResume: () => boolean,
  beforeFrame: BeforeFrame,
  onReset?: () => void,
) {
  let release: (() => void) | undefined;
  const dispose = () => { release?.(); release = undefined; };
  return {
    suspend() {
      if (release) return;
      release = beforeFrame(() => {
        // Paused demand frames, other Canvas roots and hidden-page callbacks
        // must not consume the pending reset for this world's active frame.
        if (!canResume()) return;
        clock.getDelta();
        dispose();
        onReset?.();
      });
    },
    dispose,
  };
}
